import { createGameWithPlayers, insertHand } from '../../src/db/repo';
import { replayLocalGameBundle, loadAndReplayLocalGame } from '../../src/services/localGameReplay';
import { computeHkSettlement } from '../../src/domain/hk/settlement';
import { ActualSqliteDatabase } from '../../test-support/sqlite/actualSqliteDatabase';
import { EMPTY_GAME_BUNDLE, GOLDEN_PLAYERS, traditionalRules } from '../../test-support/gameRecord/fixtures';
import type { GameBundle } from '../../src/models/db';

const mockOpenDatabase = jest.fn();

jest.mock('react-native-sqlite-storage', () => ({
  __esModule: true,
  default: {
    enablePromise: jest.fn(),
    openDatabase: (...args: unknown[]) => mockOpenDatabase(...args),
  },
}));

async function queryRows(
  database: ActualSqliteDatabase,
  sql: string,
): Promise<Array<Record<string, unknown>>> {
  const [result] = await database.executeSql(sql);
  const typedResult = result as {
    rows: { length: number; item: (index: number) => Record<string, unknown> };
  };
  return Array.from({ length: typedResult.rows.length }, (_, index) => typedResult.rows.item(index));
}

function emptyBundle(): GameBundle {
  return JSON.parse(JSON.stringify(EMPTY_GAME_BUNDLE)) as GameBundle;
}

describe('local game replay service', () => {
  beforeEach(() => {
    mockOpenDatabase.mockReset();
  });

  it('replays a bundle without reading or writing storage', () => {
    const bundle = emptyBundle();
    const before = JSON.parse(JSON.stringify(bundle)) as GameBundle;

    const result = replayLocalGameBundle(bundle);

    expect(result.readError).toBeNull();
    expect(result.replay?.isValid).toBe(true);
    expect(result.parity?.requiredStatus).toBe('exact');
    expect(result.authoritative).toBe(true);
    expect(bundle).toEqual(before);
  });

  it('loads through getGameBundle and proves a real SQLite read leaves rows unchanged', async () => {
    const database = await ActualSqliteDatabase.create();
    mockOpenDatabase.mockResolvedValue(database);
    const gameId = 'phase-1b-read-only-game';
    const rules = traditionalRules({ gunMode: 'halfGun' });
    const players = GOLDEN_PLAYERS.map((player) => ({ ...player, gameId }));
    const settlement = computeHkSettlement({
      rules,
      fan: 3,
      settlementType: 'discard',
      winnerSeatIndex: 1,
      discarderSeatIndex: 0,
    });

    try {
      await createGameWithPlayers(
        {
          id: gameId,
          title: 'Phase 1B read only',
          currencySymbol: rules.currencySymbol,
          variant: 'HK',
          rulesJson: JSON.stringify(rules),
          startingDealerSeatIndex: 0,
          createdAt: 1_700_000_000_000,
        },
        players,
      );
      await insertHand({
        id: `${gameId}:hand:0`,
        gameId,
        dealerSeatIndex: 0,
        isDraw: false,
        winnerSeatIndex: 1,
        discarderSeatIndex: 0,
        type: 'fan',
        winnerPlayerId: players[1].id,
        discarderPlayerId: players[0].id,
        inputValue: 0,
        deltasJson: JSON.stringify({ unit: 'Q', values: settlement.deltasQ }),
        computedJson: JSON.stringify({
          settlementType: 'discard',
          fan: 3,
        }),
        createdAt: 1_700_000_000_001,
      });
      await insertHand({
        id: `${gameId}:hand:1`,
        gameId,
        dealerSeatIndex: 1,
        isDraw: true,
        winnerSeatIndex: null,
        discarderSeatIndex: null,
        type: 'draw',
        winnerPlayerId: null,
        discarderPlayerId: null,
        inputValue: 0,
        deltasJson: JSON.stringify({ unit: 'Q', values: [0, 0, 0, 0] }),
        computedJson: JSON.stringify({
          settlementType: 'draw',
          dealerAction: 'pass',
        }),
        createdAt: 1_700_000_000_002,
      });

      const beforeRows = {
        games: await queryRows(database, 'SELECT * FROM games ORDER BY id;'),
        players: await queryRows(database, 'SELECT * FROM players ORDER BY id;'),
        hands: await queryRows(database, 'SELECT * FROM hands ORDER BY handIndex;'),
      };

      const result = await loadAndReplayLocalGame(gameId);

      const afterRows = {
        games: await queryRows(database, 'SELECT * FROM games ORDER BY id;'),
        players: await queryRows(database, 'SELECT * FROM players ORDER BY id;'),
        hands: await queryRows(database, 'SELECT * FROM hands ORDER BY handIndex;'),
      };

      expect(result.readError).toBeNull();
      expect(result.adapter?.ok).toBe(true);
      expect(result.replay?.isValid).toBe(true);
      expect(result.parity?.requiredStatus).toBe('exact');
      expect(result.authoritative).toBe(true);
      expect(afterRows).toEqual(beforeRows);

      const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      const missingResult = await loadAndReplayLocalGame('missing-phase-1b-game');
      errorSpy.mockRestore();
      expect(missingResult.adapter).toBeNull();
      expect(missingResult.replay).toBeNull();
      expect(missingResult.parity).toBeNull();
      expect(missingResult.authoritative).toBe(false);
      expect(missingResult.readError).toMatchObject({
        code: 'NOT_FOUND',
        gameId: 'missing-phase-1b-game',
      });
    } finally {
      await new Promise((resolve) => setTimeout(resolve, 25));
      await database.close();
    }
  });
});
