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
  return getNextDealerSeatIndex({
    dealerSeatIndex: lastHand.dealerSeatIndex,
    isDraw: lastHand.isDraw,
    winnerSeatIndex: lastHand.winnerSeatIndex ?? null,
  });
}

export function __devTestDealerCases(): Array<{ name: string; result: number; expected: number; pass: boolean }> {
  const cases = [
    {
      name: 'dealer=0, winner=0, draw=false => 0',
      input: { dealerSeatIndex: 0, winnerSeatIndex: 0, isDraw: false },
      expected: 0,
    },
    {
      name: 'dealer=0, draw=true => 0',
      input: { dealerSeatIndex: 0, winnerSeatIndex: null, isDraw: true },
      expected: 0,
    },
    {
      name: 'dealer=0, winner=1 => 1',
      input: { dealerSeatIndex: 0, winnerSeatIndex: 1, isDraw: false },
      expected: 1,
    },
    {
      name: 'dealer=2, winner=3 => 3',
      input: { dealerSeatIndex: 2, winnerSeatIndex: 3, isDraw: false },
      expected: 3,
    },
  ] as const;

  return cases.map((item) => {
    const result = getNextDealerSeatIndex(item.input);
    return { name: item.name, result, expected: item.expected, pass: result === item.expected };
  });
}

if (__DEV__) {
  const globalMarker = globalThis as { __mahjongDealerDevValidated?: boolean };
  if (!globalMarker.__mahjongDealerDevValidated) {
    globalMarker.__mahjongDealerDevValidated = true;
    const outputs = __devTestDealerCases();
    const hasFailure = outputs.some((item) => !item.pass);
    if (hasFailure) {
      console.error('[Dealer][DEV] case failed', outputs);
    } else {
      console.log('[Dealer][DEV] cases passed', outputs);
    }
  }
}
