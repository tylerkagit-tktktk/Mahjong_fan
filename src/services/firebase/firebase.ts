import { getApp } from '@react-native-firebase/app';
import firestore from '@react-native-firebase/firestore';

export function getFirebaseApp() {
  return getApp();
}

export function getFirestore() {
  return firestore(getFirebaseApp());
}

export async function runFirestoreSmokeTest(input: {
  actorId?: string | null;
  source?: string;
} = {}) {
  const db = getFirestore();
  const docRef = db.collection('dev_ping').doc('smoke_test');
  const payload = {
    actorId: input.actorId ?? null,
    source: input.source ?? 'room_lobby_v2',
    updatedAt: Date.now(),
    ok: true,
  };

  await docRef.set(payload, { merge: true });
  const snapshot = await docRef.get();
  const data = snapshot.data();

  return {
    ok: data !== undefined,
    data: data ?? null,
  };
}
