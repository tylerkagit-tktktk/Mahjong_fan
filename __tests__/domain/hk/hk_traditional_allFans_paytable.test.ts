import { computeHkSettlement } from '../../../src/domain/hk/settlement';
import { getDefaultRules, HkGunMode, HkStakePreset, RulesV1 } from '../../../src/models/rules';

function makeRules(stakePreset: HkStakePreset, gunMode: HkGunMode): RulesV1 {
  const base = getDefaultRules('HK');
  return {
    ...base,
    mode: 'HK',
    minFanToWin: 0,
    hk: {
      ...base.hk!,
      scoringPreset: 'traditionalFan',
      gunMode,
      stakePreset,
      capFan: 13,
    },
  };
}

// full-gun baseline (TWO_FIVE_CHICKEN) fan 0..13
const full25: number[] = [1, 2, 4, 8, 16, 24, 32, 48, 64, 96, 128, 192, 256, 384];

// half-gun baseline (TWO_FIVE_CHICKEN) fan 0..13
const D25: number[] = [0.5, 1, 2, 4, 8, 12, 16, 24, 32, 48, 64, 96, 128, 192];
const O25: number[] = [0.25, 0.5, 1, 2, 4, 6, 8, 12, 16, 24, 32, 48, 64, 96];

const stakeScale: Record<HkStakePreset, number> = {
  TWO_FIVE_CHICKEN: 1,
  FIVE_ONE: 2,
  ONE_TWO: 4,
};

function getFullPay(stakePreset: HkStakePreset, fan: number): number {
  const scale = stakeScale[stakePreset];
  return full25[fan] * scale;
}

function getHalfGunDO(stakePreset: HkStakePreset, fan: number): { D: number; O: number } {
  const scale = stakeScale[stakePreset];
  return {
    D: D25[fan] * scale,
    O: O25[fan] * scale,
  };
}

function expectZeroSum(deltasQ: [number, number, number, number]): void {
  expect(deltasQ.reduce((sum, v) => sum + v, 0)).toBe(0);
}

describe('HK traditionalFan paytable (fan=1..13, all stake presets)', () => {
  const stakePresets: HkStakePreset[] = ['TWO_FIVE_CHICKEN', 'FIVE_ONE', 'ONE_TWO'];

  it.each(stakePresets)('fullGun + %s: discard & zimo 1..13 fan', (preset) => {
    for (let fan = 1; fan <= 13; fan += 1) {
      const rules = makeRules(preset, 'fullGun');
      const base = getFullPay(preset, fan);

      // discard: winner gets fullPay, discarder pays all
      const outDiscard = computeHkSettlement({
        rules,
        fan,
        settlementType: 'discard',
        winnerSeatIndex: 0,
        discarderSeatIndex: 1,
      });

      const wDisc = outDiscard.deltasQ[0] / 4;
      const dDisc = outDiscard.deltasQ[1] / 4;

      expect(wDisc).toBeCloseTo(base, 6);
      expect(dDisc).toBeCloseTo(-base, 6);
      expect(outDiscard.deltasQ[2]).toBe(0);
      expect(outDiscard.deltasQ[3]).toBe(0);
      expectZeroSum(outDiscard.deltasQ);

      // zimo: each loser pays fullPay / 2
      const outZimo = computeHkSettlement({
        rules,
        fan,
        settlementType: 'zimo',
        winnerSeatIndex: 0,
        discarderSeatIndex: null,
      });

      const wZimo = outZimo.deltasQ[0] / 4;
      const l1Zimo = outZimo.deltasQ[1] / 4;
      const l2Zimo = outZimo.deltasQ[2] / 4;
      const l3Zimo = outZimo.deltasQ[3] / 4;

      const each = base / 2;
      expect(l1Zimo).toBeCloseTo(-each, 6);
      expect(l2Zimo).toBeCloseTo(-each, 6);
      expect(l3Zimo).toBeCloseTo(-each, 6);
      expect(wZimo).toBeCloseTo(each * 3, 6);
      expectZeroSum(outZimo.deltasQ);
    }
  });

  it.each(stakePresets)('halfGun + %s: discard & zimo 1..13 fan', (preset) => {
    for (let fan = 1; fan <= 13; fan += 1) {
      const rules = makeRules(preset, 'halfGun');
      const { D, O } = getHalfGunDO(preset, fan);

      // discard: winner = D + 2O; discarder = D; others = O each
      const outDiscard = computeHkSettlement({
        rules,
        fan,
        settlementType: 'discard',
        winnerSeatIndex: 0,
        discarderSeatIndex: 1,
      });

      const wDisc = outDiscard.deltasQ[0] / 4;
      const dDisc = outDiscard.deltasQ[1] / 4;
      const o2Disc = outDiscard.deltasQ[2] / 4;
      const o3Disc = outDiscard.deltasQ[3] / 4;

      expect(wDisc).toBeCloseTo(D + 2 * O, 6);
      expect(dDisc).toBeCloseTo(-D, 6);
      expect(o2Disc).toBeCloseTo(-O, 6);
      expect(o3Disc).toBeCloseTo(-O, 6);
      expectZeroSum(outDiscard.deltasQ);

      // zimo: each loser pays = fullPay/2 = D
      const outZimo = computeHkSettlement({
        rules,
        fan,
        settlementType: 'zimo',
        winnerSeatIndex: 0,
        discarderSeatIndex: null,
      });

      const wZimo = outZimo.deltasQ[0] / 4;
      const l1Zimo = outZimo.deltasQ[1] / 4;
      const l2Zimo = outZimo.deltasQ[2] / 4;
      const l3Zimo = outZimo.deltasQ[3] / 4;

      const each = D;
      expect(l1Zimo).toBeCloseTo(-each, 6);
      expect(l2Zimo).toBeCloseTo(-each, 6);
      expect(l3Zimo).toBeCloseTo(-each, 6);
      expect(wZimo).toBeCloseTo(each * 3, 6);
      expectZeroSum(outZimo.deltasQ);
    }
  });
});
