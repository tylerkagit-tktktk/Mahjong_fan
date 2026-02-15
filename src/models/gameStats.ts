import { GameBundle } from './db';
import { INITIAL_ROUND_LABEL_ZH } from '../constants/game';
import { aggregatePlayerTotalsQByTimeline } from './seatRotation';

type RankedPlayer = {
  playerId: string;
  name: string;
  totalMoney: number;
};

type TopPlayerStat = {
  playerId: string;
  name: string;
  count: number;
  tiedCount: number;
};

export type GameStats = {
  totalsQBySeat: [number, number, number, number];
  ranking: RankedPlayer[];
  winsByPlayerId: Record<string, number>;
  zimoByPlayerId: Record<string, number>;
  draws: number;
  mostDiscarder: TopPlayerStat | null;
  mostZimo: TopPlayerStat | null;
  zeroSumOk: boolean;
};

function resolveDeltasQ(deltasJson?: string | null): number[] | null {
  if (!deltasJson) {
    return null;
  }
  try {
    const parsed = JSON.parse(deltasJson) as number[] | { values?: number[]; deltasQ?: number[] };
    if (Array.isArray(parsed)) {
      return parsed;
    }
    if (Array.isArray(parsed.values)) {
      return parsed.values;
    }
    if (Array.isArray(parsed.deltasQ)) {
      return parsed.deltasQ;
    }
    return null;
  } catch {
    return null;
  }
}

function pickTop(
  counts: Map<string, number>,
  playersById: Map<string, string>,
): TopPlayerStat | null {
  const sorted = Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
  if (sorted.length === 0 || sorted[0][1] <= 0) {
    return null;
  }
  const count = sorted[0][1];
  const tiedCount = sorted.filter(([, value]) => value === count).length;
  return {
    playerId: sorted[0][0],
    name: playersById.get(sorted[0][0]) ?? '—',
    count,
    tiedCount,
  };
}

export function computeGameStats(bundle: GameBundle): GameStats {
  const orderedHands = bundle.hands.slice().sort((a, b) => a.handIndex - b.handIndex);
  const totalsQBySeat: [number, number, number, number] = [0, 0, 0, 0];
  const winsByPlayerIdMap = new Map<string, number>();
  const zimoByPlayerIdMap = new Map<string, number>();
  const discarderByPlayerIdMap = new Map<string, number>();
  let draws = 0;

  orderedHands.forEach((hand) => {
    if (hand.isDraw) {
      draws += 1;
    }
    const deltas = resolveDeltasQ(hand.deltasJson);
    if (deltas) {
      for (let index = 0; index < 4; index += 1) {
        totalsQBySeat[index] += Number(deltas[index] ?? 0);
      }
    }
    if (hand.winnerPlayerId) {
      winsByPlayerIdMap.set(hand.winnerPlayerId, (winsByPlayerIdMap.get(hand.winnerPlayerId) ?? 0) + 1);
    }
    if (hand.type === 'zimo' && hand.winnerPlayerId) {
      zimoByPlayerIdMap.set(hand.winnerPlayerId, (zimoByPlayerIdMap.get(hand.winnerPlayerId) ?? 0) + 1);
    }
    if (hand.type === 'discard' && hand.discarderPlayerId) {
      discarderByPlayerIdMap.set(
        hand.discarderPlayerId,
        (discarderByPlayerIdMap.get(hand.discarderPlayerId) ?? 0) + 1,
      );
    }
  });

  const totalsQByPlayer = aggregatePlayerTotalsQByTimeline(
    bundle.players,
    orderedHands.map((hand) => ({
      nextRoundLabelZh: hand.nextRoundLabelZh ?? null,
      deltasQ: resolveDeltasQ(hand.deltasJson),
    })),
    INITIAL_ROUND_LABEL_ZH,
    0,
  );

  const ranking = bundle.players
    .map((player) => ({
      playerId: player.id,
      name: player.name,
      totalMoney: (totalsQByPlayer.get(player.id) ?? 0) / 4,
    }))
    .sort((a, b) => {
      if (b.totalMoney !== a.totalMoney) {
        return b.totalMoney - a.totalMoney;
      }
      return a.name.localeCompare(b.name);
    });

  const playersById = new Map(bundle.players.map((player) => [player.id, player.name]));
  const winsByPlayerId = bundle.players.reduce<Record<string, number>>((acc, player) => {
    acc[player.id] = winsByPlayerIdMap.get(player.id) ?? 0;
    return acc;
  }, {});
  const zimoByPlayerId = bundle.players.reduce<Record<string, number>>((acc, player) => {
    acc[player.id] = zimoByPlayerIdMap.get(player.id) ?? 0;
    return acc;
  }, {});

  const totalQ = Array.from(totalsQByPlayer.values()).reduce((sum, value) => sum + value, 0);

  return {
    totalsQBySeat,
    ranking,
    winsByPlayerId,
    zimoByPlayerId,
    draws,
    mostDiscarder: pickTop(discarderByPlayerIdMap, playersById),
    mostZimo: pickTop(zimoByPlayerIdMap, playersById),
    zeroSumOk: totalQ === 0,
  };
}
