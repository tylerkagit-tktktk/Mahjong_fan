import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  ActiveHostedRoomPointer,
  CloudSnapshot,
  HandLog,
  ResolvedRoomPlayer,
  Room,
  RoomLineup,
} from '../../models/cloud';
import { createSecureToken } from './secureRandom';

const CLOUD_SNAPSHOT_KEY = 'cloud_snapshot_v2';
const ACTIVE_HOSTED_ROOM_KEY = 'cloud_active_hosted_room_v1';
const ACTIVE_HOSTED_ROOM_DRAFT_KEY = 'cloud_active_hosted_room_draft_v1';
const ACTIVE_ROOM_RECOVERY_KEY_PREFIX = 'cloud_active_room_recovery_v1:';
const LOCAL_TAKEOVER_GAME_KEY_PREFIX = 'cloud_local_takeover_game_v1:';
const PENDING_HOSTED_ROOM_CLEANUP_KEY = 'cloud_pending_hosted_room_cleanup_v1';

export type ActiveRoomRecoverySnapshot = {
  roomId: string;
  savedAt: number;
  room?: Room | null;
  players?: ResolvedRoomPlayer[];
  lineup?: RoomLineup | null;
  hands?: HandLog[];
  lineups?: RoomLineup[];
  totalsQByPlayerId?: Record<string, number>;
  dealerSeatIndex?: number;
  roundState?: {
    dealerSeatIndex: number;
    dealerAdvanceCount: number;
    handCount: number;
  };
};

export type ActiveHostedRoomDraft = {
  roomId: string;
  seatMode: 'manual' | 'auto';
  players: string[];
  autoNames: string[];
  autoAssigned: string[] | null;
  autoAssignedPlayerIds: Array<string | null> | null;
  startingDealerMode: 'random' | 'manual';
  startingDealerSourceIndex: number | null;
  syncSeatAssignments: Record<'0' | '1' | '2' | '3', string | null>;
};

export type PendingHostedRoomCleanup = {
  uid: string;
  roomId: string;
  localGameId: string;
  createdAt: number;
};

const inMemory = new Map<string, string>();
const recoveryWriteQueues = new Map<string, Promise<void>>();

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

async function removeItem(key: string): Promise<void> {
  try {
    await AsyncStorage.removeItem(key);
  } catch {
    inMemory.delete(key);
  }
}

export async function loadActiveHostedRoomPointer(): Promise<ActiveHostedRoomPointer | null> {
  const raw = await getItem(ACTIVE_HOSTED_ROOM_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<ActiveHostedRoomPointer>;
    return typeof parsed.uid === 'string' && typeof parsed.roomId === 'string'
      ? { uid: parsed.uid, roomId: parsed.roomId }
      : null;
  } catch {
    return null;
  }
}

export async function saveActiveHostedRoomPointer(pointer: ActiveHostedRoomPointer): Promise<void> {
  await setItem(ACTIVE_HOSTED_ROOM_KEY, JSON.stringify(pointer));
}

export async function clearActiveHostedRoomPointer(expected?: ActiveHostedRoomPointer): Promise<void> {
  if (expected) {
    const current = await loadActiveHostedRoomPointer();
    if (!current || current.uid !== expected.uid || current.roomId !== expected.roomId) return;
  }
  await removeItem(ACTIVE_HOSTED_ROOM_KEY);
  await removeItem(ACTIVE_HOSTED_ROOM_DRAFT_KEY);
}

export async function loadActiveHostedRoomDraft(roomId: string): Promise<ActiveHostedRoomDraft | null> {
  const raw = await getItem(ACTIVE_HOSTED_ROOM_DRAFT_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as ActiveHostedRoomDraft;
    return parsed.roomId === roomId ? parsed : null;
  } catch {
    return null;
  }
}

export async function saveActiveHostedRoomDraft(draft: ActiveHostedRoomDraft): Promise<void> {
  await setItem(ACTIVE_HOSTED_ROOM_DRAFT_KEY, JSON.stringify(draft));
}

function activeRoomRecoveryKey(roomId: string): string {
  return `${ACTIVE_ROOM_RECOVERY_KEY_PREFIX}${roomId}`;
}

function localTakeoverGameKey(roomId: string): string {
  return `${LOCAL_TAKEOVER_GAME_KEY_PREFIX}${roomId}`;
}

export async function loadLocalTakeoverGameId(roomId: string): Promise<string | null> {
  const value = await getItem(localTakeoverGameKey(roomId));
  return value?.trim() || null;
}

export async function saveLocalTakeoverGameId(roomId: string, gameId: string): Promise<void> {
  await setItem(localTakeoverGameKey(roomId), gameId);
}

export async function loadPendingHostedRoomCleanup(): Promise<PendingHostedRoomCleanup | null> {
  const raw = await getItem(PENDING_HOSTED_ROOM_CLEANUP_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<PendingHostedRoomCleanup>;
    return typeof parsed.uid === 'string' &&
      typeof parsed.roomId === 'string' &&
      typeof parsed.localGameId === 'string' &&
      typeof parsed.createdAt === 'number'
      ? parsed as PendingHostedRoomCleanup
      : null;
  } catch {
    return null;
  }
}

export async function savePendingHostedRoomCleanup(cleanup: PendingHostedRoomCleanup): Promise<void> {
  await setItem(PENDING_HOSTED_ROOM_CLEANUP_KEY, JSON.stringify(cleanup));
}

export async function clearPendingHostedRoomCleanup(expectedRoomId?: string): Promise<void> {
  if (expectedRoomId) {
    const current = await loadPendingHostedRoomCleanup();
    if (!current || current.roomId !== expectedRoomId) return;
  }
  await removeItem(PENDING_HOSTED_ROOM_CLEANUP_KEY);
}

export async function loadActiveRoomRecoverySnapshot(roomId: string): Promise<ActiveRoomRecoverySnapshot | null> {
  const raw = await getItem(activeRoomRecoveryKey(roomId));
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as ActiveRoomRecoverySnapshot;
    return parsed.roomId === roomId && typeof parsed.savedAt === 'number' ? parsed : null;
  } catch {
    return null;
  }
}

export function mergeActiveRoomRecoverySnapshot(
  roomId: string,
  patch: Omit<Partial<ActiveRoomRecoverySnapshot>, 'roomId' | 'savedAt'>,
): Promise<void> {
  const previous = recoveryWriteQueues.get(roomId) ?? Promise.resolve();
  const next = previous.catch(() => {}).then(async () => {
    const current = await loadActiveRoomRecoverySnapshot(roomId);
    const snapshot: ActiveRoomRecoverySnapshot = {
      ...(current ?? { roomId, savedAt: Date.now() }),
      ...patch,
      roomId,
      savedAt: Date.now(),
    };
    await setItem(activeRoomRecoveryKey(roomId), JSON.stringify(snapshot));
  });
  recoveryWriteQueues.set(roomId, next);
  return next.finally(() => {
    if (recoveryWriteQueues.get(roomId) === next) {
      recoveryWriteQueues.delete(roomId);
    }
  });
}

export async function clearActiveRoomRecoverySnapshot(roomId: string): Promise<void> {
  await (recoveryWriteQueues.get(roomId) ?? Promise.resolve()).catch(() => {});
  await removeItem(activeRoomRecoveryKey(roomId));
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

export function makeId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function now(): number {
  return Date.now();
}

export function createToken(): string {
  return createSecureToken();
}
