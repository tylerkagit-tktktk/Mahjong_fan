import { Player } from './db';

export function normalizeSeatRotationOffset(offset: number): number {
  const normalized = offset % 4;
  return normalized < 0 ? normalized + 4 : normalized;
}

export function didCompleteWindCycle(
  previousRoundLabelZh: string | null | undefined,
  nextRoundLabelZh: string | null | undefined,
): boolean {
  const prev = previousRoundLabelZh ?? '';
  const next = nextRoundLabelZh ?? '';
  return prev.startsWith('北風') && next.startsWith('東風');
}

export function getEffectiveSeatForPlayer(baseSeatIndex: number, seatRotationOffset: number): number {
  return (baseSeatIndex + normalizeSeatRotationOffset(seatRotationOffset)) % 4;
}

export function getBaseSeatForEffectiveSeat(effectiveSeatIndex: number, seatRotationOffset: number): number {
  return (effectiveSeatIndex - normalizeSeatRotationOffset(seatRotationOffset) + 4) % 4;
}

export function getEffectivePlayersBySeat(
  players: Player[],
  seatRotationOffset: number,
): Record<number, Player | undefined> {
  const output: Record<number, Player | undefined> = {};
  players.forEach((player) => {
    const effectiveSeat = getEffectiveSeatForPlayer(player.seatIndex, seatRotationOffset);
    output[effectiveSeat] = player;
  });
  return output;
}

export function getEffectivePlayerForSeat(
  players: Player[],
  seatRotationOffset: number,
  effectiveSeatIndex: number,
): Player | null {
  const bySeat = getEffectivePlayersBySeat(players, seatRotationOffset);
  return bySeat[effectiveSeatIndex] ?? null;
}

type HandWithNextRoundLabel = {
  nextRoundLabelZh?: string | null;
};

type HandWithDeltasAndLabel = {
  nextRoundLabelZh?: string | null;
  deltasQ: number[] | null;
};

export function buildSeatRotationOffsetsByHand(
  hands: HandWithNextRoundLabel[],
  initialRoundLabelZh: string,
  initialOffset = 0,
): number[] {
  let currentOffset = normalizeSeatRotationOffset(initialOffset);
  let previousRoundLabelZh = initialRoundLabelZh;

  return hands.map((hand) => {
    const offsetAtHand = currentOffset;
    const nextRoundLabelZh = hand.nextRoundLabelZh ?? previousRoundLabelZh;
    if (didCompleteWindCycle(previousRoundLabelZh, nextRoundLabelZh)) {
      currentOffset = normalizeSeatRotationOffset(currentOffset + 1);
    }
    previousRoundLabelZh = nextRoundLabelZh;
    return offsetAtHand;
  });
}

export function aggregatePlayerTotalsQByTimeline(
  players: Player[],
  hands: HandWithDeltasAndLabel[],
  initialRoundLabelZh: string,
  initialOffset = 0,
): Map<string, number> {
  const totals = new Map<string, number>();
  players.forEach((player) => totals.set(player.id, 0));

  const offsetsByHand = buildSeatRotationOffsetsByHand(hands, initialRoundLabelZh, initialOffset);
  hands.forEach((hand, handIndex) => {
    if (!hand.deltasQ) {
      return;
    }
    const playersBySeat = getEffectivePlayersBySeat(players, offsetsByHand[handIndex] ?? initialOffset);
    for (let seatIndex = 0; seatIndex < 4; seatIndex += 1) {
      const player = playersBySeat[seatIndex];
      if (!player) {
        continue;
      }
      totals.set(player.id, (totals.get(player.id) ?? 0) + Number(hand.deltasQ[seatIndex] ?? 0));
    }
  });

  return totals;
}
