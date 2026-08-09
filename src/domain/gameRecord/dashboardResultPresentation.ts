export type DashboardRankInput = {
  playerId: string;
  displayName: string;
  totalQ: number;
};

export type DashboardRankedPlayer<T extends DashboardRankInput = DashboardRankInput> = T & {
  rank: number;
  tied: boolean;
};

export type DashboardTopPlayers = {
  count: number;
  players: readonly DashboardRankInput[];
};

/**
 * Sorts final balances deterministically while retaining competition ranks for ties:
 * 1, 1, 3, 4 rather than inventing a name-based result order.
 */
export function rankDashboardPlayers<T extends DashboardRankInput>(players: readonly T[]): DashboardRankedPlayer<T>[] {
  const sorted = [...players].sort(
    (left, right) => right.totalQ - left.totalQ || left.displayName.localeCompare(right.displayName) || left.playerId.localeCompare(right.playerId),
  );
  const countByTotal = new Map<number, number>();
  sorted.forEach((player) => countByTotal.set(player.totalQ, (countByTotal.get(player.totalQ) ?? 0) + 1));

  let previousTotal: number | null = null;
  let rank = 0;
  return sorted.map((player, index) => {
    if (previousTotal === null || player.totalQ !== previousTotal) {
      rank = index + 1;
      previousTotal = player.totalQ;
    }
    return { ...player, rank, tied: (countByTotal.get(player.totalQ) ?? 0) > 1 };
  });
}

/** Returns every tied leader, while intentionally treating an all-zero category as empty. */
export function getTopDashboardPlayers(
  players: readonly DashboardRankInput[],
  countByPlayerId: Readonly<Record<string, number>>,
): DashboardTopPlayers | null {
  const maxCount = players.reduce((max, player) => Math.max(max, countByPlayerId[player.playerId] ?? 0), 0);
  if (maxCount <= 0) return null;
  return {
    count: maxCount,
    players: players.filter((player) => (countByPlayerId[player.playerId] ?? 0) === maxCount),
  };
}
