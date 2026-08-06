import type { GameBundle, Hand } from '../../models/db';
import { computeHkSettlement } from '../hk/settlement';
import type { RulesV1 } from '../../models/rules';
import { adaptLocalGameBundle } from './localAdapter';
import { compareLocalReplayParity } from './localParity';
import { replayGameRecord } from './replay';
import type { CanonicalGameRecordSnapshot, CanonicalHandInput, CanonicalHandOutcome, CanonicalHkRules, ReplayResult, SeatIndex } from './types';

export type LocalLastHandMutationErrorCode =
  | 'GAME_NOT_FOUND'
  | 'GAME_NOT_ACTIVE'
  | 'NO_HAND_TO_MUTATE'
  | 'STALE_MUTATION_TARGET'
  | 'PERSISTED_HANDS_COUNT_MISMATCH'
  | 'CORRECTION_TARGET_NOT_LAST_EFFECTIVE_EVENT'
  | 'CURRENT_TIMELINE_NOT_AUTHORITATIVE'
  | 'INVALID_REPLACEMENT_INPUT'
  | 'PROSPECTIVE_REPLAY_INVALID';

export type LocalLastHandMutationIssue = {
  code: LocalLastHandMutationErrorCode;
};

type LastHandGuard = {
  gameId: string;
  expectedHandId: string;
  expectedHandIndex: number;
  expectedHandsCount: number;
  reason?: string | null;
};

export type ReplaceLastHandInput = LastHandGuard & {
  action: 'replace';
  outcome: CanonicalHandOutcome;
  fan?: number | null;
  winnerPlayerId?: string | null;
  discarderPlayerId?: string | null;
  dealerAction?: 'stick' | 'pass' | null;
};

export type RemoveLastHandInput = LastHandGuard & {
  action: 'remove';
};

export type LocalLastHandMutationInput = ReplaceLastHandInput | RemoveLastHandInput;

export type LocalLastHandMutationPlan = {
  action: 'replace' | 'remove';
  gameId: string;
  beforeHand: Hand;
  afterHand: Hand | null;
  nextHandsCount: number;
  nextRoundLabelZh: string;
  replay: ReplayResult;
  reason: string | null;
};

export type LocalLastHandMutationPlanResult =
  | { ok: true; plan: LocalLastHandMutationPlan; issues: readonly [] }
  | { ok: false; plan: null; issues: readonly LocalLastHandMutationIssue[] };

export type LocalLastHandCorrectionAvailabilityCode =
  | 'AVAILABLE'
  | 'GAME_NOT_ACTIVE'
  | 'NO_HAND'
  | 'NOT_AUTHORITATIVE'
  | 'LAST_EFFECTIVE_EVENT_IS_BOUNDARY'
  | 'STALE_SOURCE_DATA';

export function getLocalLastHandCorrectionAvailability(input: {
  bundle: GameBundle;
  authoritative: boolean;
}): { code: LocalLastHandCorrectionAvailabilityCode; available: boolean } {
  const { bundle, authoritative } = input;
  if (bundle.game.gameState !== 'active') return { code: 'GAME_NOT_ACTIVE', available: false };
  if (bundle.hands.length === 0) return { code: 'NO_HAND', available: false };
  if (bundle.game.handsCount !== bundle.hands.length) return { code: 'STALE_SOURCE_DATA', available: false };
  if (!authoritative) return { code: 'NOT_AUTHORITATIVE', available: false };
  if ((bundle.seatBoundaries ?? []).some((boundary) => boundary.effectiveFromHandIndex === bundle.hands.length)) {
    return { code: 'LAST_EFFECTIVE_EVENT_IS_BOUNDARY', available: false };
  }
  return { code: 'AVAILABLE', available: true };
}

const WIND_INDEX: Record<string, number> = { 東: 0, 南: 1, 西: 2, 北: 3 };

function reject(code: LocalLastHandMutationErrorCode): LocalLastHandMutationPlanResult {
  return { ok: false, plan: null, issues: [{ code }] };
}

function cloneSnapshot(snapshot: CanonicalGameRecordSnapshot): CanonicalGameRecordSnapshot {
  return {
    ...snapshot,
    players: snapshot.players.map((player) => ({ ...player })),
    initialSeats: snapshot.initialSeats.map((seat) => ({ ...seat })),
    timeline: snapshot.timeline.map((entry) => entry.entryType === 'hand'
      ? { ...entry, persistedDeltasQ: entry.persistedDeltasQ ? [...entry.persistedDeltasQ] : null }
      : { ...entry, seats: entry.seats.map((seat) => ({ ...seat })) }),
  };
}

function replaceIntentIsStructurallyValid(
  input: ReplaceLastHandInput,
  playerIds: ReadonlySet<string>,
): boolean {
  if (input.outcome === 'draw') {
    return input.fan == null && input.winnerPlayerId == null && input.discarderPlayerId == null &&
      (input.dealerAction === 'stick' || input.dealerAction === 'pass');
  }
  if (!Number.isInteger(input.fan) || (input.fan as number) < 0 || !input.winnerPlayerId || !playerIds.has(input.winnerPlayerId)) {
    return false;
  }
  if (input.outcome === 'zimo') {
    return input.discarderPlayerId == null && input.dealerAction == null;
  }
  return Boolean(
    input.discarderPlayerId &&
    input.discarderPlayerId !== input.winnerPlayerId &&
    playerIds.has(input.discarderPlayerId) &&
    input.dealerAction == null,
  );
}

function makeReplacementCanonicalHand(before: CanonicalHandInput, input: ReplaceLastHandInput): CanonicalHandInput {
  return {
    ...before,
    outcome: input.outcome,
    fan: input.outcome === 'draw' ? null : input.fan ?? null,
    winnerPlayerId: input.outcome === 'draw' ? null : input.winnerPlayerId ?? null,
    discarderPlayerId: input.outcome === 'discard' ? input.discarderPlayerId ?? null : null,
    drawDealerAction: input.outcome === 'draw' ? input.dealerAction ?? null : null,
    // Caller settlement is never accepted; a null persisted source lets replay derive it afresh.
    persistedDeltasQ: null,
  };
}

function asSeatIndex(value: number | null): SeatIndex | null {
  return value !== null && Number.isInteger(value) && value >= 0 && value <= 3 ? value as SeatIndex : null;
}

function toRulesV1(rules: CanonicalHkRules): RulesV1 {
  return {
    version: 1, variant: 'HK', mode: 'HK', languageDefault: 'zh-Hant', currencyCode: 'HKD',
    currencySymbol: rules.currencySymbol, seats: { order: ['E', 'S', 'W', 'N'] }, minFanToWin: rules.minFanToWin,
    hk: {
      scoring: 'fan', scoringPreset: rules.scoringPreset, gunMode: rules.gunMode, stakePreset: rules.stakePreset,
      unitPerFan: rules.unitPerFan, capFan: rules.capFan, applyDealerMultiplier: true,
    },
    settlement: { mode: 'immediate' },
  };
}

function derivedStoredHand(
  before: Hand,
  replay: ReplayResult,
  targetIndex: number,
): Hand | null {
  const projection = replay.handProjections[targetIndex];
  const deltasQ = projection?.deltasQ;
  if (!projection || !deltasQ || projection.derivedDealerSeatIndex === null) return null;
  const source = projection.source;
  const winnerSeatIndex = source.winnerPlayerId
    ? asSeatIndex(projection.effectiveSeats.find((seat) => seat.playerId === source.winnerPlayerId)?.seatIndex ?? null)
    : null;
  const priorRound = targetIndex === 0 ? null : replay.handProjections[targetIndex - 1]?.roundAfterHand ?? null;
  const wind = priorRound?.wind ?? '東';
  const roundNumber = priorRound?.roundIndex ?? 1;
  const computed: Record<string, unknown> = { settlementType: source.outcome };
  if (source.outcome === 'draw') {
    computed.dealerAction = source.drawDealerAction;
  } else {
    const discarderSeatIndex = source.outcome === 'discard'
      ? asSeatIndex(projection.effectiveSeats.find((seat) => seat.playerId === source.discarderPlayerId)?.seatIndex ?? null)
      : null;
    const rules = replay.source.rules;
    const effectiveFan = rules.variant === 'HK' && winnerSeatIndex !== null
      ? computeHkSettlement({
          rules: toRulesV1(rules as CanonicalHkRules), fan: source.fan as number, settlementType: source.outcome,
          winnerSeatIndex, discarderSeatIndex,
        }).effectiveFan
      : source.fan;
    computed.fan = source.fan;
    computed.effectiveFan = effectiveFan;
  }
  return {
    ...before,
    dealerSeatIndex: projection.derivedDealerSeatIndex,
    windIndex: WIND_INDEX[wind],
    roundNumber,
    isDraw: source.outcome === 'draw',
    winnerSeatIndex,
    type: source.outcome,
    winnerPlayerId: source.winnerPlayerId,
    discarderPlayerId: source.discarderPlayerId,
    inputValue: source.outcome === 'draw' || winnerSeatIndex === null ? 0 : deltasQ[winnerSeatIndex] / 4,
    deltasJson: JSON.stringify({ unit: 'Q', values: deltasQ }),
    computedJson: JSON.stringify(computed),
    nextRoundLabelZh: projection.roundAfterHand?.nextRoundLabelZh ?? null,
    createdAt: before.createdAt,
  };
}

/**
 * Plans a local last-hand mutation from a fully loaded bundle. It is intentionally pure: IDs,
 * timestamps and every SQLite write are repository responsibilities.
 */
export function planLocalLastHandMutation(input: {
  bundle: GameBundle;
  action: LocalLastHandMutationInput;
}): LocalLastHandMutationPlanResult {
  const { bundle, action } = input;
  if (bundle.game.id !== action.gameId) return reject('STALE_MUTATION_TARGET');
  if (bundle.game.gameState !== 'active') return reject('GAME_NOT_ACTIVE');
  const orderedHands = bundle.hands.slice().sort((left, right) => left.handIndex - right.handIndex);
  if (orderedHands.length === 0) return reject('NO_HAND_TO_MUTATE');
  if (bundle.game.handsCount !== orderedHands.length) return reject('PERSISTED_HANDS_COUNT_MISMATCH');
  const beforeHand = orderedHands[orderedHands.length - 1];
  if (
    action.expectedHandsCount !== orderedHands.length ||
    action.expectedHandId !== beforeHand.id ||
    action.expectedHandIndex !== beforeHand.handIndex
  ) return reject('STALE_MUTATION_TARGET');
  if ((bundle.seatBoundaries ?? []).some((boundary) => boundary.effectiveFromHandIndex === orderedHands.length)) {
    return reject('CORRECTION_TARGET_NOT_LAST_EFFECTIVE_EVENT');
  }

  const adapter = adaptLocalGameBundle(bundle);
  if (!adapter.ok) return reject('CURRENT_TIMELINE_NOT_AUTHORITATIVE');
  const currentReplay = replayGameRecord(adapter.snapshot);
  const currentParity = compareLocalReplayParity(bundle, currentReplay);
  const reliesOnInferredBoundary = adapter.snapshot.timeline.some((entry) => entry.entryType === 'seat-boundary') &&
    adapter.diagnostics.some((diagnostic) => diagnostic.code === 'LEGACY_INFERRED_BOUNDARY_HISTORY');
  const currentAuthoritative = currentReplay.isValid && currentParity.requiredStatus === 'exact' &&
    !reliesOnInferredBoundary && adapter.diagnostics.every((diagnostic) => diagnostic.severity === 'info');
  if (!currentAuthoritative) return reject('CURRENT_TIMELINE_NOT_AUTHORITATIVE');
  const snapshot = cloneSnapshot(adapter.snapshot);
  const canonicalHands = snapshot.timeline.filter((entry): entry is CanonicalHandInput => entry.entryType === 'hand');
  const targetCanonical = canonicalHands[canonicalHands.length - 1];
  if (!targetCanonical || targetCanonical.id !== beforeHand.id || targetCanonical.handIndex !== beforeHand.handIndex) {
    return reject('CURRENT_TIMELINE_NOT_AUTHORITATIVE');
  }

  let prospective: CanonicalGameRecordSnapshot;
  if (action.action === 'replace') {
    const playerIds = new Set(snapshot.players.map((player) => player.id));
    if (!replaceIntentIsStructurallyValid(action, playerIds)) return reject('INVALID_REPLACEMENT_INPUT');
    prospective = {
      ...snapshot,
      timeline: snapshot.timeline.map((entry) => entry.entryType === 'hand' && entry.id === targetCanonical.id
        ? makeReplacementCanonicalHand(entry, action)
        : entry),
    };
  } else {
    prospective = {
      ...snapshot,
      timeline: snapshot.timeline.filter((entry) => entry.entryType !== 'hand' || entry.id !== targetCanonical.id),
    };
  }

  const replay = replayGameRecord(prospective);
  if (!replay.isValid || !replay.finalRound || !replay.statistics) return reject('PROSPECTIVE_REPLAY_INVALID');
  const afterHand = action.action === 'replace'
    ? derivedStoredHand(beforeHand, replay, beforeHand.handIndex)
    : null;
  if (action.action === 'replace' && !afterHand) return reject('PROSPECTIVE_REPLAY_INVALID');

  return {
    ok: true,
    issues: [],
    plan: {
      action: action.action,
      gameId: bundle.game.id,
      beforeHand: { ...beforeHand },
      afterHand,
      nextHandsCount: replay.statistics.handsCount,
      nextRoundLabelZh: replay.finalRound.nextRoundLabelZh,
      replay,
      reason: action.reason ?? null,
    },
  };
}
