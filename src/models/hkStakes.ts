import { HkGunMode } from './rules';

export type HkSettlementType = 'zimo' | 'discard';

export type HkCustomPayoutInput = {
  fan: number;
  unitPerFan: number;
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

export function computeEffectiveFan(fan: number, capFan: number | null): number {
  if (!Number.isInteger(fan) || fan <= 0) {
    throw new Error('fan must be a positive integer');
  }
  if (capFan === null) {
    return fan;
  }
  if (!Number.isInteger(capFan) || capFan <= 0) {
    throw new Error('capFan must be null or a positive integer');
  }
  return Math.min(fan, capFan);
}

export function computeCustomPayout(input: HkCustomPayoutInput): HkCustomPayout {
  const { fan, capFan, gunMode, settlementType } = input;
  const unitPerFan = Number(input.unitPerFan);
  if (!Number.isInteger(unitPerFan) || unitPerFan <= 0) {
    throw new Error('unitPerFan must be a positive integer');
  }

  const effectiveFan = computeEffectiveFan(fan, capFan);
  const baseAmount = unitPerFan * effectiveFan;
  const zimoPerPlayer = baseAmount;
  const discarderPays = gunMode === 'fullGun' ? baseAmount * 2 : baseAmount;
  const otherPlayersPay = gunMode === 'halfGun' ? baseAmount / 2 : null;

  const totalWinAmount =
    settlementType === 'zimo'
      ? zimoPerPlayer * 3
      : gunMode === 'fullGun'
      ? discarderPays
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
