import {
  createGameWithPlayers,
  getGameBundle,
  getGameHandRevisions,
  insertHand,
  removeLastHand,
  replaceLastHand,
} from '../../src/db/repo';
import { computeHkSettlement } from '../../src/domain/hk/settlement';
import { loadAndReplayLocalGame } from '../../src/services/localGameReplay';
import { ActualSqliteDatabase } from '../../test-support/sqlite/actualSqliteDatabase';
import { traditionalRules } from '../../test-support/gameRecord/fixtures';

const mockOpenDatabase = jest.fn();

jest.mock('react-native-sqlite-storage', () => ({
  __esModule: true,
  default: { enablePromise: jest.fn(), openDatabase: (...args: unknown[]) => mockOpenDatabase(...args) },
}));

async function rows(database: ActualSqliteDatabase, sql: string, params: unknown[] = []) {
  const [result] = await database.executeSql(sql, params);
  const typed = result as { rows: { length: number; item: (index: number) => Record<string, unknown> } };
  return Array.from({ length: typed.rows.length }, (_, index) => typed.rows.item(index));
}

function players(gameId: string) {
  return [0, 1, 2, 3].map((seatIndex) => ({ id: `${gameId}:p${seatIndex}`, gameId, name: `P${seatIndex}`, seatIndex }));
}

async function createActiveGame(gameId: string, hands = 1): Promise<void> {
  const rules = traditionalRules({ gunMode: 'halfGun' });
  await createGameWithPlayers({
    id: gameId, title: gameId, currencySymbol: rules.currencySymbol, variant: 'HK', rulesJson: JSON.stringify(rules),
    startingDealerSeatIndex: 0, createdAt: 1_700_000_000_000,
  }, players(gameId));
  const first = computeHkSettlement({ rules, fan: 3, settlementType: 'discard', winnerSeatIndex: 1, discarderSeatIndex: 0 }).deltasQ;
  await insertHand({
    id: `${gameId}:h0`, gameId, dealerSeatIndex: 0, isDraw: false, winnerSeatIndex: 1, discarderSeatIndex: 0,
    type: 'discard', winnerPlayerId: null, discarderPlayerId: null, inputValue: first[1] / 4,
    deltasJson: JSON.stringify({ unit: 'Q', values: first }),
    computedJson: JSON.stringify({ settlementType: 'discard', fan: 3, effectiveFan: 3 }), createdAt: 1_700_000_000_001,
  });
  if (hands > 1) {
    await insertHand({
      id: `${gameId}:h1`, gameId, dealerSeatIndex: 1, isDraw: true, winnerSeatIndex: null, discarderSeatIndex: null,
      type: 'draw', winnerPlayerId: null, discarderPlayerId: null, inputValue: 0,
      deltasJson: JSON.stringify({ unit: 'Q', values: [0, 0, 0, 0] }),
      computedJson: JSON.stringify({ settlementType: 'draw', dealerAction: 'stick' }), createdAt: 1_700_000_000_002,
    });
  }
}

describe('local last-hand mutation repository transactions', () => {
  let database: ActualSqliteDatabase;

  beforeAll(async () => {
    database = await ActualSqliteDatabase.create();
    mockOpenDatabase.mockResolvedValue(database);
  });

  afterAll(async () => {
    await new Promise((resolve) => setTimeout(resolve, 25));
    await database.close();
  });

  it('replaces only the active last hand, preserves identity, writes derived data and immutable revision', async () => {
    const gameId = 'replace-last';
    await createActiveGame(gameId, 2);
    const before = await getGameBundle(gameId);
    const earlier = before.hands[0];
    const result = await replaceLastHand({
      action: 'replace', gameId, expectedHandId: `${gameId}:h1`, expectedHandIndex: 1, expectedHandsCount: 2,
      outcome: 'zimo', fan: 4, winnerPlayerId: `${gameId}:p1`, reason: 'correct result',
    });

    expect(result).toMatchObject({ ok: true, action: 'replace' });
    const after = await getGameBundle(gameId);
    expect(after.game).toMatchObject({ gameState: 'active', handsCount: 2, resultSummaryJson: null });
    expect(after.hands[0]).toEqual(earlier);
    expect(after.hands[1]).toMatchObject({ id: `${gameId}:h1`, handIndex: 1, type: 'zimo', winnerPlayerId: `${gameId}:p1` });
    expect(JSON.parse(after.hands[1].deltasJson ?? '{}')).toEqual({ unit: 'Q', values: [-32, 96, -32, -32] });
    const revisions = await getGameHandRevisions(gameId);
    expect(revisions).toHaveLength(1);
    expect(revisions[0]).toMatchObject({ revisionIndex: 0, action: 'replace', targetHandId: `${gameId}:h1`, reason: 'correct result' });
    expect(revisions[0].before.hand).toEqual(before.hands[1]);
    expect(revisions[0].after?.hand).toEqual(after.hands[1]);
    expect((await loadAndReplayLocalGame(gameId)).authoritative).toBe(true);
  });

  it('removes only the active last hand, preserves earlier data, and increments revision audit order', async () => {
    const gameId = 'remove-last';
    await createActiveGame(gameId, 2);
    const before = await getGameBundle(gameId);
    const result = await removeLastHand({
      action: 'remove', gameId, expectedHandId: `${gameId}:h1`, expectedHandIndex: 1, expectedHandsCount: 2,
    });
    expect(result).toMatchObject({ ok: true, action: 'remove', hand: null });
    const after = await getGameBundle(gameId);
    expect(after.game).toMatchObject({ handsCount: 1, gameState: 'active', currentRoundLabelZh: '東風南局' });
    expect(after.hands).toEqual([before.hands[0]]);
    const revisions = await getGameHandRevisions(gameId);
    expect(revisions).toHaveLength(1);
    expect(revisions[0]).toMatchObject({ action: 'remove', revisionIndex: 0, after: null });
    expect(revisions[0].before.hand).toEqual(before.hands[1]);
    expect((await loadAndReplayLocalGame(gameId)).authoritative).toBe(true);
  });

  it('rejects a stale target without writing and rolls back if immutable revision insert fails', async () => {
    const gameId = 'mutation-rollback';
    await createActiveGame(gameId);
    const stale = await removeLastHand({
      action: 'remove', gameId, expectedHandId: 'old', expectedHandIndex: 0, expectedHandsCount: 1,
    });
    expect(stale).toEqual({ ok: false, code: 'STALE_MUTATION_TARGET' });
    expect((await getGameBundle(gameId)).hands).toHaveLength(1);

    const originalExecuteSql = database.executeSql.bind(database);
    let failOnce = true;
    database.executeSql = async (sql, params) => {
      if (failOnce && sql.includes('INSERT INTO game_hand_revisions')) {
        failOnce = false;
        throw new Error('Injected revision write failure');
      }
      return originalExecuteSql(sql, params);
    };
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    await expect(replaceLastHand({
      action: 'replace', gameId, expectedHandId: `${gameId}:h0`, expectedHandIndex: 0, expectedHandsCount: 1,
      outcome: 'draw', dealerAction: 'stick',
    })).rejects.toThrow('Injected revision write failure');
    database.executeSql = originalExecuteSql;
    errorSpy.mockRestore();

    const after = await getGameBundle(gameId);
    expect(after.hands).toHaveLength(1);
    expect(after.hands[0].type).toBe('discard');
    expect(await getGameHandRevisions(gameId)).toEqual([]);
    expect(await rows(database, 'SELECT handsCount FROM games WHERE id = ?;', [gameId])).toEqual([{ handsCount: 1 }]);
  });
});
