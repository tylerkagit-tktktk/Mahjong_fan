import { computeHkSettlement } from '../../../src/domain/hk/settlement';
import { getDefaultRules, HkGunMode, RulesV1 } from '../../../src/models/rules';

function makeCustomRules(params: {
  gunMode: HkGunMode;
  unitPerFan?: number;
  capFan?: number | null;
  minFanToWin?: number;
}): RulesV1 {
  const base = getDefaultRules('HK');
  return {
    ...base,
    mode: 'HK',
    minFanToWin: params.minFanToWin ?? 0,
    hk: {
      ...base.hk!,
      scoringPreset: 'customTable',
      gunMode: params.gunMode,
      unitPerFan: params.unitPerFan ?? 1,
      capFan: params.capFan ?? null,
    },
  };
}

describe('HK customTable linear cash settlement', () => {
  test('fullGun + zimo, fan=1 unitPerFan=1 => winner +3, others -1/-1/-1', () => {
    const rules = makeCustomRules({ gunMode: 'fullGun', unitPerFan: 1, minFanToWin: 0 });
    const out = computeHkSettlement({
      rules,
      fan: 1,
      settlementType: 'zimo',
      winnerSeatIndex: 0,
      discarderSeatIndex: null,
    });

    expect(out.source).toBe('legacy');
    expect(out.effectiveFan).toBe(1);
    expect(out.deltasQ).toEqual([12, -4, -4, -4]);
    expect(out.deltasQ.reduce((sum, value) => sum + value, 0)).toBe(0);
  });

  test('fullGun + discard, fan=1 unitPerFan=1 => winner +2, discarder -2, others 0', () => {
    const rules = makeCustomRules({ gunMode: 'fullGun', unitPerFan: 1, minFanToWin: 0 });
    const out = computeHkSettlement({
      rules,
      fan: 1,
      settlementType: 'discard',
      winnerSeatIndex: 0,
      discarderSeatIndex: 1,
    });

    expect(out.source).toBe('legacy');
    expect(out.effectiveFan).toBe(1);
    expect(out.deltasQ).toEqual([8, -8, 0, 0]);
    expect(out.deltasQ.reduce((sum, value) => sum + value, 0)).toBe(0);
  });

  test('customTable applies capFan clamp before linear cash multiplication', () => {
    const rules = makeCustomRules({
      gunMode: 'fullGun',
      unitPerFan: 5,
      capFan: 10,
      minFanToWin: 3,
    });

    const out = computeHkSettlement({
      rules,
      fan: 12,
      settlementType: 'discard',
      winnerSeatIndex: 0,
      discarderSeatIndex: 1,
    });

    expect(out.source).toBe('legacy');
    expect(out.effectiveFan).toBe(10);
    expect(out.totalWinAmountQ).toBe(400);
    expect(out.deltasQ).toEqual([400, -400, 0, 0]);
    expect(out.deltasQ.reduce((sum, value) => sum + value, 0)).toBe(0);
  });

  test('customTable applies minFanToWin clamp before cap and multiplication', () => {
    const rules = makeCustomRules({
      gunMode: 'fullGun',
      unitPerFan: 1,
      capFan: 10,
      minFanToWin: 3,
    });

    const out = computeHkSettlement({
      rules,
      fan: 1,
      settlementType: 'discard',
      winnerSeatIndex: 0,
      discarderSeatIndex: 1,
    });

    expect(out.effectiveFan).toBe(3);
    expect(out.deltasQ).toEqual([24, -24, 0, 0]);
  });

  test('customTable supports decimal unitPerFan (fan=3, unitPerFan=0.1 => base 0.3)', () => {
    const rules = makeCustomRules({
      gunMode: 'fullGun',
      unitPerFan: 0.1,
      minFanToWin: 1,
    });
    const out = computeHkSettlement({
      rules,
      fan: 3,
      settlementType: 'zimo',
      winnerSeatIndex: 0,
      discarderSeatIndex: null,
    });

    expect(out.effectiveFan).toBe(3);
    expect(out.deltasQ).toEqual([3, -1, -1, -1]);
    expect(out.totalWinAmountQ).toBe(3);
    expect(out.deltasQ.reduce((sum, value) => sum + value, 0)).toBe(0);
  });

  test('customTable ignores gunMode: halfGun matches fullGun linear outputs', () => {
    const halfRules = makeCustomRules({ gunMode: 'halfGun', unitPerFan: 3, minFanToWin: 0 });
    const fullRules = makeCustomRules({ gunMode: 'fullGun', unitPerFan: 3, minFanToWin: 0 });

    const halfZimo = computeHkSettlement({
      rules: halfRules,
      fan: 2,
      settlementType: 'zimo',
      winnerSeatIndex: 0,
      discarderSeatIndex: null,
    });
    const fullZimo = computeHkSettlement({
      rules: fullRules,
      fan: 2,
      settlementType: 'zimo',
      winnerSeatIndex: 0,
      discarderSeatIndex: null,
    });

    const halfDiscard = computeHkSettlement({
      rules: halfRules,
      fan: 2,
      settlementType: 'discard',
      winnerSeatIndex: 0,
      discarderSeatIndex: 1,
    });
    const fullDiscard = computeHkSettlement({
      rules: fullRules,
      fan: 2,
      settlementType: 'discard',
      winnerSeatIndex: 0,
      discarderSeatIndex: 1,
    });

    expect(halfZimo.deltasQ).toEqual([72, -24, -24, -24]);
    expect(fullZimo.deltasQ).toEqual([72, -24, -24, -24]);
    expect(halfDiscard.deltasQ).toEqual([48, -48, 0, 0]);
    expect(fullDiscard.deltasQ).toEqual([48, -48, 0, 0]);
    expect(halfZimo.deltasQ).toEqual(fullZimo.deltasQ);
    expect(halfDiscard.deltasQ).toEqual(fullDiscard.deltasQ);
  });
});
