import { HkStakePresetCode } from './payoutTableHalfGunHalfSpicy';

export type HkFullGunHalfSpicyPayoutQ = {
  discarderPaysQ: number;
};

// fan 0..10 fixed table (quarter units)
const TABLE_25: HkFullGunHalfSpicyPayoutQ[] = [
  { discarderPaysQ: 4 },
  { discarderPaysQ: 8 },
  { discarderPaysQ: 16 },
  { discarderPaysQ: 32 },
  { discarderPaysQ: 64 },
  { discarderPaysQ: 96 },
  { discarderPaysQ: 128 },
  { discarderPaysQ: 192 },
  { discarderPaysQ: 256 },
  { discarderPaysQ: 384 },
  { discarderPaysQ: 512 },
];

const TABLE_51: HkFullGunHalfSpicyPayoutQ[] = [
  { discarderPaysQ: 8 },
  { discarderPaysQ: 16 },
  { discarderPaysQ: 32 },
  { discarderPaysQ: 64 },
  { discarderPaysQ: 128 },
  { discarderPaysQ: 192 },
  { discarderPaysQ: 256 },
  { discarderPaysQ: 384 },
  { discarderPaysQ: 512 },
  { discarderPaysQ: 768 },
  { discarderPaysQ: 1024 },
];

const TABLE_12: HkFullGunHalfSpicyPayoutQ[] = [
  { discarderPaysQ: 16 },
  { discarderPaysQ: 32 },
  { discarderPaysQ: 64 },
  { discarderPaysQ: 128 },
  { discarderPaysQ: 256 },
  { discarderPaysQ: 384 },
  { discarderPaysQ: 512 },
  { discarderPaysQ: 768 },
  { discarderPaysQ: 1024 },
  { discarderPaysQ: 1536 },
  { discarderPaysQ: 2048 },
];

function assertFan(fan: number): void {
  if (!Number.isInteger(fan) || fan < 0) {
    throw new Error('fan must be an integer >= 0');
  }
}

function getTable(preset: HkStakePresetCode): HkFullGunHalfSpicyPayoutQ[] {
  if (preset === '25') {
    return TABLE_25;
  }
  if (preset === '51') {
    return TABLE_51;
  }
  return TABLE_12;
}

function extrapolateFromTable(fan: number, table: HkFullGunHalfSpicyPayoutQ[]): HkFullGunHalfSpicyPayoutQ {
  const fan10 = table[10];
  if (fan === 10) {
    return fan10;
  }

  const evenMap: Record<number, HkFullGunHalfSpicyPayoutQ> = {
    10: fan10,
  };

  for (let currentEven = 12; currentEven <= fan; currentEven += 2) {
    const prevEven = evenMap[currentEven - 2];
    evenMap[currentEven] = {
      discarderPaysQ: prevEven.discarderPaysQ * 2,
    };
  }

  if (fan % 2 === 0) {
    return evenMap[fan];
  }

  const prevEven = evenMap[fan - 1];
  return {
    discarderPaysQ: Math.round(prevEven.discarderPaysQ * 1.5),
  };
}

export function getHkFullGunHalfSpicyPayoutQ(
  fan: number,
  stakePreset: HkStakePresetCode,
): HkFullGunHalfSpicyPayoutQ {
  assertFan(fan);
  const table = getTable(stakePreset);
  if (fan <= 10) {
    return table[fan];
  }
  return extrapolateFromTable(fan, table);
}
