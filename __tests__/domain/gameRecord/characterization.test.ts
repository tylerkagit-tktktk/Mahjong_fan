import { buildGameResultSummarySnapshot } from '../../../src/db/repo';
import { computeHkSettlement } from '../../../src/domain/hk/settlement';
import { getDealerSeatIndexForNextHand, getNextDealerSeatIndex, getRoundLabel } from '../../../src/models/dealer';
import { computeGameStats } from '../../../src/models/gameStats';
import { aggregatePlayerTotalsQByTimeline } from '../../../src/models/seatRotation';
import {
  ALL_DRAW_HANDS,
  DRAW_PASS_HAND,
  DRAW_STAY_HAND,
  EMPTY_GAME_BUNDLE,
  ENDED_RESULT_BUNDLE,
  FIXED_CREATED_AT,
  GOLDEN_PLAYERS,
  MALFORMED_STORED_HAND_FIXTURE,
  NEXT_WIND_HANDS,
  RESEAT_BOUNDARY_HANDS,
  SETTLEMENT_FIXTURES,
  traditionalRules,
} from '../../../test-support/gameRecord/fixtures';

function sumQ(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

describe('2.1 game record characterization fixtures', () => {
  it.each(SETTLEMENT_FIXTURES)('$id preserves current settlement deltas and effective fan', (fixture) => {
    const result = computeHkSettlement({
      rules: fixture.rules,
      fan: fixture.fan,
      settlementType: fixture.settlementType,
      winnerSeatIndex: fixture.winnerSeatIndex,
      discarderSeatIndex: fixture.discarderSeatIndex,
    });

    expect(result.deltasQ).toEqual(fixture.expectedDeltasQ);
    expect(result.effectiveFan).toBe(fixture.expectedEffectiveFan);
    expect(sumQ(result.deltasQ)).toBe(0);
  });

  it('preserves the minimum-fan boundary', () => {
    const rules = traditionalRules({ minFanToWin: 3 });

    expect(() => computeHkSettlement({
      rules,
      fan: 2,
      settlementType: 'discard',
      winnerSeatIndex: 0,
      discarderSeatIndex: 1,
    })).toThrow('HK_MIN_FAN_NOT_MET:3');

    expect(computeHkSettlement({
      rules,
      fan: 3,
      settlementType: 'discard',
      winnerSeatIndex: 0,
      discarderSeatIndex: 1,
    }).deltasQ).toEqual([32, -16, -8, -8]);
  });

  it('preserves dealer advancement for wins and draw stay/pass', () => {
    expect(getNextDealerSeatIndex({ dealerSeatIndex: 0, isDraw: false, winnerSeatIndex: 0 })).toBe(0);
    expect(getNextDealerSeatIndex({ dealerSeatIndex: 0, isDraw: false, winnerSeatIndex: 2 })).toBe(1);
    expect(getDealerSeatIndexForNextHand(0, [DRAW_STAY_HAND])).toBe(0);
    expect(getDealerSeatIndexForNextHand(0, [DRAW_PASS_HAND])).toBe(1);
  });

  it('treats currentRoundLabelZh as the next hand label and advances after four dealer changes', () => {
    expect(getRoundLabel(0, EMPTY_GAME_BUNDLE.hands).labelZh).toBe('東風東局');
    expect(getRoundLabel(0, [DRAW_STAY_HAND]).labelZh).toBe('東風東局');
    expect(getRoundLabel(0, [DRAW_PASS_HAND]).labelZh).toBe('東風南局');
    expect(NEXT_WIND_HANDS.map((hand) => hand.handIndex)).toEqual([0, 1, 2, 3]);
    expect(getRoundLabel(0, NEXT_WIND_HANDS).labelZh).toBe('南風東局');
    expect(NEXT_WIND_HANDS[NEXT_WIND_HANDS.length - 1].nextRoundLabelZh).toBe('南風東局');
  });

  it('keeps all-draw timelines at zero totals and counts draw statistics', () => {
    const bundle = {
      ...EMPTY_GAME_BUNDLE,
      game: {
        ...EMPTY_GAME_BUNDLE.game,
        gameState: 'ended' as const,
        endedAt: FIXED_CREATED_AT + 4_000,
        handsCount: ALL_DRAW_HANDS.length,
      },
      hands: ALL_DRAW_HANDS,
    };
    const stats = computeGameStats(bundle);

    expect(stats.draws).toBe(4);
    expect(stats.totalsQBySeat).toEqual([0, 0, 0, 0]);
    expect(stats.zeroSumOk).toBe(true);
  });

  it('preserves player identity totals across the existing wind-cycle seat rotation convention', () => {
    const totals = aggregatePlayerTotalsQByTimeline(
      GOLDEN_PLAYERS,
      RESEAT_BOUNDARY_HANDS.map((hand) => ({
        nextRoundLabelZh: hand.nextRoundLabelZh,
        deltasQ: JSON.parse(hand.deltasJson ?? 'null') as number[] | null,
      })),
      '北風北局',
      0,
    );

    expect(totals.get('player-east')).toBe(0);
    expect(totals.get('player-south')).toBe(-16);
    expect(totals.get('player-west')).toBe(0);
    expect(totals.get('player-north')).toBe(16);
    expect(Array.from(totals.values()).reduce((total, value) => total + value, 0)).toBe(0);
  });

  it('preserves ended-game ranking, statistics, and result summary projection', () => {
    const stats = computeGameStats(ENDED_RESULT_BUNDLE);
    const summary = buildGameResultSummarySnapshot(ENDED_RESULT_BUNDLE);

    expect(stats.ranking.map((entry) => [entry.name, entry.totalMoney])).toEqual([
      ['West', 12],
      ['East', 4],
      ['North', -4],
      ['South', -12],
    ]);
    expect(stats.winsByPlayerId).toMatchObject({ 'player-east': 1, 'player-west': 1 });
    expect(stats.zimoByPlayerId).toMatchObject({ 'player-west': 1 });
    expect(stats.discardByPlayerId).toMatchObject({ 'player-south': 1 });
    expect(stats.draws).toBe(0);
    expect(summary).toEqual({
      winnerText: 'West +HK$12',
      loserText: 'South -HK$12',
      seatTotalsQ: [16, -48, 48, -16],
      playerTotalsQ: {
        'player-east': 16,
        'player-south': -48,
        'player-west': 48,
        'player-north': -16,
      },
      playersCount: 4,
    });
  });

  it('keeps malformed stored settlement input deterministic for future rejection coverage', () => {
    expect(MALFORMED_STORED_HAND_FIXTURE).toEqual({
      id: 'malformed-non-zero-sum',
      handIndex: 0,
      persistedDeltasQ: [16, -8, -4, -2],
      expectedFutureValidationCode: 'NON_ZERO_SUM_SETTLEMENT',
    });
    expect(sumQ(MALFORMED_STORED_HAND_FIXTURE.persistedDeltasQ)).toBe(2);
  });

  it('uses fixed fixture IDs and timestamps without locale, timezone, or random inputs', () => {
    expect(EMPTY_GAME_BUNDLE.game.createdAt).toBe(FIXED_CREATED_AT);
    expect(ENDED_RESULT_BUNDLE.hands.map((hand) => hand.createdAt)).toEqual([
      FIXED_CREATED_AT,
      FIXED_CREATED_AT + 1_000,
    ]);
    expect(SETTLEMENT_FIXTURES.map((fixture) => fixture.id)).toEqual([
      'dealer-zimo-stays',
      'half-gun-discard',
      'full-gun-discard',
      'custom-linear-cap',
      'traditional-thirteen-fan',
      'traditional-cap-ten',
    ]);
  });
});
