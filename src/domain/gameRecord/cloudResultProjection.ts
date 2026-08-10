import { getRoundLabelFromDealerState } from '../../models/dealer';
import { adaptCloudSourceToCanonical, CloudAdapterDiagnostic, CloudHandTrace } from './cloudAdapter';
import {
  LEGACY_CLOUD_ARCHIVE_SOURCE_FORMAT,
  LEGACY_CLOUD_SOURCE_TRUST,
  parseCloudArchiveSource,
  CloudSourceDiagnostic,
} from './cloudSource';
import { getTopDashboardPlayers, rankDashboardPlayers } from './dashboardResultPresentation';
import { replayGameRecord } from './replay';
import type {
  CanonicalHkRules,
  CanonicalSeatAssignment,
  ReplayResult,
  ReplayRoundProjection,
  ReplayValidationIssue,
  SeatIndex,
} from './types';

export type CloudResultPlayer = {
  playerId: string;
  displayName: string;
  totalQ: number;
  wins: number;
  zimoCount: number;
  discardCount: number;
};

export type CloudCurrentHandRound = {
  dealerSeatIndex: SeatIndex;
  dealerAdvanceCount: number;
  roundIndex: number;
  wind: '東' | '南' | '西' | '北';
  dealerWind: '東' | '南' | '西' | '北';
  labelZh: string;
};

export type CloudResultHandProjection = {
  trace: CloudHandTrace;
  currentRound: CloudCurrentHandRound;
  outcome: 'zimo' | 'discard' | 'draw';
  fan: number | null;
  winnerPlayerId: string | null;
  discarderPlayerId: string | null;
  drawDealerAction: 'stick' | 'pass' | null;
  effectiveSeats: readonly CanonicalSeatAssignment[];
  deltasQ: readonly [number, number, number, number] | null;
  winnerGainQ: number | null;
  roundAfterHand: ReplayRoundProjection | null;
};

export type CloudCanonicalProjection = {
  sourceFormat: typeof LEGACY_CLOUD_ARCHIVE_SOURCE_FORMAT;
  sourceTrust: typeof LEGACY_CLOUD_SOURCE_TRUST;
  rules: CanonicalHkRules;
  resultParticipantIds: readonly string[];
  players: readonly CloudResultPlayer[];
  ranking: ReturnType<typeof rankDashboardPlayers<CloudResultPlayer>>;
  statistics: {
    handsCount: number;
    draws: number;
    zimoLeaders: { count: number; playerIds: readonly string[] } | null;
    discardLeaders: { count: number; playerIds: readonly string[] } | null;
  };
  hands: readonly CloudResultHandProjection[];
  finalSeats: readonly CanonicalSeatAssignment[];
  finalRound: ReplayRoundProjection;
};

export type CloudCanonicalResult = {
  sourceStatus: 'valid' | 'invalid';
  adapterStatus: 'not_run' | 'valid' | 'invalid';
  replayStatus: 'not_run' | 'valid' | 'invalid';
  projectionStatus: 'not_run' | 'valid';
  canonicalValid: boolean;
  sourceFormat: typeof LEGACY_CLOUD_ARCHIVE_SOURCE_FORMAT;
  sourceTrust: typeof LEGACY_CLOUD_SOURCE_TRUST;
  diagnostics: {
    source: readonly CloudSourceDiagnostic[];
    adapter: readonly CloudAdapterDiagnostic[];
    replay: readonly ReplayValidationIssue[];
  };
  replay: ReplayResult | null;
  projection: CloudCanonicalProjection | null;
};

function firstCurrentRound(): CloudCurrentHandRound {
  const round = getRoundLabelFromDealerState(0, 0);
  return {
    dealerSeatIndex: 0,
    dealerAdvanceCount: 0,
    roundIndex: round.roundIndex,
    wind: round.wind,
    dealerWind: round.dealerWind,
    labelZh: round.labelZh,
  };
}

function currentRoundFromPrevious(previous: ReplayRoundProjection): CloudCurrentHandRound {
  return {
    dealerSeatIndex: previous.dealerSeatIndex,
    dealerAdvanceCount: previous.dealerAdvanceCount,
    roundIndex: previous.roundIndex,
    wind: previous.wind,
    dealerWind: previous.dealerWind,
    labelZh: previous.nextRoundLabelZh,
  };
}

function projectValidReplay(
  sourceRules: CanonicalHkRules,
  replay: ReplayResult,
  handTrace: readonly CloudHandTrace[],
  resultParticipantIds: readonly string[],
): CloudCanonicalProjection {
  const participantSet = new Set(resultParticipantIds);
  const players: CloudResultPlayer[] = replay.players
    .filter((player) => participantSet.has(player.playerId))
    .map((player) => ({ ...player }));
  const rankInput = players.map((player) => ({
    playerId: player.playerId,
    displayName: player.displayName,
    totalQ: player.totalQ,
  }));
  const zimoCounts = players.reduce<Record<string, number>>((counts, player) => {
    counts[player.playerId] = player.zimoCount;
    return counts;
  }, {});
  const discardCounts = players.reduce<Record<string, number>>((counts, player) => {
    counts[player.playerId] = player.discardCount;
    return counts;
  }, {});
  const zimoLeaders = getTopDashboardPlayers(rankInput, zimoCounts);
  const discardLeaders = getTopDashboardPlayers(rankInput, discardCounts);
  const traceByCanonicalIndex = new Map(handTrace.map((trace) => [trace.canonicalHandIndex, trace]));
  let currentRound = firstCurrentRound();
  const hands: CloudResultHandProjection[] = replay.handProjections.map((hand, index) => {
    const trace = traceByCanonicalIndex.get(hand.source.handIndex);
    if (!trace) {
      throw new Error(`Missing Cloud hand trace for canonical hand ${hand.source.handIndex}`);
    }
    const winnerSeatIndex = hand.source.winnerPlayerId
      ? hand.effectiveSeats.find((seat) => seat.playerId === hand.source.winnerPlayerId)?.seatIndex
      : undefined;
    const projected = {
      trace,
      currentRound,
      outcome: hand.source.outcome,
      fan: hand.source.fan,
      winnerPlayerId: hand.source.winnerPlayerId,
      discarderPlayerId: hand.source.discarderPlayerId,
      drawDealerAction: hand.source.drawDealerAction,
      effectiveSeats: hand.effectiveSeats,
      deltasQ: hand.deltasQ,
      winnerGainQ: winnerSeatIndex !== undefined && hand.deltasQ
        ? hand.deltasQ[winnerSeatIndex]
        : null,
      roundAfterHand: hand.roundAfterHand,
    };
    if (hand.roundAfterHand) {
      currentRound = currentRoundFromPrevious(hand.roundAfterHand);
    } else if (index < replay.handProjections.length - 1) {
      throw new Error('Valid replay unexpectedly lacks an intermediate round projection');
    }
    return projected;
  });
  if (!replay.statistics || !replay.finalSeats || !replay.finalRound) {
    throw new Error('Valid replay unexpectedly lacks final result projections');
  }
  return {
    sourceFormat: LEGACY_CLOUD_ARCHIVE_SOURCE_FORMAT,
    sourceTrust: LEGACY_CLOUD_SOURCE_TRUST,
    rules: sourceRules,
    resultParticipantIds,
    players,
    ranking: rankDashboardPlayers(players),
    statistics: {
      handsCount: replay.statistics.handsCount,
      draws: replay.statistics.draws,
      zimoLeaders: zimoLeaders
        ? { count: zimoLeaders.count, playerIds: zimoLeaders.players.map((player) => player.playerId) }
        : null,
      discardLeaders: discardLeaders
        ? { count: discardLeaders.count, playerIds: discardLeaders.players.map((player) => player.playerId) }
        : null,
    },
    hands,
    finalSeats: replay.finalSeats,
    finalRound: replay.finalRound,
  };
}

/** Runs the complete pure source -> adapter -> canonical replay -> characterization pipeline. */
export function buildCloudCanonicalResult(input: unknown): CloudCanonicalResult {
  const parsed = parseCloudArchiveSource(input);
  if (!parsed.ok) {
    return {
      sourceStatus: 'invalid', adapterStatus: 'not_run', replayStatus: 'not_run', projectionStatus: 'not_run',
      canonicalValid: false, sourceFormat: LEGACY_CLOUD_ARCHIVE_SOURCE_FORMAT, sourceTrust: LEGACY_CLOUD_SOURCE_TRUST,
      diagnostics: { source: parsed.diagnostics, adapter: [], replay: [] }, replay: null, projection: null,
    };
  }
  const adapted = adaptCloudSourceToCanonical(parsed.source);
  if (!adapted.ok) {
    return {
      sourceStatus: 'valid', adapterStatus: 'invalid', replayStatus: 'not_run', projectionStatus: 'not_run',
      canonicalValid: false, sourceFormat: parsed.source.format, sourceTrust: parsed.source.sourceTrust,
      diagnostics: { source: parsed.diagnostics, adapter: adapted.diagnostics, replay: [] }, replay: null, projection: null,
    };
  }
  const replay = replayGameRecord(adapted.value.snapshot);
  if (!replay.isValid) {
    return {
      sourceStatus: 'valid', adapterStatus: 'valid', replayStatus: 'invalid', projectionStatus: 'not_run',
      canonicalValid: false, sourceFormat: parsed.source.format, sourceTrust: parsed.source.sourceTrust,
      diagnostics: { source: parsed.diagnostics, adapter: adapted.diagnostics, replay: replay.validationIssues }, replay, projection: null,
    };
  }
  const projection = projectValidReplay(
    parsed.source.rules,
    replay,
    adapted.value.handTrace,
    adapted.value.resultParticipantIds,
  );
  return {
    sourceStatus: 'valid', adapterStatus: 'valid', replayStatus: 'valid', projectionStatus: 'valid',
    canonicalValid: true, sourceFormat: parsed.source.format, sourceTrust: parsed.source.sourceTrust,
    diagnostics: { source: parsed.diagnostics, adapter: adapted.diagnostics, replay: replay.validationIssues }, replay, projection,
  };
}
