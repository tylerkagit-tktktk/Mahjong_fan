import { HkStakePreset, RulesV1 } from '../../models/rules';
import {
  getHkHalfGunHalfSpicyPayoutQ,
  HkStakePresetCode,
} from './payoutTableHalfGunHalfSpicy';
import { getHkFullGunHalfSpicyPayoutQ } from './payoutTableFullGunHalfSpicy';

type ComputeSettlementHkV1Input = {
  rules: RulesV1;
  fan: number;
  winnerSeatIndex: number;
  discarderSeatIndex: number;
};

export type HkSettlementResult = {
  effectiveFan: number;
  deltasQ: [number, number, number, number];
  discarderPaysQ: number;
  othersPayQ: number | null;
};

function assertSeatIndex(name: string, value: number): void {
  if (!Number.isInteger(value) || value < 0 || value > 3) {
    throw new Error(`${name} must be an integer in 0..3`);
  }
}

function toStakePresetCode(preset: HkStakePreset): HkStakePresetCode {
  if (preset === 'TWO_FIVE_CHICKEN') {
    return '25';
  }
  if (preset === 'FIVE_ONE') {
    return '51';
  }
  return '12';
}

function assertZeroSum(deltasQ: [number, number, number, number]): void {
  const sum = deltasQ[0] + deltasQ[1] + deltasQ[2] + deltasQ[3];
  if (sum !== 0) {
    throw new Error(`deltasQ must sum to 0, got ${sum}`);
  }
}

export function computeSettlementHkV1(input: ComputeSettlementHkV1Input): HkSettlementResult {
  const { rules, fan, winnerSeatIndex, discarderSeatIndex } = input;

  if (!rules.hk) {
    throw new Error('HK rules are required');
  }
  if (!Number.isInteger(fan)) {
    throw new Error('fan must be an integer');
  }

  assertSeatIndex('winnerSeatIndex', winnerSeatIndex);
  assertSeatIndex('discarderSeatIndex', discarderSeatIndex);
  if (winnerSeatIndex === discarderSeatIndex) {
    throw new Error('discarderSeatIndex must be different from winnerSeatIndex');
  }

  const minFanToWin = Number.isInteger(rules.minFanToWin) ? Number(rules.minFanToWin) : 0;
  if (fan < minFanToWin) {
    throw new Error(`fan must be >= minFanToWin (${minFanToWin})`);
  }

  const capFan = rules.hk.capFan;
  const effectiveFan = Number.isInteger(capFan) && capFan > 0 ? Math.min(fan, capFan) : fan;
  const stakePresetCode = toStakePresetCode(rules.hk.stakePreset);
  const halfGunPayout = getHkHalfGunHalfSpicyPayoutQ(effectiveFan, stakePresetCode);
  const fullGunPayout = getHkFullGunHalfSpicyPayoutQ(effectiveFan, stakePresetCode);

  const deltasQ: [number, number, number, number] = [0, 0, 0, 0];
  const others = [0, 1, 2, 3].filter(
    (seat) => seat !== winnerSeatIndex && seat !== discarderSeatIndex,
  );
  let discarderPaysQ: number;
  let othersPayQ: number | null;

  if (rules.hk.gunMode === 'fullGun') {
    discarderPaysQ = fullGunPayout.discarderPaysQ;
    othersPayQ = null;
    deltasQ[winnerSeatIndex] = discarderPaysQ;
    deltasQ[discarderSeatIndex] = -discarderPaysQ;
    deltasQ[others[0]] = 0;
    deltasQ[others[1]] = 0;
  } else {
    discarderPaysQ = halfGunPayout.discarderPaysQ;
    othersPayQ = halfGunPayout.othersPayQ;
    deltasQ[winnerSeatIndex] = discarderPaysQ + othersPayQ * 2;
    deltasQ[discarderSeatIndex] = -discarderPaysQ;
    deltasQ[others[0]] = -othersPayQ;
    deltasQ[others[1]] = -othersPayQ;
  }

  assertZeroSum(deltasQ);

  return {
    effectiveFan,
    deltasQ,
    discarderPaysQ,
    othersPayQ,
  };
}
