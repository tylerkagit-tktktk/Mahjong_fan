import { INITIAL_ROUND_LABEL_ZH } from '../../constants/game';
import { getDealerSeatIndexForNextHand } from '../../models/dealer';
import { computeGameStats } from '../../models/gameStats';
import {
  aggregatePlayerTotalsQByTimeline,
  getEffectivePlayersBySeat,
  normalizeSeatRotationOffset,
} from '../../models/seatRotation';
import type { GameBundle, Hand, Player } from '../../models/db';
import type { ReplayResult } from './types';

export type LocalReplayParityStatus = 'exact' | 'mismatch' | 'notComparable';
export type LocalReplayParityCategory = 'required' | 'informational';

export type LocalReplayParityItem = {
  category: LocalReplayParityCategory;
  field: string;
  status: LocalReplayParityStatus;
  expected: unknown;
  actual: unknown;
  handIndex?: number;
  playerId?: string;
};

export type LocalReplayParityReport = {
  status: LocalReplayParityStatus;
  requiredStatus: LocalReplayParityStatus;
  informationalStatus: LocalReplayParityStatus;
  exact: boolean;
  required: readonly LocalReplayParityItem[];
  informational: readonly LocalReplayParityItem[];
  items: readonly LocalReplayParityItem[];
};

type LegacySummaryProjection = {
  winnerPlayerId: string | null;
  loserPlayerId: string | null;
  seatTotalsQ: readonly number[];
  playerTotalsQ: Readonly<Record<string, number>>;
  playersCount: number;
};

type StoredSummaryProjection = LegacySummaryProjection;

function resolveDeltasQ(deltasJson?: string | null): number[] | null {
  if (!deltasJson) {
    return null;
  }
  try {
    const parsed = JSON.parse(deltasJson) as unknown;
    const values = Array.isArray(parsed)
      ? parsed
      : typeof parsed === 'object' && parsed !== null
        ? (Array.isArray((parsed as { values?: unknown }).values)
          ? (parsed as { values: unknown[] }).values
          : (parsed as { deltasQ?: unknown[] }).deltasQ)
        : null;
    if (
      !Array.isArray(values) ||
      values.length !== 4 ||
      values.some((value) => typeof value !== 'number' || !Number.isFinite(value))
    ) {
      return null;
    }
    return values as number[];
  } catch {
    return null;
  }
}

function sumQ(values: readonly number[]): number {
  return values.reduce((sum, value) => sum + value, 0);
}

function deepEqual(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function compareValues(
  category: LocalReplayParityCategory,
  field: string,
  expected: unknown,
  actual: unknown,
  context: { handIndex?: number; playerId?: string } = {},
  comparable = true,
): LocalReplayParityItem {
  return {
    category,
    field,
    status: !comparable ? 'notComparable' : deepEqual(expected, actual) ? 'exact' : 'mismatch',
    expected: comparable ? expected : null,
    actual: comparable ? actual : null,
    ...(context.handIndex === undefined ? {} : { handIndex: context.handIndex }),
    ...(context.playerId === undefined ? {} : { playerId: context.playerId }),
  };
}

function statusOf(items: readonly LocalReplayParityItem[]): LocalReplayParityStatus {
  if (items.some((item) => item.status === 'mismatch')) {
    return 'mismatch';
  }
  if (items.some((item) => item.status === 'notComparable')) {
    return 'notComparable';
  }
  return 'exact';
}

function orderedHands(bundle: GameBundle): Hand[] {
  return bundle.hands.slice().sort((left, right) => left.handIndex - right.handIndex);
}

function buildLegacyPlayerTotals(bundle: GameBundle, hands: readonly Hand[]): Map<string, number> {
  return aggregatePlayerTotalsQByTimeline(
    bundle.players,
    hands.map((hand) => ({
      nextRoundLabelZh: hand.nextRoundLabelZh ?? null,
      deltasQ: resolveDeltasQ(hand.deltasJson),
    })),
    INITIAL_ROUND_LABEL_ZH,
    0,
  );
}

function buildLegacySummary(
  bundle: GameBundle,
  hands: readonly Hand[],
  playerTotalsQ: ReadonlyMap<string, number>,
): LegacySummaryProjection {
  const seatTotalsQ = [0, 0, 0, 0];
  hands.forEach((hand) => {
    const deltasQ = resolveDeltasQ(hand.deltasJson);
    if (!deltasQ) {
      return;
    }
    for (let seatIndex = 0; seatIndex < 4; seatIndex += 1) {
      seatTotalsQ[seatIndex] += Number(deltasQ[seatIndex] ?? 0);
    }
  });

  let winnerPlayer: Player | null = bundle.players[0] ?? null;
  let loserPlayer: Player | null = bundle.players[0] ?? null;
  bundle.players.forEach((player) => {
    if (!winnerPlayer || (playerTotalsQ.get(player.id) ?? 0) > (playerTotalsQ.get(winnerPlayer.id) ?? 0)) {
      winnerPlayer = player;
    }
    if (!loserPlayer || (playerTotalsQ.get(player.id) ?? 0) < (playerTotalsQ.get(loserPlayer.id) ?? 0)) {
      loserPlayer = player;
    }
  });

  return {
    winnerPlayerId: winnerPlayer?.id ?? null,
    loserPlayerId: loserPlayer?.id ?? null,
    seatTotalsQ,
    playerTotalsQ: bundle.players.reduce<Record<string, number>>((totals, player) => {
      totals[player.id] = playerTotalsQ.get(player.id) ?? 0;
      return totals;
    }, {}),
    playersCount: bundle.players.length,
  };
}

function parseStoredSummary(raw: string | null | undefined): StoredSummaryProjection | null {
  if (!raw) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      return null;
    }
    const value = parsed as {
      seatTotalsQ?: unknown;
      playerTotalsQ?: unknown;
      playersCount?: unknown;
    };
    if (
      !Array.isArray(value.seatTotalsQ) ||
      value.seatTotalsQ.length !== 4 ||
      value.seatTotalsQ.some((entry) => typeof entry !== 'number' || !Number.isFinite(entry)) ||
      typeof value.playerTotalsQ !== 'object' ||
      value.playerTotalsQ === null ||
      Array.isArray(value.playerTotalsQ) ||
      typeof value.playersCount !== 'number' ||
      !Number.isInteger(value.playersCount) ||
      value.playersCount < 0
    ) {
      return null;
    }
    const playerTotalsQ: Record<string, number> = {};
    for (const [playerId, total] of Object.entries(value.playerTotalsQ as Record<string, unknown>)) {
      if (typeof total !== 'number' || !Number.isFinite(total)) {
        return null;
      }
      playerTotalsQ[playerId] = total;
    }

    const orderedPlayerIds = Object.keys(playerTotalsQ);
    const winnerPlayerId = orderedPlayerIds.reduce<string | null>((winner, playerId) => {
      if (winner === null || playerTotalsQ[playerId] > playerTotalsQ[winner]) {
        return playerId;
      }
      return winner;
    }, null);
    const loserPlayerId = orderedPlayerIds.reduce<string | null>((loser, playerId) => {
      if (loser === null || playerTotalsQ[playerId] < playerTotalsQ[loser]) {
        return playerId;
      }
      return loser;
    }, null);

    return {
      winnerPlayerId,
      loserPlayerId,
      seatTotalsQ: value.seatTotalsQ as number[],
      playerTotalsQ,
      playersCount: value.playersCount,
    };
  } catch {
    return null;
  }
}

function normalizeSummary(summary: LegacySummaryProjection | null): LegacySummaryProjection | null {
  if (!summary) {
    return null;
  }
  const playerTotalsQ = Object.keys(summary.playerTotalsQ)
    .sort()
    .reduce<Record<string, number>>((totals, playerId) => {
      totals[playerId] = summary.playerTotalsQ[playerId];
      return totals;
    }, {});
  return {
    winnerPlayerId: summary.winnerPlayerId,
    loserPlayerId: summary.loserPlayerId,
    seatTotalsQ: [...summary.seatTotalsQ],
    playerTotalsQ,
    playersCount: summary.playersCount,
  };
}

function buildCurrentSeatMapping(bundle: GameBundle): readonly { seatIndex: number; playerId: string }[] {
  const effective = getEffectivePlayersBySeat(
    bundle.players,
    normalizeSeatRotationOffset(bundle.game.seatRotationOffset ?? 0),
  );
  return [0, 1, 2, 3].map((seatIndex) => ({
    seatIndex,
    playerId: effective[seatIndex]?.id ?? '',
  }));
}

export function compareLocalReplayParity(
  bundle: GameBundle,
  replay: ReplayResult,
): LocalReplayParityReport {
  const hands = orderedHands(bundle);
  const stats = computeGameStats(bundle);
  const legacyPlayerTotalsQ = buildLegacyPlayerTotals(bundle, hands);
  const legacySummary = buildLegacySummary(bundle, hands, legacyPlayerTotalsQ);
  const required: LocalReplayParityItem[] = [];
  const informational: LocalReplayParityItem[] = [];

  required.push(compareValues(
    'required',
    'handsCount',
    hands.length,
    replay.statistics?.handsCount ?? null,
    {},
    replay.statistics !== null,
  ));

  hands.forEach((hand, index) => {
    const projection = replay.handProjections[index];
    required.push(compareValues(
      'required',
      'handIndex',
      hand.handIndex,
      projection?.source.handIndex ?? null,
      { handIndex: hand.handIndex },
      Boolean(projection),
    ));

    const persistedDeltasQ = resolveDeltasQ(hand.deltasJson);
    required.push(compareValues(
      'required',
      'persistedDeltaQ',
      persistedDeltasQ,
      projection?.deltasQ ?? null,
      { handIndex: hand.handIndex },
      persistedDeltasQ !== null && Boolean(projection?.deltasQ),
    ));
  });

  bundle.players.forEach((player) => {
    const replayPlayer = replay.players.find((entry) => entry.playerId === player.id);
    required.push(compareValues(
      'required',
      'playerTotalQ',
      legacyPlayerTotalsQ.get(player.id) ?? 0,
      replayPlayer?.totalQ ?? null,
      { playerId: player.id },
      Boolean(replayPlayer),
    ));
    required.push(compareValues(
      'required',
      'wins',
      stats.winsByPlayerId[player.id] ?? 0,
      replayPlayer?.wins ?? null,
      { playerId: player.id },
      Boolean(replayPlayer),
    ));
    required.push(compareValues(
      'required',
      'zimoCount',
      stats.zimoByPlayerId[player.id] ?? 0,
      replayPlayer?.zimoCount ?? null,
      { playerId: player.id },
      Boolean(replayPlayer),
    ));
    required.push(compareValues(
      'required',
      'discardCount',
      stats.discardByPlayerId[player.id] ?? 0,
      replayPlayer?.discardCount ?? null,
      { playerId: player.id },
      Boolean(replayPlayer),
    ));
  });

  required.push(compareValues(
    'required',
    'ranking',
    stats.ranking.map((entry) => ({ playerId: entry.playerId, totalQ: entry.totalMoney * 4 })),
    replay.ranking.map((entry) => ({ playerId: entry.playerId, totalQ: entry.totalQ })),
    {},
    replay.ranking.length === bundle.players.length,
  ));
  required.push(compareValues(
    'required',
    'drawCount',
    stats.draws,
    replay.statistics?.draws ?? null,
    {},
    replay.statistics !== null,
  ));

  let expectedNextDealer: number | null = null;
  try {
    expectedNextDealer = getDealerSeatIndexForNextHand(bundle.game.startingDealerSeatIndex, hands);
  } catch {
    expectedNextDealer = null;
  }
  required.push(compareValues(
    'required',
    'nextDealer',
    expectedNextDealer,
    replay.finalRound?.dealerSeatIndex ?? null,
    {},
    expectedNextDealer !== null && replay.finalRound !== null,
  ));
  required.push(compareValues(
    'required',
    'currentRoundLabelZh',
    bundle.game.currentRoundLabelZh ?? null,
    replay.finalRound?.nextRoundLabelZh ?? null,
    {},
    bundle.game.currentRoundLabelZh !== null && bundle.game.currentRoundLabelZh !== undefined && replay.finalRound !== null,
  ));

  const replayPlayerTotals = replay.players.reduce<Record<string, number>>((totals, player) => {
    totals[player.playerId] = player.totalQ;
    return totals;
  }, {});
  required.push(compareValues(
    'required',
    'zeroSumTotals',
    { sumQ: sumQ(Object.values(legacySummary.playerTotalsQ)), zeroSum: stats.zeroSumOk },
    replay.statistics
      ? { sumQ: sumQ(Object.values(replayPlayerTotals)), zeroSum: replay.statistics.zeroSum }
      : null,
    {},
    replay.statistics !== null,
  ));

  const hasEndedResult = bundle.game.gameState === 'ended' && (
    hands.length > 0 || bundle.game.resultSummaryJson !== null && bundle.game.resultSummaryJson !== undefined
  );
  if (hasEndedResult) {
    const storedSummary = parseStoredSummary(bundle.game.resultSummaryJson);
    required.push(compareValues(
      'required',
      'endedResultSummary.source',
      normalizeSummary(storedSummary),
      normalizeSummary(legacySummary),
      {},
      storedSummary !== null,
    ));
    required.push(compareValues(
      'required',
      'endedResultSummary.replay',
      normalizeSummary(legacySummary),
      normalizeSummary(replay.summary
        ? {
            winnerPlayerId: replay.summary.winnerPlayerId,
            loserPlayerId: replay.summary.loserPlayerId,
            seatTotalsQ: replay.summary.seatTotalsQ,
            playerTotalsQ: replay.summary.playerTotalsQ,
            playersCount: replay.summary.playersCount,
          }
        : null),
      {},
      replay.summary !== null,
    ));
  }

  informational.push(compareValues(
    'informational',
    'settlementDirections',
    null,
    replay.settlementDirections,
    {},
    false,
  ));
  informational.push(compareValues(
    'informational',
    'finalEffectiveSeatMapping',
    buildCurrentSeatMapping(bundle),
    replay.finalSeats ?? null,
    {},
    replay.finalSeats !== null,
  ));
  informational.push(compareValues(
    'informational',
    'rulesNormalization',
    { variant: bundle.game.variant },
    { variant: replay.source.rules.variant },
    {},
    replay.source.rules !== null,
  ));

  const requiredStatus = statusOf(required);
  const informationalStatus = statusOf(informational);
  const status = requiredStatus === 'mismatch' || informationalStatus === 'mismatch'
    ? 'mismatch'
    : requiredStatus === 'notComparable' || informationalStatus === 'notComparable'
      ? 'notComparable'
      : 'exact';
  const items = [...required, ...informational];
  return {
    status,
    requiredStatus,
    informationalStatus,
    exact: status === 'exact',
    required,
    informational,
    items,
  };
}
