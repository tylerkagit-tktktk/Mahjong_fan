import type {
  CanonicalGameRecordSnapshot,
  CanonicalPlayer,
  CanonicalSeatAssignment,
  CanonicalSeatBoundary,
  CanonicalTimelineEntry,
  SeatIndex,
} from './types';
import type { ParsedCloudArchiveSource, ParsedCloudLineup } from './cloudSource';

export type CloudAdapterDiagnosticCode =
  | 'MISSING_INITIAL_CLOUD_LINEUP'
  | 'MISSING_ACTIVE_CLOUD_LINEUP'
  | 'MISSING_CLOUD_LINEUP_VERSION'
  | 'HAND_LINEUP_BOUNDARY_MISMATCH'
  | 'UNKNOWN_CLOUD_PLAYER_IDENTITY'
  | 'IMPLICIT_STARTING_DEALER_SEAT_ZERO';

export type CloudAdapterDiagnostic = {
  code: CloudAdapterDiagnosticCode;
  severity: 'error' | 'info';
  sourceHandIndex?: number;
  lineupVersion?: number;
  detail?: string;
};

export type CloudHandTrace = {
  sourceHandId: string;
  sourceHandIndex: number;
  canonicalHandIndex: number;
  canonicalHandId: string;
};

export type CloudGameRecordAdapterValue = {
  snapshot: CanonicalGameRecordSnapshot;
  handTrace: readonly CloudHandTrace[];
  resultParticipantIds: readonly string[];
};

export type CloudGameRecordAdapterResult =
  | { ok: true; value: CloudGameRecordAdapterValue; diagnostics: readonly CloudAdapterDiagnostic[] }
  | { ok: false; value: null; diagnostics: readonly CloudAdapterDiagnostic[] };

const SEAT_INDICES: readonly SeatIndex[] = [0, 1, 2, 3];

function compareText(left: string, right: string): number {
  return left === right ? 0 : left < right ? -1 : 1;
}

function sortDiagnostics(diagnostics: readonly CloudAdapterDiagnostic[]): CloudAdapterDiagnostic[] {
  const severityOrder = { error: 0, info: 1 } as const;
  return diagnostics.slice().sort((left, right) =>
    severityOrder[left.severity] - severityOrder[right.severity] ||
    (left.sourceHandIndex ?? Number.MAX_SAFE_INTEGER) - (right.sourceHandIndex ?? Number.MAX_SAFE_INTEGER) ||
    (left.lineupVersion ?? Number.MAX_SAFE_INTEGER) - (right.lineupVersion ?? Number.MAX_SAFE_INTEGER) ||
    compareText(left.code, right.code) ||
    compareText(left.detail ?? '', right.detail ?? ''),
  );
}

function toCanonicalSeats(lineup: ParsedCloudLineup): CanonicalSeatAssignment[] {
  return SEAT_INDICES.map((seatIndex) => ({ seatIndex, playerId: lineup.seats[seatIndex] }));
}

function sameSeats(left: readonly CanonicalSeatAssignment[], right: readonly CanonicalSeatAssignment[]): boolean {
  return SEAT_INDICES.every((seatIndex) =>
    left.find((seat) => seat.seatIndex === seatIndex)?.playerId ===
      right.find((seat) => seat.seatIndex === seatIndex)?.playerId,
  );
}

function selectLineupForSourceHand(
  lineups: readonly ParsedCloudLineup[],
  sourceHandIndex: number,
): ParsedCloudLineup | null {
  return lineups.reduce<ParsedCloudLineup | null>((selected, lineup) => {
    if (lineup.effectiveFromHandIndex > sourceHandIndex) return selected;
    if (!selected) return lineup;
    if (lineup.effectiveFromHandIndex > selected.effectiveFromHandIndex) return lineup;
    if (
      lineup.effectiveFromHandIndex === selected.effectiveFromHandIndex &&
      lineup.lineupVersion > selected.lineupVersion
    ) return lineup;
    return selected;
  }, null);
}

/** Maps a validated frozen Cloud source into storage-independent canonical record input. */
export function adaptCloudSourceToCanonical(
  source: ParsedCloudArchiveSource,
): CloudGameRecordAdapterResult {
  const diagnostics: CloudAdapterDiagnostic[] = [];
  const add = (
    code: CloudAdapterDiagnosticCode,
    severity: CloudAdapterDiagnostic['severity'],
    context: Omit<CloudAdapterDiagnostic, 'code' | 'severity'> = {},
  ) => diagnostics.push({ code, severity, ...context });

  const lineups = source.lineups.slice().sort((left, right) => left.lineupVersion - right.lineupVersion);
  const initialLineups = lineups.filter((lineup) => lineup.effectiveFromHandIndex === 0);
  if (initialLineups.length !== 1) {
    add('MISSING_INITIAL_CLOUD_LINEUP', 'error', { detail: `expected exactly one initial lineup, received ${initialLineups.length}` });
  }
  const lineupByVersion = new Map(lineups.map((lineup) => [lineup.lineupVersion, lineup]));
  for (let version = 1; version <= source.room.activeLineupVersion; version += 1) {
    if (!lineupByVersion.has(version)) {
      add('MISSING_CLOUD_LINEUP_VERSION', 'error', { lineupVersion: version });
    }
  }
  const activeLineup = lineupByVersion.get(source.room.activeLineupVersion);
  if (!activeLineup || lineups[lineups.length - 1]?.lineupVersion !== source.room.activeLineupVersion) {
    add('MISSING_ACTIVE_CLOUD_LINEUP', 'error', { lineupVersion: source.room.activeLineupVersion });
  }
  let previousEffectiveIndex = -1;
  lineups.forEach((lineup) => {
    if (lineup.effectiveFromHandIndex < previousEffectiveIndex) {
      add('HAND_LINEUP_BOUNDARY_MISMATCH', 'error', {
        lineupVersion: lineup.lineupVersion,
        detail: 'lineup effective indexes must not move backwards as versions increase',
      });
    }
    previousEffectiveIndex = Math.max(previousEffectiveIndex, lineup.effectiveFromHandIndex);
  });

  const participantIds = new Set<string>();
  source.hands.forEach((hand) => {
    const exactLineup = lineupByVersion.get(hand.lineupVersion);
    if (!exactLineup) {
      add('MISSING_CLOUD_LINEUP_VERSION', 'error', {
        sourceHandIndex: hand.sourceHandIndex,
        lineupVersion: hand.lineupVersion,
      });
      return;
    }
    const effectiveLineup = selectLineupForSourceHand(lineups, hand.sourceHandIndex);
    if (!effectiveLineup || effectiveLineup.lineupVersion !== exactLineup.lineupVersion) {
      add('HAND_LINEUP_BOUNDARY_MISMATCH', 'error', {
        sourceHandIndex: hand.sourceHandIndex,
        lineupVersion: hand.lineupVersion,
        detail: effectiveLineup
          ? `effective lineup version is ${effectiveLineup.lineupVersion}`
          : 'no lineup is effective for this hand',
      });
      return;
    }
    const effectivePlayerIds = new Set(exactLineup.seats);
    const referencedPlayerIds = [hand.winnerPlayerId, hand.discarderPlayerId].filter(
      (playerId): playerId is string => playerId !== null,
    );
    referencedPlayerIds.forEach((playerId) => {
      if (!effectivePlayerIds.has(playerId)) {
        add('UNKNOWN_CLOUD_PLAYER_IDENTITY', 'error', {
          sourceHandIndex: hand.sourceHandIndex,
          lineupVersion: hand.lineupVersion,
          detail: `${playerId} is not in the hand's exact lineup`,
        });
      }
    });
    exactLineup.seats.forEach((playerId) => participantIds.add(playerId));
  });

  if (source.hands.length === 0 && initialLineups.length === 1) {
    const effectiveStartingLineup = selectLineupForSourceHand(lineups, 1) ?? initialLineups[0];
    effectiveStartingLineup.seats.forEach((playerId) => participantIds.add(playerId));
  }
  if (diagnostics.some((diagnostic) => diagnostic.severity === 'error') || initialLineups.length !== 1 || !activeLineup) {
    return { ok: false, value: null, diagnostics: sortDiagnostics(diagnostics) };
  }

  const initialLineup = initialLineups[0];
  const initialSeats = toCanonicalSeats(initialLineup);
  const referencedIdentityIds = new Set(lineups.flatMap((lineup) => [...lineup.seats]));
  const players: CanonicalPlayer[] = source.players
    .filter((player) => referencedIdentityIds.has(player.id))
    .map((player) => ({ id: player.id, displayName: player.displayName }));

  const selectedLineupByEffectiveIndex = new Map<number, ParsedCloudLineup>();
  lineups.forEach((lineup) => {
    if (lineup.effectiveFromHandIndex > 0) {
      selectedLineupByEffectiveIndex.set(lineup.effectiveFromHandIndex, lineup);
    }
  });
  let precedingSeats = initialSeats;
  const boundariesByCanonicalIndex = new Map<number, CanonicalSeatBoundary>();
  [...selectedLineupByEffectiveIndex.values()]
    .sort((left, right) => left.effectiveFromHandIndex - right.effectiveFromHandIndex)
    .forEach((lineup) => {
      const seats = toCanonicalSeats(lineup);
      if (!sameSeats(precedingSeats, seats)) {
        const canonicalIndex = lineup.effectiveFromHandIndex - 1;
        boundariesByCanonicalIndex.set(canonicalIndex, {
          entryType: 'seat-boundary',
          id: `cloud-lineup:${lineup.sourceLineupId}`,
          effectiveFromHandIndex: canonicalIndex,
          occurredAt: lineup.effectiveFromHandIndex,
          seats,
        });
      }
      precedingSeats = seats;
    });

  const handTrace: CloudHandTrace[] = source.hands.map((hand) => ({
    sourceHandId: hand.sourceHandId,
    sourceHandIndex: hand.sourceHandIndex,
    canonicalHandIndex: hand.sourceHandIndex - 1,
    canonicalHandId: `cloud-hand:${hand.sourceHandId}`,
  }));
  const timeline: CanonicalTimelineEntry[] = [];
  source.hands.forEach((hand) => {
    const canonicalHandIndex = hand.sourceHandIndex - 1;
    const boundary = boundariesByCanonicalIndex.get(canonicalHandIndex);
    if (boundary) timeline.push(boundary);
    timeline.push({
      entryType: 'hand',
      id: `cloud-hand:${hand.sourceHandId}`,
      handIndex: canonicalHandIndex,
      occurredAt: hand.sourceHandIndex,
      dealerSeatIndex: null,
      outcome: hand.outcome,
      fan: hand.fan,
      winnerPlayerId: hand.winnerPlayerId,
      discarderPlayerId: hand.discarderPlayerId,
      drawDealerAction: hand.drawDealerAction,
      persistedDeltasQ: null,
    });
  });
  const pendingBoundary = boundariesByCanonicalIndex.get(source.hands.length);
  if (pendingBoundary) timeline.push(pendingBoundary);

  add('IMPLICIT_STARTING_DEALER_SEAT_ZERO', 'info', {
    detail: 'legacy Cloud archive compatibility fixes the starting dealer at seat 0',
  });
  return {
    ok: true,
    value: {
      snapshot: {
        gameId: source.room.roomId,
        lifecycle: 'ended',
        rules: source.rules,
        players,
        initialSeats,
        startingDealerSeatIndex: 0,
        timeline,
      },
      handTrace,
      resultParticipantIds: players
        .map((player) => player.id)
        .filter((playerId) => participantIds.has(playerId)),
    },
    diagnostics: sortDiagnostics(diagnostics),
  };
}
