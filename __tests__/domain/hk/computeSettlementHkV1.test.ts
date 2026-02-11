import { getHkHalfGunHalfSpicyPayoutQ } from '../../../src/domain/hk/payoutTableHalfGunHalfSpicy';
import { getHkFullGunHalfSpicyPayoutQ } from '../../../src/domain/hk/payoutTableFullGunHalfSpicy';
import { computeSettlementHkV1 } from '../../../src/domain/hk/computeSettlementHkV1';
import { getDefaultRules } from '../../../src/models/rules';

describe('HK half-gun half-spicy payout table', () => {
  const cases: Array<{
    preset: '25' | '51' | '12';
    fan: number;
    expectedDiscarderQ: number;
    expectedOthersQ: number;
  }> = [
    { preset: '25', fan: 0, expectedDiscarderQ: 2, expectedOthersQ: 1 },
    { preset: '25', fan: 1, expectedDiscarderQ: 4, expectedOthersQ: 2 },
    { preset: '25', fan: 4, expectedDiscarderQ: 32, expectedOthersQ: 16 },
    { preset: '25', fan: 5, expectedDiscarderQ: 48, expectedOthersQ: 24 },
    { preset: '25', fan: 6, expectedDiscarderQ: 64, expectedOthersQ: 32 },
    { preset: '25', fan: 10, expectedDiscarderQ: 256, expectedOthersQ: 128 },
    { preset: '51', fan: 0, expectedDiscarderQ: 4, expectedOthersQ: 2 },
    { preset: '51', fan: 1, expectedDiscarderQ: 8, expectedOthersQ: 4 },
    { preset: '51', fan: 4, expectedDiscarderQ: 64, expectedOthersQ: 32 },
    { preset: '51', fan: 5, expectedDiscarderQ: 96, expectedOthersQ: 48 },
    { preset: '51', fan: 6, expectedDiscarderQ: 128, expectedOthersQ: 64 },
    { preset: '51', fan: 10, expectedDiscarderQ: 512, expectedOthersQ: 256 },
    { preset: '12', fan: 0, expectedDiscarderQ: 8, expectedOthersQ: 4 },
    { preset: '12', fan: 1, expectedDiscarderQ: 16, expectedOthersQ: 8 },
    { preset: '12', fan: 4, expectedDiscarderQ: 128, expectedOthersQ: 64 },
    { preset: '12', fan: 5, expectedDiscarderQ: 192, expectedOthersQ: 96 },
    { preset: '12', fan: 6, expectedDiscarderQ: 256, expectedOthersQ: 128 },
    { preset: '12', fan: 10, expectedDiscarderQ: 1024, expectedOthersQ: 512 },
  ];

  it.each(cases)(
    'preset $preset fan $fan => discarderQ=$expectedDiscarderQ othersQ=$expectedOthersQ',
    ({ preset, fan, expectedDiscarderQ, expectedOthersQ }) => {
      const result = getHkHalfGunHalfSpicyPayoutQ(fan, preset);
      expect(result.discarderPaysQ).toBe(expectedDiscarderQ);
      expect(result.othersPayQ).toBe(expectedOthersQ);
    },
  );

  it('capFan=10 clamps fan=13 to fan=10 payout', () => {
    const rules = getDefaultRules('HK');
    rules.hk!.stakePreset = 'FIVE_ONE';
    rules.hk!.capFan = 10;
    rules.minFanToWin = 0;

    const fan10 = computeSettlementHkV1({
      rules,
      fan: 10,
      winnerSeatIndex: 0,
      discarderSeatIndex: 1,
    });

    const fan13 = computeSettlementHkV1({
      rules,
      fan: 13,
      winnerSeatIndex: 0,
      discarderSeatIndex: 1,
    });

    expect(fan13.discarderPaysQ).toBe(fan10.discarderPaysQ);
    expect(fan13.othersPayQ).toBe(fan10.othersPayQ);
  });

  const fullGunCases: Array<{
    preset: '25' | '51' | '12';
    fan: number;
    expectedDiscarderQ: number;
  }> = [
    { preset: '25', fan: 0, expectedDiscarderQ: 4 },
    { preset: '25', fan: 1, expectedDiscarderQ: 8 },
    { preset: '25', fan: 4, expectedDiscarderQ: 64 },
    { preset: '25', fan: 5, expectedDiscarderQ: 96 },
    { preset: '25', fan: 6, expectedDiscarderQ: 128 },
    { preset: '25', fan: 10, expectedDiscarderQ: 512 },
    { preset: '51', fan: 0, expectedDiscarderQ: 8 },
    { preset: '51', fan: 1, expectedDiscarderQ: 16 },
    { preset: '51', fan: 4, expectedDiscarderQ: 128 },
    { preset: '51', fan: 5, expectedDiscarderQ: 192 },
    { preset: '51', fan: 6, expectedDiscarderQ: 256 },
    { preset: '51', fan: 10, expectedDiscarderQ: 1024 },
    { preset: '12', fan: 0, expectedDiscarderQ: 16 },
    { preset: '12', fan: 1, expectedDiscarderQ: 32 },
    { preset: '12', fan: 4, expectedDiscarderQ: 256 },
    { preset: '12', fan: 5, expectedDiscarderQ: 384 },
    { preset: '12', fan: 6, expectedDiscarderQ: 512 },
    { preset: '12', fan: 10, expectedDiscarderQ: 2048 },
  ];

  it.each(fullGunCases)(
    'FULL preset $preset fan $fan => discarderQ=$expectedDiscarderQ',
    ({ preset, fan, expectedDiscarderQ }) => {
      const result = getHkFullGunHalfSpicyPayoutQ(fan, preset);
      expect(result.discarderPaysQ).toBe(expectedDiscarderQ);
    },
  );

  it('fan above cap is clamped to capFan (no extrapolation)', () => {
    const rules = getDefaultRules('HK');
    rules.hk!.gunMode = 'fullGun';
    rules.hk!.stakePreset = 'TWO_FIVE_CHICKEN';
    rules.hk!.capFan = 10;
    rules.minFanToWin = 0;

    const fan10 = computeSettlementHkV1({
      rules,
      fan: 10,
      winnerSeatIndex: 0,
      discarderSeatIndex: 1,
    });

    const fan13 = computeSettlementHkV1({
      rules,
      fan: 13,
      winnerSeatIndex: 0,
      discarderSeatIndex: 1,
    });

    expect(fan13.discarderPaysQ).toBe(fan10.discarderPaysQ);
    expect(fan13.othersPayQ).toBe(fan10.othersPayQ);
    expect(fan13.deltasQ).toEqual(fan10.deltasQ);
    const sum13 = fan13.deltasQ[0] + fan13.deltasQ[1] + fan13.deltasQ[2] + fan13.deltasQ[3];
    expect(sum13).toBe(0);
  });

  it('deltas always sum to zero', () => {
    const rules = getDefaultRules('HK');
    rules.hk!.stakePreset = 'ONE_TWO';
    rules.hk!.capFan = null;
    rules.minFanToWin = 0;

    const result = computeSettlementHkV1({
      rules,
      fan: 6,
      winnerSeatIndex: 2,
      discarderSeatIndex: 0,
    });

    const sum = result.deltasQ[0] + result.deltasQ[1] + result.deltasQ[2] + result.deltasQ[3];
    expect(sum).toBe(0);
  });

  it('full gun route returns discarder only payout and zero-sum deltas', () => {
    const rules = getDefaultRules('HK');
    rules.hk!.gunMode = 'fullGun';
    rules.hk!.stakePreset = 'TWO_FIVE_CHICKEN';
    rules.hk!.capFan = null;
    rules.minFanToWin = 0;

    const result = computeSettlementHkV1({
      rules,
      fan: 5,
      winnerSeatIndex: 1,
      discarderSeatIndex: 3,
    });

    expect(result.discarderPaysQ).toBe(96);
    expect(result.othersPayQ).toBeNull();
    expect(result.deltasQ).toEqual([0, 96, 0, -96]);
    const sum = result.deltasQ[0] + result.deltasQ[1] + result.deltasQ[2] + result.deltasQ[3];
    expect(sum).toBe(0);
  });
});
