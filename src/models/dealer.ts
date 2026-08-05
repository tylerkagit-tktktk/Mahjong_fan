import { Hand } from './db';

type NextDealerInput = {
  dealerSeatIndex: number;
  isDraw: boolean;
  winnerSeatIndex: number | null;
};

function isValidSeatIndex(value: number): boolean {
  return Number.isInteger(value) && value >= 0 && value <= 3;
}

function assertSeatIndex(value: number, field: 'dealerSeatIndex' | 'winnerSeatIndex'): void {
  if (!isValidSeatIndex(value)) {
    throw new Error(`[Dealer] invalid ${field}: ${value}`);
  }
}

export function getNextDealerSeatIndex({
  dealerSeatIndex,
  isDraw,
  winnerSeatIndex,
}: NextDealerInput): number {
  assertSeatIndex(dealerSeatIndex, 'dealerSeatIndex');
  if (winnerSeatIndex !== null) {
    assertSeatIndex(winnerSeatIndex, 'winnerSeatIndex');
  }

  if (isDraw || winnerSeatIndex === dealerSeatIndex) {
    return dealerSeatIndex;
  }

  if (winnerSeatIndex !== null && winnerSeatIndex !== dealerSeatIndex) {
    return (dealerSeatIndex + 1) % 4;
  }

  return dealerSeatIndex;
}

export function getDealerSeatIndexForNextHand(
  startingDealerSeatIndex: number,
  hands: Hand[],
): number {
  assertSeatIndex(startingDealerSeatIndex, 'dealerSeatIndex');
  if (hands.length === 0) {
    return startingDealerSeatIndex;
  }

  const lastHand = hands[hands.length - 1];
  if (lastHand.isDraw && parseDrawDealerAction(lastHand) === 'pass') {
    return (lastHand.dealerSeatIndex + 1) % 4;
  }
  return getNextDealerSeatIndex({
    dealerSeatIndex: lastHand.dealerSeatIndex,
    isDraw: lastHand.isDraw,
    winnerSeatIndex: lastHand.winnerSeatIndex ?? null,
  });
}

export type RoundLabel = {
  wind: '東' | '南' | '西' | '北';
  dealerWind: '東' | '南' | '西' | '北';
  labelZh: string;
  roundIndex: number;
};

const WIND_LABELS: Array<'東' | '南' | '西' | '北'> = ['東', '南', '西', '北'];

function parseDrawDealerAction(hand: Hand): 'stick' | 'pass' | null {
  if (!hand.computedJson) {
    return null;
  }
  try {
    const parsed = JSON.parse(hand.computedJson) as { dealerAction?: unknown } | null;
    if (!parsed || typeof parsed !== 'object') {
      return null;
    }
    if (parsed.dealerAction === 'stick' || parsed.dealerAction === 'pass') {
      return parsed.dealerAction;
    }
    return null;
  } catch {
    return null;
  }
}

export function getRoundLabel(startingDealerSeatIndex: number, hands: Hand[]): RoundLabel {
  assertSeatIndex(startingDealerSeatIndex, 'dealerSeatIndex');

  let dealer = startingDealerSeatIndex;
  let dealerAdvanceCount = 0;

  for (const hand of hands) {
    let nextDealer: number;
    if (hand.isDraw) {
      const dealerAction = parseDrawDealerAction(hand);
      if (dealerAction === 'pass') {
        nextDealer = (dealer + 1) % 4;
      } else {
        // For explicit "stick" and legacy draw rows without dealerAction, keep previous behavior.
        nextDealer = dealer;
      }
    } else {
      nextDealer = getNextDealerSeatIndex({
        dealerSeatIndex: dealer,
        isDraw: false,
        winnerSeatIndex: hand.winnerSeatIndex ?? null,
      });
    }
    if (nextDealer !== dealer) {
      dealerAdvanceCount += 1;
    }
    dealer = nextDealer;
  }

  const roundIndex = Math.floor(dealerAdvanceCount / 4) + 1;
  const roundWind = WIND_LABELS[(roundIndex - 1) % 4];
  const dealerWind = WIND_LABELS[dealer];
  return {
    wind: roundWind,
    dealerWind,
    labelZh: `${roundWind}風${dealerWind}局`,
    roundIndex,
  };
}

export function getRoundIndexFromLabel(roundLabel: string | null | undefined): number {
  if (!roundLabel) {
    return 1;
  }
  if (roundLabel.startsWith('東風')) {
    return 1;
  }
  if (roundLabel.startsWith('南風')) {
    return 2;
  }
  if (roundLabel.startsWith('西風')) {
    return 3;
  }
  if (roundLabel.startsWith('北風')) {
    return 4;
  }
  return 1;
}
