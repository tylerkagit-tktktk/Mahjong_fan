import { CloudArchivePayload, CloudProvider, CloudUserProfile, ProfileStats, ProfileStatsContribution, RoomLineup } from '../../models/cloud';
import { getFirestore } from '../firebase/firebase';

const profiles = () => getFirestore().collection('profiles');
const stats = () => getFirestore().collection('profileStats');

export const MAX_PROFILE_DISPLAY_NAME_LENGTH = 10;

export function defaultDisplayName(uid: string): string {
  return `Player-${uid.slice(-3)}`;
}

export function normalizeDisplayName(value: string | null | undefined, uid: string): string {
  const normalized = value?.trim().slice(0, MAX_PROFILE_DISPLAY_NAME_LENGTH) ?? '';
  return normalized || defaultDisplayName(uid);
}

function defaultProfile(uid: string, provider: CloudProvider): CloudUserProfile {
  const timestamp = Date.now();
  return {
    uid,
    provider,
    displayName: defaultDisplayName(uid),
    avatarUrl: null,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

function defaultStats(uid: string): ProfileStats {
  return { uid, handsParticipated: 0, wins: 0, zimoCount: 0, discardCount: 0, drawCount: 0, updatedAt: Date.now() };
}

export async function ensureProfile(uid: string, provider: CloudProvider = 'anonymous'): Promise<CloudUserProfile> {
  const ref = profiles().doc(uid);
  const existing = await ref.get();
  if (existing.exists()) {
    return existing.data() as CloudUserProfile;
  }
  const profile = defaultProfile(uid, provider);
  await ref.set(profile);
  await stats().doc(uid).set(defaultStats(uid), { merge: true });
  return profile;
}

export async function getProfile(uid: string): Promise<CloudUserProfile | null> {
  const snapshot = await profiles().doc(uid).get();
  return snapshot.exists() ? (snapshot.data() as CloudUserProfile) : null;
}

export async function updateProfile(
  uid: string,
  input: { displayName: string; avatarUrl?: string | null },
  roomId?: string,
): Promise<CloudUserProfile> {
  const current = await ensureProfile(uid);
  const displayName = input.displayName.trim();
  if (displayName.length < 1 || displayName.length > MAX_PROFILE_DISPLAY_NAME_LENGTH) {
    throw new Error(`Display name must be between 1 and ${MAX_PROFILE_DISPLAY_NAME_LENGTH} characters`);
  }
  const next: CloudUserProfile = {
    ...current,
    displayName,
    avatarUrl: Object.prototype.hasOwnProperty.call(input, 'avatarUrl') ? input.avatarUrl ?? null : current.avatarUrl,
    updatedAt: Date.now(),
  };
  const batch = getFirestore().batch();
  batch.set(profiles().doc(uid), next);
  if (roomId) {
    batch.update(getFirestore().collection('rooms').doc(roomId).collection('members').doc(uid), {
      displayName: next.displayName,
      avatarUrl: next.avatarUrl,
    });
  }
  await batch.commit();
  return next;
}

export async function getProfileStats(uid: string): Promise<ProfileStats> {
  const ref = stats().doc(uid);
  const snapshot = await ref.get();
  if (snapshot.exists()) {
    return snapshot.data() as ProfileStats;
  }
  const created = defaultStats(uid);
  await ref.set(created);
  return created;
}

function isPlayerSeated(uid: string, lineup: RoomLineup | undefined): boolean {
  if (!lineup) return false;
  return Object.values(lineup.seats).includes(uid);
}

export function getArchiveStatsContribution(payload: CloudArchivePayload, uid: string): ProfileStatsContribution {
  const lineups = new Map(payload.lineups.map((lineup) => [lineup.lineupVersion, lineup]));
  return payload.hands.reduce<ProfileStatsContribution>((totals, hand) => {
    if (!isPlayerSeated(uid, lineups.get(hand.lineupVersion))) return totals;
    totals.handsParticipated += 1;
    if (hand.type === 'draw') totals.drawCount += 1;
    if (hand.winnerPlayerId === uid) {
      totals.wins += 1;
      if (hand.type === 'zimo') totals.zimoCount += 1;
    }
    if (hand.discarderPlayerId === uid) totals.discardCount += 1;
    return totals;
  }, { handsParticipated: 0, wins: 0, zimoCount: 0, discardCount: 0, drawCount: 0 });
}

export async function applyArchiveStats(uid: string, payload: CloudArchivePayload): Promise<void> {
  if (!payload.members.some((member) => member.uid === uid)) return;
  const contribution = getArchiveStatsContribution(payload, uid);
  const archiveId = `${payload.room.roomId}_${payload.archiveVersion}`;
  const statsRef = stats().doc(uid);
  const markerRef = statsRef.collection('appliedArchives').doc(archiveId);

  await getFirestore().runTransaction(async (transaction) => {
    const marker = await transaction.get(markerRef);
    if (marker.exists()) return;

    const currentSnapshot = await transaction.get(statsRef);
    const current = currentSnapshot.exists() ? currentSnapshot.data() as ProfileStats : defaultStats(uid);
    transaction.set(statsRef, {
      ...current,
      uid,
      handsParticipated: current.handsParticipated + contribution.handsParticipated,
      wins: current.wins + contribution.wins,
      zimoCount: current.zimoCount + contribution.zimoCount,
      discardCount: current.discardCount + contribution.discardCount,
      drawCount: current.drawCount + contribution.drawCount,
      updatedAt: Date.now(),
    });
    transaction.set(markerRef, {
      roomId: payload.room.roomId,
      archiveVersion: payload.archiveVersion,
      appliedAt: Date.now(),
    });
  });
}
