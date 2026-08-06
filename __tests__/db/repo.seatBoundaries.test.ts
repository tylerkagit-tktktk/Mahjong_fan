import {
  createGameWithPlayers,
  getGameBundle,
  insertHand,
  updateGamePlayerSeats,
} from '../../src/db/repo';
import { ActualSqliteDatabase } from '../../test-support/sqlite/actualSqliteDatabase';
import { traditionalRules } from '../../test-support/gameRecord/fixtures';

const mockOpenDatabase = jest.fn();

jest.mock('react-native-sqlite-storage', () => ({
  __esModule: true,
  default: {
    enablePromise: jest.fn(),
    openDatabase: (...args: unknown[]) => mockOpenDatabase(...args),
  },
}));

async function rows(database: ActualSqliteDatabase, sql: string): Promise<Array<Record<string, unknown>>> {
  const [result] = await database.executeSql(sql);
  const typed = result as { rows: { length: number; item: (index: number) => Record<string, unknown> } };
  return Array.from({ length: typed.rows.length }, (_, index) => typed.rows.item(index));
}

function players(gameId: string) {
  return [0, 1, 2, 3].map((seatIndex) => ({
    id: `${gameId}:player:${seatIndex}`,
    gameId,
    name: `Player ${seatIndex}`,
    seatIndex,
  }));
}

async function createGame(gameId: string): Promise<void> {
  const rules = traditionalRules();
  await createGameWithPlayers(
    {
      id: gameId,
      title: gameId,
      currencySymbol: rules.currencySymbol,
      variant: 'HK',
      rulesJson: JSON.stringify(rules),
      startingDealerSeatIndex: 0,
      createdAt: 1_700_000_000_000,
    },
    players(gameId),
  );
}

async function insertDraw(gameId: string, id = `${gameId}:hand:0`): Promise<void> {
  await insertHand({
    id,
    gameId,
    dealerSeatIndex: 0,
    isDraw: true,
    winnerSeatIndex: null,
    discarderSeatIndex: null,
    type: 'draw',
    winnerPlayerId: null,
    discarderPlayerId: null,
    inputValue: 0,
    deltasJson: JSON.stringify([0, 0, 0, 0]),
    computedJson: JSON.stringify({ settlementType: 'draw', dealerAction: 'stick' }),
    createdAt: 1_700_000_000_001,
  });
}

describe('persisted local seat boundaries', () => {
  let database: ActualSqliteDatabase;

  beforeAll(async () => {
    database = await ActualSqliteDatabase.create();
    mockOpenDatabase.mockResolvedValue(database);
  });

  afterAll(async () => {
    await new Promise((resolve) => setTimeout(resolve, 25));
    await database.close();
  });

  it('creates explicit games and writes one confirmed boundary at the persisted hand count', async () => {
    const gameId = 'boundary-confirmed';
    await createGame(gameId);
    await insertDraw(gameId);

    const before = await getGameBundle(gameId);
    expect(before.game.seatBoundaryHistoryMode).toBe('explicit');
    expect(JSON.parse(before.game.initialSeatMappingJson ?? '{}')).toEqual({
      0: `${gameId}:player:0`,
      1: `${gameId}:player:1`,
      2: `${gameId}:player:2`,
      3: `${gameId}:player:3`,
    });
    expect(before.seatBoundaries).toEqual([]);

    const firstMapping = {
      [`${gameId}:player:3`]: 0,
      [`${gameId}:player:0`]: 1,
      [`${gameId}:player:1`]: 2,
      [`${gameId}:player:2`]: 3,
    };
    await updateGamePlayerSeats(gameId, firstMapping);

    const confirmed = await getGameBundle(gameId);
    expect(confirmed.seatBoundaries).toHaveLength(1);
    expect(confirmed.seatBoundaries?.[0]).toMatchObject({
      gameId,
      effectiveFromHandIndex: 1,
      reason: 'confirmed_reseat',
      seatMapping: {
        0: `${gameId}:player:3`,
        1: `${gameId}:player:0`,
        2: `${gameId}:player:1`,
        3: `${gameId}:player:2`,
      },
    });

    const replacementMapping = {
      [`${gameId}:player:2`]: 0,
      [`${gameId}:player:3`]: 1,
      [`${gameId}:player:0`]: 2,
      [`${gameId}:player:1`]: 3,
    };
    await updateGamePlayerSeats(gameId, replacementMapping);
    const replaced = await getGameBundle(gameId);
    expect(replaced.seatBoundaries).toHaveLength(1);
    expect(replaced.seatBoundaries?.[0].seatMapping).toEqual({
      0: `${gameId}:player:2`,
      1: `${gameId}:player:3`,
      2: `${gameId}:player:0`,
      3: `${gameId}:player:1`,
    });
  });

  it('does not write boundaries during an ordinary hand insert and rejects invalid or terminal reseat writes', async () => {
    const gameId = 'boundary-guards';
    await createGame(gameId);
    await insertDraw(gameId);
    expect((await getGameBundle(gameId)).seatBoundaries).toEqual([]);
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    await expect(updateGamePlayerSeats(gameId, { [`${gameId}:player:0`]: 0 })).rejects.toThrow('Invalid reseat payload');
    expect((await getGameBundle(gameId)).seatBoundaries).toEqual([]);

    await database.executeSql("UPDATE games SET gameState = 'ended', endedAt = 1 WHERE id = ?;", [gameId]);
    await expect(updateGamePlayerSeats(gameId, {
      [`${gameId}:player:0`]: 0,
      [`${gameId}:player:1`]: 1,
      [`${gameId}:player:2`]: 2,
      [`${gameId}:player:3`]: 3,
    })).rejects.toThrow('Cannot mutate ended or abandoned game');
    expect((await getGameBundle(gameId)).seatBoundaries).toEqual([]);
    errorSpy.mockRestore();
  });

  it('rolls back player seat updates when boundary persistence fails', async () => {
    const gameId = 'boundary-rollback';
    await createGame(gameId);
    await insertDraw(gameId);
    const originalExecuteSql = database.executeSql.bind(database);
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    let failOnce = true;
    database.executeSql = async (sql, params) => {
      if (failOnce && sql.includes('INSERT INTO game_seat_boundaries')) {
        failOnce = false;
        throw new Error('Injected boundary write failure');
      }
      return originalExecuteSql(sql, params);
    };

    await expect(updateGamePlayerSeats(gameId, {
      [`${gameId}:player:3`]: 0,
      [`${gameId}:player:0`]: 1,
      [`${gameId}:player:1`]: 2,
      [`${gameId}:player:2`]: 3,
    })).rejects.toThrow('Injected boundary write failure');

    expect(await rows(database, `SELECT id, seatIndex FROM players WHERE gameId = '${gameId}' ORDER BY seatIndex;`)).toEqual([
      { id: `${gameId}:player:0`, seatIndex: 0 },
      { id: `${gameId}:player:1`, seatIndex: 1 },
      { id: `${gameId}:player:2`, seatIndex: 2 },
      { id: `${gameId}:player:3`, seatIndex: 3 },
    ]);
    expect(await rows(database, `SELECT id FROM game_seat_boundaries WHERE gameId = '${gameId}';`)).toEqual([]);
    database.executeSql = originalExecuteSql;
    errorSpy.mockRestore();
  });

  it('keeps boundary rows subject to the database delete cascade', async () => {
    const gameId = 'boundary-delete';
    await createGame(gameId);
    await insertDraw(gameId);
    await updateGamePlayerSeats(gameId, {
      [`${gameId}:player:3`]: 0,
      [`${gameId}:player:0`]: 1,
      [`${gameId}:player:1`]: 2,
      [`${gameId}:player:2`]: 3,
    });
    await database.executeSql('DELETE FROM games WHERE id = ?;', [gameId]);
    expect(await rows(database, `SELECT id FROM game_seat_boundaries WHERE gameId = '${gameId}';`)).toEqual([]);
  });
});
