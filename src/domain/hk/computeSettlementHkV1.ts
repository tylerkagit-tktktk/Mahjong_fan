import { HkSettlementType } from '../../models/hkStakes';
import { HkStakePreset, RulesV1 } from '../../models/rules';
import { getHkFullGunHalfSpicyPayoutQ } from './payoutTableFullGunHalfSpicy';
import { getHkHalfGunHalfSpicyPayoutQ, type HkStakePresetCode } from './payoutTableHalfGunHalfSpicy';

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

type NormalizedFan = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13;

const STAKE_PRESET_CODES: Record<HkStakePreset, HkStakePresetCode> = {
  TWO_FIVE_CHICKEN: '25',
  FIVE_ONE: '51',
  ONE_TWO: '12',
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

export function normalizeTraditionalFan(rawFan: number): NormalizedFan {
  if (rawFan <= 0) {
    return 0;
  }
  if (rawFan >= 13) {
    return 13;
  }
  return rawFan as NormalizedFan;
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
    throw new Error(`HK_MIN_FAN_NOT_MET:${minFanToWin}`);
  }

  const rawCapFan = rules.hk.capFan;
  const capFan = typeof rawCapFan === 'number' && Number.isInteger(rawCapFan) && rawCapFan > 0 ? rawCapFan : null;
  const cappedFan = capFan !== null ? Math.min(fan, capFan) : fan;
  const effectiveFan = normalizeTraditionalFan(cappedFan);
  const stakePresetCode = STAKE_PRESET_CODES[rules.hk.stakePreset];
  const halfGunPay = getHkHalfGunHalfSpicyPayoutQ(effectiveFan, stakePresetCode);
  const fullGunPay = getHkFullGunHalfSpicyPayoutQ(effectiveFan, stakePresetCode);

  const deltasQ: [number, number, number, number] = [0, 0, 0, 0];
  const losers = [0, 1, 2, 3].filter((seat) => seat !== winnerSeatIndex);

  const selfDrawQ = halfGunPay.discarderPaysQ;
  const discardBigQ = halfGunPay.discarderPaysQ;
  const discardSmallQ = halfGunPay.othersPayQ;
  const fullDiscardTotalQ = fullGunPay.discarderPaysQ;

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
