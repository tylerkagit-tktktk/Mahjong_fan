import {
  createGameWithPlayers,
  endGame,
  getGameBundle,
  insertHand,
  updateGamePlayerSeats,
} from '../../src/db/repo';
import { buildLocalDashboardProjection } from '../../src/domain/gameRecord/localDashboardProjection';
import { rankDashboardPlayers } from '../../src/domain/gameRecord/dashboardResultPresentation';
import { replayLocalGameBundle } from '../../src/services/localGameReplay';
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
  const names = ['East', 'South', 'West', 'North'];
  return [0, 1, 2, 3].map((seatIndex) => ({
    id: `${gameId}:player:${seatIndex}`,
    gameId,
    name: names[seatIndex],
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

async function insertDrawPass(gameId: string, handNumber: number, dealerSeatIndex: number): Promise<void> {
  await insertHand({
    id: `${gameId}:draw-pass:${handNumber}`,
    gameId,
    dealerSeatIndex,
    isDraw: true,
    winnerSeatIndex: null,
    discarderSeatIndex: null,
    type: 'draw',
    winnerPlayerId: null,
    discarderPlayerId: null,
    inputValue: 0,
    deltasJson: JSON.stringify({ unit: 'Q', values: [0, 0, 0, 0] }),
    computedJson: JSON.stringify({ settlementType: 'draw', dealerAction: 'pass' }),
    createdAt: 1_700_000_000_100 + handNumber,
  });
}

async function insertAsymmetricDiscard(gameId: string, id: string): Promise<void> {
  await insertHand({
    id,
    gameId,
    dealerSeatIndex: 0,
    isDraw: false,
    winnerSeatIndex: 0,
    discarderSeatIndex: 1,
    type: 'fan',
    winnerPlayerId: null,
    discarderPlayerId: null,
    inputValue: 8,
    deltasJson: JSON.stringify({ unit: 'Q', values: [32, -16, -8, -8] }),
    computedJson: JSON.stringify({ settlementType: 'discard', fan: 3 }),
    createdAt: 1_700_000_001_000,
  });
}

async function advanceToNorthToEastWrap(gameId: string): Promise<void> {
  for (let handNumber = 0; handNumber < 16; handNumber += 1) {
    await insertDrawPass(gameId, handNumber, handNumber % 4);
  }
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

  it('persists canonical results across an explicit reseat, dashboard ranking, and share ranking source', async () => {
    const gameId = 'boundary-ended-result';
    await createGame(gameId);

    await insertAsymmetricDiscard(gameId, `${gameId}:before-reseat`);
    await advanceToNorthToEastWrap(gameId);

    const beforeReseat = await getGameBundle(gameId);
    expect(beforeReseat.game.currentRoundLabelZh).toBe('東風東局');
    expect(beforeReseat.hands.at(-2)?.nextRoundLabelZh).toBe('北風北局');
    expect(beforeReseat.hands.at(-1)?.nextRoundLabelZh).toBe('東風東局');

    await updateGamePlayerSeats(gameId, {
      [`${gameId}:player:3`]: 0,
      [`${gameId}:player:0`]: 1,
      [`${gameId}:player:1`]: 2,
      [`${gameId}:player:2`]: 3,
    });
    await insertAsymmetricDiscard(gameId, `${gameId}:after-reseat`);
    await endGame(gameId, 1_700_000_010_000);

    const ended = await getGameBundle(gameId);
    const persistedSummary = JSON.parse(ended.game.resultSummaryJson ?? '{}');
    const playerTotalsQ = {
      [`${gameId}:player:0`]: 16,
      [`${gameId}:player:1`]: -24,
      [`${gameId}:player:2`]: -16,
      [`${gameId}:player:3`]: 24,
    };

    expect(ended.seatBoundaries).toEqual([
      expect.objectContaining({
        effectiveFromHandIndex: 17,
        reason: 'confirmed_reseat',
        seatMapping: {
          0: `${gameId}:player:3`,
          1: `${gameId}:player:0`,
          2: `${gameId}:player:1`,
          3: `${gameId}:player:2`,
        },
      }),
    ]);
    expect(persistedSummary).toEqual({
      winnerText: 'North +HK$6',
      loserText: 'South -HK$6',
      seatTotalsQ: [64, -32, -16, -16],
      playerTotalsQ,
      playersCount: 4,
    });

    const replay = replayLocalGameBundle(ended);
    expect(replay.authoritative).toBe(true);
    expect(replay.parity?.requiredStatus).toBe('exact');
    expect(replay.parity?.items).toEqual(expect.arrayContaining([
      expect.objectContaining({ field: 'endedResultSummary.source', status: 'exact' }),
      expect.objectContaining({ field: 'endedResultSummary.replay', status: 'exact' }),
    ]));

    const dashboard = buildLocalDashboardProjection({ bundle: ended, localReplayResult: replay });
    expect(dashboard).toMatchObject({ source: 'canonical', fallbackReason: null });
    expect(Object.fromEntries(dashboard.projection.players.map((player) => [player.playerId, player.totalQ]))).toEqual(playerTotalsQ);
    expect(rankDashboardPlayers(dashboard.projection.players).map((player) => [
      player.displayName,
      player.totalQ,
      player.rank,
    ])).toEqual([
      ['North', 24, 1],
      ['East', 16, 2],
      ['West', -16, 3],
      ['South', -24, 4],
    ]);
  });

  it('keeps the no-reseat ended result projection unchanged', async () => {
    const gameId = 'boundary-no-reseat-result';
    await createGame(gameId);
    await insertAsymmetricDiscard(gameId, `${gameId}:only-hand`);
    await endGame(gameId, 1_700_000_020_000);

    const ended = await getGameBundle(gameId);
    expect(JSON.parse(ended.game.resultSummaryJson ?? '{}')).toEqual({
      winnerText: 'East +HK$8',
      loserText: 'South -HK$4',
      seatTotalsQ: [32, -16, -8, -8],
      playerTotalsQ: {
        [`${gameId}:player:0`]: 32,
        [`${gameId}:player:1`]: -16,
        [`${gameId}:player:2`]: -8,
        [`${gameId}:player:3`]: -8,
      },
      playersCount: 4,
    });
    expect(replayLocalGameBundle(ended).parity?.requiredStatus).toBe('exact');
  });

  it('keeps explicit player attribution across multiple post-reseat hands', async () => {
    const gameId = 'boundary-multiple-post-hands';
    await createGame(gameId);
    await insertAsymmetricDiscard(gameId, `${gameId}:before-reseat`);
    await advanceToNorthToEastWrap(gameId);
    await updateGamePlayerSeats(gameId, {
      [`${gameId}:player:3`]: 0,
      [`${gameId}:player:0`]: 1,
      [`${gameId}:player:1`]: 2,
      [`${gameId}:player:2`]: 3,
    });
    await insertAsymmetricDiscard(gameId, `${gameId}:after-reseat-one`);
    await insertAsymmetricDiscard(gameId, `${gameId}:after-reseat-two`);
    await endGame(gameId, 1_700_000_030_000);

    const ended = await getGameBundle(gameId);
    const replay = replayLocalGameBundle(ended);
    const expectedTotals = {
      [`${gameId}:player:0`]: 0,
      [`${gameId}:player:1`]: -32,
      [`${gameId}:player:2`]: -24,
      [`${gameId}:player:3`]: 56,
    };

    expect(JSON.parse(ended.game.resultSummaryJson ?? '{}').playerTotalsQ).toEqual(expectedTotals);
    expect(replay.replay?.summary?.playerTotalsQ).toEqual(expectedTotals);
    expect(replay.parity?.requiredStatus).toBe('exact');
    expect(replay.authoritative).toBe(true);
  });
});
