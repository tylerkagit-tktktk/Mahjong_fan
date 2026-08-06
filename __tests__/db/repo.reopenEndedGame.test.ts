import {
  createGameWithPlayers,
  endGame,
  getGameBundle,
  getGameHandRevisions,
  getGameLifecycleRevisions,
  insertHand,
  removeLastHand,
  reopenEndedGame,
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

function players(gameId: string) {
  return [0, 1, 2, 3].map((seatIndex) => ({ id: `${gameId}:p${seatIndex}`, gameId, name: `P${seatIndex}`, seatIndex }));
}

async function createEndedGame(gameId: string): Promise<void> {
  const rules = traditionalRules({ gunMode: 'halfGun' });
  await createGameWithPlayers({
    id: gameId, title: gameId, currencySymbol: 'HK$', variant: 'HK', rulesJson: JSON.stringify(rules),
    startingDealerSeatIndex: 0, createdAt: 1_700_000_000_000,
  }, players(gameId));
  const deltasQ = computeHkSettlement({ rules, fan: 3, settlementType: 'discard', winnerSeatIndex: 1, discarderSeatIndex: 0 }).deltasQ;
  await insertHand({
    id: `${gameId}:h0`, gameId, dealerSeatIndex: 0, isDraw: false, winnerSeatIndex: 1, discarderSeatIndex: 0,
    type: 'discard', winnerPlayerId: null, discarderPlayerId: null, inputValue: deltasQ[1] / 4,
    deltasJson: JSON.stringify({ unit: 'Q', values: deltasQ }),
    computedJson: JSON.stringify({ settlementType: 'discard', fan: 3, effectiveFan: 3 }), createdAt: 1_700_000_000_001,
  });
  await endGame(gameId, 1_700_000_001_000);
}

function reopenInput(bundle: Awaited<ReturnType<typeof getGameBundle>>) {
  const last = bundle.hands[bundle.hands.length - 1];
  return {
    gameId: bundle.game.id,
    expectedHandsCount: bundle.hands.length,
    expectedLastHandId: last.id,
    expectedEndedAt: bundle.game.endedAt as number,
  };
}

describe('ended local game reopen lifecycle transaction', () => {
  let database: ActualSqliteDatabase;

  beforeAll(async () => {
    database = await ActualSqliteDatabase.create();
    mockOpenDatabase.mockResolvedValue(database);
  });

  afterAll(async () => {
    await new Promise((resolve) => setTimeout(resolve, 25));
    await database.close();
  });

  it('reopens an authoritative ended game, invalidates terminal cache, and writes immutable lifecycle audit', async () => {
    const gameId = 'reopen-success';
    await createEndedGame(gameId);
    const before = await getGameBundle(gameId);
    expect((await loadAndReplayLocalGame(gameId)).authoritative).toBe(true);

    const result = await reopenEndedGame({ ...reopenInput(before), reason: 'fix final hand' });
    expect(result).toMatchObject({ ok: true, state: 'active', handsCount: 1, recordMutationVersion: 1 });
    const after = await getGameBundle(gameId);
    expect(after.hands).toEqual(before.hands);
    expect(after.players).toEqual(before.players);
    expect(after.seatBoundaries).toEqual(before.seatBoundaries);
    expect(after.game).toMatchObject({
      gameState: 'active', endedAt: null, resultStatus: 'none', resultSummaryJson: null,
      resultUpdatedAt: null, recordMutationVersion: 1, currentRoundLabelZh: '東風南局',
    });
    const lifecycle = await getGameLifecycleRevisions(gameId);
    expect(lifecycle).toHaveLength(1);
    expect(lifecycle[0]).toMatchObject({ action: 'reopen', lifecycleRevisionIndex: 0, recordMutationVersion: 1, reason: 'fix final hand' });
    expect(lifecycle[0].before.game).toEqual(before.game);
    expect(lifecycle[0].after.game).toEqual(after.game);
    expect(await getGameHandRevisions(gameId)).toEqual([]);
    expect((await loadAndReplayLocalGame(gameId)).authoritative).toBe(true);
    const remove = await removeLastHand({
      action: 'remove', gameId, expectedHandId: `${gameId}:h0`, expectedHandIndex: 0, expectedHandsCount: 1,
    });
    expect(remove).toMatchObject({ ok: true, revision: { recordMutationVersion: 2 } });
  });

  it('shares mutation order with a subsequent hand mutation and permits a new end result', async () => {
    const gameId = 'reopen-mutation-order';
    await createEndedGame(gameId);
    const ended = await getGameBundle(gameId);
    await reopenEndedGame(reopenInput(ended));
    const replace = await replaceLastHand({
      action: 'replace', gameId, expectedHandId: `${gameId}:h0`, expectedHandIndex: 0, expectedHandsCount: 1,
      outcome: 'draw', dealerAction: 'stick',
    });
    expect(replace).toMatchObject({ ok: true, revision: { recordMutationVersion: 2 } });
    expect((await getGameBundle(gameId)).game.recordMutationVersion).toBe(2);
    expect((await getGameHandRevisions(gameId)).map((revision) => revision.recordMutationVersion)).toEqual([2]);
    await endGame(gameId, 1_700_000_002_000);
    const reEnded = await getGameBundle(gameId);
    expect(reEnded.game).toMatchObject({ gameState: 'ended', resultStatus: 'result', recordMutationVersion: 2 });
    expect(reEnded.game.resultSummaryJson).not.toBe(ended.game.resultSummaryJson);
  });

  it('rejects stale/second/abandoned reopen requests and rolls back revision insert failures', async () => {
    const gameId = 'reopen-guards';
    await createEndedGame(gameId);
    const ended = await getGameBundle(gameId);
    const stale = await reopenEndedGame({ ...reopenInput(ended), expectedLastHandId: 'old' });
    expect(stale).toEqual({ ok: false, code: 'STALE_REOPEN_TARGET' });

    const originalExecuteSql = database.executeSql.bind(database);
    let failOnce = true;
    database.executeSql = async (sql, params) => {
      if (failOnce && sql.includes('INSERT INTO game_lifecycle_revisions')) {
        failOnce = false;
        throw new Error('Injected lifecycle write failure');
      }
      return originalExecuteSql(sql, params);
    };
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    await expect(reopenEndedGame(reopenInput(ended))).rejects.toThrow('Injected lifecycle write failure');
    database.executeSql = originalExecuteSql;
    errorSpy.mockRestore();
    expect((await getGameBundle(gameId)).game).toEqual(ended.game);
    expect(await getGameLifecycleRevisions(gameId)).toEqual([]);

    expect((await reopenEndedGame(reopenInput(ended))).ok).toBe(true);
    expect(await reopenEndedGame(reopenInput(ended))).toEqual({ ok: false, code: 'GAME_NOT_ENDED' });

    await createGameWithPlayers({
      id: 'abandoned', title: 'abandoned', currencySymbol: 'HK$', variant: 'HK', rulesJson: JSON.stringify(traditionalRules()),
      startingDealerSeatIndex: 0, createdAt: 1,
    }, players('abandoned'));
    await endGame('abandoned', 2);
    expect(await reopenEndedGame({ gameId: 'abandoned', expectedHandsCount: 0, expectedLastHandId: '', expectedEndedAt: 2 }))
      .toEqual({ ok: false, code: 'ABANDONED_GAME_CANNOT_REOPEN' });
  });
});
