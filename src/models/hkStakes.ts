import { HkGunMode } from './rules';

export type HkSettlementType = 'zimo' | 'discard';

export type HkCustomPayoutInput = {
  fan: number;
  unitPerFan: number;
  minFanToWin: number;
  capFan: number | null;
  gunMode: HkGunMode;
  settlementType: HkSettlementType;
};

export type HkCustomPayout = {
  fan: number;
  effectiveFan: number;
  baseAmount: number;
  settlementType: HkSettlementType;
  zimoPerPlayer: number;
  discarderPays: number;
  otherPlayersPay: number | null;
  totalWinAmount: number;
};

export function computeEffectiveFan(fan: number, minFanToWin: number, capFan: number | null): number {
  if (!Number.isInteger(fan) || fan <= 0) {
    throw new Error('fan must be a positive integer');
  }
  if (!Number.isInteger(minFanToWin) || minFanToWin < 0) {
    throw new Error('minFanToWin must be a non-negative integer');
  }
  const raisedFan = Math.max(fan, minFanToWin);
  if (capFan === null) {
    return raisedFan;
  }
  if (!Number.isInteger(capFan) || capFan <= 0) {
    throw new Error('capFan must be null or a positive integer');
  }
  return Math.min(raisedFan, capFan);
}

export function computeCustomPayout(input: HkCustomPayoutInput): HkCustomPayout {
  const { fan, minFanToWin, capFan, settlementType } = input;
  const unitPerFan = Number(input.unitPerFan);
  if (!Number.isFinite(unitPerFan) || unitPerFan < 0.1) {
    throw new Error('unitPerFan must be a number >= 0.1');
  }

  const effectiveFan = computeEffectiveFan(fan, minFanToWin, capFan);
  const baseAmount = unitPerFan * effectiveFan;
  // customTable ignores gunMode: always uses one linear HK-style cash formula.
  const zimoPerPlayer = baseAmount;
  const discarderPays = baseAmount * 2;
  const otherPlayersPay = null;

  const totalWinAmount =
    settlementType === 'zimo'
      ? zimoPerPlayer * 3
      : discarderPays + (otherPlayersPay ?? 0) * 2;

  return {
    fan,
    effectiveFan,
    baseAmount,
    settlementType,
    zimoPerPlayer,
    discarderPays,
    otherPlayersPay,
    totalWinAmount,
  };
}
