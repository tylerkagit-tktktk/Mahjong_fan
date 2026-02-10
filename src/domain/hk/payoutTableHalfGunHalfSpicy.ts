export type HkStakePresetCode = '25' | '51' | '12';

export type HkHalfGunHalfSpicyPayoutQ = {
  discarderPaysQ: number;
  othersPayQ: number;
};

// fan 0..10 fixed table (quarter units)
const TABLE_25: HkHalfGunHalfSpicyPayoutQ[] = [
  { discarderPaysQ: 2, othersPayQ: 1 },
  { discarderPaysQ: 4, othersPayQ: 2 },
  { discarderPaysQ: 8, othersPayQ: 4 },
  { discarderPaysQ: 16, othersPayQ: 8 },
  { discarderPaysQ: 32, othersPayQ: 16 },
  { discarderPaysQ: 48, othersPayQ: 24 },
  { discarderPaysQ: 64, othersPayQ: 32 },
  { discarderPaysQ: 96, othersPayQ: 48 },
  { discarderPaysQ: 128, othersPayQ: 64 },
  { discarderPaysQ: 192, othersPayQ: 96 },
  { discarderPaysQ: 256, othersPayQ: 128 },
];

const TABLE_51: HkHalfGunHalfSpicyPayoutQ[] = [
  { discarderPaysQ: 4, othersPayQ: 2 },
  { discarderPaysQ: 8, othersPayQ: 4 },
  { discarderPaysQ: 16, othersPayQ: 8 },
  { discarderPaysQ: 32, othersPayQ: 16 },
  { discarderPaysQ: 64, othersPayQ: 32 },
  { discarderPaysQ: 96, othersPayQ: 48 },
  { discarderPaysQ: 128, othersPayQ: 64 },
  { discarderPaysQ: 192, othersPayQ: 96 },
  { discarderPaysQ: 256, othersPayQ: 128 },
  { discarderPaysQ: 384, othersPayQ: 192 },
  { discarderPaysQ: 512, othersPayQ: 256 },
];

const TABLE_12: HkHalfGunHalfSpicyPayoutQ[] = [
  { discarderPaysQ: 8, othersPayQ: 4 },
  { discarderPaysQ: 16, othersPayQ: 8 },
  { discarderPaysQ: 32, othersPayQ: 16 },
  { discarderPaysQ: 64, othersPayQ: 32 },
  { discarderPaysQ: 128, othersPayQ: 64 },
  { discarderPaysQ: 192, othersPayQ: 96 },
  { discarderPaysQ: 256, othersPayQ: 128 },
  { discarderPaysQ: 384, othersPayQ: 192 },
  { discarderPaysQ: 512, othersPayQ: 256 },
  { discarderPaysQ: 768, othersPayQ: 384 },
  { discarderPaysQ: 1024, othersPayQ: 512 },
];

function assertFan(fan: number): void {
  if (!Number.isInteger(fan) || fan < 0) {
    throw new Error('fan must be an integer >= 0');
  }
}

function getTable(preset: HkStakePresetCode): HkHalfGunHalfSpicyPayoutQ[] {
  if (preset === '25') {
    return TABLE_25;
  }
  if (preset === '51') {
    return TABLE_51;
  }
  return TABLE_12;
}

function extrapolateFromTable(fan: number, table: HkHalfGunHalfSpicyPayoutQ[]): HkHalfGunHalfSpicyPayoutQ {
  const fan10 = table[10];
  if (fan === 10) {
    return fan10;
  }

  const evenMap: Record<number, HkHalfGunHalfSpicyPayoutQ> = {
    10: fan10,
  };

  for (let currentEven = 12; currentEven <= fan; currentEven += 2) {
    const prevEven = evenMap[currentEven - 2];
    evenMap[currentEven] = {
      discarderPaysQ: prevEven.discarderPaysQ * 2,
      othersPayQ: prevEven.othersPayQ * 2,
    };
  }

  if (fan % 2 === 0) {
    return evenMap[fan];
  }

  const prevEven = evenMap[fan - 1];
  return {
    discarderPaysQ: Math.round(prevEven.discarderPaysQ * 1.5),
    othersPayQ: Math.round(prevEven.othersPayQ * 1.5),
  };
}

export function getHkHalfGunHalfSpicyPayoutQ(
  fan: number,
  stakePreset: HkStakePresetCode,
): HkHalfGunHalfSpicyPayoutQ {
  assertFan(fan);
  const table = getTable(stakePreset);
  if (fan <= 10) {
    return table[fan];
  }
  return extrapolateFromTable(fan, table);
}
