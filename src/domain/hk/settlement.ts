import { computeCustomPayout, HkSettlementType } from '../../models/hkStakes';
import { RulesV1 } from '../../models/rules';
import { computeSettlementHkV1 } from './computeSettlementHkV1';

export type ComputeHkSettlementInput = {
  rules: RulesV1;
  fan: number;
  settlementType: HkSettlementType;
  winnerSeatIndex: number;
  discarderSeatIndex: number | null;
};

export type ComputeHkSettlementOutput = {
  source: 'v1' | 'legacy';
  effectiveFan: number;
  deltasQ: [number, number, number, number];
  totalWinAmountQ: number;
  discarderPaysQ: number;
  othersPayQ: number | null;
  zimoPerPlayerQ: number;
};

export function toAmountFromQ(valueQ: number): number {
  return valueQ / 4;
}

function assertSeatIndex(name: string, value: number): void {
  if (!Number.isInteger(value) || value < 0 || value > 3) {
    throw new Error(`${name} must be an integer in 0..3`);
  }
}

function buildDeltasFromLegacy(input: {
  settlementType: HkSettlementType;
  winnerSeatIndex: number;
  discarderSeatIndex: number | null;
  zimoPerPlayerQ: number;
  discarderPaysQ: number;
  othersPayQ: number | null;
}): [number, number, number, number] {
  const {
    settlementType,
    winnerSeatIndex,
    discarderSeatIndex,
    zimoPerPlayerQ,
    discarderPaysQ,
    othersPayQ,
  } = input;

  const deltasQ: [number, number, number, number] = [0, 0, 0, 0];

  if (settlementType === 'zimo') {
    const losers = [0, 1, 2, 3].filter((seat) => seat !== winnerSeatIndex);
    deltasQ[winnerSeatIndex] = zimoPerPlayerQ * 3;
    deltasQ[losers[0]] = -zimoPerPlayerQ;
    deltasQ[losers[1]] = -zimoPerPlayerQ;
    deltasQ[losers[2]] = -zimoPerPlayerQ;
    return deltasQ;
  }

  if (discarderSeatIndex === null) {
    throw new Error('discarderSeatIndex is required for discard settlement');
  }

  const others = [0, 1, 2, 3].filter(
    (seat) => seat !== winnerSeatIndex && seat !== discarderSeatIndex,
  );

  deltasQ[winnerSeatIndex] = discarderPaysQ + (othersPayQ ?? 0) * 2;
  deltasQ[discarderSeatIndex] = -discarderPaysQ;
  if (othersPayQ !== null) {
    deltasQ[others[0]] = -othersPayQ;
    deltasQ[others[1]] = -othersPayQ;
  }

  return deltasQ;
}

export function computeHkSettlement(
  input: ComputeHkSettlementInput,
): ComputeHkSettlementOutput {
  const { rules, fan, settlementType, winnerSeatIndex, discarderSeatIndex } = input;

  if (!rules.hk || rules.mode !== 'HK') {
    throw new Error('HK rules are required');
  }

  assertSeatIndex('winnerSeatIndex', winnerSeatIndex);
  if (settlementType === 'discard' && discarderSeatIndex !== null) {
    assertSeatIndex('discarderSeatIndex', discarderSeatIndex);
  }

  if (
    rules.hk.scoringPreset === 'traditionalFan' &&
    settlementType === 'discard'
  ) {
    if (discarderSeatIndex === null) {
      throw new Error('discarderSeatIndex is required for discard settlement');
    }

    const v1 = computeSettlementHkV1({
      rules,
      fan,
      winnerSeatIndex,
      discarderSeatIndex,
    });

    const totalWinAmountQ = v1.discarderPaysQ + (v1.othersPayQ ?? 0) * 2;

    return {
      source: 'v1',
      effectiveFan: v1.effectiveFan,
      deltasQ: v1.deltasQ,
      totalWinAmountQ,
      discarderPaysQ: v1.discarderPaysQ,
      othersPayQ: v1.othersPayQ,
      zimoPerPlayerQ: v1.discarderPaysQ,
    };
  }

  const legacy = computeCustomPayout({
    fan,
    unitPerFan: rules.hk.unitPerFan ?? 1,
    capFan: rules.hk.capFan ?? null,
    gunMode: rules.hk.gunMode,
    settlementType,
  });

  const zimoPerPlayerQ = Math.round(legacy.zimoPerPlayer * 4);
  const discarderPaysQ = Math.round(legacy.discarderPays * 4);
  const othersPayQ = legacy.otherPlayersPay === null ? null : Math.round(legacy.otherPlayersPay * 4);
  const totalWinAmountQ = Math.round(legacy.totalWinAmount * 4);

  return {
    source: 'legacy',
    effectiveFan: legacy.effectiveFan,
    deltasQ: buildDeltasFromLegacy({
      settlementType,
      winnerSeatIndex,
      discarderSeatIndex,
      zimoPerPlayerQ,
      discarderPaysQ,
      othersPayQ,
    }),
    totalWinAmountQ,
    discarderPaysQ,
    othersPayQ,
    zimoPerPlayerQ,
  };
}
