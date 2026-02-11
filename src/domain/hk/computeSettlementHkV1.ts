import { HkSettlementType } from '../../models/hkStakes';
import { HkStakePreset, RulesV1 } from '../../models/rules';

type ComputeSettlementHkV1Input = {
  rules: RulesV1;
  fan: number;
  settlementType: HkSettlementType;
  winnerSeatIndex: number;
  discarderSeatIndex: number | null;
};

export type HkSettlementResult = {
  effectiveFan: number;
  deltasQ: [number, number, number, number];
  discarderPaysQ: number;
  othersPayQ: number | null;
  zimoPerPlayerQ: number;
};

type TraditionalHalfGunPay = {
  selfDraw: number;
  discardBig: number;
  discardSmall: number;
};

type NormalizedFan = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;

const TRADITIONAL_HALF_GUN_PAYTABLE: Record<
  HkStakePreset,
  Record<NormalizedFan, TraditionalHalfGunPay>
> = {
  TWO_FIVE_CHICKEN: {
    0: { selfDraw: 0.5, discardBig: 0.5, discardSmall: 0.25 },
    1: { selfDraw: 1, discardBig: 1, discardSmall: 0.5 },
    2: { selfDraw: 2, discardBig: 2, discardSmall: 1 },
    3: { selfDraw: 4, discardBig: 4, discardSmall: 2 },
    4: { selfDraw: 8, discardBig: 8, discardSmall: 4 },
    5: { selfDraw: 12, discardBig: 12, discardSmall: 6 },
    6: { selfDraw: 16, discardBig: 16, discardSmall: 8 },
    7: { selfDraw: 24, discardBig: 24, discardSmall: 12 },
    8: { selfDraw: 32, discardBig: 32, discardSmall: 16 },
    9: { selfDraw: 48, discardBig: 48, discardSmall: 24 },
    10: { selfDraw: 64, discardBig: 64, discardSmall: 32 },
  },
  FIVE_ONE: {
    0: { selfDraw: 1, discardBig: 1, discardSmall: 0.5 },
    1: { selfDraw: 2, discardBig: 2, discardSmall: 1 },
    2: { selfDraw: 4, discardBig: 4, discardSmall: 2 },
    3: { selfDraw: 8, discardBig: 8, discardSmall: 4 },
    4: { selfDraw: 16, discardBig: 16, discardSmall: 8 },
    5: { selfDraw: 24, discardBig: 24, discardSmall: 12 },
    6: { selfDraw: 32, discardBig: 32, discardSmall: 16 },
    7: { selfDraw: 48, discardBig: 48, discardSmall: 24 },
    8: { selfDraw: 64, discardBig: 64, discardSmall: 32 },
    9: { selfDraw: 96, discardBig: 96, discardSmall: 48 },
    10: { selfDraw: 128, discardBig: 128, discardSmall: 64 },
  },
  ONE_TWO: {
    0: { selfDraw: 2, discardBig: 2, discardSmall: 1 },
    1: { selfDraw: 4, discardBig: 4, discardSmall: 2 },
    2: { selfDraw: 8, discardBig: 8, discardSmall: 4 },
    3: { selfDraw: 16, discardBig: 16, discardSmall: 8 },
    4: { selfDraw: 32, discardBig: 32, discardSmall: 16 },
    5: { selfDraw: 48, discardBig: 48, discardSmall: 24 },
    6: { selfDraw: 64, discardBig: 64, discardSmall: 32 },
    7: { selfDraw: 96, discardBig: 96, discardSmall: 48 },
    8: { selfDraw: 128, discardBig: 128, discardSmall: 64 },
    9: { selfDraw: 192, discardBig: 192, discardSmall: 96 },
    10: { selfDraw: 256, discardBig: 256, discardSmall: 128 },
  },
};

function assertSeatIndex(name: string, value: number): void {
  if (!Number.isInteger(value) || value < 0 || value > 3) {
    throw new Error(`${name} must be an integer in 0..3`);
  }
}

function assertZeroSum(deltasQ: [number, number, number, number]): void {
  const sum = deltasQ[0] + deltasQ[1] + deltasQ[2] + deltasQ[3];
  if (sum !== 0) {
    throw new Error(`deltasQ must sum to 0, got ${sum}`);
  }
}

function moneyToQ(value: number): number {
  return Math.round(value * 4);
}

export function normalizeTraditionalFan(rawFan: number): NormalizedFan {
  if (rawFan <= 0) {
    return 0;
  }
  if (rawFan >= 10) {
    return 10;
  }
  return rawFan as NormalizedFan;
}

export function getTraditionalHalfGunPaytable(
  stakePreset: HkStakePreset,
  rawFan: number,
): TraditionalHalfGunPay {
  const normalizedFan = normalizeTraditionalFan(rawFan);
  return TRADITIONAL_HALF_GUN_PAYTABLE[stakePreset][normalizedFan];
}

export function computeSettlementHkV1(input: ComputeSettlementHkV1Input): HkSettlementResult {
  const { rules, fan, settlementType, winnerSeatIndex, discarderSeatIndex } = input;

  if (!rules.hk) {
    throw new Error('HK rules are required');
  }
  if (!Number.isInteger(fan)) {
    throw new Error('fan must be an integer');
  }

  assertSeatIndex('winnerSeatIndex', winnerSeatIndex);
  if (settlementType === 'discard') {
    if (discarderSeatIndex === null) {
      throw new Error('discarderSeatIndex is required for discard settlement');
    }
    assertSeatIndex('discarderSeatIndex', discarderSeatIndex);
    if (winnerSeatIndex === discarderSeatIndex) {
      throw new Error('discarderSeatIndex must be different from winnerSeatIndex');
    }
  }

  const minFanToWin = Number.isInteger(rules.minFanToWin) ? Number(rules.minFanToWin) : 0;
  if (fan < minFanToWin) {
    throw new Error(`fan must be >= minFanToWin (${minFanToWin})`);
  }

  const capFan = rules.hk.capFan;
  const cappedFan = Number.isInteger(capFan) && capFan > 0 ? Math.min(fan, capFan) : fan;
  const effectiveFan = normalizeTraditionalFan(cappedFan);
  const base = getTraditionalHalfGunPaytable(rules.hk.stakePreset, effectiveFan);

  const deltasQ: [number, number, number, number] = [0, 0, 0, 0];
  const losers = [0, 1, 2, 3].filter((seat) => seat !== winnerSeatIndex);

  const selfDrawQ = moneyToQ(base.selfDraw);
  const discardBigQ = moneyToQ(base.discardBig);
  const discardSmallQ = moneyToQ(base.discardSmall);
  const fullDiscardTotalQ = discardBigQ + discardSmallQ * 2;

  let discarderPaysQ = discardBigQ;
  let othersPayQ: number | null = discardSmallQ;
  let zimoPerPlayerQ = selfDrawQ;

  if (settlementType === 'zimo') {
    deltasQ[winnerSeatIndex] = selfDrawQ * 3;
    deltasQ[losers[0]] = -selfDrawQ;
    deltasQ[losers[1]] = -selfDrawQ;
    deltasQ[losers[2]] = -selfDrawQ;
    if (rules.hk.gunMode === 'fullGun') {
      discarderPaysQ = fullDiscardTotalQ;
      othersPayQ = null;
    }
  } else {
    const normalizedDiscarderSeatIndex = discarderSeatIndex as number;
    const otherSeats = [0, 1, 2, 3].filter(
      (seat) => seat !== winnerSeatIndex && seat !== normalizedDiscarderSeatIndex,
    );

    if (rules.hk.gunMode === 'fullGun') {
      deltasQ[winnerSeatIndex] = fullDiscardTotalQ;
      deltasQ[normalizedDiscarderSeatIndex] = -fullDiscardTotalQ;
      deltasQ[otherSeats[0]] = 0;
      deltasQ[otherSeats[1]] = 0;
      discarderPaysQ = fullDiscardTotalQ;
      othersPayQ = null;
    } else {
      deltasQ[winnerSeatIndex] = discardBigQ + discardSmallQ * 2;
      deltasQ[normalizedDiscarderSeatIndex] = -discardBigQ;
      deltasQ[otherSeats[0]] = -discardSmallQ;
      deltasQ[otherSeats[1]] = -discardSmallQ;
      discarderPaysQ = discardBigQ;
      othersPayQ = discardSmallQ;
    }
  }

  assertZeroSum(deltasQ);

  return {
    effectiveFan,
    deltasQ,
    discarderPaysQ,
    othersPayQ,
    zimoPerPlayerQ,
  };
}
