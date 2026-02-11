import { computeHkSettlement } from '../../../src/domain/hk/settlement';
import { getDefaultRules, HkStakePreset, RulesV1 } from '../../../src/models/rules';

function makeFullGunRules(preset: HkStakePreset): RulesV1 {
  const base = getDefaultRules('HK');
  return {
    ...base,
    mode: 'HK',
    minFanToWin: 3,
    hk: {
      ...base.hk!,
      scoringPreset: 'traditionalFan',
      gunMode: 'fullGun',
      stakePreset: preset,
      capFan: 10,
    },
  };
}

describe('HK traditional + fullGun + TWO_FIVE_CHICKEN + zimo', () => {
  test('dealer zimo 10 fan should match golden table', () => {
    const rules = makeFullGunRules('TWO_FIVE_CHICKEN');

    const out = computeHkSettlement({
      rules,
      fan: 10,
      settlementType: 'zimo',
      winnerSeatIndex: 1,
      discarderSeatIndex: null,
    });

    const winnerMoney = out.deltasQ[1] / 4;
    const p0Money = out.deltasQ[0] / 4;
    const p2Money = out.deltasQ[2] / 4;
    const p3Money = out.deltasQ[3] / 4;

    expect(winnerMoney).toBe(192);
    expect(p0Money).toBe(-64);
    expect(p2Money).toBe(-64);
    expect(p3Money).toBe(-64);
    expect(out.deltasQ[0] + out.deltasQ[1] + out.deltasQ[2] + out.deltasQ[3]).toBe(0);
  });

  test('non dealer zimo 10 fan should also be 3-way collection', () => {
    const rules = makeFullGunRules('TWO_FIVE_CHICKEN');

    const out = computeHkSettlement({
      rules,
      fan: 10,
      settlementType: 'zimo',
      winnerSeatIndex: 2,
      discarderSeatIndex: null,
    });

    const winnerMoney = out.deltasQ[2] / 4;
    const p0Money = out.deltasQ[0] / 4;
    const p1Money = out.deltasQ[1] / 4;
    const p3Money = out.deltasQ[3] / 4;

    expect(winnerMoney).toBe(192);
    expect(p0Money).toBe(-64);
    expect(p1Money).toBe(-64);
    expect(p3Money).toBe(-64);
    expect(out.deltasQ[0] + out.deltasQ[1] + out.deltasQ[2] + out.deltasQ[3]).toBe(0);
  });

  test('discard should still use full-gun golden value fan 10', () => {
    const rules = makeFullGunRules('TWO_FIVE_CHICKEN');

    const out = computeHkSettlement({
      rules,
      fan: 10,
      settlementType: 'discard',
      winnerSeatIndex: 0,
      discarderSeatIndex: 1,
    });

    expect(out.deltasQ).toEqual([512, -512, 0, 0]);
    expect(out.deltasQ.reduce((sum, item) => sum + item, 0)).toBe(0);
  });

  test('discard non-dealer winner should still use full-gun golden value fan 10', () => {
    const rules = makeFullGunRules('TWO_FIVE_CHICKEN');

    const out = computeHkSettlement({
      rules,
      fan: 10,
      settlementType: 'discard',
      winnerSeatIndex: 2,
      discarderSeatIndex: 0,
    });

    expect(out.deltasQ).toEqual([-512, 0, 512, 0]);
    expect(out.deltasQ.reduce((sum, item) => sum + item, 0)).toBe(0);
  });
});
