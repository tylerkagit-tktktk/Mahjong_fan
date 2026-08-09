import { getRoundLabel } from '../../models/dealer';
import { computeGameStats } from '../../models/gameStats';
import type { GameBundle, Hand } from '../../models/db';
import type { LocalGameReplayResult } from '../../services/localGameReplay';
import type { CanonicalHkRules, CanonicalSeatAssignment, ReplayResult } from './types';

export type DashboardProjectionSource = 'canonical' | 'legacy';

export type DashboardPlayerRow = {
  playerId: string;
  displayName: string;
  totalQ: number;
  finalSeatIndex: number | null;
};

export type DashboardTopPlayerStat = {
  playerId: string;
  displayName: string;
  count: number;
} | null;

export type DashboardStatistics = {
  handsCount: number;
  draws: number;
  winsByPlayerId: Readonly<Record<string, number>>;
  zimoByPlayerId: Readonly<Record<string, number>>;
  discardByPlayerId: Readonly<Record<string, number>>;
  mostDiscarder: DashboardTopPlayerStat;
  mostZimo: DashboardTopPlayerStat;
  zeroSum: boolean;
};

export type DashboardSettlementDirection = {
  handIndex?: number;
  fromPlayerId: string;
  toPlayerId: string;
  amountQ: number;
};

export type DashboardHandRow = {
  id: string;
  handIndex: number;
  occurredAt: number;
  outcome: 'zimo' | 'discard' | 'draw';
  winnerPlayerId: string | null;
  winnerSeatIndex: number | null;
  discarderPlayerId: string | null;
  fan: number | null;
  drawDealerAction: 'stick' | 'pass' | null;
  deltasQ: readonly number[] | null;
  effectiveSeats: readonly CanonicalSeatAssignment[];
  roundLabelZh: string;
  nextRoundLabelZh: string;
  windLabelZh: string;
};

export type DashboardRuleSummary = {
  variant: string;
  currencySymbol: string;
  minFanToWin: number | null;
  scoringPreset: string | null;
  gunMode: string | null;
  stakePreset: string | null;
  unitPerFan: number | null;
  capFan: number | null;
};

export type LocalDashboardProjection = {
  source: DashboardProjectionSource;
  players: readonly DashboardPlayerRow[];
  statistics: DashboardStatistics;
  settlementDirections: readonly DashboardSettlementDirection[];
  hands: readonly DashboardHandRow[];
  ruleSummary: DashboardRuleSummary;
};

export type DashboardFallbackReason =
  | 'NOT_DASHBOARD_LIFECYCLE'
  | 'ADAPTER_NOT_OK'
  | 'REPLAY_INVALID'
  | 'PARITY_MISMATCH'
  | 'LEGACY_INFERRED_HISTORY'
  | 'NOT_AUTHORITATIVE';

export type LocalDashboardProjectionResult = {
  projection: LocalDashboardProjection;
  source: DashboardProjectionSource;
  fallbackReason: DashboardFallbackReason | null;
};

function resolveDeltasQ(deltasJson?: string | null): number[] | null {
  if (!deltasJson) return null;
  try {
    const parsed = JSON.parse(deltasJson) as unknown;
    const values = Array.isArray(parsed)
      ? parsed
      : parsed && typeof parsed === 'object' && Array.isArray((parsed as { values?: unknown }).values)
        ? (parsed as { values: unknown[] }).values
        : parsed && typeof parsed === 'object' && Array.isArray((parsed as { deltasQ?: unknown }).deltasQ)
          ? (parsed as { deltasQ: unknown[] }).deltasQ
          : null;
    if (!values || values.length !== 4 || values.some((value) => typeof value !== 'number' || !Number.isFinite(value))) {
      return null;
    }
    return values as number[];
  } catch {
    return null;
  }
}

function parseComputed(hand: Hand): {
  outcome: DashboardHandRow['outcome'];
  fan: number | null;
  drawDealerAction: DashboardHandRow['drawDealerAction'];
} {
  let parsed: Record<string, unknown> = {};
  try {
    const raw = JSON.parse(hand.computedJson) as unknown;
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) parsed = raw as Record<string, unknown>;
  } catch {
    // Legacy dashboard intentionally remains tolerant of malformed source JSON.
  }
  const settlementType = parsed.settlementType;
  const outcome = hand.isDraw || hand.type === 'draw' || settlementType === 'draw'
    ? 'draw'
    : hand.type === 'zimo' || settlementType === 'zimo'
      ? 'zimo'
      : 'discard';
  const effectiveFan = parsed.effectiveFan;
  const rawFan = effectiveFan ?? parsed.fan;
  const fan = outcome === 'draw' || typeof rawFan !== 'number' || !Number.isFinite(rawFan) ? null : rawFan;
  const drawDealerAction = parsed.dealerAction === 'stick' || parsed.dealerAction === 'pass'
    ? parsed.dealerAction
    : null;
  return { outcome, fan, drawDealerAction };
}

function ruleSummaryFromBundle(bundle: GameBundle): DashboardRuleSummary {
  try {
    const raw = JSON.parse(bundle.game.rulesJson) as Record<string, unknown>;
    const hk = raw.hk && typeof raw.hk === 'object' ? raw.hk as Record<string, unknown> : {};
    return {
      variant: bundle.game.variant,
      currencySymbol: typeof raw.currencySymbol === 'string' ? raw.currencySymbol : bundle.game.currencySymbol,
      minFanToWin: typeof raw.minFanToWin === 'number' ? raw.minFanToWin : null,
      scoringPreset: typeof hk.scoringPreset === 'string' ? hk.scoringPreset : null,
      gunMode: typeof hk.gunMode === 'string' ? hk.gunMode : null,
      stakePreset: typeof hk.stakePreset === 'string' ? hk.stakePreset : null,
      unitPerFan: typeof hk.unitPerFan === 'number' ? hk.unitPerFan : null,
      capFan: typeof hk.capFan === 'number' ? hk.capFan : hk.capFan === null ? null : null,
    };
  } catch {
    return {
      variant: bundle.game.variant,
      currencySymbol: bundle.game.currencySymbol,
      minFanToWin: null,
      scoringPreset: null,
      gunMode: null,
      stakePreset: null,
      unitPerFan: null,
      capFan: null,
    };
  }
}

function topStat(
  playerId: string | null,
  countByPlayerId: Readonly<Record<string, number>>,
  namesByPlayerId: ReadonlyMap<string, string>,
): DashboardTopPlayerStat {
  if (!playerId) return null;
  return {
    playerId,
    displayName: namesByPlayerId.get(playerId) ?? playerId,
    count: countByPlayerId[playerId] ?? 0,
  };
}

function seatAssignmentsFromPlayers(bundle: GameBundle): CanonicalSeatAssignment[] {
  return bundle.players
    .map((player) => ({ seatIndex: player.seatIndex, playerId: player.id }))
    .filter((seat) => Number.isInteger(seat.seatIndex) && seat.seatIndex >= 0 && seat.seatIndex <= 3)
    .sort((left, right) => left.seatIndex - right.seatIndex) as CanonicalSeatAssignment[];
}

/**
 * Legacy records do not store settlement directions. This is the same final-balance
 * transfer allocation formerly used only by Dashboard sharing, now owned by the selected
 * projection so every local result surface reads one presentation source.
 */
function buildLegacySettlementDirections(players: readonly DashboardPlayerRow[]): DashboardSettlementDirection[] {
  const winners = players
    .filter((player) => player.totalQ > 0)
    .map((player) => ({ ...player, remainingQ: player.totalQ }))
    .sort((left, right) => right.remainingQ - left.remainingQ);
  const losers = players
    .filter((player) => player.totalQ < 0)
    .map((player) => ({ ...player, remainingQ: Math.abs(player.totalQ) }))
    .sort((left, right) => right.remainingQ - left.remainingQ);
  const directions: DashboardSettlementDirection[] = [];

  losers.forEach((loser) => {
    winners.forEach((winner) => {
      if (loser.remainingQ <= 0 || winner.remainingQ <= 0) return;
      const amountQ = Math.min(loser.remainingQ, winner.remainingQ);
      directions.push({ fromPlayerId: loser.playerId, toPlayerId: winner.playerId, amountQ });
      loser.remainingQ -= amountQ;
      winner.remainingQ -= amountQ;
    });
  });
  return directions.filter((direction) => direction.amountQ > 0);
}

function buildLegacyLocalDashboardProjection(bundle: GameBundle): LocalDashboardProjection {
  const stats = computeGameStats(bundle);
  const orderedHands = bundle.hands.slice().sort((left, right) => left.handIndex - right.handIndex);
  const progressive: Hand[] = [];
  const effectiveSeats = seatAssignmentsFromPlayers(bundle);
  const hands = orderedHands.map((hand) => {
    progressive.push(hand);
    const parsed = parseComputed(hand);
    const roundLabelZh = getRoundLabel(bundle.game.startingDealerSeatIndex, progressive).labelZh;
    return {
      id: hand.id,
      handIndex: hand.handIndex,
      occurredAt: hand.createdAt,
      outcome: parsed.outcome,
      winnerPlayerId: hand.winnerPlayerId ?? null,
      winnerSeatIndex: hand.winnerSeatIndex ?? null,
      discarderPlayerId: hand.discarderPlayerId ?? null,
      fan: parsed.fan,
      drawDealerAction: parsed.drawDealerAction,
      deltasQ: resolveDeltasQ(hand.deltasJson),
      effectiveSeats,
      roundLabelZh,
      nextRoundLabelZh: hand.nextRoundLabelZh ?? roundLabelZh,
      windLabelZh: roundLabelZh.slice(0, 2),
    } satisfies DashboardHandRow;
  });
  const players = stats.ranking.map((entry) => ({
    playerId: entry.playerId,
    displayName: entry.name,
    totalQ: entry.totalMoney * 4,
    finalSeatIndex: effectiveSeats.find((seat) => seat.playerId === entry.playerId)?.seatIndex ?? null,
  }));
  return {
    source: 'legacy',
    players,
    statistics: {
      handsCount: bundle.game.handsCount ?? orderedHands.length,
      draws: stats.draws,
      winsByPlayerId: stats.winsByPlayerId,
      zimoByPlayerId: stats.zimoByPlayerId,
      discardByPlayerId: stats.discardByPlayerId,
      mostDiscarder: stats.mostDiscarder
        ? { playerId: stats.mostDiscarder.playerId, displayName: stats.mostDiscarder.name, count: stats.mostDiscarder.count }
        : null,
      mostZimo: stats.mostZimo
        ? { playerId: stats.mostZimo.playerId, displayName: stats.mostZimo.name, count: stats.mostZimo.count }
        : null,
      zeroSum: stats.zeroSumOk,
    },
    settlementDirections: buildLegacySettlementDirections(players),
    hands,
    ruleSummary: ruleSummaryFromBundle(bundle),
  };
}

function buildCanonicalLocalDashboardProjection(bundle: GameBundle, replay: ReplayResult): LocalDashboardProjection {
  const namesByPlayerId = new Map(replay.players.map((player) => [player.playerId, player.displayName]));
  const finalSeats = replay.finalSeats ?? [];
  const players = replay.ranking.map((entry) => ({
    playerId: entry.playerId,
    displayName: entry.displayName,
    totalQ: entry.totalQ,
    finalSeatIndex: finalSeats.find((seat) => seat.playerId === entry.playerId)?.seatIndex ?? null,
  }));
  const statistics = replay.statistics!;
  const hands = replay.handProjections.map((projection) => ({
    id: projection.source.id,
    handIndex: projection.source.handIndex,
    occurredAt: projection.source.occurredAt,
    outcome: projection.source.outcome,
    winnerPlayerId: projection.source.winnerPlayerId,
    winnerSeatIndex: projection.source.winnerPlayerId
      ? projection.effectiveSeats.find((seat) => seat.playerId === projection.source.winnerPlayerId)?.seatIndex ?? null
      : null,
    discarderPlayerId: projection.source.discarderPlayerId,
    fan: projection.source.fan,
    drawDealerAction: projection.source.drawDealerAction,
    deltasQ: projection.deltasQ,
    effectiveSeats: projection.effectiveSeats,
    roundLabelZh: projection.roundAfterHand?.nextRoundLabelZh ?? '',
    nextRoundLabelZh: projection.roundAfterHand?.nextRoundLabelZh ?? '',
    windLabelZh: (projection.roundAfterHand?.nextRoundLabelZh ?? '').slice(0, 2),
  } satisfies DashboardHandRow));
  const rules = replay.source.rules;
  const canonicalRules: CanonicalHkRules | null = rules.variant === 'HK' && 'currencySymbol' in rules
    ? rules as CanonicalHkRules
    : null;
  const discardByPlayerId = replay.players.reduce<Record<string, number>>((output, player) => {
    output[player.playerId] = player.discardCount;
    return output;
  }, {});
  const zimoByPlayerId = replay.players.reduce<Record<string, number>>((output, player) => {
    output[player.playerId] = player.zimoCount;
    return output;
  }, {});

  return {
    source: 'canonical',
    players,
    statistics: {
      handsCount: statistics.handsCount,
      draws: statistics.draws,
      winsByPlayerId: replay.players.reduce<Record<string, number>>((output, player) => {
        output[player.playerId] = player.wins;
        return output;
      }, {}),
      zimoByPlayerId,
      discardByPlayerId,
      mostDiscarder: topStat(
        statistics.mostDiscarderPlayerId,
        discardByPlayerId,
        namesByPlayerId,
      ),
      mostZimo: topStat(
        statistics.mostZimoPlayerId,
        zimoByPlayerId,
        namesByPlayerId,
      ),
      zeroSum: statistics.zeroSum,
    },
    settlementDirections: replay.settlementDirections,
    hands,
    ruleSummary: canonicalRules
      ? {
          variant: canonicalRules.variant,
          currencySymbol: canonicalRules.currencySymbol,
          minFanToWin: canonicalRules.minFanToWin,
          scoringPreset: canonicalRules.scoringPreset,
          gunMode: canonicalRules.gunMode,
          stakePreset: canonicalRules.stakePreset,
          unitPerFan: canonicalRules.unitPerFan,
          capFan: canonicalRules.capFan,
        }
      : ruleSummaryFromBundle(bundle),
  };
}

function fallbackReasonFor(result: LocalGameReplayResult | null): DashboardFallbackReason {
  if (!result?.adapter?.ok) return 'ADAPTER_NOT_OK';
  if (!result.replay?.isValid) return 'REPLAY_INVALID';
  if (result.parity?.requiredStatus !== 'exact') return 'PARITY_MISMATCH';
  if (result.adapter.snapshot.timeline.some((entry) => entry.entryType === 'seat-boundary') &&
      result.adapter.diagnostics.some((diagnostic) => diagnostic.code === 'LEGACY_INFERRED_BOUNDARY_HISTORY')) {
    return 'LEGACY_INFERRED_HISTORY';
  }
  return 'NOT_AUTHORITATIVE';
}

export function buildLocalDashboardProjection(input: {
  bundle: GameBundle;
  localReplayResult: LocalGameReplayResult | null;
}): LocalDashboardProjectionResult {
  const { bundle, localReplayResult } = input;
  if (bundle.game.gameState === 'ended' && localReplayResult?.authoritative && localReplayResult.replay) {
    const projection = buildCanonicalLocalDashboardProjection(bundle, localReplayResult.replay);
    return { projection, source: 'canonical', fallbackReason: null };
  }
  const projection = buildLegacyLocalDashboardProjection(bundle);
  return {
    projection,
    source: 'legacy',
    fallbackReason: bundle.game.gameState === 'ended'
      ? fallbackReasonFor(localReplayResult)
      : 'NOT_DASHBOARD_LIFECYCLE',
  };
}
