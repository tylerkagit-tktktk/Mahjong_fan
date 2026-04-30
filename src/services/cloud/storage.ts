import AsyncStorage from '@react-native-async-storage/async-storage';
import { CloudSnapshot } from '../../models/cloud';

const CLOUD_SNAPSHOT_KEY = 'cloud_snapshot_v2';
const SESSION_KEY = 'cloud_session_v2';

const inMemory = new Map<string, string>();

function createEmptySnapshot(): CloudSnapshot {
  return {
    rooms: [],
    members: [],
    tempPlayers: [],
    lineups: [],
    hands: [],
    profiles: [],
    stats: [],
    archiveSyncs: [],
  };
}

async function getItem(key: string): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(key);
  } catch {
    return inMemory.has(key) ? inMemory.get(key)! : null;
  }
}

async function setItem(key: string, value: string): Promise<void> {
  try {
    await AsyncStorage.setItem(key, value);
  } catch {
    inMemory.set(key, value);
  }
}

export async function loadSnapshot(): Promise<CloudSnapshot> {
  const raw = await getItem(CLOUD_SNAPSHOT_KEY);
  if (!raw) {
    return createEmptySnapshot();
  }
  try {
    const parsed = JSON.parse(raw) as CloudSnapshot;
    return {
      rooms: parsed.rooms ?? [],
      members: parsed.members ?? [],
      tempPlayers: parsed.tempPlayers ?? [],
      lineups: parsed.lineups ?? [],
      hands: parsed.hands ?? [],
      profiles: parsed.profiles ?? [],
      stats: parsed.stats ?? [],
      archiveSyncs: parsed.archiveSyncs ?? [],
    };
  } catch {
    return createEmptySnapshot();
  }
}

export async function saveSnapshot(snapshot: CloudSnapshot): Promise<void> {
  await setItem(CLOUD_SNAPSHOT_KEY, JSON.stringify(snapshot));
}

export async function loadSessionRaw(): Promise<string | null> {
  return getItem(SESSION_KEY);
}

export async function saveSessionRaw(raw: string | null): Promise<void> {
  if (raw === null) {
    await setItem(SESSION_KEY, '');
    return;
  }
  await setItem(SESSION_KEY, raw);
}

export function makeId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function hashToken(token: string): string {
  let hash = 0;
  for (let i = 0; i < token.length; i += 1) {
    hash = (hash * 31 + token.charCodeAt(i)) % 2147483647;
  }
  return String(hash);
}

export function now(): number {
  return Date.now();
}

export function createToken(): string {
  return Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
}
