import { computeHkSettlement } from '../../../src/domain/hk/settlement';
import { getDefaultRules, RulesV1 } from '../../../src/models/rules';

function makeHalfGunRules(): RulesV1 {
  const base = getDefaultRules('HK');
  return {
    ...base,
    mode: 'HK',
    minFanToWin: 3,
    hk: {
      ...base.hk!,
      scoringPreset: 'traditionalFan',
      gunMode: 'halfGun',
      stakePreset: 'TWO_FIVE_CHICKEN',
      capFan: 10,
    },
  };
}

describe('HK traditional + halfGun + TWO_FIVE_CHICKEN', () => {
  test('Case A: dealer zimo 10 fan', () => {
    const rules = makeHalfGunRules();
    const out = computeHkSettlement({
      rules,
      fan: 10,
      settlementType: 'zimo',
      winnerSeatIndex: 0,
      discarderSeatIndex: null,
    });

    // Half-gun table (25, fan=10): discard pays 64, others pay 32 in discard mode.
    // Zimo legacy-compatible rule in v1: each loser pays "discarder amount" = 64.
    expect(out.deltasQ).toEqual([768, -256, -256, -256]);
    expect(out.deltasQ.reduce((sum, v) => sum + v, 0)).toBe(0);
  });

  test('Case B: non-dealer zimo 10 fan', () => {
    const rules = makeHalfGunRules();
    const out = computeHkSettlement({
      rules,
      fan: 10,
      settlementType: 'zimo',
      winnerSeatIndex: 1,
      discarderSeatIndex: null,
    });

    expect(out.deltasQ).toEqual([-256, 768, -256, -256]);
    expect(out.deltasQ.reduce((sum, v) => sum + v, 0)).toBe(0);
  });

  test('Case C: dealer discard 10 fan (winner=seat1, discarder=seat0)', () => {
    const rules = makeHalfGunRules();
    const out = computeHkSettlement({
      rules,
      fan: 10,
      settlementType: 'discard',
      winnerSeatIndex: 1,
      discarderSeatIndex: 0,
    });

    // winner +128, discarder -64, other two -32
    expect(out.deltasQ).toEqual([-256, 512, -128, -128]);
    expect(out.deltasQ.reduce((sum, v) => sum + v, 0)).toBe(0);
  });

  test('Case D: non-dealer discard 10 fan (winner=seat0, discarder=seat1)', () => {
    const rules = makeHalfGunRules();
    const out = computeHkSettlement({
      rules,
      fan: 10,
      settlementType: 'discard',
      winnerSeatIndex: 0,
      discarderSeatIndex: 1,
    });

    expect(out.deltasQ).toEqual([512, -256, -128, -128]);
    expect(out.deltasQ.reduce((sum, v) => sum + v, 0)).toBe(0);
  });
});

