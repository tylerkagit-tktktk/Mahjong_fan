import { computeHkSettlement } from '../../../src/domain/hk/settlement';
import { getLocalLastHandCorrectionAvailability, planLocalLastHandMutation } from '../../../src/domain/gameRecord/localMutation';
import type { GameBundle } from '../../../src/models/db';
import { traditionalRules } from '../../../test-support/gameRecord/fixtures';

function activeBundle(): GameBundle {
  const rules = traditionalRules({ gunMode: 'halfGun' });
  const deltasQ = computeHkSettlement({
    rules,
    fan: 3,
    settlementType: 'discard',
    winnerSeatIndex: 1,
    discarderSeatIndex: 0,
  }).deltasQ;
  return {
    game: {
      id: 'mutation-game', title: 'Mutation', createdAt: 1_700_000_000_000, currencySymbol: 'HK$', variant: 'HK',
      rulesJson: JSON.stringify(rules), startingDealerSeatIndex: 0, progressIndex: 0, currentWindIndex: 0,
      currentRoundNumber: 1, maxWindIndex: 1, seatRotationOffset: 0, seatBoundaryHistoryMode: 'explicit',
      initialSeatMappingJson: JSON.stringify({ 0: 'p0', 1: 'p1', 2: 'p2', 3: 'p3' }), gameState: 'active',
      currentRoundLabelZh: '東風南局', endedAt: null, handsCount: 1, resultStatus: 'none', resultSummaryJson: null,
      resultUpdatedAt: null,
    },
    players: [0, 1, 2, 3].map((seatIndex) => ({ id: `p${seatIndex}`, gameId: 'mutation-game', name: `P${seatIndex}`, seatIndex })),
    hands: [{
      id: 'h0', gameId: 'mutation-game', handIndex: 0, dealerSeatIndex: 0, windIndex: 0, roundNumber: 1,
      isDraw: false, winnerSeatIndex: 1, type: 'discard', winnerPlayerId: 'p1', discarderPlayerId: 'p0',
      inputValue: deltasQ[1] / 4, deltasJson: JSON.stringify({ unit: 'Q', values: deltasQ }),
      nextRoundLabelZh: '東風南局', computedJson: JSON.stringify({ settlementType: 'discard', fan: 3, effectiveFan: 3 }),
      createdAt: 1_700_000_000_001,
    }],
    seatBoundaries: [],
  };
}

function guard() {
  return { gameId: 'mutation-game', expectedHandId: 'h0', expectedHandIndex: 0, expectedHandsCount: 1 };
}

describe('local last-hand mutation planner', () => {
  it('only exposes correction for an authoritative active game without a final seat boundary', () => {
    const bundle = activeBundle();
    expect(getLocalLastHandCorrectionAvailability({ bundle, authoritative: true })).toEqual({ code: 'AVAILABLE', available: true });
    expect(getLocalLastHandCorrectionAvailability({ bundle, authoritative: false })).toEqual({ code: 'NOT_AUTHORITATIVE', available: false });

    bundle.seatBoundaries = [{
      id: 'after', gameId: bundle.game.id, effectiveFromHandIndex: 1,
      seatMapping: { 0: 'p3', 1: 'p0', 2: 'p1', 3: 'p2' }, reason: 'confirmed_reseat', createdAt: 2,
    }];
    expect(getLocalLastHandCorrectionAvailability({ bundle, authoritative: true })).toEqual({
      code: 'LAST_EFFECTIVE_EVENT_IS_BOUNDARY', available: false,
    });
  });

  it('replaces a discard with canonical zimo persistence without mutating input', () => {
    const bundle = activeBundle();
    const before = JSON.parse(JSON.stringify(bundle));
    const result = planLocalLastHandMutation({
      bundle,
      action: { ...guard(), action: 'replace', outcome: 'zimo', fan: 4, winnerPlayerId: 'p1' },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.plan.afterHand).toMatchObject({
      id: 'h0', handIndex: 0, type: 'zimo', winnerPlayerId: 'p1', discarderPlayerId: null,
      isDraw: false, dealerSeatIndex: 0,
    });
    expect(JSON.parse(result.plan.afterHand?.deltasJson ?? '{}')).toEqual({ unit: 'Q', values: [-32, 96, -32, -32] });
    expect(result.plan.nextHandsCount).toBe(1);
    expect(planLocalLastHandMutation({
      bundle,
      action: { ...guard(), action: 'replace', outcome: 'zimo', fan: 4, winnerPlayerId: 'p1' },
    })).toEqual(result);
    expect(bundle).toEqual(before);
  });

  it('replaces a win with draw pass and removes an only hand through valid prospective replays', () => {
    const draw = planLocalLastHandMutation({
      bundle: activeBundle(),
      action: { ...guard(), action: 'replace', outcome: 'draw', dealerAction: 'pass' },
    });
    expect(draw.ok).toBe(true);
    if (draw.ok) expect(draw.plan.afterHand).toMatchObject({ isDraw: true, type: 'draw', winnerPlayerId: null, nextRoundLabelZh: '東風南局' });

    const remove = planLocalLastHandMutation({ bundle: activeBundle(), action: { ...guard(), action: 'remove' } });
    expect(remove.ok).toBe(true);
    if (remove.ok) {
      expect(remove.plan.afterHand).toBeNull();
      expect(remove.plan.nextHandsCount).toBe(0);
      expect(remove.plan.nextRoundLabelZh).toBe('東風東局');
    }
  });

  it('rejects stale, invalid, non-authoritative, and later-boundary targets with stable codes', () => {
    const stale = planLocalLastHandMutation({
      bundle: activeBundle(), action: { ...guard(), expectedHandId: 'old', action: 'remove' },
    });
    expect(stale).toMatchObject({ ok: false, issues: [{ code: 'STALE_MUTATION_TARGET' }] });

    const invalid = planLocalLastHandMutation({
      bundle: activeBundle(), action: { ...guard(), action: 'replace', outcome: 'discard', fan: 3, winnerPlayerId: 'p1' },
    });
    expect(invalid).toMatchObject({ ok: false, issues: [{ code: 'INVALID_REPLACEMENT_INPUT' }] });

    const withLaterBoundary = activeBundle();
    withLaterBoundary.seatBoundaries = [{
      id: 'after', gameId: 'mutation-game', effectiveFromHandIndex: 1,
      seatMapping: { 0: 'p3', 1: 'p0', 2: 'p1', 3: 'p2' }, reason: 'confirmed_reseat', createdAt: 2,
    }];
    withLaterBoundary.players = [
      { ...withLaterBoundary.players[3], seatIndex: 0 }, { ...withLaterBoundary.players[0], seatIndex: 1 },
      { ...withLaterBoundary.players[1], seatIndex: 2 }, { ...withLaterBoundary.players[2], seatIndex: 3 },
    ];
    const boundary = planLocalLastHandMutation({ bundle: withLaterBoundary, action: { ...guard(), action: 'remove' } });
    expect(boundary).toMatchObject({ ok: false, issues: [{ code: 'CORRECTION_TARGET_NOT_LAST_EFFECTIVE_EVENT' }] });

    const corrupted = activeBundle();
    corrupted.hands[0].deltasJson = JSON.stringify([0, 0, 0, 0]);
    const nonAuthoritative = planLocalLastHandMutation({ bundle: corrupted, action: { ...guard(), action: 'remove' } });
    expect(nonAuthoritative).toMatchObject({ ok: false, issues: [{ code: 'CURRENT_TIMELINE_NOT_AUTHORITATIVE' }] });
  });
});
