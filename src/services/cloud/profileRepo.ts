import firestore from '@react-native-firebase/firestore';
import { CloudProvider, CloudUserProfile, ProfileStats } from '../../models/cloud';
import { getFirestore } from '../firebase/firebase';

const profiles = () => getFirestore().collection('profiles');
const stats = () => getFirestore().collection('profileStats');

function defaultProfile(uid: string, provider: CloudProvider): CloudUserProfile {
  const timestamp = Date.now();
  return {
    uid,
    provider,
    displayName: `Player-${uid.slice(-4)}`,
    avatarUrl: null,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

function defaultStats(uid: string): ProfileStats {
  return { uid, handsParticipated: 0, wins: 0, zimoCount: 0, discardCount: 0, drawCount: 0, updatedAt: Date.now() };
}

async function syncRoomMemberProfile(uid: string, profile: CloudUserProfile): Promise<void> {
  const snapshot = await getFirestore()
    .collectionGroup('members')
    .where('uid', '==', uid)
    .get();
  const activeMemberDocs = snapshot.docs.filter(
    (doc) => (doc.data() as { membershipStatus?: string }).membershipStatus === 'active',
  );

  for (let index = 0; index < activeMemberDocs.length; index += 450) {
    const batch = getFirestore().batch();
    for (const memberDoc of activeMemberDocs.slice(index, index + 450)) {
      batch.update(memberDoc.ref, {
        displayName: profile.displayName,
        avatarUrl: profile.avatarUrl,
      });
    }
    await batch.commit();
  }
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

export async function updateProfile(uid: string, input: { displayName: string; avatarUrl?: string | null }): Promise<CloudUserProfile> {
  const current = await ensureProfile(uid);
  const next: CloudUserProfile = {
    ...current,
    displayName: input.displayName.trim() || current.displayName,
    avatarUrl: Object.prototype.hasOwnProperty.call(input, 'avatarUrl') ? input.avatarUrl ?? null : current.avatarUrl,
    updatedAt: Date.now(),
  };
  await profiles().doc(uid).set(next);
  await syncRoomMemberProfile(uid, next);
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

export async function applyHandStats(
  uidsOnTable: string[],
  input: { type: 'zimo' | 'discard' | 'draw'; winnerPlayerId?: string | null; discarderPlayerId?: string | null },
): Promise<void> {
  const batch = getFirestore().batch();
  const timestamp = Date.now();
  for (const uid of new Set(uidsOnTable)) {
    const update: Record<string, unknown> = {
      uid,
      handsParticipated: firestore.FieldValue.increment(1),
      updatedAt: timestamp,
    };
    if (input.type === 'draw') update.drawCount = firestore.FieldValue.increment(1);
    if (input.winnerPlayerId === uid) {
      update.wins = firestore.FieldValue.increment(1);
      if (input.type === 'zimo') update.zimoCount = firestore.FieldValue.increment(1);
    }
    if (input.discarderPlayerId === uid) update.discardCount = firestore.FieldValue.increment(1);
    batch.set(stats().doc(uid), { ...defaultStats(uid), ...update }, { merge: true });
  }
  await batch.commit();
}
