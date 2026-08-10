import { computeHkSettlement } from '../hk/settlement';
import { getNextDealerSeatIndex, getRoundLabelFromDealerState } from '../../models/dealer';
import type { RulesV1 } from '../../models/rules';
import {
  CanonicalGameRecordSnapshot,
  CanonicalHandInput,
  CanonicalHkRules,
  CanonicalPlayer,
  CanonicalSeatAssignment,
  CanonicalSeatBoundary,
  ReplayHandProjection,
  ReplayOptions,
  ReplayPlayerProjection,
  ReplayRankingEntry,
  ReplayResult,
  ReplayRoundProjection,
  ReplaySettlementDirection,
  ReplayStatistics,
  ReplayValidationCode,
  ReplayValidationIssue,
  SeatIndex,
} from './types';

const SEAT_INDICES: readonly SeatIndex[] = [0, 1, 2, 3];

const BLOCKING_TIMELINE_CODES = new Set<ReplayValidationCode>([
  'INVALID_HAND_INDEX',
  'NON_SEQUENTIAL_HAND_INDEX',
  'UNKNOWN_WINNER',
  'UNKNOWN_DISCARDER',
  'WINNER_EQUALS_DISCARDER',
  'INVALID_FAN_VALUE',
  'BELOW_MINIMUM_FAN',
  'INVALID_DRAW_ACTION',
  'INVALID_SEAT_BOUNDARY',
]);

type RawRecord = Record<string, unknown>;

type CollectedIssue = {
  issue: ReplayValidationIssue;
  category: 'record' | 'timeline';
  timelineIndex: number;
  insertionIndex: number;
};

type HandEntry = {
  source: CanonicalHandInput;
  timelineIndex: number;
  persistedDeltas: PersistedDeltas;
};

type BoundaryEntry = {
  source: CanonicalSeatBoundary;
  timelineIndex: number;
  seats: CanonicalSeatAssignment[];
};

type PersistedDeltas =
  | { kind: 'absent' }
  | { kind: 'malformed' }
  | { kind: 'non-zero-sum' }
  | { kind: 'valid'; values: [number, number, number, number] };

function isRecord(value: unknown): value is RawRecord {
  return typeof value === 'object' && value !== null;
}

function isSeatIndex(value: unknown): value is SeatIndex {
  return Number.isInteger(value) && typeof value === 'number' && value >= 0 && value <= 3;
}

function isNonNegativeInteger(value: unknown): value is number {
  return Number.isInteger(value) && typeof value === 'number' && value >= 0;
}

function cloneSeats(seats: readonly CanonicalSeatAssignment[]): CanonicalSeatAssignment[] {
  return seats.map((seat) => ({ seatIndex: seat.seatIndex, playerId: seat.playerId }));
}

function sumQ(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

function sameDeltas(
  left: readonly number[],
  right: readonly number[],
): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function sameSeatMapping(
  left: readonly CanonicalSeatAssignment[],
  right: readonly CanonicalSeatAssignment[],
): boolean {
  return left.length === right.length && left.every(
    (seat, index) => seat.seatIndex === right[index]?.seatIndex && seat.playerId === right[index]?.playerId,
  );
}

function compareText(left: string, right: string): number {
  if (left === right) {
    return 0;
  }
  return left < right ? -1 : 1;
}

function toRulesV1(rules: CanonicalHkRules): RulesV1 {
  return {
    version: 1,
    variant: 'HK',
    mode: 'HK',
    languageDefault: 'zh-Hant',
    currencyCode: 'HKD',
    currencySymbol: rules.currencySymbol,
    seats: { order: ['E', 'S', 'W', 'N'] },
    minFanToWin: rules.minFanToWin,
    hk: {
      scoring: 'fan',
      scoringPreset: rules.scoringPreset,
      gunMode: rules.gunMode,
      stakePreset: rules.stakePreset,
      unitPerFan: rules.unitPerFan,
      capFan: rules.capFan,
      applyDealerMultiplier: true,
    },
    settlement: { mode: 'immediate' },
  };
}

function normalizeRules(
  rawRules: unknown,
  addRecordIssue: (code: ReplayValidationCode, detail: string) => void,
): CanonicalHkRules | null {
  if (!isRecord(rawRules)) {
    addRecordIssue('CORRUPTED_RULES_SNAPSHOT', 'rules snapshot must be an object');
    return null;
  }
  if (rawRules.variant !== 'HK') {
    if (typeof rawRules.variant === 'string') {
      addRecordIssue('UNSUPPORTED_RULE_VARIANT', `unsupported variant: ${rawRules.variant}`);
    } else {
      addRecordIssue('CORRUPTED_RULES_SNAPSHOT', 'rules variant is missing or invalid');
    }
    return null;
  }
  const scoringPreset = rawRules.scoringPreset;
  const gunMode = rawRules.gunMode;
  const stakePreset = rawRules.stakePreset;
  const minFanToWin = rawRules.minFanToWin;
  const unitPerFan = rawRules.unitPerFan;
  const capFan = rawRules.capFan;
  const currencySymbol = rawRules.currencySymbol;
  if (
    (scoringPreset !== 'traditionalFan' && scoringPreset !== 'customTable') ||
    (gunMode !== 'halfGun' && gunMode !== 'fullGun') ||
    (stakePreset !== 'TWO_FIVE_CHICKEN' && stakePreset !== 'FIVE_ONE' && stakePreset !== 'ONE_TWO') ||
    !isNonNegativeInteger(minFanToWin) ||
    typeof unitPerFan !== 'number' ||
    !Number.isFinite(unitPerFan) ||
    unitPerFan <= 0 ||
    !(capFan === null || (Number.isInteger(capFan) && typeof capFan === 'number' && capFan > 0)) ||
    typeof currencySymbol !== 'string'
  ) {
    addRecordIssue('CORRUPTED_RULES_SNAPSHOT', 'HK rules snapshot is incomplete or invalid');
    return null;
  }
  return {
    variant: 'HK',
    scoringPreset,
    gunMode,
    stakePreset,
    minFanToWin,
    unitPerFan,
    capFan,
    currencySymbol,
  };
}

function normalizePlayers(
  rawPlayers: unknown,
  addRecordIssue: (code: ReplayValidationCode, detail: string) => void,
): CanonicalPlayer[] | null {
  if (!Array.isArray(rawPlayers)) {
    addRecordIssue('INVALID_PLAYER_COUNT', 'players must be an array with at least four historical identities');
    return null;
  }
  if (rawPlayers.length < 4) {
    addRecordIssue('INVALID_PLAYER_COUNT', `expected at least four historical players, received ${rawPlayers.length}`);
  }
  const players: CanonicalPlayer[] = [];
  const seenIds = new Set<string>();
  rawPlayers.forEach((rawPlayer, index) => {
    if (!isRecord(rawPlayer) || typeof rawPlayer.id !== 'string' || rawPlayer.id.length === 0 || typeof rawPlayer.displayName !== 'string') {
      addRecordIssue('DUPLICATE_PLAYER_IDENTITY', `player at index ${index} is not a valid identity`);
      return;
    }
    if (seenIds.has(rawPlayer.id)) {
      addRecordIssue('DUPLICATE_PLAYER_IDENTITY', `duplicate player id: ${rawPlayer.id}`);
      return;
    }
    seenIds.add(rawPlayer.id);
    players.push({ id: rawPlayer.id, displayName: rawPlayer.displayName });
  });
  return players;
}

function normalizeInitialSeats(
  rawSeats: unknown,
  playersById: ReadonlyMap<string, CanonicalPlayer>,
  addRecordIssue: (code: ReplayValidationCode, detail: string) => void,
): CanonicalSeatAssignment[] | null {
  if (!Array.isArray(rawSeats) || rawSeats.length !== 4) {
    addRecordIssue('DUPLICATE_SEAT_IDENTITY', 'initial seats must contain exactly four assignments');
    return null;
  }
  const seats: CanonicalSeatAssignment[] = [];
  const seenSeatIndices = new Set<number>();
  const seenPlayerIds = new Set<string>();
  rawSeats.forEach((rawSeat, index) => {
    if (!isRecord(rawSeat) || !isSeatIndex(rawSeat.seatIndex) || typeof rawSeat.playerId !== 'string') {
      addRecordIssue('DUPLICATE_SEAT_IDENTITY', `initial seat at index ${index} is invalid`);
      return;
    }
    if (seenSeatIndices.has(rawSeat.seatIndex)) {
      addRecordIssue('DUPLICATE_SEAT_IDENTITY', `duplicate seat index: ${rawSeat.seatIndex}`);
      return;
    }
    if (seenPlayerIds.has(rawSeat.playerId) || !playersById.has(rawSeat.playerId)) {
      addRecordIssue('DUPLICATE_SEAT_IDENTITY', `invalid or duplicate seat player: ${rawSeat.playerId}`);
      return;
    }
    seenSeatIndices.add(rawSeat.seatIndex);
    seenPlayerIds.add(rawSeat.playerId);
    seats.push({ seatIndex: rawSeat.seatIndex, playerId: rawSeat.playerId });
  });
  if (seats.length !== 4 || seenSeatIndices.size !== 4 || seenPlayerIds.size !== 4) {
    return null;
  }
  return seats.sort((left, right) => left.seatIndex - right.seatIndex);
}

function parsePersistedDeltas(raw: unknown): PersistedDeltas {
  if (raw === null || raw === undefined) {
    return { kind: 'absent' };
  }
  if (!Array.isArray(raw) || raw.length !== 4 || raw.some((value) => typeof value !== 'number' || !Number.isInteger(value))) {
    return { kind: 'malformed' };
  }
  const values: [number, number, number, number] = [raw[0], raw[1], raw[2], raw[3]];
  if (sumQ(values) !== 0) {
    return { kind: 'non-zero-sum' };
  }
  return { kind: 'valid', values };
}

function isKnownPlayerId(value: unknown, playersById: ReadonlyMap<string, CanonicalPlayer>): value is string {
  return typeof value === 'string' && playersById.has(value);
}

function makeRoundProjection(dealerSeatIndex: SeatIndex, dealerAdvanceCount: number): ReplayRoundProjection {
  const round = getRoundLabelFromDealerState(dealerSeatIndex, dealerAdvanceCount);
  return {
    dealerSeatIndex,
    dealerAdvanceCount,
    roundIndex: round.roundIndex,
    wind: round.wind,
    dealerWind: round.dealerWind,
    nextRoundLabelZh: round.labelZh,
  };
}

function getTopPlayerId(players: readonly CanonicalPlayer[], counts: ReadonlyMap<string, number>): string | null {
  const sorted = players
    .map((player) => [player.id, counts.get(player.id) ?? 0] as const)
    .sort((left, right) => right[1] - left[1]);
  return sorted.length > 0 && sorted[0][1] > 0 ? sorted[0][0] : null;
}

function buildDirections(
  handIndex: number,
  deltasQ: readonly [number, number, number, number],
  effectiveSeats: readonly CanonicalSeatAssignment[],
  winnerPlayerId: string,
): ReplaySettlementDirection[] {
  const playerIdBySeat = new Map(effectiveSeats.map((seat) => [seat.seatIndex, seat.playerId]));
  return SEAT_INDICES.flatMap((seatIndex) => {
    const deltaQ = deltasQ[seatIndex];
    const fromPlayerId = playerIdBySeat.get(seatIndex);
    if (deltaQ >= 0 || !fromPlayerId) {
      return [];
    }
    return [{ handIndex, fromPlayerId, toPlayerId: winnerPlayerId, amountQ: -deltaQ }];
  });
}

/**
 * Replays a canonical record without reading storage, time, randomness, locale, or UI state.
 * Persisted settlement and dealer values are diagnostic source snapshots only; derived values drive output.
 */
export function replayGameRecord(
  input: CanonicalGameRecordSnapshot,
  options: ReplayOptions = {},
): ReplayResult {
  const rawInput: RawRecord = isRecord(input) ? input : {};
  const collectedIssues: CollectedIssue[] = [];
  let insertionIndex = 0;

  const addIssue = (
    category: 'record' | 'timeline',
    code: ReplayValidationCode,
    detail: string,
    context: { entryId?: unknown; handIndex?: unknown; timelineIndex?: number } = {},
  ) => {
    const issue: ReplayValidationIssue = {
      code,
      detail,
      ...(typeof context.entryId === 'string' ? { entryId: context.entryId } : {}),
      ...(isNonNegativeInteger(context.handIndex) ? { handIndex: context.handIndex } : {}),
      ...(category === 'timeline' && context.timelineIndex !== undefined ? { timelineIndex: context.timelineIndex } : {}),
    };
    collectedIssues.push({
      issue,
      category,
      timelineIndex: context.timelineIndex ?? -1,
      insertionIndex,
    });
    insertionIndex += 1;
  };
  const addRecordIssue = (code: ReplayValidationCode, detail: string) => addIssue('record', code, detail);
  const addTimelineIssue = (
    timelineIndex: number,
    source: unknown,
    code: ReplayValidationCode,
    detail: string,
  ) => {
    const rawSource = isRecord(source) ? source : {};
    addIssue('timeline', code, detail, {
      entryId: rawSource.id,
      handIndex: rawSource.handIndex,
      timelineIndex,
    });
  };
  const sortedIssues = (): ReplayValidationIssue[] => collectedIssues
    .slice()
    .sort((left, right) => {
      const categoryOrder = (left.category === 'record' ? 0 : 1) - (right.category === 'record' ? 0 : 1);
      if (categoryOrder !== 0) {
        return categoryOrder;
      }
      if (left.timelineIndex !== right.timelineIndex) {
        return left.timelineIndex - right.timelineIndex;
      }
      const codeOrder = compareText(left.issue.code, right.issue.code);
      return codeOrder !== 0 ? codeOrder : left.insertionIndex - right.insertionIndex;
    })
    .map(({ issue }) => issue);
  const issuesForTimeline = (timelineIndex: number): ReplayValidationIssue[] => sortedIssues()
    .filter((issue) => issue.timelineIndex === timelineIndex);

  const rules = normalizeRules(rawInput.rules, addRecordIssue);
  const players = normalizePlayers(rawInput.players, addRecordIssue);
  const playersById = new Map((players ?? []).map((player) => [player.id, player]));
  const initialSeats = normalizeInitialSeats(rawInput.initialSeats, playersById, addRecordIssue);
  const startingDealerSeatIndex = rawInput.startingDealerSeatIndex;
  if (!isSeatIndex(startingDealerSeatIndex)) {
    addRecordIssue('DEALER_STATE_MISMATCH', 'starting dealer seat must be an integer in 0..3');
  }

  const rawTimeline = rawInput.timeline;
  if (!Array.isArray(rawTimeline)) {
    addRecordIssue('INVALID_HAND_INDEX', 'timeline must be an array');
  }

  const handEntries: HandEntry[] = [];
  const boundaryEntries: BoundaryEntry[] = [];
  const shouldValidatePersistedDeltas = options.validatePersistedDeltas !== false;
  const handCount = Array.isArray(rawTimeline)
    ? rawTimeline.filter((entry) => isRecord(entry) && entry.entryType === 'hand').length
    : 0;

  if (Array.isArray(rawTimeline) && rules && players && initialSeats && isSeatIndex(startingDealerSeatIndex)) {
    rawTimeline.forEach((rawEntry, timelineIndex) => {
      if (!isRecord(rawEntry)) {
        addTimelineIssue(timelineIndex, rawEntry, 'INVALID_HAND_INDEX', 'timeline entry must be an object');
        return;
      }
      if (rawEntry.entryType === 'hand') {
        const source = rawEntry as unknown as CanonicalHandInput;
        const persistedDeltas = shouldValidatePersistedDeltas ? parsePersistedDeltas(rawEntry.persistedDeltasQ) : { kind: 'absent' } as const;
        handEntries.push({ source, timelineIndex, persistedDeltas });
        if (!isNonNegativeInteger(rawEntry.handIndex)) {
          addTimelineIssue(timelineIndex, rawEntry, 'INVALID_HAND_INDEX', 'hand index must be a non-negative integer');
        }
        if (rawEntry.dealerSeatIndex !== null && !isSeatIndex(rawEntry.dealerSeatIndex)) {
          addTimelineIssue(timelineIndex, rawEntry, 'DEALER_STATE_MISMATCH', 'stored dealer seat is invalid');
        }
        if (rawEntry.outcome !== 'zimo' && rawEntry.outcome !== 'discard' && rawEntry.outcome !== 'draw') {
          addTimelineIssue(timelineIndex, rawEntry, 'INVALID_DRAW_ACTION', 'hand outcome is invalid');
        } else if (rawEntry.outcome === 'draw') {
          if (rawEntry.fan !== null) {
            addTimelineIssue(timelineIndex, rawEntry, 'INVALID_FAN_VALUE', 'draw hands must not contain a fan value');
          }
          if (rawEntry.winnerPlayerId !== null) {
            addTimelineIssue(timelineIndex, rawEntry, 'UNKNOWN_WINNER', 'draw hands must not contain a winner');
          }
          if (rawEntry.discarderPlayerId !== null) {
            addTimelineIssue(timelineIndex, rawEntry, 'UNKNOWN_DISCARDER', 'draw hands must not contain a discarder');
          }
          if (rawEntry.drawDealerAction !== 'stick' && rawEntry.drawDealerAction !== 'pass') {
            addTimelineIssue(timelineIndex, rawEntry, 'INVALID_DRAW_ACTION', 'draw hands require a stick or pass action');
          }
        } else {
          if (!isKnownPlayerId(rawEntry.winnerPlayerId, playersById)) {
            addTimelineIssue(timelineIndex, rawEntry, 'UNKNOWN_WINNER', 'winner must be a known player');
          }
          if (rawEntry.outcome === 'discard' && !isKnownPlayerId(rawEntry.discarderPlayerId, playersById)) {
            addTimelineIssue(timelineIndex, rawEntry, 'UNKNOWN_DISCARDER', 'discard hands require a known discarder');
          }
          if (rawEntry.outcome === 'zimo' && rawEntry.discarderPlayerId !== null) {
            addTimelineIssue(timelineIndex, rawEntry, 'UNKNOWN_DISCARDER', 'zimo hands must not contain a discarder');
          }
          if (rawEntry.winnerPlayerId === rawEntry.discarderPlayerId && rawEntry.winnerPlayerId !== null) {
            addTimelineIssue(timelineIndex, rawEntry, 'WINNER_EQUALS_DISCARDER', 'winner and discarder cannot match');
          }
          if (!isNonNegativeInteger(rawEntry.fan)) {
            addTimelineIssue(timelineIndex, rawEntry, 'INVALID_FAN_VALUE', 'winning hands require a non-negative integer fan');
          } else if (rawEntry.fan < rules.minFanToWin) {
            addTimelineIssue(timelineIndex, rawEntry, 'BELOW_MINIMUM_FAN', `fan is below minimum ${rules.minFanToWin}`);
          }
          if (rawEntry.drawDealerAction !== null) {
            addTimelineIssue(timelineIndex, rawEntry, 'INVALID_DRAW_ACTION', 'winning hands must not contain a draw action');
          }
        }
        if (persistedDeltas.kind === 'malformed') {
          addTimelineIssue(timelineIndex, rawEntry, 'MALFORMED_STORED_DELTAS', 'persisted deltas must be four integer Q values');
        } else if (persistedDeltas.kind === 'non-zero-sum') {
          addTimelineIssue(timelineIndex, rawEntry, 'NON_ZERO_SUM_SETTLEMENT', 'persisted deltas must sum to zero');
        }
        return;
      }
      if (rawEntry.entryType === 'seat-boundary') {
        const source = rawEntry as unknown as CanonicalSeatBoundary;
        let seats: CanonicalSeatAssignment[] = [];
        let valid = isNonNegativeInteger(rawEntry.effectiveFromHandIndex) && rawEntry.effectiveFromHandIndex <= handCount;
        if (!valid) {
          addTimelineIssue(timelineIndex, rawEntry, 'INVALID_SEAT_BOUNDARY', 'boundary index must be within 0..handCount');
        }
        if (!Array.isArray(rawEntry.seats) || rawEntry.seats.length !== 4) {
          valid = false;
          addTimelineIssue(timelineIndex, rawEntry, 'INVALID_SEAT_BOUNDARY', 'boundary must contain exactly four seats');
        } else {
          const seenSeatIndices = new Set<number>();
          const seenPlayerIds = new Set<string>();
          rawEntry.seats.forEach((rawSeat, seatPosition) => {
            if (!isRecord(rawSeat) || !isSeatIndex(rawSeat.seatIndex) || typeof rawSeat.playerId !== 'string') {
              valid = false;
              addTimelineIssue(timelineIndex, rawEntry, 'INVALID_SEAT_BOUNDARY', `boundary seat ${seatPosition} is invalid`);
              return;
            }
            if (seenSeatIndices.has(rawSeat.seatIndex) || seenPlayerIds.has(rawSeat.playerId) || !playersById.has(rawSeat.playerId)) {
              valid = false;
              addTimelineIssue(timelineIndex, rawEntry, 'INVALID_SEAT_BOUNDARY', `boundary seat ${seatPosition} duplicates or references an unknown player`);
              return;
            }
            seenSeatIndices.add(rawSeat.seatIndex);
            seenPlayerIds.add(rawSeat.playerId);
            seats.push({ seatIndex: rawSeat.seatIndex, playerId: rawSeat.playerId });
          });
          if (seats.length !== 4 || seenSeatIndices.size !== 4 || seenPlayerIds.size !== 4) {
            valid = false;
          }
        }
        if (valid) {
          seats = seats.sort((left, right) => left.seatIndex - right.seatIndex);
          boundaryEntries.push({ source, timelineIndex, seats });
        }
        return;
      }
      addTimelineIssue(timelineIndex, rawEntry, 'INVALID_HAND_INDEX', 'unrecognized timeline entry type');
    });
  }

  const orderedHands = handEntries
    .slice()
    .sort((left, right) => {
      const leftIndex = isNonNegativeInteger(left.source.handIndex) ? left.source.handIndex : Number.MAX_SAFE_INTEGER;
      const rightIndex = isNonNegativeInteger(right.source.handIndex) ? right.source.handIndex : Number.MAX_SAFE_INTEGER;
      return leftIndex === rightIndex ? left.timelineIndex - right.timelineIndex : leftIndex - rightIndex;
    });
  let expectedHandIndex = 0;
  orderedHands.forEach((entry) => {
    if (isNonNegativeInteger(entry.source.handIndex) && entry.source.handIndex !== expectedHandIndex) {
      addTimelineIssue(entry.timelineIndex, entry.source, 'NON_SEQUENTIAL_HAND_INDEX', `expected hand index ${expectedHandIndex}`);
    }
    expectedHandIndex += 1;
  });
  let previousSourceHandIndex = -1;
  handEntries.forEach((entry) => {
    if (isNonNegativeInteger(entry.source.handIndex)) {
      if (entry.source.handIndex <= previousSourceHandIndex) {
        addTimelineIssue(entry.timelineIndex, entry.source, 'NON_SEQUENTIAL_HAND_INDEX', 'hands are not in timeline order');
      }
      previousSourceHandIndex = entry.source.handIndex;
    }
  });

  const boundariesByHandIndex = new Map<number, BoundaryEntry>();
  boundaryEntries.forEach((entry) => {
    const effectiveFromHandIndex = entry.source.effectiveFromHandIndex;
    const precedingHand = orderedHands[effectiveFromHandIndex - 1];
    const followingHand = orderedHands[effectiveFromHandIndex];
    if (
      (precedingHand && entry.timelineIndex < precedingHand.timelineIndex) ||
      (followingHand && entry.timelineIndex > followingHand.timelineIndex)
    ) {
      addTimelineIssue(entry.timelineIndex, entry.source, 'INVALID_SEAT_BOUNDARY', 'boundary position conflicts with effective timeline order');
      return;
    }
    const existing = boundariesByHandIndex.get(effectiveFromHandIndex);
    if (existing && !sameSeatMapping(existing.seats, entry.seats)) {
      addTimelineIssue(entry.timelineIndex, entry.source, 'INVALID_SEAT_BOUNDARY', 'conflicting boundaries share an effective hand index');
      return;
    }
    if (!existing) {
      boundariesByHandIndex.set(effectiveFromHandIndex, entry);
    }
  });

  const hasRecordIssue = collectedIssues.some((entry) => entry.category === 'record');
  const hasBlockingTimelineIssue = collectedIssues.some(
    (entry) => entry.category === 'timeline' && BLOCKING_TIMELINE_CODES.has(entry.issue.code),
  );
  const invalidWithoutReplay = hasRecordIssue || hasBlockingTimelineIssue;
  if (invalidWithoutReplay) {
    const issues = sortedIssues();
    if (hasRecordIssue) {
      return {
        source: input,
        isValid: false,
        handProjections: [],
        players: [],
        ranking: [],
        settlementDirections: [],
        finalSeats: null,
        finalRound: null,
        statistics: null,
        summary: null,
        validationIssues: issues,
      };
    }
    const fallbackSeats = cloneSeats(initialSeats ?? []);
    return {
      source: input,
      isValid: false,
      handProjections: orderedHands.map((entry) => ({
        source: entry.source,
        effectiveSeats: cloneSeats(fallbackSeats),
        derivedDealerSeatIndex: null,
        deltasQ: null,
        settlementDirections: [],
        roundAfterHand: null,
        validationIssues: issuesForTimeline(entry.timelineIndex),
      })),
      players: [],
      ranking: [],
      settlementDirections: [],
      finalSeats: null,
      finalRound: null,
      statistics: null,
      summary: null,
      validationIssues: issues,
    };
  }

  const effectiveSeatsByHandIndex = new Map<number, CanonicalSeatAssignment[]>();
  let currentSeats = cloneSeats(initialSeats as CanonicalSeatAssignment[]);
  for (let handIndex = 0; handIndex <= orderedHands.length; handIndex += 1) {
    const boundary = boundariesByHandIndex.get(handIndex);
    if (boundary) {
      currentSeats = cloneSeats(boundary.seats);
    }
    if (handIndex < orderedHands.length) {
      effectiveSeatsByHandIndex.set(handIndex, cloneSeats(currentSeats));
    }
  }
  const finalSeats = cloneSeats(currentSeats);
  const rulesV1 = toRulesV1(rules as CanonicalHkRules);
  const playerTotalsQ = new Map<string, number>((players as CanonicalPlayer[]).map((player) => [player.id, 0]));
  const wins = new Map<string, number>();
  const zimoCounts = new Map<string, number>();
  const discardCounts = new Map<string, number>();
  const seatTotalsQ: [number, number, number, number] = [0, 0, 0, 0];
  const settlementDirections: ReplaySettlementDirection[] = [];
  const handProjections: ReplayHandProjection[] = [];
  let currentDealerSeatIndex = startingDealerSeatIndex as SeatIndex;
  let dealerAdvanceCount = 0;
  let draws = 0;
  let semanticFailure = false;

  orderedHands.forEach((entry) => {
    const source = entry.source;
    const effectiveSeats = cloneSeats(effectiveSeatsByHandIndex.get(source.handIndex) ?? finalSeats);
    const seatByPlayerId = new Map(effectiveSeats.map((seat) => [seat.playerId, seat.seatIndex]));
    const derivedDealerSeatIndex = currentDealerSeatIndex;
    if (source.dealerSeatIndex !== null && source.dealerSeatIndex !== derivedDealerSeatIndex) {
      addTimelineIssue(entry.timelineIndex, source, 'DEALER_STATE_MISMATCH', `expected dealer seat ${derivedDealerSeatIndex}`);
    }

    let deltasQ: [number, number, number, number] | null = null;
    let directions: ReplaySettlementDirection[] = [];
    if (source.outcome === 'draw') {
      deltasQ = [0, 0, 0, 0];
      draws += 1;
    } else {
      const winnerSeatIndex = seatByPlayerId.get(source.winnerPlayerId as string) as SeatIndex;
      const discarderSeatIndex = source.outcome === 'discard'
        ? seatByPlayerId.get(source.discarderPlayerId as string) ?? null
        : null;
      try {
        deltasQ = computeHkSettlement({
          rules: rulesV1,
          fan: source.fan as number,
          settlementType: source.outcome,
          winnerSeatIndex,
          discarderSeatIndex,
        }).deltasQ;
      } catch {
        addTimelineIssue(entry.timelineIndex, source, 'INVALID_FAN_VALUE', 'settlement could not be derived from the source hand');
        semanticFailure = true;
      }
      if (deltasQ && source.winnerPlayerId) {
        wins.set(source.winnerPlayerId, (wins.get(source.winnerPlayerId) ?? 0) + 1);
        if (source.outcome === 'zimo') {
          zimoCounts.set(source.winnerPlayerId, (zimoCounts.get(source.winnerPlayerId) ?? 0) + 1);
        }
        if (source.outcome === 'discard' && source.discarderPlayerId) {
          discardCounts.set(source.discarderPlayerId, (discardCounts.get(source.discarderPlayerId) ?? 0) + 1);
        }
        directions = buildDirections(source.handIndex, deltasQ, effectiveSeats, source.winnerPlayerId);
      }
    }

    if (deltasQ && sumQ(deltasQ) !== 0) {
      addTimelineIssue(entry.timelineIndex, source, 'NON_ZERO_SUM_SETTLEMENT', 'derived settlement must sum to zero');
      semanticFailure = true;
    }
    if (deltasQ && entry.persistedDeltas.kind === 'valid' && !sameDeltas(entry.persistedDeltas.values, deltasQ)) {
      addTimelineIssue(entry.timelineIndex, source, 'STORED_SETTLEMENT_MISMATCH', 'persisted deltas differ from replay-derived deltas');
    }
    if (deltasQ) {
      SEAT_INDICES.forEach((seatIndex) => {
        const deltaQ = deltasQ![seatIndex];
        seatTotalsQ[seatIndex] += deltaQ;
        const playerId = effectiveSeats.find((seat) => seat.seatIndex === seatIndex)?.playerId;
        if (playerId) {
          playerTotalsQ.set(playerId, (playerTotalsQ.get(playerId) ?? 0) + deltaQ);
        }
      });
      settlementDirections.push(...directions);
    }

    let nextDealerSeatIndex: SeatIndex;
    if (source.outcome === 'draw') {
      nextDealerSeatIndex = source.drawDealerAction === 'pass'
        ? ((derivedDealerSeatIndex + 1) % 4) as SeatIndex
        : derivedDealerSeatIndex;
    } else {
      nextDealerSeatIndex = getNextDealerSeatIndex({
        dealerSeatIndex: derivedDealerSeatIndex,
        isDraw: false,
        winnerSeatIndex: seatByPlayerId.get(source.winnerPlayerId as string) ?? null,
      }) as SeatIndex;
    }
    if (nextDealerSeatIndex !== derivedDealerSeatIndex) {
      dealerAdvanceCount += 1;
    }
    currentDealerSeatIndex = nextDealerSeatIndex;
    handProjections.push({
      source,
      effectiveSeats,
      derivedDealerSeatIndex,
      deltasQ,
      settlementDirections: directions,
      roundAfterHand: makeRoundProjection(currentDealerSeatIndex, dealerAdvanceCount),
      validationIssues: [],
    });
  });

  const validationIssues = sortedIssues();
  const isValid = !semanticFailure && validationIssues.length === 0;
  const replayPlayers: ReplayPlayerProjection[] = (players as CanonicalPlayer[]).map((player) => ({
    playerId: player.id,
    displayName: player.displayName,
    totalQ: playerTotalsQ.get(player.id) ?? 0,
    wins: wins.get(player.id) ?? 0,
    zimoCount: zimoCounts.get(player.id) ?? 0,
    discardCount: discardCounts.get(player.id) ?? 0,
  }));
  const ranking: ReplayRankingEntry[] = replayPlayers
    .map((player) => ({ playerId: player.playerId, displayName: player.displayName, totalQ: player.totalQ }))
    .sort((left, right) => {
      if (right.totalQ !== left.totalQ) {
        return right.totalQ - left.totalQ;
      }
      return left.displayName.localeCompare(right.displayName);
    });
  const statistics: ReplayStatistics = {
    handsCount: orderedHands.length,
    draws,
    zeroSum: sumQ(Array.from(playerTotalsQ.values())) === 0,
    mostDiscarderPlayerId: getTopPlayerId(players as CanonicalPlayer[], discardCounts),
    mostZimoPlayerId: getTopPlayerId(players as CanonicalPlayer[], zimoCounts),
  };
  const playerTotalsRecord = replayPlayers.reduce<Record<string, number>>((totals, player) => {
    totals[player.playerId] = player.totalQ;
    return totals;
  }, {});

  return {
    source: input,
    isValid,
    handProjections: handProjections.map((projection, index) => ({
      ...projection,
      validationIssues: issuesForTimeline(orderedHands[index].timelineIndex),
    })),
    players: replayPlayers,
    ranking,
    settlementDirections,
    finalSeats,
    finalRound: makeRoundProjection(currentDealerSeatIndex, dealerAdvanceCount),
    statistics,
    summary: isValid
      ? {
          winnerPlayerId: ranking[0]?.playerId ?? null,
          loserPlayerId: ranking[ranking.length - 1]?.playerId ?? null,
          seatTotalsQ,
          playerTotalsQ: playerTotalsRecord,
          playersCount: replayPlayers.length,
        }
      : null,
    validationIssues,
  };
}
