import { getLocalGameReopenAvailability } from '../../../src/domain/gameRecord/localLifecycle';
import { replayLocalGameBundle } from '../../../src/services/localGameReplay';
import { computeHkSettlement } from '../../../src/domain/hk/settlement';
import { traditionalRules } from '../../../test-support/gameRecord/fixtures';

function endedBundle() {
  const rules = traditionalRules({ gunMode: 'halfGun' });
  const deltasQ = computeHkSettlement({
    rules, fan: 3, settlementType: 'discard', winnerSeatIndex: 1, discarderSeatIndex: 0,
  }).deltasQ;
  return {
    game: {
      id: 'reopen-availability', title: 'Ended', createdAt: 1, currencySymbol: 'HK$', variant: 'HK', rulesJson: JSON.stringify(rules),
      startingDealerSeatIndex: 0, progressIndex: 0, currentWindIndex: 0, currentRoundNumber: 1, maxWindIndex: 1,
      seatRotationOffset: 0, seatBoundaryHistoryMode: 'explicit', initialSeatMappingJson: JSON.stringify({ 0: 'p0', 1: 'p1', 2: 'p2', 3: 'p3' }),
      gameState: 'ended', currentRoundLabelZh: '東風南局', endedAt: 2, handsCount: 1, resultStatus: 'result',
      resultSummaryJson: JSON.stringify({ seatTotalsQ: deltasQ, playerTotalsQ: { p0: deltasQ[0], p1: deltasQ[1], p2: deltasQ[2], p3: deltasQ[3] }, playersCount: 4 }),
      resultUpdatedAt: 2,
    },
    players: [0, 1, 2, 3].map((seatIndex) => ({ id: `p${seatIndex}`, gameId: 'reopen-availability', name: `P${seatIndex}`, seatIndex })),
    hands: [{
      id: 'h0', gameId: 'reopen-availability', handIndex: 0, dealerSeatIndex: 0, windIndex: 0, roundNumber: 1,
      isDraw: false, winnerSeatIndex: 1, type: 'discard', winnerPlayerId: 'p1', discarderPlayerId: 'p0', inputValue: deltasQ[1] / 4,
      deltasJson: JSON.stringify({ unit: 'Q', values: deltasQ }), nextRoundLabelZh: '東風南局',
      computedJson: JSON.stringify({ settlementType: 'discard', fan: 3, effectiveFan: 3 }), createdAt: 1,
    }],
    seatBoundaries: [],
  };
}

describe('local game reopen availability', () => {
  it('requires an authoritative ended local result with a current persisted hand count', () => {
    const bundle = endedBundle();
    const replayResult = replayLocalGameBundle(bundle as any);
    expect(replayResult.authoritative).toBe(true);
    expect(getLocalGameReopenAvailability({ bundle: bundle as any, replayResult })).toEqual({ code: 'AVAILABLE', available: true });

    expect(getLocalGameReopenAvailability({
      bundle: { ...bundle, game: { ...bundle.game, handsCount: 2 } } as any,
      replayResult,
    })).toEqual({ code: 'STALE_SOURCE_DATA', available: false });
    expect(getLocalGameReopenAvailability({
      bundle: { ...bundle, game: { ...bundle.game, gameState: 'abandoned' } } as any,
      replayResult,
    })).toEqual({ code: 'ABANDONED_NOT_SUPPORTED', available: false });
  });
});
