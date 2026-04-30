import { CloudProvider, CloudSession, CloudUserProfile, ProfileStats } from '../../models/cloud';
import { loadSessionRaw, loadSnapshot, makeId, now, saveSessionRaw, saveSnapshot } from './storage';

function defaultProfile(uid: string, provider: CloudProvider): CloudUserProfile {
  const ts = now();
  return {
    uid,
    provider,
    displayName: `Player-${uid.slice(-4)}`,
    avatarUrl: null,
    createdAt: ts,
    updatedAt: ts,
  };
}

function defaultStats(uid: string): ProfileStats {
  return {
    uid,
    handsParticipated: 0,
    wins: 0,
    zimoCount: 0,
    discardCount: 0,
    drawCount: 0,
    updatedAt: now(),
  };
}

export async function getCurrentSession(): Promise<CloudSession | null> {
  const raw = await loadSessionRaw();
  if (!raw) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as CloudSession;
    if (!parsed.uid || !parsed.provider) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export async function signInWithProvider(provider: CloudProvider): Promise<CloudSession> {
  const snapshot = await loadSnapshot();
  const uid = makeId(provider);
  const session: CloudSession = { uid, provider };
  snapshot.profiles.push(defaultProfile(uid, provider));
  snapshot.stats.push(defaultStats(uid));
  await saveSnapshot(snapshot);
  await saveSessionRaw(JSON.stringify(session));
  return session;
}

export async function signOut(): Promise<void> {
  await saveSessionRaw(null);
}

export async function ensureSession(preferredProvider: CloudProvider = 'google'): Promise<CloudSession> {
  const existing = await getCurrentSession();
  if (existing) {
    return existing;
  }
  return signInWithProvider(preferredProvider);
}
