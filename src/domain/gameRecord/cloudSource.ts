import type { CanonicalHkRules, SeatIndex } from './types';

export const LEGACY_CLOUD_ARCHIVE_SOURCE_FORMAT = 'legacy_unversioned_cloud_archive_v0' as const;
export const LEGACY_CLOUD_SOURCE_TRUST = 'legacy_unverified' as const;

export type CloudSourceDiagnosticCode =
  | 'MALFORMED_CLOUD_SOURCE'
  | 'MALFORMED_CLOUD_ROOM'
  | 'MALFORMED_CLOUD_PLAYER'
  | 'DUPLICATE_CLOUD_PLAYER_IDENTITY'
  | 'CORRUPTED_RULES_SNAPSHOT'
  | 'UNSUPPORTED_RULE_VARIANT'
  | 'MALFORMED_CLOUD_LINEUP'
  | 'DUPLICATE_CLOUD_LINEUP_VERSION'
  | 'INVALID_CLOUD_LINEUP_PLAYER_COUNT'
  | 'DUPLICATE_CLOUD_LINEUP_PLAYER'
  | 'UNKNOWN_CLOUD_PLAYER_IDENTITY'
  | 'INVALID_CLOUD_LINEUP_EFFECTIVE_INDEX'
  | 'INVALID_CLOUD_HAND'
  | 'INVALID_CLOUD_HAND_INDEX'
  | 'DUPLICATE_CLOUD_HAND_INDEX'
  | 'NON_CONTIGUOUS_CLOUD_HAND_INDEX'
  | 'DUPLICATE_CLOUD_HAND_ID'
  | 'CLOUD_CURRENT_HAND_INDEX_MISMATCH';

export type CloudSourceDiagnostic = {
  code: CloudSourceDiagnosticCode;
  severity: 'error';
  sourcePath: string;
  detail?: string;
  sourceHandIndex?: number;
  lineupVersion?: number;
};

export type ParsedCloudPlayer = {
  id: string;
  displayName: string;
  kind: 'member' | 'temporary';
};

export type ParsedCloudLineup = {
  sourceLineupId: string;
  lineupVersion: number;
  effectiveFromHandIndex: number;
  seats: readonly [string, string, string, string];
};

export type ParsedCloudHand = {
  sourceHandId: string;
  sourceHandIndex: number;
  lineupVersion: number;
  outcome: 'zimo' | 'discard' | 'draw';
  winnerPlayerId: string | null;
  discarderPlayerId: string | null;
  drawDealerAction: 'stick' | 'pass' | null;
  fan: number | null;
};

export type ParsedCloudArchiveSource = {
  format: typeof LEGACY_CLOUD_ARCHIVE_SOURCE_FORMAT;
  sourceTrust: typeof LEGACY_CLOUD_SOURCE_TRUST;
  room: {
    roomId: string;
    status: 'ended' | 'archived';
    currentVersion: number;
    currentHandIndex: number;
    activeLineupVersion: number;
  };
  rules: CanonicalHkRules;
  players: readonly ParsedCloudPlayer[];
  lineups: readonly ParsedCloudLineup[];
  hands: readonly ParsedCloudHand[];
};

export type CloudSourceParseResult =
  | { ok: true; source: ParsedCloudArchiveSource; diagnostics: readonly CloudSourceDiagnostic[] }
  | { ok: false; source: null; diagnostics: readonly CloudSourceDiagnostic[] };

type RawRecord = Record<string, unknown>;

function isRecord(value: unknown): value is RawRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0;
}

function isNonEmptyText(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function compareText(left: string, right: string): number {
  return left === right ? 0 : left < right ? -1 : 1;
}

export function sortCloudSourceDiagnostics(
  diagnostics: readonly CloudSourceDiagnostic[],
): CloudSourceDiagnostic[] {
  return diagnostics.slice().sort((left, right) => {
    const handOrder = (left.sourceHandIndex ?? Number.MAX_SAFE_INTEGER) -
      (right.sourceHandIndex ?? Number.MAX_SAFE_INTEGER);
    if (handOrder !== 0) return handOrder;
    const lineupOrder = (left.lineupVersion ?? Number.MAX_SAFE_INTEGER) -
      (right.lineupVersion ?? Number.MAX_SAFE_INTEGER);
    if (lineupOrder !== 0) return lineupOrder;
    const pathOrder = compareText(left.sourcePath, right.sourcePath);
    if (pathOrder !== 0) return pathOrder;
    const codeOrder = compareText(left.code, right.code);
    if (codeOrder !== 0) return codeOrder;
    return compareText(left.detail ?? '', right.detail ?? '');
  });
}

function parseRules(
  rulesSnapshot: unknown,
  add: (code: CloudSourceDiagnosticCode, path: string, detail?: string) => void,
): CanonicalHkRules | null {
  if (!isRecord(rulesSnapshot) || !isNonEmptyText(rulesSnapshot.serializedRules)) {
    add('CORRUPTED_RULES_SNAPSHOT', 'room.rulesSnapshot.serializedRules', 'expected non-empty serialized RulesV1');
    return null;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(rulesSnapshot.serializedRules);
  } catch {
    add('CORRUPTED_RULES_SNAPSHOT', 'room.rulesSnapshot.serializedRules', 'rules JSON parsing failed');
    return null;
  }
  if (!isRecord(parsed)) {
    add('CORRUPTED_RULES_SNAPSHOT', 'room.rulesSnapshot.serializedRules', 'rules JSON must contain an object');
    return null;
  }
  const rawVariant = parsed.mode ?? parsed.variant;
  if (rawVariant !== 'HK' || parsed.variant !== 'HK' || parsed.mode !== 'HK') {
    add(
      typeof rawVariant === 'string' ? 'UNSUPPORTED_RULE_VARIANT' : 'CORRUPTED_RULES_SNAPSHOT',
      'room.rulesSnapshot.serializedRules',
      `unsupported or missing rules variant: ${String(rawVariant)}`,
    );
    return null;
  }
  if (parsed.version !== 1 || !isRecord(parsed.hk) || !isRecord(parsed.settlement)) {
    add('CORRUPTED_RULES_SNAPSHOT', 'room.rulesSnapshot.serializedRules', 'complete HK RulesV1 is required');
    return null;
  }
  const hk = parsed.hk;
  const scoringPreset = hk.scoringPreset;
  const gunMode = hk.gunMode;
  const stakePreset = hk.stakePreset;
  const minFanToWin = parsed.minFanToWin;
  const unitPerFan = hk.unitPerFan;
  const capFan = hk.capFan;
  const currencySymbol = parsed.currencySymbol;
  const capIsValid = capFan === null || isPositiveInteger(capFan);
  if (
    hk.scoring !== 'fan' ||
    (scoringPreset !== 'traditionalFan' && scoringPreset !== 'customTable') ||
    (gunMode !== 'halfGun' && gunMode !== 'fullGun') ||
    (stakePreset !== 'TWO_FIVE_CHICKEN' && stakePreset !== 'FIVE_ONE' && stakePreset !== 'ONE_TWO') ||
    !isNonNegativeInteger(minFanToWin) ||
    typeof unitPerFan !== 'number' ||
    !Number.isFinite(unitPerFan) ||
    unitPerFan < 0.1 ||
    !capIsValid ||
    typeof currencySymbol !== 'string' ||
    hk.applyDealerMultiplier !== true ||
    parsed.settlement.mode !== 'immediate'
  ) {
    add('CORRUPTED_RULES_SNAPSHOT', 'room.rulesSnapshot.serializedRules', 'HK RulesV1 contains missing or unsupported values');
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

function parsePlayers(
  rawMembers: unknown,
  rawTempPlayers: unknown,
  roomId: string,
  diagnostics: CloudSourceDiagnostic[],
): ParsedCloudPlayer[] {
  const players: ParsedCloudPlayer[] = [];
  const seenIds = new Set<string>();
  const parseCollection = (
    rawCollection: unknown,
    collectionName: 'members' | 'tempPlayers',
    kind: ParsedCloudPlayer['kind'],
    idField: 'uid' | 'tempPlayerId',
  ) => {
    if (!Array.isArray(rawCollection)) {
      diagnostics.push({ code: 'MALFORMED_CLOUD_SOURCE', severity: 'error', sourcePath: collectionName, detail: 'expected an array' });
      return;
    }
    rawCollection.forEach((rawPlayer, index) => {
      const sourcePath = `${collectionName}[${index}]`;
      if (
        !isRecord(rawPlayer) ||
        !isNonEmptyText(rawPlayer[idField]) ||
        !isNonEmptyText(rawPlayer.displayName) ||
        rawPlayer.roomId !== roomId
      ) {
        diagnostics.push({ code: 'MALFORMED_CLOUD_PLAYER', severity: 'error', sourcePath, detail: 'invalid identity, display name, or room ownership' });
        return;
      }
      const id = rawPlayer[idField] as string;
      if (seenIds.has(id)) {
        diagnostics.push({ code: 'DUPLICATE_CLOUD_PLAYER_IDENTITY', severity: 'error', sourcePath: `${sourcePath}.${idField}`, detail: id });
        return;
      }
      seenIds.add(id);
      players.push({ id, displayName: rawPlayer.displayName as string, kind });
    });
  };
  parseCollection(rawMembers, 'members', 'member', 'uid');
  parseCollection(rawTempPlayers, 'tempPlayers', 'temporary', 'tempPlayerId');
  return players;
}

function parseLineups(
  rawLineups: unknown,
  roomId: string,
  playerIds: ReadonlySet<string>,
  currentHandIndex: number,
  diagnostics: CloudSourceDiagnostic[],
): ParsedCloudLineup[] {
  if (!Array.isArray(rawLineups)) {
    diagnostics.push({ code: 'MALFORMED_CLOUD_SOURCE', severity: 'error', sourcePath: 'lineups', detail: 'expected an array' });
    return [];
  }
  const lineups: ParsedCloudLineup[] = [];
  const seenVersions = new Set<number>();
  rawLineups.forEach((rawLineup, index) => {
    const sourcePath = `lineups[${index}]`;
    const rawVersion = isRecord(rawLineup) ? rawLineup.lineupVersion : undefined;
    const lineupVersion = isPositiveInteger(rawVersion) ? rawVersion : undefined;
    if (
      !isRecord(rawLineup) ||
      !isNonEmptyText(rawLineup.lineupId) ||
      rawLineup.roomId !== roomId ||
      lineupVersion === undefined ||
      !isRecord(rawLineup.seats)
    ) {
      diagnostics.push({ code: 'MALFORMED_CLOUD_LINEUP', severity: 'error', sourcePath, ...(lineupVersion ? { lineupVersion } : {}), detail: 'invalid lineup identity, version, seats, or room ownership' });
      return;
    }
    if (seenVersions.has(lineupVersion)) {
      diagnostics.push({ code: 'DUPLICATE_CLOUD_LINEUP_VERSION', severity: 'error', sourcePath: `${sourcePath}.lineupVersion`, lineupVersion });
      return;
    }
    seenVersions.add(lineupVersion);
    if (
      !isNonNegativeInteger(rawLineup.effectiveFromHandIndex) ||
      rawLineup.effectiveFromHandIndex > currentHandIndex + 1
    ) {
      diagnostics.push({ code: 'INVALID_CLOUD_LINEUP_EFFECTIVE_INDEX', severity: 'error', sourcePath: `${sourcePath}.effectiveFromHandIndex`, lineupVersion, detail: 'expected an index within 0..currentHandIndex + 1' });
      return;
    }
    const rawSeats = rawLineup.seats as RawRecord;
    const seatValues = ([0, 1, 2, 3] as SeatIndex[]).map((seatIndex) => rawSeats[String(seatIndex)]);
    if (seatValues.some((value) => !isNonEmptyText(value))) {
      diagnostics.push({ code: 'INVALID_CLOUD_LINEUP_PLAYER_COUNT', severity: 'error', sourcePath: `${sourcePath}.seats`, lineupVersion, detail: 'exactly four non-empty seat identities are required' });
      return;
    }
    const seats = seatValues as [string, string, string, string];
    if (new Set(seats).size !== 4) {
      diagnostics.push({ code: 'DUPLICATE_CLOUD_LINEUP_PLAYER', severity: 'error', sourcePath: `${sourcePath}.seats`, lineupVersion });
      return;
    }
    const unknownPlayerId = seats.find((playerId) => !playerIds.has(playerId));
    if (unknownPlayerId) {
      diagnostics.push({ code: 'UNKNOWN_CLOUD_PLAYER_IDENTITY', severity: 'error', sourcePath: `${sourcePath}.seats`, lineupVersion, detail: unknownPlayerId });
      return;
    }
    lineups.push({
      sourceLineupId: rawLineup.lineupId,
      lineupVersion,
      effectiveFromHandIndex: rawLineup.effectiveFromHandIndex,
      seats,
    });
  });
  return lineups.sort((left, right) => left.lineupVersion - right.lineupVersion);
}

function parseHands(
  rawHands: unknown,
  roomId: string,
  diagnostics: CloudSourceDiagnostic[],
): ParsedCloudHand[] {
  if (!Array.isArray(rawHands)) {
    diagnostics.push({ code: 'MALFORMED_CLOUD_SOURCE', severity: 'error', sourcePath: 'hands', detail: 'expected an array' });
    return [];
  }
  const hands: ParsedCloudHand[] = [];
  const seenIds = new Set<string>();
  const seenIndices = new Set<number>();
  rawHands.forEach((rawHand, index) => {
    const sourcePath = `hands[${index}]`;
    const rawIndex = isRecord(rawHand) ? rawHand.handIndex : undefined;
    const sourceHandIndex = isPositiveInteger(rawIndex) ? rawIndex : undefined;
    if (
      !isRecord(rawHand) ||
      !isNonEmptyText(rawHand.handId) ||
      rawHand.roomId !== roomId ||
      sourceHandIndex === undefined ||
      !isPositiveInteger(rawHand.lineupVersion)
    ) {
      diagnostics.push({
        code: sourceHandIndex === undefined && isRecord(rawHand) ? 'INVALID_CLOUD_HAND_INDEX' : 'INVALID_CLOUD_HAND',
        severity: 'error',
        sourcePath,
        ...(sourceHandIndex ? { sourceHandIndex } : {}),
        detail: 'invalid hand identity, index, lineup version, or room ownership',
      });
      return;
    }
    if (seenIds.has(rawHand.handId)) {
      diagnostics.push({ code: 'DUPLICATE_CLOUD_HAND_ID', severity: 'error', sourcePath: `${sourcePath}.handId`, sourceHandIndex, detail: rawHand.handId });
      return;
    }
    seenIds.add(rawHand.handId);
    if (seenIndices.has(sourceHandIndex)) {
      diagnostics.push({ code: 'DUPLICATE_CLOUD_HAND_INDEX', severity: 'error', sourcePath: `${sourcePath}.handIndex`, sourceHandIndex });
      return;
    }
    seenIndices.add(sourceHandIndex);
    const outcome = rawHand.type;
    const fanIsValid = rawHand.fan === undefined || isNonNegativeInteger(rawHand.fan);
    let valid = fanIsValid && (outcome === 'zimo' || outcome === 'discard' || outcome === 'draw');
    if (outcome === 'draw') {
      valid = valid &&
        (rawHand.dealerAction === 'stick' || rawHand.dealerAction === 'pass') &&
        (rawHand.winnerPlayerId === null || rawHand.winnerPlayerId === undefined) &&
        (rawHand.discarderPlayerId === null || rawHand.discarderPlayerId === undefined);
    } else if (outcome === 'zimo') {
      valid = valid && isNonEmptyText(rawHand.winnerPlayerId) && isNonNegativeInteger(rawHand.fan) &&
        (rawHand.discarderPlayerId === null || rawHand.discarderPlayerId === undefined) &&
        (rawHand.dealerAction === null || rawHand.dealerAction === undefined);
    } else if (outcome === 'discard') {
      valid = valid && isNonEmptyText(rawHand.winnerPlayerId) && isNonEmptyText(rawHand.discarderPlayerId) &&
        rawHand.winnerPlayerId !== rawHand.discarderPlayerId && isNonNegativeInteger(rawHand.fan) &&
        (rawHand.dealerAction === null || rawHand.dealerAction === undefined);
    }
    if (!valid) {
      diagnostics.push({ code: 'INVALID_CLOUD_HAND', severity: 'error', sourcePath, sourceHandIndex, detail: 'outcome fields are incomplete or inconsistent' });
      return;
    }
    hands.push({
      sourceHandId: rawHand.handId,
      sourceHandIndex,
      lineupVersion: rawHand.lineupVersion,
      outcome: outcome as ParsedCloudHand['outcome'],
      winnerPlayerId: outcome === 'draw' ? null : rawHand.winnerPlayerId as string,
      discarderPlayerId: outcome === 'discard' ? rawHand.discarderPlayerId as string : null,
      drawDealerAction: outcome === 'draw' ? rawHand.dealerAction as 'stick' | 'pass' : null,
      fan: outcome === 'draw' ? null : rawHand.fan as number,
    });
  });
  const sorted = hands.sort((left, right) => left.sourceHandIndex - right.sourceHandIndex);
  sorted.forEach((hand, index) => {
    const expected = index + 1;
    if (hand.sourceHandIndex !== expected) {
      diagnostics.push({ code: 'NON_CONTIGUOUS_CLOUD_HAND_INDEX', severity: 'error', sourcePath: `hands[sourceHandIndex=${hand.sourceHandIndex}]`, sourceHandIndex: hand.sourceHandIndex, detail: `expected ${expected}` });
    }
  });
  return sorted;
}

/** Strictly recognizes the current unversioned local Cloud archive compatibility shape. */
export function parseCloudArchiveSource(input: unknown): CloudSourceParseResult {
  if (!isRecord(input)) {
    return { ok: false, source: null, diagnostics: [{ code: 'MALFORMED_CLOUD_SOURCE', severity: 'error', sourcePath: '$', detail: 'expected an object' }] };
  }
  const diagnostics: CloudSourceDiagnostic[] = [];
  const add = (code: CloudSourceDiagnosticCode, sourcePath: string, detail?: string) => {
    diagnostics.push({ code, severity: 'error', sourcePath, ...(detail ? { detail } : {}) });
  };
  if (!isRecord(input.room)) {
    add('MALFORMED_CLOUD_ROOM', 'room', 'expected an object');
    return { ok: false, source: null, diagnostics: sortCloudSourceDiagnostics(diagnostics) };
  }
  const room = input.room;
  if (
    !isNonEmptyText(room.roomId) ||
    (room.status !== 'ended' && room.status !== 'archived') ||
    !isPositiveInteger(room.currentVersion) ||
    !isNonNegativeInteger(room.currentHandIndex) ||
    !isPositiveInteger(room.activeLineupVersion)
  ) {
    add('MALFORMED_CLOUD_ROOM', 'room', 'ended/archive room requires stable identity and non-negative version/index metadata');
  }
  const roomId = isNonEmptyText(room.roomId) ? room.roomId : '';
  const currentHandIndex = isNonNegativeInteger(room.currentHandIndex) ? room.currentHandIndex : 0;
  const rules = parseRules(room.rulesSnapshot, add);
  const players = parsePlayers(input.members, input.tempPlayers, roomId, diagnostics);
  const playerIds = new Set(players.map((player) => player.id));
  const lineups = parseLineups(input.lineups, roomId, playerIds, currentHandIndex, diagnostics);
  const hands = parseHands(input.hands, roomId, diagnostics);
  hands.forEach((hand) => {
    [hand.winnerPlayerId, hand.discarderPlayerId]
      .filter((playerId): playerId is string => playerId !== null)
      .forEach((playerId) => {
        if (!playerIds.has(playerId)) {
          diagnostics.push({
            code: 'UNKNOWN_CLOUD_PLAYER_IDENTITY',
            severity: 'error',
            sourcePath: `hands[sourceHandIndex=${hand.sourceHandIndex}]`,
            sourceHandIndex: hand.sourceHandIndex,
            detail: playerId,
          });
        }
      });
  });
  if (hands.length !== currentHandIndex) {
    add('CLOUD_CURRENT_HAND_INDEX_MISMATCH', 'room.currentHandIndex', `room says ${currentHandIndex}, source contains ${hands.length} valid hands`);
  }
  const sortedDiagnostics = sortCloudSourceDiagnostics(diagnostics);
  if (
    sortedDiagnostics.length > 0 ||
    !rules ||
    !isNonEmptyText(room.roomId) ||
    (room.status !== 'ended' && room.status !== 'archived') ||
    !isPositiveInteger(room.currentVersion) ||
    !isNonNegativeInteger(room.currentHandIndex) ||
    !isPositiveInteger(room.activeLineupVersion)
  ) {
    return { ok: false, source: null, diagnostics: sortedDiagnostics };
  }
  return {
    ok: true,
    source: {
      format: LEGACY_CLOUD_ARCHIVE_SOURCE_FORMAT,
      sourceTrust: LEGACY_CLOUD_SOURCE_TRUST,
      room: {
        roomId: room.roomId,
        status: room.status,
        currentVersion: room.currentVersion,
        currentHandIndex: room.currentHandIndex,
        activeLineupVersion: room.activeLineupVersion,
      },
      rules,
      players,
      lineups,
      hands,
    },
    diagnostics: [],
  };
}
