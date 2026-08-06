import { INITIAL_ROUND_LABEL_ZH } from '../../constants/game';
import { getRoundLabel } from '../../models/dealer';
import { aggregatePlayerTotalsQByTimeline, didCompleteWindCycle } from '../../models/seatRotation';
import type { GameBundle, Hand } from '../../models/db';
import type {
  CanonicalGameLifecycle,
  CanonicalGameRecordSnapshot,
  CanonicalHandInput,
  CanonicalHkRules,
  CanonicalPlayer,
  CanonicalSeatAssignment,
  CanonicalSeatBoundary,
  CanonicalTimelineEntry,
  SeatIndex,
} from './types';

const LIFECYCLES: readonly CanonicalGameLifecycle[] = ['draft', 'active', 'ended', 'abandoned'];

type RawRecord = Record<string, unknown>;

export type LocalAdapterDiagnosticSeverity = 'error' | 'warning' | 'info';

export type LocalAdapterDiagnosticCode =
  | 'INVALID_GAME_BUNDLE'
  | 'MALFORMED_RULES_JSON'
  | 'UNSUPPORTED_LOCAL_RULE_VARIANT'
  | 'CORRUPTED_RULES_SNAPSHOT'
  | 'MISSING_STARTING_DEALER'
  | 'INVALID_STARTING_DEALER'
  | 'INVALID_LOCAL_PLAYER'
  | 'DUPLICATE_LOCAL_PLAYER'
  | 'DUPLICATE_LOCAL_SEAT'
  | 'INVALID_LOCAL_HAND'
  | 'DUPLICATE_HAND_INDEX'
  | 'NON_CONTIGUOUS_HAND_INDEX'
  | 'MALFORMED_HAND_INPUT_JSON'
  | 'MALFORMED_DELTA_JSON'
  | 'MISSING_HAND_PLAYER_IDENTITY'
  | 'AMBIGUOUS_SEAT_ROTATION_HISTORY'
  | 'PERSISTED_HANDS_COUNT_MISMATCH'
  | 'PERSISTED_CURRENT_ROUND_LABEL_MISMATCH'
  | 'MALFORMED_RESULT_SUMMARY_JSON'
  | 'PERSISTED_RESULT_SUMMARY_MISMATCH'
  | 'CURRENT_SEAT_ROTATION_OFFSET_SOURCE_ONLY'
  | 'MALFORMED_PERSISTED_SEAT_BOUNDARY'
  | 'DUPLICATE_PERSISTED_SEAT_BOUNDARY'
  | 'INVALID_PERSISTED_SEAT_BOUNDARY_INDEX'
  | 'UNKNOWN_BOUNDARY_PLAYER'
  | 'INCOMPLETE_BOUNDARY_MAPPING'
  | 'MISSING_EXPLICIT_BOUNDARY_HISTORY'
  | 'LEGACY_INFERRED_BOUNDARY_HISTORY';

export type LocalAdapterDiagnostic = {
  code: LocalAdapterDiagnosticCode;
  severity: LocalAdapterDiagnosticSeverity;
  gameId: string;
  handIndex?: number;
  sourceField?: string;
  detail?: string;
};

export type LocalGameRecordAdapterResult =
  | {
      ok: true;
      snapshot: CanonicalGameRecordSnapshot;
      diagnostics: readonly LocalAdapterDiagnostic[];
    }
  | {
      ok: false;
      snapshot: null;
      diagnostics: readonly LocalAdapterDiagnostic[];
    };

type ParsedLocalHand = {
  source: Hand;
  canonical: CanonicalHandInput;
};

function isRecord(value: unknown): value is RawRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isSeatIndex(value: unknown): value is SeatIndex {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 3;
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

function compareText(left: string, right: string): number {
  if (left === right) {
    return 0;
  }
  return left < right ? -1 : 1;
}

const SEVERITY_ORDER: Record<LocalAdapterDiagnosticSeverity, number> = {
  error: 0,
  warning: 1,
  info: 2,
};

export function sortLocalAdapterDiagnostics(
  diagnostics: readonly LocalAdapterDiagnostic[],
): LocalAdapterDiagnostic[] {
  return diagnostics.slice().sort((left, right) => {
    const severityOrder = SEVERITY_ORDER[left.severity] - SEVERITY_ORDER[right.severity];
    if (severityOrder !== 0) {
      return severityOrder;
    }
    const handOrder = (left.handIndex ?? Number.MAX_SAFE_INTEGER) - (right.handIndex ?? Number.MAX_SAFE_INTEGER);
    if (handOrder !== 0) {
      return handOrder;
    }
    const codeOrder = compareText(left.code, right.code);
    if (codeOrder !== 0) {
      return codeOrder;
    }
    const fieldOrder = compareText(left.sourceField ?? '', right.sourceField ?? '');
    if (fieldOrder !== 0) {
      return fieldOrder;
    }
    return compareText(left.detail ?? '', right.detail ?? '');
  });
}

export function createLocalAdapterDiagnostic(input: LocalAdapterDiagnostic): LocalAdapterDiagnostic {
  return { ...input };
}

function addDiagnostic(
  diagnostics: LocalAdapterDiagnostic[],
  gameId: string,
  code: LocalAdapterDiagnosticCode,
  severity: LocalAdapterDiagnosticSeverity,
  context: { handIndex?: number; sourceField?: string; detail?: string } = {},
): void {
  diagnostics.push({
    code,
    severity,
    gameId,
    ...(context.handIndex === undefined ? {} : { handIndex: context.handIndex }),
    ...(context.sourceField === undefined ? {} : { sourceField: context.sourceField }),
    ...(context.detail === undefined ? {} : { detail: context.detail }),
  });
}

function getGameId(bundle: GameBundle): string {
  return typeof bundle?.game?.id === 'string' ? bundle.game.id : '';
}

function parseJsonObject(
  value: unknown,
  diagnostics: LocalAdapterDiagnostic[],
  gameId: string,
  code: LocalAdapterDiagnosticCode,
  sourceField: string,
  handIndex?: number,
): RawRecord | null {
  if (typeof value !== 'string' || value.trim().length === 0) {
    addDiagnostic(diagnostics, gameId, code, 'error', { handIndex, sourceField, detail: 'expected non-empty JSON object' });
    return null;
  }

  try {
    const parsed = JSON.parse(value) as unknown;
    if (!isRecord(parsed)) {
      addDiagnostic(diagnostics, gameId, code, 'error', { handIndex, sourceField, detail: 'JSON value must be an object' });
      return null;
    }
    return parsed;
  } catch {
    addDiagnostic(diagnostics, gameId, code, 'error', { handIndex, sourceField, detail: 'JSON parsing failed' });
    return null;
  }
}

function mapRules(
  bundle: GameBundle,
  diagnostics: LocalAdapterDiagnostic[],
): CanonicalHkRules | null {
  const gameId = getGameId(bundle);
  let parsed: RawRecord;
  try {
    const value = JSON.parse(bundle.game.rulesJson) as unknown;
    if (!isRecord(value)) {
      addDiagnostic(diagnostics, gameId, 'MALFORMED_RULES_JSON', 'error', {
        sourceField: 'game.rulesJson',
        detail: 'rules JSON must contain an object',
      });
      return null;
    }
    parsed = value;
  } catch {
    addDiagnostic(diagnostics, gameId, 'MALFORMED_RULES_JSON', 'error', {
      sourceField: 'game.rulesJson',
      detail: 'rules JSON parsing failed',
    });
    return null;
  }

  const rawVariant = parsed.mode ?? parsed.variant;
  if (bundle.game.variant !== 'HK' || rawVariant !== 'HK') {
    const diagnosticCode = typeof rawVariant === 'string'
      ? 'UNSUPPORTED_LOCAL_RULE_VARIANT'
      : 'CORRUPTED_RULES_SNAPSHOT';
    addDiagnostic(diagnostics, gameId, diagnosticCode, 'error', {
      sourceField: 'game.variant',
      detail: `local variant is ${String(rawVariant ?? bundle.game.variant)}`,
    });
    return null;
  }
  if (parsed.variant !== undefined && parsed.variant !== 'HK') {
    addDiagnostic(diagnostics, gameId, 'UNSUPPORTED_LOCAL_RULE_VARIANT', 'error', {
      sourceField: 'rules.variant',
      detail: `rules variant is ${String(parsed.variant)}`,
    });
    return null;
  }
  if (parsed.mode !== undefined && parsed.mode !== 'HK') {
    addDiagnostic(diagnostics, gameId, 'UNSUPPORTED_LOCAL_RULE_VARIANT', 'error', {
      sourceField: 'rules.mode',
      detail: `rules mode is ${String(parsed.mode)}`,
    });
    return null;
  }

  if (parsed.version !== 1) {
    addDiagnostic(diagnostics, gameId, 'CORRUPTED_RULES_SNAPSHOT', 'error', {
      sourceField: 'rules.version',
      detail: 'only RulesV1 is supported',
    });
    return null;
  }

  const hk = parsed.hk;
  const settlement = parsed.settlement;
  if (!isRecord(hk) || !isRecord(settlement)) {
    addDiagnostic(diagnostics, gameId, 'CORRUPTED_RULES_SNAPSHOT', 'error', {
      sourceField: 'rules.hk',
      detail: 'HK and settlement snapshots are required',
    });
    return null;
  }

  const scoringPreset = hk.scoringPreset;
  const gunMode = hk.gunMode;
  const stakePreset = hk.stakePreset;
  const minFanToWin = parsed.minFanToWin;
  const unitPerFan = hk.unitPerFan;
  const capFan = hk.capFan;
  const currencySymbol = parsed.currencySymbol;
  const isValidCap = capFan === null || (
    typeof capFan === 'number' && Number.isInteger(capFan) && capFan > 0
  );

  if (
    hk.scoring !== 'fan' ||
    (scoringPreset !== 'traditionalFan' && scoringPreset !== 'customTable') ||
    (gunMode !== 'halfGun' && gunMode !== 'fullGun') ||
    (stakePreset !== 'TWO_FIVE_CHICKEN' && stakePreset !== 'FIVE_ONE' && stakePreset !== 'ONE_TWO') ||
    !isNonNegativeInteger(minFanToWin) ||
    typeof unitPerFan !== 'number' ||
    !Number.isFinite(unitPerFan) ||
    unitPerFan < 0.1 ||
    !isValidCap ||
    typeof currencySymbol !== 'string' ||
    settlement.mode !== 'immediate'
  ) {
    addDiagnostic(diagnostics, gameId, 'CORRUPTED_RULES_SNAPSHOT', 'error', {
      sourceField: 'game.rulesJson',
      detail: 'HK RulesV1 snapshot is incomplete or contains unsupported values',
    });
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

function mapPlayers(
  bundle: GameBundle,
  diagnostics: LocalAdapterDiagnostic[],
): {
  players: CanonicalPlayer[];
  initialSeats: CanonicalSeatAssignment[];
  playerIds: Set<string>;
} | null {
  const gameId = getGameId(bundle);
  if (!Array.isArray(bundle.players) || bundle.players.length !== 4) {
    addDiagnostic(diagnostics, gameId, 'INVALID_LOCAL_PLAYER', 'error', {
      sourceField: 'players',
      detail: 'exactly four local players are required',
    });
  }
  const players = Array.isArray(bundle.players) ? bundle.players : [];
  const playerIds = new Set<string>();
  const seatIndices = new Set<number>();
  const canonicalPlayers: CanonicalPlayer[] = [];
  const initialSeats: CanonicalSeatAssignment[] = [];

  players.forEach((player, index) => {
    if (
      !player ||
      player.gameId !== gameId ||
      typeof player.id !== 'string' ||
      player.id.length === 0 ||
      typeof player.name !== 'string' ||
      !isSeatIndex(player.seatIndex)
    ) {
      addDiagnostic(diagnostics, gameId, 'INVALID_LOCAL_PLAYER', 'error', {
        sourceField: `players[${index}]`,
        detail: 'player row has invalid identity, game ownership, name, or seat',
      });
      return;
    }
    if (playerIds.has(player.id)) {
      addDiagnostic(diagnostics, gameId, 'DUPLICATE_LOCAL_PLAYER', 'error', {
        sourceField: `players[${index}].id`,
        detail: `duplicate player id ${player.id}`,
      });
      return;
    }
    if (seatIndices.has(player.seatIndex)) {
      addDiagnostic(diagnostics, gameId, 'DUPLICATE_LOCAL_SEAT', 'error', {
        sourceField: `players[${index}].seatIndex`,
        detail: `duplicate seat index ${player.seatIndex}`,
      });
      return;
    }
    playerIds.add(player.id);
    seatIndices.add(player.seatIndex);
    canonicalPlayers.push({ id: player.id, displayName: player.name });
    initialSeats.push({ seatIndex: player.seatIndex, playerId: player.id });
  });

  if (canonicalPlayers.length !== 4 || seatIndices.size !== 4 || playerIds.size !== 4) {
    return null;
  }

  return {
    players: canonicalPlayers,
    initialSeats: initialSeats.slice().sort((left, right) => left.seatIndex - right.seatIndex),
    playerIds,
  };
}

function parseDeltas(
  hand: Hand,
  diagnostics: LocalAdapterDiagnostic[],
  gameId: string,
): readonly number[] | null {
  if (hand.deltasJson === null || hand.deltasJson === undefined) {
    return null;
  }
  if (typeof hand.deltasJson !== 'string' || hand.deltasJson.trim().length === 0) {
    addDiagnostic(diagnostics, gameId, 'MALFORMED_DELTA_JSON', 'error', {
      handIndex: hand.handIndex,
      sourceField: 'hands.deltasJson',
      detail: 'delta source must be JSON',
    });
    return null;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(hand.deltasJson) as unknown;
  } catch {
    addDiagnostic(diagnostics, gameId, 'MALFORMED_DELTA_JSON', 'error', {
      handIndex: hand.handIndex,
      sourceField: 'hands.deltasJson',
      detail: 'delta JSON parsing failed',
    });
    return null;
  }

  const values = Array.isArray(parsed)
    ? parsed
    : isRecord(parsed) && (Array.isArray(parsed.values) ? parsed.values : parsed.deltasQ);
  if (
    !Array.isArray(values) ||
    values.length !== 4 ||
    values.some((value) => typeof value !== 'number' || !Number.isInteger(value) || !Number.isFinite(value))
  ) {
    addDiagnostic(diagnostics, gameId, 'MALFORMED_DELTA_JSON', 'error', {
      handIndex: hand.handIndex,
      sourceField: 'hands.deltasJson',
      detail: 'delta source must contain four integer Q values',
    });
    return null;
  }
  return values as number[];
}

function sameJsonValue(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function sameNumberRecord(
  left: unknown,
  right: Readonly<Record<string, number>>,
): boolean {
  if (typeof left !== 'object' || left === null || Array.isArray(left)) {
    return false;
  }
  const leftRecord = left as Record<string, unknown>;
  const leftKeys = Object.keys(leftRecord).sort();
  const rightKeys = Object.keys(right).sort();
  return leftKeys.length === rightKeys.length && leftKeys.every((key, index) => {
    return key === rightKeys[index] && leftRecord[key] === right[key];
  });
}

function comparePersistedResultSummary(
  bundle: GameBundle,
  sortedSourceHands: readonly Hand[],
  parsedHands: readonly ParsedLocalHand[],
  parsedSummary: RawRecord | null,
  diagnostics: LocalAdapterDiagnostic[],
  historyMode: 'legacy_inferred' | 'explicit',
  initialSeats: readonly CanonicalSeatAssignment[],
  boundaries: readonly CanonicalSeatBoundary[],
): void {
  if (!parsedSummary) {
    return;
  }
  const seatTotalsQ = [0, 0, 0, 0];
  parsedHands.forEach((entry) => {
    const deltasQ = entry.canonical.persistedDeltasQ;
    if (!deltasQ) {
      return;
    }
    for (let seatIndex = 0; seatIndex < 4; seatIndex += 1) {
      seatTotalsQ[seatIndex] += Number(deltasQ[seatIndex] ?? 0);
    }
  });
  const playerTotalsQ = historyMode === 'explicit'
    ? (() => {
        const totals = new Map<string, number>(bundle.players.map((player) => [player.id, 0]));
        const boundariesByIndex = new Map(boundaries.map((boundary) => [boundary.effectiveFromHandIndex, boundary]));
        let effectiveSeats = initialSeats.slice();
        parsedHands.forEach((entry) => {
          const boundary = boundariesByIndex.get(entry.canonical.handIndex);
          if (boundary) effectiveSeats = boundary.seats.slice();
          const deltasQ = entry.canonical.persistedDeltasQ;
          if (!deltasQ) return;
          for (let seatIndex = 0; seatIndex < 4; seatIndex += 1) {
            const playerId = effectiveSeats.find((seat) => seat.seatIndex === seatIndex)?.playerId;
            if (playerId) totals.set(playerId, (totals.get(playerId) ?? 0) + Number(deltasQ[seatIndex] ?? 0));
          }
        });
        return totals;
      })()
    : aggregatePlayerTotalsQByTimeline(
        bundle.players,
        sortedSourceHands.map((hand, index) => ({
          nextRoundLabelZh: hand.nextRoundLabelZh ?? null,
          deltasQ: parsedHands[index]?.canonical.persistedDeltasQ
            ? [...(parsedHands[index].canonical.persistedDeltasQ as readonly number[])]
            : null,
        })),
        INITIAL_ROUND_LABEL_ZH,
        0,
      );
  const expectedPlayerTotalsQ = bundle.players.reduce<Record<string, number>>((totals, player) => {
    totals[player.id] = playerTotalsQ.get(player.id) ?? 0;
    return totals;
  }, {});
  const persistedSeatTotalsQ = parsedSummary.seatTotalsQ;
  const persistedPlayerTotalsQ = parsedSummary.playerTotalsQ;
  const persistedPlayersCount = parsedSummary.playersCount;
  const isComparable =
    Array.isArray(persistedSeatTotalsQ) &&
    typeof persistedPlayerTotalsQ === 'object' &&
    persistedPlayerTotalsQ !== null &&
    !Array.isArray(persistedPlayerTotalsQ) &&
    typeof persistedPlayersCount === 'number';
  if (!isComparable) {
    return;
  }
  if (
    !sameJsonValue(persistedSeatTotalsQ, seatTotalsQ) ||
    !sameNumberRecord(persistedPlayerTotalsQ, expectedPlayerTotalsQ) ||
    persistedPlayersCount !== bundle.players.length
  ) {
    addDiagnostic(diagnostics, getGameId(bundle), 'PERSISTED_RESULT_SUMMARY_MISMATCH', 'warning', {
      sourceField: 'game.resultSummaryJson',
      detail: 'persisted result summary differs from the local source projection',
    });
  }
}

function parseLocalHand(
  hand: Hand,
  playerIds: ReadonlySet<string>,
  diagnostics: LocalAdapterDiagnostic[],
  gameId: string,
): ParsedLocalHand | null {
  let valid = true;
  if (
    hand.gameId !== gameId ||
    typeof hand.id !== 'string' ||
    hand.id.length === 0 ||
    !isNonNegativeInteger(hand.handIndex) ||
    !isSeatIndex(hand.dealerSeatIndex) ||
    typeof hand.createdAt !== 'number' ||
    !Number.isFinite(hand.createdAt)
  ) {
    valid = false;
    addDiagnostic(diagnostics, gameId, 'INVALID_LOCAL_HAND', 'error', {
      handIndex: isNonNegativeInteger(hand.handIndex) ? hand.handIndex : undefined,
      sourceField: 'hands',
      detail: 'hand row has invalid id, game ownership, index, dealer, or timestamp',
    });
  }

  const computed = parseJsonObject(
    hand.computedJson,
    diagnostics,
    gameId,
    'MALFORMED_HAND_INPUT_JSON',
    'hands.computedJson',
    isNonNegativeInteger(hand.handIndex) ? hand.handIndex : undefined,
  );
  if (!computed) {
    valid = false;
  }

  const rawSettlementType = computed?.settlementType;
  let outcome: CanonicalHandInput['outcome'] | null = null;
  if (hand.isDraw) {
    outcome = 'draw';
    if (rawSettlementType !== undefined && rawSettlementType !== 'draw') {
      valid = false;
      addDiagnostic(diagnostics, gameId, 'INVALID_LOCAL_HAND', 'error', {
        handIndex: hand.handIndex,
        sourceField: 'hands.computedJson.settlementType',
        detail: 'draw row has a non-draw settlement type',
      });
    }
  } else if (rawSettlementType === 'zimo' || rawSettlementType === 'discard') {
    outcome = rawSettlementType;
  } else if (hand.type === 'zimo' || hand.type === 'discard') {
    outcome = hand.type;
  } else {
    valid = false;
    addDiagnostic(diagnostics, gameId, 'MALFORMED_HAND_INPUT_JSON', 'error', {
      handIndex: hand.handIndex,
      sourceField: 'hands.computedJson.settlementType',
      detail: 'winning row does not identify zimo or discard settlement',
    });
  }

  const fan = outcome === 'draw' ? null : computed?.fan;
  if (outcome !== 'draw' && (typeof fan !== 'number' || !Number.isInteger(fan) || fan < 0)) {
    valid = false;
    addDiagnostic(diagnostics, gameId, 'MALFORMED_HAND_INPUT_JSON', 'error', {
      handIndex: hand.handIndex,
      sourceField: 'hands.computedJson.fan',
      detail: 'winning row requires an integer fan source',
    });
  }

  const drawDealerAction = outcome === 'draw' ? computed?.dealerAction : null;
  if (outcome === 'draw' && drawDealerAction !== 'stick' && drawDealerAction !== 'pass') {
    valid = false;
    addDiagnostic(diagnostics, gameId, 'MALFORMED_HAND_INPUT_JSON', 'error', {
      handIndex: hand.handIndex,
      sourceField: 'hands.computedJson.dealerAction',
      detail: 'draw row requires an explicit stick or pass action',
    });
  }

  const winnerPlayerId = outcome === 'draw' ? null : hand.winnerPlayerId ?? null;
  const discarderPlayerId = outcome === 'discard' ? hand.discarderPlayerId ?? null : null;
  if (outcome !== 'draw' && (!winnerPlayerId || !playerIds.has(winnerPlayerId))) {
    valid = false;
    addDiagnostic(diagnostics, gameId, 'MISSING_HAND_PLAYER_IDENTITY', 'error', {
      handIndex: hand.handIndex,
      sourceField: 'hands.winnerPlayerId',
      detail: 'winning row must reference a known player identity',
    });
  }
  if (outcome === 'discard' && (!discarderPlayerId || !playerIds.has(discarderPlayerId))) {
    valid = false;
    addDiagnostic(diagnostics, gameId, 'MISSING_HAND_PLAYER_IDENTITY', 'error', {
      handIndex: hand.handIndex,
      sourceField: 'hands.discarderPlayerId',
      detail: 'discard row must reference a known discarder identity',
    });
  }
  if (outcome === 'zimo' && hand.discarderPlayerId !== null && hand.discarderPlayerId !== undefined) {
    valid = false;
    addDiagnostic(diagnostics, gameId, 'INVALID_LOCAL_HAND', 'error', {
      handIndex: hand.handIndex,
      sourceField: 'hands.discarderPlayerId',
      detail: 'zimo row must not reference a discarder',
    });
  }
  if (outcome === 'draw' && (hand.winnerPlayerId !== null && hand.winnerPlayerId !== undefined || hand.discarderPlayerId !== null && hand.discarderPlayerId !== undefined)) {
    valid = false;
    addDiagnostic(diagnostics, gameId, 'INVALID_LOCAL_HAND', 'error', {
      handIndex: hand.handIndex,
      sourceField: 'hands.winnerPlayerId',
      detail: 'draw row must not reference winner or discarder identities',
    });
  }

  if (outcome !== 'draw' && !isSeatIndex(hand.winnerSeatIndex)) {
    valid = false;
    addDiagnostic(diagnostics, gameId, 'INVALID_LOCAL_HAND', 'error', {
      handIndex: hand.handIndex,
      sourceField: 'hands.winnerSeatIndex',
      detail: 'winning row requires a valid effective winner seat',
    });
  }
  if (outcome === 'draw' && hand.winnerSeatIndex !== null && hand.winnerSeatIndex !== undefined) {
    valid = false;
    addDiagnostic(diagnostics, gameId, 'INVALID_LOCAL_HAND', 'error', {
      handIndex: hand.handIndex,
      sourceField: 'hands.winnerSeatIndex',
      detail: 'draw row must not reference a winner seat',
    });
  }

  const persistedDeltasQ = parseDeltas(hand, diagnostics, gameId);
  if (!valid) {
    return null;
  }

  return {
    source: hand,
    canonical: {
      entryType: 'hand',
      id: hand.id,
      handIndex: hand.handIndex,
      occurredAt: hand.createdAt,
      dealerSeatIndex: hand.dealerSeatIndex as SeatIndex,
      outcome: outcome as CanonicalHandInput['outcome'],
      fan: fan as number | null,
      winnerPlayerId,
      discarderPlayerId,
      drawDealerAction: drawDealerAction as CanonicalHandInput['drawDealerAction'],
      persistedDeltasQ,
    },
  };
}

function rotateSeats(
  initialSeats: readonly CanonicalSeatAssignment[],
  offset: number,
): CanonicalSeatAssignment[] {
  return initialSeats
    .map((seat) => ({
      seatIndex: ((seat.seatIndex + offset) % 4) as SeatIndex,
      playerId: seat.playerId,
    }))
    .sort((left, right) => left.seatIndex - right.seatIndex);
}

function getPlayerIdAtSeat(
  seats: readonly CanonicalSeatAssignment[],
  seatIndex: number,
): string | null {
  return seats.find((seat) => seat.seatIndex === seatIndex)?.playerId ?? null;
}

function sameSeatAssignments(
  left: readonly CanonicalSeatAssignment[],
  right: readonly CanonicalSeatAssignment[],
): boolean {
  return left.length === right.length && left.every(
    (seat, index) => seat.seatIndex === right[index]?.seatIndex && seat.playerId === right[index]?.playerId,
  );
}

function isBoundaryMappingRecord(value: unknown): value is Record<string, unknown> {
  return isRecord(value);
}

function mapPersistedSeatMapping(
  mapping: unknown,
  playerIds: ReadonlySet<string>,
  diagnostics: LocalAdapterDiagnostic[],
  gameId: string,
  sourceField: string,
  handIndex?: number,
): CanonicalSeatAssignment[] | null {
  if (!isBoundaryMappingRecord(mapping)) {
    addDiagnostic(diagnostics, gameId, 'INCOMPLETE_BOUNDARY_MAPPING', 'error', {
      handIndex,
      sourceField,
      detail: 'seat mapping must be an object containing all four canonical seats',
    });
    return null;
  }
  const keys = Object.keys(mapping);
  const expectedKeys = ['0', '1', '2', '3'];
  if (keys.length !== expectedKeys.length || expectedKeys.some((key) => !Object.prototype.hasOwnProperty.call(mapping, key))) {
    addDiagnostic(diagnostics, gameId, 'INCOMPLETE_BOUNDARY_MAPPING', 'error', {
      handIndex,
      sourceField,
      detail: 'seat mapping must contain exactly seats 0, 1, 2, and 3',
    });
    return null;
  }
  const seenPlayerIds = new Set<string>();
  const seats: CanonicalSeatAssignment[] = [];
  for (let seatIndex = 0; seatIndex < 4; seatIndex += 1) {
    const playerId = mapping[String(seatIndex)];
    if (typeof playerId !== 'string' || playerId.length === 0) {
      addDiagnostic(diagnostics, gameId, 'MALFORMED_PERSISTED_SEAT_BOUNDARY', 'error', {
        handIndex,
        sourceField,
        detail: `seat ${seatIndex} must contain a player identity`,
      });
      return null;
    }
    if (!playerIds.has(playerId)) {
      addDiagnostic(diagnostics, gameId, 'UNKNOWN_BOUNDARY_PLAYER', 'error', {
        handIndex,
        sourceField,
        detail: `seat ${seatIndex} references unknown player ${playerId}`,
      });
      return null;
    }
    if (seenPlayerIds.has(playerId)) {
      addDiagnostic(diagnostics, gameId, 'INCOMPLETE_BOUNDARY_MAPPING', 'error', {
        handIndex,
        sourceField,
        detail: `player ${playerId} appears in more than one seat`,
      });
      return null;
    }
    seenPlayerIds.add(playerId);
    seats.push({ seatIndex: seatIndex as SeatIndex, playerId });
  }
  return seats;
}

function resolveHistoryMode(
  bundle: GameBundle,
  diagnostics: LocalAdapterDiagnostic[],
): 'legacy_inferred' | 'explicit' | null {
  const gameId = getGameId(bundle);
  // Bundles built before schema 301 are source-compatible legacy input, never implicit explicit history.
  const mode = bundle.game.seatBoundaryHistoryMode ?? 'legacy_inferred';
  if (mode === 'legacy_inferred' || mode === 'explicit') {
    return mode;
  }
  addDiagnostic(diagnostics, gameId, 'INVALID_GAME_BUNDLE', 'error', {
    sourceField: 'game.seatBoundaryHistoryMode',
    detail: `unsupported seat boundary history mode ${String(mode)}`,
  });
  return null;
}

function resolveExplicitInitialSeats(
  bundle: GameBundle,
  fallbackSeats: readonly CanonicalSeatAssignment[],
  playerIds: ReadonlySet<string>,
  hasPersistedBoundaries: boolean,
  diagnostics: LocalAdapterDiagnostic[],
): CanonicalSeatAssignment[] | null {
  const raw = bundle.game.initialSeatMappingJson;
  if (raw === null || raw === undefined || (typeof raw === 'string' && raw.trim().length === 0)) {
    if (hasPersistedBoundaries) {
      addDiagnostic(diagnostics, getGameId(bundle), 'MISSING_EXPLICIT_BOUNDARY_HISTORY', 'error', {
        sourceField: 'game.initialSeatMappingJson',
        detail: 'explicit reseat history requires the original identity-to-seat baseline',
      });
      return null;
    }
    return fallbackSeats.slice();
  }
  if (typeof raw !== 'string') {
    addDiagnostic(diagnostics, getGameId(bundle), 'MALFORMED_PERSISTED_SEAT_BOUNDARY', 'error', {
      sourceField: 'game.initialSeatMappingJson',
      detail: 'initial seat mapping must be JSON',
    });
    return null;
  }
  try {
    return mapPersistedSeatMapping(
      JSON.parse(raw) as unknown,
      playerIds,
      diagnostics,
      getGameId(bundle),
      'game.initialSeatMappingJson',
    );
  } catch {
    addDiagnostic(diagnostics, getGameId(bundle), 'MALFORMED_PERSISTED_SEAT_BOUNDARY', 'error', {
      sourceField: 'game.initialSeatMappingJson',
      detail: 'initial seat mapping JSON parsing failed',
    });
    return null;
  }
}

function buildPersistedBoundaries(
  bundle: GameBundle,
  handsCount: number,
  playerIds: ReadonlySet<string>,
  diagnostics: LocalAdapterDiagnostic[],
): CanonicalSeatBoundary[] {
  const gameId = getGameId(bundle);
  if (bundle.seatBoundaries !== undefined && !Array.isArray(bundle.seatBoundaries)) {
    addDiagnostic(diagnostics, gameId, 'MALFORMED_PERSISTED_SEAT_BOUNDARY', 'error', {
      sourceField: 'seatBoundaries',
      detail: 'persisted boundaries must be an array',
    });
    return [];
  }
  const boundaries = (bundle.seatBoundaries ?? []).slice().sort((left, right) =>
    left.effectiveFromHandIndex - right.effectiveFromHandIndex || compareText(left.id, right.id),
  );
  const seenIndexes = new Set<number>();
  const output: CanonicalSeatBoundary[] = [];
  boundaries.forEach((boundary, rowIndex) => {
    const sourceField = `seatBoundaries[${rowIndex}]`;
    if (!boundary || typeof boundary !== 'object' || boundary.gameId !== gameId || typeof boundary.id !== 'string' || boundary.id.length === 0 || boundary.reason !== 'confirmed_reseat' || !Number.isFinite(boundary.createdAt)) {
      addDiagnostic(diagnostics, gameId, 'MALFORMED_PERSISTED_SEAT_BOUNDARY', 'error', {
        sourceField,
        detail: 'boundary row is missing its stable identity, game ownership, reason, or timestamp',
      });
      return;
    }
    if (!isNonNegativeInteger(boundary.effectiveFromHandIndex) || boundary.effectiveFromHandIndex > handsCount) {
      addDiagnostic(diagnostics, gameId, 'INVALID_PERSISTED_SEAT_BOUNDARY_INDEX', 'error', {
        sourceField: `${sourceField}.effectiveFromHandIndex`,
        detail: `boundary index must be within 0..${handsCount}`,
      });
      return;
    }
    if (seenIndexes.has(boundary.effectiveFromHandIndex)) {
      addDiagnostic(diagnostics, gameId, 'DUPLICATE_PERSISTED_SEAT_BOUNDARY', 'error', {
        handIndex: boundary.effectiveFromHandIndex,
        sourceField: `${sourceField}.effectiveFromHandIndex`,
        detail: 'more than one persisted boundary has the same effective hand index',
      });
      return;
    }
    seenIndexes.add(boundary.effectiveFromHandIndex);
    const seats = mapPersistedSeatMapping(
      boundary.seatMapping,
      playerIds,
      diagnostics,
      gameId,
      `${sourceField}.seatMapping`,
      boundary.effectiveFromHandIndex,
    );
    if (!seats) {
      return;
    }
    output.push({
      entryType: 'seat-boundary',
      id: boundary.id,
      effectiveFromHandIndex: boundary.effectiveFromHandIndex,
      occurredAt: boundary.createdAt,
      seats,
    });
  });
  return output;
}

function buildLegacyInferredBoundaries(
  bundle: GameBundle,
  parsedHands: readonly ParsedLocalHand[],
  initialSeats: readonly CanonicalSeatAssignment[],
  playerIds: ReadonlySet<string>,
  diagnostics: LocalAdapterDiagnostic[],
): CanonicalSeatBoundary[] {
  const gameId = getGameId(bundle);
  const boundaries: CanonicalSeatBoundary[] = [];
  let currentOffset = 0;
  let previousRoundLabelZh = INITIAL_ROUND_LABEL_ZH;

  parsedHands.forEach((entry, index) => {
    const source = entry.source;
    const canonical = entry.canonical;
    const effectiveSeats = rotateSeats(initialSeats, currentOffset);
    const expectedWinnerPlayerId = isSeatIndex(source.winnerSeatIndex)
      ? getPlayerIdAtSeat(effectiveSeats, source.winnerSeatIndex)
      : null;
    if (
      canonical.outcome !== 'draw' &&
      canonical.winnerPlayerId &&
      expectedWinnerPlayerId !== canonical.winnerPlayerId
    ) {
      addDiagnostic(diagnostics, gameId, 'AMBIGUOUS_SEAT_ROTATION_HISTORY', 'error', {
        handIndex: canonical.handIndex,
        sourceField: 'hands.winnerSeatIndex',
        detail: `stored winner identity ${canonical.winnerPlayerId} does not match inferred effective seat ${String(source.winnerSeatIndex)}`,
      });
    }

    const nextRoundLabelZh = source.nextRoundLabelZh;
    if (typeof nextRoundLabelZh !== 'string' || nextRoundLabelZh.length === 0) {
      addDiagnostic(diagnostics, gameId, 'AMBIGUOUS_SEAT_ROTATION_HISTORY', 'error', {
        handIndex: canonical.handIndex,
        sourceField: 'hands.nextRoundLabelZh',
        detail: 'round label is required to infer historical seat boundaries',
      });
      return;
    }

    if (didCompleteWindCycle(previousRoundLabelZh, nextRoundLabelZh)) {
      currentOffset = (currentOffset + 1) % 4;
      const effectiveFromHandIndex = index + 1;
      const nextHand = parsedHands[effectiveFromHandIndex]?.canonical;
      boundaries.push({
        entryType: 'seat-boundary',
        id: `${gameId}:seat-boundary:${effectiveFromHandIndex}`,
        effectiveFromHandIndex,
        occurredAt: nextHand?.occurredAt ?? canonical.occurredAt,
        seats: rotateSeats(initialSeats, currentOffset),
      });
    }
    previousRoundLabelZh = nextRoundLabelZh;
  });

  boundaries.forEach((boundary, boundaryIndex) => {
    const segmentStart = boundary.effectiveFromHandIndex;
    if (segmentStart >= parsedHands.length) {
      return;
    }
    const segmentEnd = boundaries[boundaryIndex + 1]?.effectiveFromHandIndex ?? parsedHands.length;
    const observedWinnerIds = new Set<string>();
    for (let index = segmentStart; index < segmentEnd; index += 1) {
      const hand = parsedHands[index]?.canonical;
      if (hand && hand.outcome !== 'draw' && hand.winnerPlayerId) {
        observedWinnerIds.add(hand.winnerPlayerId);
      }
    }
    if (observedWinnerIds.size < 4) {
      addDiagnostic(diagnostics, gameId, 'AMBIGUOUS_SEAT_ROTATION_HISTORY', 'error', {
        handIndex: segmentStart,
        sourceField: 'hands.winnerPlayerId',
        detail: `boundary at ${segmentStart} has only ${observedWinnerIds.size} independently observed post-boundary winner identities`,
      });
    }
  });

  if (typeof bundle.game.seatRotationOffset === 'number' && Number.isInteger(bundle.game.seatRotationOffset)) {
    const persistedOffset = ((bundle.game.seatRotationOffset % 4) + 4) % 4;
    if (persistedOffset !== currentOffset) {
      addDiagnostic(diagnostics, gameId, 'CURRENT_SEAT_ROTATION_OFFSET_SOURCE_ONLY', 'info', {
        sourceField: 'game.seatRotationOffset',
        detail: `stored current offset ${persistedOffset} is not historical boundary evidence; label-derived offset is ${currentOffset}`,
      });
    }
  }

  // A player identity set is passed explicitly to keep this helper's contract honest when called from tests.
  if (playerIds.size !== 4) {
    addDiagnostic(diagnostics, gameId, 'AMBIGUOUS_SEAT_ROTATION_HISTORY', 'error', {
      sourceField: 'players',
      detail: 'historical seat mapping cannot be inferred without four identities',
    });
  }
  return boundaries;
}

function buildTimeline(
  hands: readonly ParsedLocalHand[],
  boundaries: readonly CanonicalSeatBoundary[],
): CanonicalTimelineEntry[] {
  const boundariesByIndex = new Map(boundaries.map((boundary) => [boundary.effectiveFromHandIndex, boundary]));
  const timeline: CanonicalTimelineEntry[] = [];
  for (let handIndex = 0; handIndex <= hands.length; handIndex += 1) {
    const boundary = boundariesByIndex.get(handIndex);
    if (boundary) {
      timeline.push(boundary);
    }
    if (handIndex < hands.length) {
      timeline.push(hands[handIndex].canonical);
    }
  }
  return timeline;
}

function hasError(diagnostics: readonly LocalAdapterDiagnostic[]): boolean {
  return diagnostics.some((diagnostic) => diagnostic.severity === 'error');
}

export function adaptLocalGameBundle(bundle: GameBundle): LocalGameRecordAdapterResult {
  const diagnostics: LocalAdapterDiagnostic[] = [];
  const gameId = getGameId(bundle);
  if (!bundle || !bundle.game || !gameId) {
    addDiagnostic(diagnostics, gameId, 'INVALID_GAME_BUNDLE', 'error', {
      sourceField: 'game.id',
      detail: 'a local game bundle with a non-empty game id is required',
    });
    return { ok: false, snapshot: null, diagnostics: sortLocalAdapterDiagnostics(diagnostics) };
  }

  if (!LIFECYCLES.includes(bundle.game.gameState as CanonicalGameLifecycle)) {
    addDiagnostic(diagnostics, gameId, 'INVALID_GAME_BUNDLE', 'error', {
      sourceField: 'game.gameState',
      detail: `unsupported lifecycle ${String(bundle.game.gameState)}`,
    });
  }

  const startingDealerSeatIndex = bundle.game.startingDealerSeatIndex;
  if (startingDealerSeatIndex === null || startingDealerSeatIndex === undefined) {
    addDiagnostic(diagnostics, gameId, 'MISSING_STARTING_DEALER', 'error', {
      sourceField: 'game.startingDealerSeatIndex',
      detail: 'starting dealer is required even for an empty game',
    });
  } else if (!isSeatIndex(startingDealerSeatIndex)) {
    addDiagnostic(diagnostics, gameId, 'INVALID_STARTING_DEALER', 'error', {
      sourceField: 'game.startingDealerSeatIndex',
      detail: 'starting dealer must be an integer in 0..3',
    });
  }

  const rules = mapRules(bundle, diagnostics);
  const playerMapping = mapPlayers(bundle, diagnostics);
  const sourceHands = Array.isArray(bundle.hands) ? bundle.hands.slice() : [];
  if (!Array.isArray(bundle.hands)) {
    addDiagnostic(diagnostics, gameId, 'INVALID_GAME_BUNDLE', 'error', {
      sourceField: 'hands',
      detail: 'hands must be an array',
    });
  }

  const sortedSourceHands = sourceHands.slice().sort((left, right) => {
    const leftIndex = isNonNegativeInteger(left.handIndex) ? left.handIndex : Number.MAX_SAFE_INTEGER;
    const rightIndex = isNonNegativeInteger(right.handIndex) ? right.handIndex : Number.MAX_SAFE_INTEGER;
    return leftIndex - rightIndex;
  });
  const seenHandIndices = new Set<number>();
  sortedSourceHands.forEach((hand) => {
    if (isNonNegativeInteger(hand.handIndex)) {
      if (seenHandIndices.has(hand.handIndex)) {
        addDiagnostic(diagnostics, gameId, 'DUPLICATE_HAND_INDEX', 'error', {
          handIndex: hand.handIndex,
          sourceField: 'hands.handIndex',
          detail: `duplicate hand index ${hand.handIndex}`,
        });
      }
      seenHandIndices.add(hand.handIndex);
    }
  });
  sortedSourceHands.forEach((hand, index) => {
    if (!isNonNegativeInteger(hand.handIndex) || hand.handIndex !== index) {
      addDiagnostic(diagnostics, gameId, 'NON_CONTIGUOUS_HAND_INDEX', 'error', {
        handIndex: isNonNegativeInteger(hand.handIndex) ? hand.handIndex : undefined,
        sourceField: 'hands.handIndex',
        detail: `expected canonical zero-based hand index ${index}`,
      });
    }
  });

  if (typeof bundle.game.handsCount === 'number' && bundle.game.handsCount !== sortedSourceHands.length) {
    addDiagnostic(diagnostics, gameId, 'PERSISTED_HANDS_COUNT_MISMATCH', 'warning', {
      sourceField: 'game.handsCount',
      detail: `persisted hands count ${bundle.game.handsCount} differs from ${sortedSourceHands.length} loaded hands`,
    });
  }

  const parsedHands: ParsedLocalHand[] = [];
  if (playerMapping) {
    sortedSourceHands.forEach((hand) => {
      const parsed = parseLocalHand(hand, playerMapping.playerIds, diagnostics, gameId);
      if (parsed) {
        parsedHands.push(parsed);
      }
    });
  }

  let parsedSummary: RawRecord | null = null;
  if (bundle.game.resultSummaryJson !== null && bundle.game.resultSummaryJson !== undefined) {
    parsedSummary = parseJsonObject(
      bundle.game.resultSummaryJson,
      diagnostics,
      gameId,
      'MALFORMED_RESULT_SUMMARY_JSON',
      'game.resultSummaryJson',
    );
  }

  let boundaries: CanonicalSeatBoundary[] = [];
  let initialSeats = playerMapping?.initialSeats ?? [];
  const historyMode = resolveHistoryMode(bundle, diagnostics);
  if (playerMapping && parsedHands.length === sortedSourceHands.length && isSeatIndex(startingDealerSeatIndex)) {
    const persistedBoundaries = buildPersistedBoundaries(
      bundle,
      parsedHands.length,
      playerMapping.playerIds,
      diagnostics,
    );
    if (historyMode === 'explicit') {
      const explicitInitialSeats = resolveExplicitInitialSeats(
        bundle,
        playerMapping.initialSeats,
        playerMapping.playerIds,
        persistedBoundaries.length > 0,
        diagnostics,
      );
      if (explicitInitialSeats) {
        initialSeats = explicitInitialSeats;
        boundaries = persistedBoundaries;
        const finalPersistedSeats = boundaries[boundaries.length - 1]?.seats ?? initialSeats;
        if (!sameSeatAssignments(finalPersistedSeats, playerMapping.initialSeats)) {
          addDiagnostic(diagnostics, gameId, 'MISSING_EXPLICIT_BOUNDARY_HISTORY', 'error', {
            sourceField: 'players.seatIndex',
            detail: 'current player seats do not match the final explicit persisted mapping',
          });
        }
      }
    } else if (historyMode === 'legacy_inferred') {
      addDiagnostic(diagnostics, gameId, 'LEGACY_INFERRED_BOUNDARY_HISTORY', 'info', {
        sourceField: 'game.seatBoundaryHistoryMode',
        detail: 'legacy local data may infer historical seat boundaries from round labels without writing them back',
      });
      const inferredBoundaries = buildLegacyInferredBoundaries(
        bundle,
        parsedHands,
        playerMapping.initialSeats,
        playerMapping.playerIds,
        diagnostics,
      );
      const byIndex = new Map<number, CanonicalSeatBoundary>();
      inferredBoundaries.forEach((boundary) => byIndex.set(boundary.effectiveFromHandIndex, boundary));
      // Persisted confirmations on a migrated game are preferred where they exist, while earlier
      // unknown history remains legacy-only and cannot become authoritative through inference.
      persistedBoundaries.forEach((boundary) => byIndex.set(boundary.effectiveFromHandIndex, boundary));
      boundaries = Array.from(byIndex.values()).sort(
        (left, right) => left.effectiveFromHandIndex - right.effectiveFromHandIndex || compareText(left.id, right.id),
      );
    }

    try {
      const expectedRoundLabelZh = getRoundLabel(
        startingDealerSeatIndex,
        sortedSourceHands,
      ).labelZh;
      if (bundle.game.currentRoundLabelZh !== expectedRoundLabelZh) {
        addDiagnostic(diagnostics, gameId, 'PERSISTED_CURRENT_ROUND_LABEL_MISMATCH', 'warning', {
          sourceField: 'game.currentRoundLabelZh',
          detail: `persisted next label ${String(bundle.game.currentRoundLabelZh)} differs from derived ${expectedRoundLabelZh}`,
        });
      }
    } catch {
      addDiagnostic(diagnostics, gameId, 'INVALID_GAME_BUNDLE', 'error', {
        sourceField: 'game.currentRoundLabelZh',
        detail: 'current round label could not be derived from local hand progression',
      });
    }
  }

  if (
    parsedSummary &&
    playerMapping &&
    historyMode &&
    initialSeats.length === 4 &&
    parsedHands.length === sortedSourceHands.length
  ) {
    comparePersistedResultSummary(
      bundle,
      sortedSourceHands,
      parsedHands,
      parsedSummary,
      diagnostics,
      historyMode,
      initialSeats,
      boundaries,
    );
  }

  if (
    hasError(diagnostics) ||
    !rules ||
    !playerMapping ||
    !historyMode ||
    initialSeats.length !== 4 ||
    !isSeatIndex(startingDealerSeatIndex) ||
    parsedHands.length !== sortedSourceHands.length
  ) {
    return { ok: false, snapshot: null, diagnostics: sortLocalAdapterDiagnostics(diagnostics) };
  }

  const lifecycle = bundle.game.gameState as CanonicalGameLifecycle;
  const snapshot: CanonicalGameRecordSnapshot = {
    gameId,
    lifecycle,
    rules,
    players: playerMapping.players,
    initialSeats,
    startingDealerSeatIndex,
    timeline: buildTimeline(parsedHands, boundaries),
  };
  return {
    ok: true,
    snapshot,
    diagnostics: sortLocalAdapterDiagnostics(diagnostics),
  };
}
