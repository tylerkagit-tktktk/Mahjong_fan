import { CloudUserProfile, ProfileStats } from '../../models/cloud';
import { loadSnapshot, now, saveSnapshot } from './storage';

export async function getProfile(uid: string): Promise<CloudUserProfile | null> {
  const snapshot = await loadSnapshot();
  return snapshot.profiles.find((p) => p.uid === uid) ?? null;
}

export async function updateProfile(
  uid: string,
  input: { displayName: string; avatarUrl?: string | null },
): Promise<CloudUserProfile> {
  const snapshot = await loadSnapshot();
  const current = snapshot.profiles.find((p) => p.uid === uid);
  if (!current) {
    throw new Error('Profile not found');
  }
  current.displayName = input.displayName.trim() || current.displayName;
  if (Object.prototype.hasOwnProperty.call(input, 'avatarUrl')) {
    current.avatarUrl = input.avatarUrl ?? null;
  }
  current.updatedAt = now();
  await saveSnapshot(snapshot);
  return current;
}

export async function getProfileStats(uid: string): Promise<ProfileStats> {
  const snapshot = await loadSnapshot();
  const existing = snapshot.stats.find((stat) => stat.uid === uid);
  if (existing) {
    return existing;
  }
  const fallback: ProfileStats = {
    uid,
    handsParticipated: 0,
    wins: 0,
    zimoCount: 0,
    discardCount: 0,
    drawCount: 0,
    updatedAt: now(),
  };
  snapshot.stats.push(fallback);
  await saveSnapshot(snapshot);
  return fallback;
}

export async function applyHandStats(
  uidsOnTable: string[],
  input: { type: 'zimo' | 'discard' | 'draw'; winnerPlayerId?: string | null; discarderPlayerId?: string | null },
): Promise<void> {
  const snapshot = await loadSnapshot();
  const touched = new Set<string>(uidsOnTable);
  for (const uid of touched) {
    let stats = snapshot.stats.find((item) => item.uid === uid);
    if (!stats) {
      stats = {
        uid,
        handsParticipated: 0,
        wins: 0,
        zimoCount: 0,
        discardCount: 0,
        drawCount: 0,
        updatedAt: now(),
      };
      snapshot.stats.push(stats);
    }
    stats.handsParticipated += 1;
    if (input.type === 'draw') {
      stats.drawCount += 1;
    }
    if (input.winnerPlayerId && uid === input.winnerPlayerId) {
      stats.wins += 1;
      if (input.type === 'zimo') {
        stats.zimoCount += 1;
      }
    }
    if (input.discarderPlayerId && uid === input.discarderPlayerId) {
      stats.discardCount += 1;
    }
    stats.updatedAt = now();
  }
  await saveSnapshot(snapshot);
}
