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
      capFan: 10,
    },
  };
}

function expectZeroSum(deltasQ: [number, number, number, number]): void {
  expect(deltasQ.reduce((sum, v) => sum + v, 0)).toBe(0);
}

describe('HK traditionalFan smoke tests for FIVE_ONE / ONE_TWO', () => {
  const fan = 10;
  const presets: HkStakePreset[] = ['FIVE_ONE', 'ONE_TWO'];

  it.each(presets)('%s: fullGun zimo / halfGun zimo / fullGun discard / halfGun discard', (preset) => {
    const fullZimo = computeHkSettlement({
      rules: makeRules(preset, 'fullGun'),
      fan,
      settlementType: 'zimo',
      winnerSeatIndex: 0,
      discarderSeatIndex: null,
    });

    const halfZimo = computeHkSettlement({
      rules: makeRules(preset, 'halfGun'),
      fan,
      settlementType: 'zimo',
      winnerSeatIndex: 0,
      discarderSeatIndex: null,
    });

    const fullDiscard = computeHkSettlement({
      rules: makeRules(preset, 'fullGun'),
      fan,
      settlementType: 'discard',
      winnerSeatIndex: 0,
      discarderSeatIndex: 1,
    });

    const halfDiscard = computeHkSettlement({
      rules: makeRules(preset, 'halfGun'),
      fan,
      settlementType: 'discard',
      winnerSeatIndex: 0,
      discarderSeatIndex: 1,
    });

    expect(fullZimo.source).toBe('v1');
    expect(halfZimo.source).toBe('v1');
    expect(fullDiscard.source).toBe('v1');
    expect(halfDiscard.source).toBe('v1');

    expect(fullZimo.deltasQ[0]).toBeGreaterThan(0);
    expect(fullZimo.deltasQ[1]).toBeLessThan(0);
    expect(fullZimo.deltasQ[2]).toBeLessThan(0);
    expect(fullZimo.deltasQ[3]).toBeLessThan(0);

    expect(halfZimo.deltasQ[0]).toBeGreaterThan(0);
    expect(halfZimo.deltasQ[1]).toBeLessThan(0);
    expect(halfZimo.deltasQ[2]).toBeLessThan(0);
    expect(halfZimo.deltasQ[3]).toBeLessThan(0);

    expect(fullDiscard.deltasQ[0]).toBeGreaterThan(0);
    expect(fullDiscard.deltasQ[1]).toBeLessThan(0);

    expect(halfDiscard.deltasQ[0]).toBeGreaterThan(0);
    expect(halfDiscard.deltasQ[1]).toBeLessThan(0);
    expect(halfDiscard.deltasQ[2]).toBeLessThan(0);
    expect(halfDiscard.deltasQ[3]).toBeLessThan(0);

    expect(fullZimo.deltasQ[0]).toBeGreaterThanOrEqual(halfZimo.deltasQ[0]);
    expect(fullDiscard.deltasQ[0]).toBeGreaterThanOrEqual(halfDiscard.deltasQ[0]);

    expectZeroSum(fullZimo.deltasQ);
    expectZeroSum(halfZimo.deltasQ);
    expectZeroSum(fullDiscard.deltasQ);
    expectZeroSum(halfDiscard.deltasQ);
  });
});

