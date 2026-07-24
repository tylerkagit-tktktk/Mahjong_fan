import { CloudProvider, CloudSession } from '../../models/cloud';
import { getFirebaseAuth } from '../firebase/firebase';
import { ensureProfile } from './profileRepo';

function toSession(uid: string): CloudSession {
  return { uid, provider: 'anonymous' };
}

export async function getCurrentSession(): Promise<CloudSession | null> {
  const user = getFirebaseAuth().currentUser;
  return user ? toSession(user.uid) : null;
}

/**
 * Multiplayer currently uses Firebase Anonymous Authentication. Apple and Google
 * account linking can be added later without changing room ownership IDs.
 */
export async function signInWithProvider(_provider: CloudProvider): Promise<CloudSession> {
  if (process.env.NODE_ENV === 'test') {
    await getFirebaseAuth().signOut();
  }
  return ensureSession();
}

export async function signOut(): Promise<void> {
  await getFirebaseAuth().signOut();
}

export async function ensureSession(_preferredProvider: CloudProvider = 'anonymous'): Promise<CloudSession> {
  const firebaseAuth = getFirebaseAuth();
  const credential = firebaseAuth.currentUser ? null : await firebaseAuth.signInAnonymously();
  const user = credential?.user ?? firebaseAuth.currentUser;
  if (!user) {
    throw new Error('Unable to create Firebase anonymous session');
  }
  const session = toSession(user.uid);
  await ensureProfile(session.uid, session.provider);
  return session;
}
