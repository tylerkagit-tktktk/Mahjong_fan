import {
  ArchiveSyncStatus,
  CloudUserProfile,
  RoomCreationGuard,
  LineupChangeInput,
  ResolvedRoomPlayer,
  Room,
  RoomLineup,
  RoomMember,
  RoomPlayerId,
  RoomTemporaryPlayer,
  SeatKey,
  StartRoomInput,
  SubmitResult,
} from '../../models/cloud';
import { getProfile } from './profileRepo';
import { createToken, makeId } from './storage';
import { clearActiveHostedRoomPointer, saveActiveHostedRoomPointer } from './storage';
import { getFirestore } from '../firebase/firebase';
import firestore from '@react-native-firebase/firestore';

export type InvitePayload = { roomId: string; token: string; expiresAt: number; deepLink: string };

const MEMBER_CAP = 8;
const ARCHIVE_RETENTION_MS = 48 * 60 * 60 * 1000;
const DELETE_BATCH_SIZE = 450;
export const ROOM_CREATION_COOLDOWN_MS = 5 * 60 * 1000;
const SEAT_KEYS: SeatKey[] = ['0', '1', '2', '3'];
const rooms = () => getFirestore().collection('rooms');
const roomRef = (roomId: string) => rooms().doc(roomId);
const inviteRef = (token: string) => getFirestore().collection('roomInvites').doc(token);
const membersRef = (roomId: string) => roomRef(roomId).collection('members');
const temporaryPlayersRef = (roomId: string) => roomRef(roomId).collection('tempPlayers');
const lineupsRef = (roomId: string) => roomRef(roomId).collection('lineups');
const handsRef = (roomId: string) => roomRef(roomId).collection('hands');
const joinTicketsRef = (roomId: string) => roomRef(roomId).collection('joinTickets');
const hostConfigRef = (roomId: string) => roomRef(roomId).collection('hostConfig').doc('current');
const roomCreationGuardRef = (uid: string) => getFirestore().collection('roomCreationGuards').doc(uid);

type RoomInvite = {
  roomId: string;
  createdByUid: string;
  createdAt: number;
  expiresAt: { toMillis?: () => number; milliseconds?: number } | number;
};

type HostConfig = {
  activeInviteToken: string | null;
  updatedAt: number;
};

export type CreateRoomResult =
  | { ok: true; kind: 'created' | 'restored'; room: Room; invite: InvitePayload | null }
  | { ok: false; code: 'RATE_LIMITED'; retryAt: number }
  | { ok: false; code: 'CLEANUP_IN_PROGRESS'; roomId: string }
  | { ok: false; code: 'UNRECOVERABLE'; message: string };

export type HostedRoomRecoveryResult =
  | { kind: 'none'; retryAt: number | null }
  | { kind: 'open'; room: Room; invite: InvitePayload }
  | { kind: 'active'; room: Room }
  | { kind: 'cleaning'; roomId: string };

type GuardedCreationTransactionResult =
  | { kind: 'created'; room: Room; invite: InvitePayload }
  | { kind: 'existing'; room: Room }
  | { kind: 'stale' }
  | { kind: 'cleaning'; roomId: string }
  | { kind: 'rateLimited'; retryAt: number };

function timestampToMillis(value: RoomCreationGuard['lastCreatedAt']): number | null {
  if (!value) return null;
  if (typeof value.toMillis === 'function') return value.toMillis();
  return typeof value.milliseconds === 'number' ? value.milliseconds : null;
}

function invitePayload(roomId: string, token: string, expiresAt: number): InvitePayload {
  return {
    roomId,
    token,
    expiresAt,
    deepLink: `mahjongfan://join?roomId=${encodeURIComponent(roomId)}&token=${encodeURIComponent(token)}`,
  };
}

function inviteHasExpired(invite: RoomInvite): boolean {
  const expiresAt = typeof invite.expiresAt === 'number'
    ? invite.expiresAt
    : typeof invite.expiresAt.toMillis === 'function'
      ? invite.expiresAt.toMillis()
      : invite.expiresAt.milliseconds ?? 0;
  return expiresAt <= Date.now();
}

export function isTemporaryPlayerId(playerId: string | null | undefined): playerId is string {
  return typeof playerId === 'string' && playerId.startsWith('temp_');
}

function normalizeLineup(raw: RoomLineup): RoomLineup {
  return { ...raw, seats: { '0': raw.seats['0'] ?? null, '1': raw.seats['1'] ?? null, '2': raw.seats['2'] ?? null, '3': raw.seats['3'] ?? null } };
}

function seatIds(lineup: RoomLineup | null): RoomPlayerId[] {
  return lineup ? SEAT_KEYS.map((key) => lineup.seats[key]).filter((value): value is string => Boolean(value)) : [];
}

function resolveRoomPlayers(room: Room, members: RoomMember[], temporaryPlayers: RoomTemporaryPlayer[], sessionUid = ''): ResolvedRoomPlayer[] {
  const real = members.filter((member) => member.membershipStatus === 'active').map<ResolvedRoomPlayer>((member) => ({
    playerId: member.uid, roomId: member.roomId, kind: 'member', uid: member.uid, displayName: member.displayName,
    avatarUrl: member.avatarUrl, isHost: member.uid === room.hostUid, isSelf: member.uid === sessionUid, joinedAt: member.joinedAt,
  }));
  const temporary = temporaryPlayers.map<ResolvedRoomPlayer>((player) => ({
    playerId: player.tempPlayerId, roomId: player.roomId, kind: 'temporary', uid: null, displayName: player.displayName,
    avatarUrl: null, isHost: false, isSelf: false, joinedAt: player.createdAt,
  }));
  return [...real, ...temporary].sort((a, b) => a.joinedAt - b.joinedAt);
}

function validateSeatSelection(room: Room, players: ResolvedRoomPlayer[], seats: Record<SeatKey, RoomPlayerId>): SubmitResult | null {
  const ids = SEAT_KEYS.map((key) => seats[key]);
  if (ids.some((id) => !id) || new Set(ids).size !== 4) return { ok: false, code: 'INVALID_LINEUP', message: 'All four seats must be filled with different players' };
  const validIds = new Set(players.map((player) => player.playerId));
  if (ids.some((id) => !validIds.has(id))) return { ok: false, code: 'INVALID_LINEUP', message: 'Seat contains non-room player' };
  if (ids.filter((id) => !isTemporaryPlayerId(id)).length < 2) return { ok: false, code: 'NEED_MORE_REAL_PLAYERS', message: 'Need at least two real players to start online room' };
  if (room.status === 'ended' || room.status === 'archived' || room.status === 'cancelling') return { ok: false, code: 'ROOM_ENDED', message: 'Room is already ended' };
  return null;
}

async function createRoomResult(input: {
  hostUid: string;
  hostDisplayName: string;
  title: string;
  rulesSnapshot?: Record<string, unknown>;
  memberCap?: number;
}): Promise<CreateRoomResult> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const transactionResult = await getFirestore().runTransaction(async (transaction) => {
      const guardReference = roomCreationGuardRef(input.hostUid);
      const guardSnapshot = await transaction.get(guardReference);
      const guard = guardSnapshot.exists() ? guardSnapshot.data() as RoomCreationGuard : null;
      if (guard?.activeRoomId) {
        const existingSnapshot = await transaction.get(roomRef(guard.activeRoomId));
        if (existingSnapshot.exists()) {
          const existingRoom = existingSnapshot.data() as Room;
          if (existingRoom.status === 'open' || existingRoom.status === 'active') {
            return { kind: 'existing', room: existingRoom } satisfies GuardedCreationTransactionResult;
          }
          if (existingRoom.status === 'cancelling') {
            return { kind: 'cleaning', roomId: existingRoom.roomId } satisfies GuardedCreationTransactionResult;
          }
        }
        transaction.update(guardReference, {
          activeRoomId: null,
          updatedAt: firestore.FieldValue.serverTimestamp(),
        });
        return { kind: 'stale' } satisfies GuardedCreationTransactionResult;
      }

      const lastCreatedAt = timestampToMillis(guard?.lastCreatedAt ?? null);
      if (lastCreatedAt !== null && Date.now() < lastCreatedAt + ROOM_CREATION_COOLDOWN_MS) {
        return { kind: 'rateLimited', retryAt: lastCreatedAt + ROOM_CREATION_COOLDOWN_MS } satisfies GuardedCreationTransactionResult;
      }

      const profileSnapshot = await transaction.get(
        getFirestore().collection('profiles').doc(input.hostUid),
      );
      const hostProfile = profileSnapshot.exists()
        ? profileSnapshot.data() as CloudUserProfile
        : null;
      const timestamp = Date.now();
      const roomId = makeId('room');
      const token = createToken();
      const expiresAt = timestamp + 2 * 60 * 60 * 1000;
      const room: Room = {
        roomId, title: input.title.trim() || '未命名牌局', hostUid: input.hostUid, status: 'open', maxSeats: 4,
        memberCap: Math.max(4, Math.min(input.memberCap ?? MEMBER_CAP, MEMBER_CAP)), memberCount: 1,
        currentVersion: 1, currentHandIndex: 0, activeLineupVersion: 0, rulesSnapshot: input.rulesSnapshot ?? {},
        archiveReadyAt: null, expiresAt: null, archiveVersion: null, createdAt: timestamp, updatedAt: timestamp,
      };
      const member: RoomMember = {
        uid: input.hostUid, roomId, role: 'host', membershipStatus: 'active', joinedAt: timestamp,
        displayName: input.hostDisplayName.trim().slice(0, 10) || hostProfile?.displayName || `Player-${input.hostUid.slice(-4)}`,
        avatarUrl: hostProfile?.avatarUrl ?? null, archiveSyncedAt: null, archiveSyncedVersion: null,
      };
      const invite = invitePayload(roomId, token, expiresAt);
      const serverTimestamp = firestore.FieldValue.serverTimestamp();
      transaction.set(guardReference, {
        activeRoomId: roomId,
        lastCreatedAt: serverTimestamp,
        updatedAt: serverTimestamp,
      });
      transaction.set(roomRef(roomId), room);
      transaction.set(membersRef(roomId).doc(member.uid), member);
      transaction.set(hostConfigRef(roomId), { activeInviteToken: token, updatedAt: timestamp } satisfies HostConfig);
      transaction.set(inviteRef(token), {
        roomId,
        createdByUid: input.hostUid,
        createdAt: timestamp,
        expiresAt: firestore.Timestamp.fromMillis(expiresAt),
      } satisfies RoomInvite);
      return { kind: 'created', room, invite } satisfies GuardedCreationTransactionResult;
    });

    if (transactionResult.kind === 'stale') continue;
    if (transactionResult.kind === 'rateLimited') return { ok: false, code: 'RATE_LIMITED', retryAt: transactionResult.retryAt };
    if (transactionResult.kind === 'cleaning') return { ok: false, code: 'CLEANUP_IN_PROGRESS', roomId: transactionResult.roomId };
    if (transactionResult.kind === 'existing') {
      await saveActiveHostedRoomPointer({ uid: input.hostUid, roomId: transactionResult.room.roomId });
      const invite = transactionResult.room.status === 'open'
        ? await getOrCreateActiveInvite(transactionResult.room.roomId, input.hostUid)
        : null;
      return { ok: true, kind: 'restored', room: transactionResult.room, invite };
    }
    await saveActiveHostedRoomPointer({ uid: input.hostUid, roomId: transactionResult.room.roomId });
    return { ok: true, kind: 'created', room: transactionResult.room, invite: transactionResult.invite };
  }
  return { ok: false, code: 'UNRECOVERABLE', message: 'Unable to release the previous room lock' };
}

type GuardedCreateRoomInput = {
  hostUid: string;
  hostDisplayName: string;
  title: string;
  rulesSnapshot?: Record<string, unknown>;
  memberCap?: number;
};

type LegacyCreateRoomInput = Omit<GuardedCreateRoomInput, 'hostDisplayName'>;

export function createRoom(input: GuardedCreateRoomInput): Promise<CreateRoomResult>;
export function createRoom(input: LegacyCreateRoomInput): Promise<Room>;
export async function createRoom(input: GuardedCreateRoomInput | LegacyCreateRoomInput): Promise<CreateRoomResult | Room> {
  const guarded = 'hostDisplayName' in input;
  const result = await createRoomResult({ ...input, hostDisplayName: guarded ? input.hostDisplayName : '' });
  if (guarded) return result;
  if (!result.ok) {
    throw new Error(result.code === 'RATE_LIMITED' ? `Room creation rate limited until ${result.retryAt}` : result.code);
  }
  return result.room;
}

export async function createInvite(roomId: string, hostUid: string): Promise<InvitePayload> {
  const [snapshot, configSnapshot] = await Promise.all([roomRef(roomId).get(), hostConfigRef(roomId).get()]);
  if (!snapshot.exists()) throw new Error('Room not found');
  const room = snapshot.data() as Room;
  if (room.hostUid !== hostUid) throw new Error('Only host can create an invite');
  const token = createToken();
  const expiresAt = Date.now() + 2 * 60 * 60 * 1000;
  const previousToken = (configSnapshot.data() as HostConfig | undefined)?.activeInviteToken;
  const batch = getFirestore().batch();
  batch.set(inviteRef(token), {
    roomId,
    createdByUid: hostUid,
    createdAt: Date.now(),
    expiresAt: firestore.Timestamp.fromMillis(expiresAt),
  } satisfies RoomInvite);
  batch.set(hostConfigRef(roomId), { activeInviteToken: token, updatedAt: Date.now() } satisfies HostConfig);
  if (previousToken) {
    batch.delete(inviteRef(previousToken));
  }
  await batch.commit();
  return invitePayload(roomId, token, expiresAt);
}

export async function getOrCreateActiveInvite(roomId: string, hostUid: string): Promise<InvitePayload> {
  const configSnapshot = await hostConfigRef(roomId).get();
  const token = (configSnapshot.data() as HostConfig | undefined)?.activeInviteToken;
  if (token) {
    const snapshot = await inviteRef(token).get();
    if (snapshot.exists()) {
      const invite = snapshot.data() as RoomInvite;
      if (invite.roomId === roomId && !inviteHasExpired(invite)) {
        return invitePayload(roomId, token, typeof invite.expiresAt === 'number'
          ? invite.expiresAt
          : invite.expiresAt.toMillis?.() ?? invite.expiresAt.milliseconds ?? 0);
      }
    }
  }
  return createInvite(roomId, hostUid);
}

export async function getRoomCreationRetryAt(uid: string): Promise<number | null> {
  const snapshot = await roomCreationGuardRef(uid).get();
  if (!snapshot.exists()) return null;
  const lastCreatedAt = timestampToMillis((snapshot.data() as RoomCreationGuard).lastCreatedAt);
  return lastCreatedAt === null ? null : lastCreatedAt + ROOM_CREATION_COOLDOWN_MS;
}

async function releaseHostedRoomGuard(uid: string, roomId: string): Promise<void> {
  await getFirestore().runTransaction(async (transaction) => {
    const reference = roomCreationGuardRef(uid);
    const snapshot = await transaction.get(reference);
    if (!snapshot.exists()) return;
    const guard = snapshot.data() as RoomCreationGuard;
    if (guard.activeRoomId !== roomId) return;
    transaction.update(reference, {
      activeRoomId: null,
      updatedAt: firestore.FieldValue.serverTimestamp(),
    });
  });
}

export async function recoverHostedRoom(uid: string, expectedRoomId?: string): Promise<HostedRoomRecoveryResult> {
  const guardSnapshot = await roomCreationGuardRef(uid).get();
  if (!guardSnapshot.exists()) {
    if (expectedRoomId) await clearActiveHostedRoomPointer({ uid, roomId: expectedRoomId });
    return { kind: 'none', retryAt: null };
  }
  const guard = guardSnapshot.data() as RoomCreationGuard;
  const retryAt = timestampToMillis(guard.lastCreatedAt);
  if (!guard.activeRoomId) {
    if (expectedRoomId) await clearActiveHostedRoomPointer({ uid, roomId: expectedRoomId });
    return { kind: 'none', retryAt: retryAt === null ? null : retryAt + ROOM_CREATION_COOLDOWN_MS };
  }
  const room = await getRoom(guard.activeRoomId);
  if (!room || room.status === 'ended' || room.status === 'archived') {
    await releaseHostedRoomGuard(uid, guard.activeRoomId);
    await clearActiveHostedRoomPointer({ uid, roomId: guard.activeRoomId });
    return { kind: 'none', retryAt: retryAt === null ? null : retryAt + ROOM_CREATION_COOLDOWN_MS };
  }
  await saveActiveHostedRoomPointer({ uid, roomId: room.roomId });
  if (room.status === 'cancelling') return { kind: 'cleaning', roomId: room.roomId };
  if (room.status === 'active') return { kind: 'active', room };
  return { kind: 'open', room, invite: await getOrCreateActiveInvite(room.roomId, uid) };
}

export async function joinWithInvite(roomId: string, token: string, uid: string): Promise<SubmitResult> {
  if (!token) return { ok: false, code: 'INVITE_EXPIRED', message: 'Invite expired or invalid' };

  const inviteSnapshot = await inviteRef(token).get();
  if (!inviteSnapshot.exists()) return { ok: false, code: 'INVITE_EXPIRED', message: 'Invite expired or invalid' };
  const invite = inviteSnapshot.data() as RoomInvite;
  if (invite.roomId !== roomId || inviteHasExpired(invite)) {
    return { ok: false, code: 'INVITE_EXPIRED', message: 'Invite expired or invalid' };
  }

  const memberRef = membersRef(roomId).doc(uid);
  const existingMember = await memberRef.get();
  if (!existingMember.exists()) {
    const profile = await getProfile(uid);
    const timestamp = Date.now();
    const batch = getFirestore().batch();
    // The ticket is private to this user and is atomically consumed with membership creation.
    // It lets Firestore rules validate the bearer token without storing it on the member document.
    const ticketRef = joinTicketsRef(roomId).doc(uid);
    await ticketRef.set({ uid, token, createdAt: timestamp });
    batch.set(memberRef, {
      uid, roomId, role: 'player', membershipStatus: 'active', joinedAt: timestamp,
      displayName: profile?.displayName ?? `Player-${uid.slice(-4)}`, avatarUrl: profile?.avatarUrl ?? null,
      archiveSyncedAt: null, archiveSyncedVersion: null,
    } satisfies RoomMember);
    batch.update(roomRef(roomId), {
      memberCount: firestore.FieldValue.increment(1),
      updatedAt: timestamp,
    });
    batch.delete(ticketRef);
    try {
      await batch.commit();
    } catch (error) {
      await ticketRef.delete().catch(() => {});
      const message = error instanceof Error ? error.message : String(error);
      if (/permission|full|expired|not-found/i.test(message)) {
        return { ok: false, code: 'INVITE_EXPIRED', message: 'Invite expired, invalid, or room is full' };
      }
      throw error;
    }
  }

  const room = await getRoom(roomId);
  if (!room) return { ok: false, code: 'ROOM_NOT_FOUND', message: 'Room not found' };
  return { ok: true, nextVersion: room.currentVersion, nextHandIndex: room.currentHandIndex };
}

export async function getRoom(roomId: string): Promise<Room | null> {
  const snapshot = await roomRef(roomId).get();
  return snapshot.exists() ? (snapshot.data() as Room) : null;
}

export async function listMembers(roomId: string): Promise<RoomMember[]> {
  const snapshot = await membersRef(roomId).orderBy('joinedAt').get();
  return snapshot.docs.map((doc) => doc.data() as RoomMember).filter((member) => member.membershipStatus === 'active');
}

export async function listTemporaryPlayers(roomId: string): Promise<RoomTemporaryPlayer[]> {
  const snapshot = await temporaryPlayersRef(roomId).orderBy('createdAt').get();
  return snapshot.docs.map((doc) => doc.data() as RoomTemporaryPlayer);
}

export async function listRoomPlayers(roomId: string, sessionUid = ''): Promise<ResolvedRoomPlayer[]> {
  const room = await getRoom(roomId);
  if (!room) return [];
  const [members, temporaryPlayers] = await Promise.all([listMembers(roomId), listTemporaryPlayers(roomId)]);
  return resolveRoomPlayers(room, members, temporaryPlayers, sessionUid);
}

export async function getActiveLineup(roomId: string): Promise<RoomLineup | null> {
  const room = await getRoom(roomId);
  if (!room || !room.activeLineupVersion) return null;
  const snapshot = await lineupsRef(roomId).doc(String(room.activeLineupVersion)).get();
  return snapshot.exists() ? normalizeLineup(snapshot.data() as RoomLineup) : null;
}

export async function getLineupByVersion(roomId: string, lineupVersion: number): Promise<RoomLineup | null> {
  if (!Number.isInteger(lineupVersion) || lineupVersion <= 0) return null;
  const snapshot = await lineupsRef(roomId).doc(String(lineupVersion)).get();
  return snapshot.exists() ? normalizeLineup(snapshot.data() as RoomLineup) : null;
}

export async function listLineups(roomId: string): Promise<RoomLineup[]> {
  const snapshot = await lineupsRef(roomId).orderBy('lineupVersion').get();
  return snapshot.docs.map((doc) => normalizeLineup(doc.data() as RoomLineup));
}

export async function addTemporaryPlayers(input: {
  roomId: string;
  createdByUid: string;
  displayNames: string[];
}): Promise<ResolvedRoomPlayer[]> {
  const displayNames = input.displayNames.map((displayName) => displayName.trim());
  if (!displayNames.length || displayNames.some((displayName) => !displayName)) {
    throw new Error('Temporary player name is required');
  }
  const temporaryPlayers = await listTemporaryPlayers(input.roomId);
  const timestamp = Date.now();
  const nextTemporaryPlayers = displayNames.map<RoomTemporaryPlayer>((displayName, index) => ({
    tempPlayerId: makeId('temp'),
    roomId: input.roomId,
    createdByUid: input.createdByUid,
    displayName,
    createdAt: timestamp + index,
    updatedAt: timestamp + index,
  }));
  await getFirestore().runTransaction(async (transaction) => {
    const current = await transaction.get(roomRef(input.roomId));
    if (!current.exists()) throw new Error('Room not found');
    const currentRoom = current.data() as Room;
    if (currentRoom.hostUid !== input.createdByUid) throw new Error('Only host can add temporary players');
    if (currentRoom.status !== 'open' && currentRoom.status !== 'active') throw new Error('Room already ended');
    const total = currentRoom.memberCount + temporaryPlayers.length + displayNames.length;
    if (total > currentRoom.memberCap) throw new Error('Room member cap reached');
    nextTemporaryPlayers.forEach((tempPlayer) => {
      transaction.set(temporaryPlayersRef(input.roomId).doc(tempPlayer.tempPlayerId), tempPlayer);
    });
    transaction.update(roomRef(input.roomId), { updatedAt: timestamp });
  });
  return nextTemporaryPlayers.map((tempPlayer) => ({
    playerId: tempPlayer.tempPlayerId,
    roomId: tempPlayer.roomId,
    kind: 'temporary',
    uid: null,
    displayName: tempPlayer.displayName,
    avatarUrl: null,
    isHost: false,
    isSelf: false,
    joinedAt: tempPlayer.createdAt,
  }));
}

export async function addTemporaryPlayer(input: {
  roomId: string;
  createdByUid: string;
  displayName: string;
}): Promise<ResolvedRoomPlayer> {
  const [player] = await addTemporaryPlayers({
    roomId: input.roomId,
    createdByUid: input.createdByUid,
    displayNames: [input.displayName],
  });
  return player;
}

async function writeLineup(input: StartRoomInput | LineupChangeInput, expectedStatus: 'open' | 'active'): Promise<SubmitResult> {
  const [members, temporaryPlayers] = await Promise.all([
    listMembers(input.roomId),
    listTemporaryPlayers(input.roomId),
  ]);
  const actorUid = 'startedByUid' in input ? input.startedByUid : input.createdByUid;
  return getFirestore().runTransaction(async (transaction) => {
    const snapshot = await transaction.get(roomRef(input.roomId));
    if (!snapshot.exists()) return { ok: false, code: 'ROOM_NOT_FOUND', message: 'Room not found' } as SubmitResult;
    const current = snapshot.data() as Room;
    if (current.hostUid !== actorUid) return { ok: false, code: 'LINEUP_CHANGE_WINDOW_CLOSED', message: 'Only host can change lineup' } as SubmitResult;
    if (current.currentVersion !== input.baseVersion) return { ok: false, code: 'VERSION_CONFLICT', message: 'Version conflict', latestVersion: current.currentVersion } as SubmitResult;
    if (current.status !== expectedStatus) return { ok: false, code: 'ROOM_NOT_OPEN', message: 'Room is not available for this change' } as SubmitResult;
    const players = resolveRoomPlayers(current, members, temporaryPlayers);
    const validation = validateSeatSelection(current, players, input.nextSeats);
    if (validation) return validation;
    const lineupVersion = current.activeLineupVersion + 1;
    const lineup: RoomLineup = { lineupId: `lineup_${lineupVersion}`, roomId: input.roomId, effectiveFromHandIndex: expectedStatus === 'open' ? current.currentHandIndex : current.currentHandIndex + 1, seats: { ...input.nextSeats }, createdByUid: actorUid, createdAt: Date.now(), baseVersion: input.baseVersion, lineupVersion };
    transaction.set(lineupsRef(input.roomId).doc(String(lineupVersion)), lineup);
    transaction.update(roomRef(input.roomId), { activeLineupVersion: lineupVersion, currentVersion: current.currentVersion + 1, status: 'active', updatedAt: Date.now() });
    return { ok: true, nextVersion: current.currentVersion + 1, nextHandIndex: current.currentHandIndex } as SubmitResult;
  });
}

export function startRoom(input: StartRoomInput): Promise<SubmitResult> { return writeLineup(input, 'open'); }
export function proposeLineupChange(input: LineupChangeInput): Promise<SubmitResult> { return writeLineup(input, 'active'); }

export async function mergeTemporaryPlayerIntoRealPlayer(input: { roomId: string; tempPlayerId: string; targetUid: string; mergedByUid: string }): Promise<SubmitResult> {
  const room = await getRoom(input.roomId);
  if (!room) return { ok: false, code: 'ROOM_NOT_FOUND', message: 'Room not found' };
  if (room.hostUid !== input.mergedByUid) return { ok: false, code: 'LINEUP_CHANGE_WINDOW_CLOSED', message: 'Only host can merge temporary players' };
  const [temporary, target] = await Promise.all([temporaryPlayersRef(input.roomId).doc(input.tempPlayerId).get(), membersRef(input.roomId).doc(input.targetUid).get()]);
  if (!temporary.exists() || !target.exists()) return { ok: false, code: 'INVALID_LINEUP', message: 'Cannot find temporary player or target member' };
  const batch = getFirestore().batch();
  const lineups = await listLineups(input.roomId);
  const hands = await handsRef(input.roomId).get();
  for (const lineup of lineups) {
    const seats = { ...lineup.seats };
    let changed = false;
    for (const key of SEAT_KEYS) if (seats[key] === input.tempPlayerId) { seats[key] = input.targetUid; changed = true; }
    if (changed) batch.update(lineupsRef(input.roomId).doc(String(lineup.lineupVersion)), { seats });
  }
  for (const hand of hands.docs) {
    const current = hand.data() as { winnerPlayerId?: string | null; discarderPlayerId?: string | null };
    const update: Record<string, string> = {};
    if (current.winnerPlayerId === input.tempPlayerId) update.winnerPlayerId = input.targetUid;
    if (current.discarderPlayerId === input.tempPlayerId) update.discarderPlayerId = input.targetUid;
    if (Object.keys(update).length) batch.update(hand.ref, update);
  }
  batch.delete(temporaryPlayersRef(input.roomId).doc(input.tempPlayerId));
  batch.update(roomRef(input.roomId), { updatedAt: Date.now() });
  await batch.commit();
  return { ok: true, nextVersion: room.currentVersion, nextHandIndex: room.currentHandIndex };
}

export async function deleteRoomAndFallbackToLocal(roomId: string, actorUid: string): Promise<void> {
  const markedRoom = await getFirestore().runTransaction(async (transaction) => {
    const reference = roomRef(roomId);
    const snapshot = await transaction.get(reference);
    if (!snapshot.exists()) return null;
    const room = snapshot.data() as Room;
    if (room.hostUid !== actorUid) throw new Error('Only host can remove room');
    if (room.status !== 'cancelling') {
      transaction.update(reference, { status: 'cancelling', updatedAt: Date.now() });
    }
    return { ...room, status: 'cancelling' as const };
  });
  if (!markedRoom) {
    await releaseHostedRoomGuard(actorUid, roomId);
    await clearActiveHostedRoomPointer({ uid: actorUid, roomId });
    return;
  }

  const hostConfig = await hostConfigRef(roomId).get();
  const activeInviteToken = (hostConfig.data() as HostConfig | undefined)?.activeInviteToken;
  if (activeInviteToken || hostConfig.exists()) {
    const revokeBatch = getFirestore().batch();
    if (activeInviteToken) revokeBatch.delete(inviteRef(activeInviteToken));
    if (hostConfig.exists()) {
      revokeBatch.update(hostConfig.ref, { activeInviteToken: null, updatedAt: Date.now() });
    }
    await revokeBatch.commit();
  }

  const [members, temporaryPlayers, lineups, hands, joinTickets] = await Promise.all([
    membersRef(roomId).get(),
    temporaryPlayersRef(roomId).get(),
    lineupsRef(roomId).get(),
    handsRef(roomId).get(),
    joinTicketsRef(roomId).get(),
  ]);
  const documentRefs = [
    ...temporaryPlayers.docs.map((doc) => doc.ref),
    ...lineups.docs.map((doc) => doc.ref),
    ...hands.docs.map((doc) => doc.ref),
    ...joinTickets.docs.map((doc) => doc.ref),
  ];
  for (let index = 0; index < documentRefs.length; index += DELETE_BATCH_SIZE) {
    const batch = getFirestore().batch();
    documentRefs.slice(index, index + DELETE_BATCH_SIZE).forEach((ref) => batch.delete(ref));
    await batch.commit();
  }
  const finalBatch = getFirestore().batch();
  members.docs.forEach((doc) => finalBatch.delete(doc.ref));
  const currentHostConfig = await hostConfigRef(roomId).get();
  if (currentHostConfig.exists()) finalBatch.delete(currentHostConfig.ref);
  const guardSnapshot = await roomCreationGuardRef(actorUid).get();
  if (guardSnapshot.exists() && (guardSnapshot.data() as RoomCreationGuard).activeRoomId === roomId) {
    finalBatch.update(roomCreationGuardRef(actorUid), {
      activeRoomId: null,
      updatedAt: firestore.FieldValue.serverTimestamp(),
    });
  }
  finalBatch.delete(roomRef(roomId));
  await finalBatch.commit();
  await clearActiveHostedRoomPointer({ uid: actorUid, roomId });
}

export async function endRoom(roomId: string, endedByUid: string): Promise<SubmitResult> {
  return getFirestore().runTransaction(async (transaction) => {
    const [roomSnapshot, memberSnapshot] = await Promise.all([transaction.get(roomRef(roomId)), transaction.get(membersRef(roomId).doc(endedByUid))]);
    if (!roomSnapshot.exists()) return { ok: false, code: 'ROOM_NOT_FOUND', message: 'Room not found' } as SubmitResult;
    const room = roomSnapshot.data() as Room;
    if (!memberSnapshot.exists() || (memberSnapshot.data() as RoomMember).membershipStatus !== 'active') return { ok: false, code: 'LINEUP_CHANGE_WINDOW_CLOSED', message: 'Only active members can end room' } as SubmitResult;
    if (room.status === 'ended' || room.status === 'archived') return { ok: true, nextVersion: room.currentVersion, nextHandIndex: room.currentHandIndex } as SubmitResult;
    transaction.update(roomRef(roomId), { status: 'ended', archiveReadyAt: Date.now(), archiveVersion: (room.archiveVersion ?? 0) + 1, updatedAt: Date.now() });
    return { ok: true, nextVersion: room.currentVersion, nextHandIndex: room.currentHandIndex } as SubmitResult;
  });
}

export async function markRoomArchived(roomId: string, archiveVersion: number): Promise<Room | null> {
  return getFirestore().runTransaction(async (transaction) => {
    const reference = roomRef(roomId);
    const snapshot = await transaction.get(reference);
    if (!snapshot.exists()) return null;

    const room = snapshot.data() as Room;
    if ((room.archiveVersion ?? 1) !== archiveVersion) {
      throw new Error('Archive version is no longer current');
    }
    if (room.status === 'archived') return room;
    if (room.status !== 'ended') throw new Error('Room is not ready to archive');

    const timestamp = Date.now();
    const next: Room = {
      ...room,
      status: 'archived',
      archiveReadyAt: room.archiveReadyAt ?? timestamp,
      archiveVersion,
      expiresAt: room.expiresAt ?? timestamp + ARCHIVE_RETENTION_MS,
      updatedAt: timestamp,
    };
    transaction.update(reference, {
      status: next.status,
      archiveReadyAt: next.archiveReadyAt,
      archiveVersion: next.archiveVersion,
      expiresAt: next.expiresAt,
      updatedAt: next.updatedAt,
    });
    return next;
  });
}

export async function markArchiveSynced(roomId: string, actorUid: string, archiveVersion: number): Promise<void> {
  await getFirestore().runTransaction(async (transaction) => {
    const [roomSnapshot, memberSnapshot] = await Promise.all([
      transaction.get(roomRef(roomId)),
      transaction.get(membersRef(roomId).doc(actorUid)),
    ]);
    if (!roomSnapshot.exists()) throw new Error('Room not found');
    if (!memberSnapshot.exists() || (memberSnapshot.data() as RoomMember).membershipStatus !== 'active') {
      throw new Error('Only active room members can confirm an archive');
    }
    const room = roomSnapshot.data() as Room;
    if (room.status !== 'ended' && room.status !== 'archived') throw new Error('Room is not ready to archive');
    if ((room.archiveVersion ?? 1) !== archiveVersion) throw new Error('Archive version is no longer current');
    transaction.update(membersRef(roomId).doc(actorUid), {
      archiveSyncedAt: Date.now(),
      archiveSyncedVersion: archiveVersion,
    });
  });
}

export function getArchiveSyncStatus(members: RoomMember[], archiveVersion: number): ArchiveSyncStatus {
  const pendingMembers = members.filter((member) => member.archiveSyncedVersion !== archiveVersion);
  return {
    requiredMemberCount: members.length,
    syncedMemberCount: members.length - pendingMembers.length,
    pendingMemberNames: pendingMembers.map((member) => member.displayName),
    isReadyForCloudDeletion: members.length > 0 && pendingMembers.length === 0,
  };
}

export async function deleteArchivedRoomAfterSync(roomId: string, actorUid: string): Promise<void> {
  const room = await getRoom(roomId);
  if (!room) return;
  if (room.hostUid !== actorUid) throw new Error('Only host can remove room');
  if (room.status !== 'archived') throw new Error('Room must be archived before cloud deletion');

  const syncStatus = getArchiveSyncStatus(await listMembers(roomId), room.archiveVersion ?? 1);
  if (!syncStatus.isReadyForCloudDeletion) {
    throw new Error(`Waiting for ${syncStatus.pendingMemberNames.join(', ')} to save the local archive`);
  }
  await deleteRoomAndFallbackToLocal(roomId, actorUid);
}

export function subscribeMembers(roomId: string, cb: (members: RoomMember[]) => void): () => void {
  return membersRef(roomId).orderBy('joinedAt').onSnapshot((snapshot) => cb((snapshot?.docs ?? []).map((doc) => doc.data() as RoomMember).filter((member) => member.membershipStatus === 'active')), () => cb([]));
}

export type RoomLiveState = {
  room: Room | null;
  players: ResolvedRoomPlayer[];
  lineup: RoomLineup | null;
};

export function subscribeRoomState(
  roomId: string,
  sessionUid: string,
  cb: (state: RoomLiveState) => void,
  onError?: (error: unknown) => void,
): () => void {
  let room: Room | null = null;
  let members: RoomMember[] = [];
  let temporary: RoomTemporaryPlayer[] = [];
  let lineup: RoomLineup | null = null;
  let activeLineupVersion = 0;
  let unsubscribeLineup: (() => void) | null = null;

  const publish = () => {
    cb({
      room,
      players: room ? resolveRoomPlayers(room, members, temporary, sessionUid) : [],
      lineup,
    });
  };

  const subscribeToLineup = (nextVersion: number) => {
    unsubscribeLineup?.();
    activeLineupVersion = nextVersion;
    if (!nextVersion) {
      lineup = null;
      publish();
      return;
    }
    unsubscribeLineup = lineupsRef(roomId).doc(String(nextVersion)).onSnapshot((snapshot) => {
      if (activeLineupVersion !== nextVersion) return;
      lineup = snapshot?.exists() ? normalizeLineup(snapshot.data() as RoomLineup) : null;
      publish();
    }, (error) => {
      if (activeLineupVersion !== nextVersion) return;
      onError?.(error);
    });
  };

  const unsubscribeRoom = roomRef(roomId).onSnapshot((snapshot) => {
    const nextRoom = snapshot?.exists() ? (snapshot.data() as Room) : null;
    room = nextRoom;
    const nextLineupVersion = nextRoom?.activeLineupVersion ?? 0;
    if (nextLineupVersion !== activeLineupVersion) {
      subscribeToLineup(nextLineupVersion);
      return;
    }
    publish();
  }, (error) => {
    onError?.(error);
  });
  const unsubscribeMembers = membersRef(roomId).onSnapshot((snapshot) => {
    members = (snapshot?.docs ?? []).map((doc) => doc.data() as RoomMember).filter((member) => member.membershipStatus === 'active');
    publish();
  }, (error) => {
    onError?.(error);
  });
  const unsubscribeTemporary = temporaryPlayersRef(roomId).onSnapshot((snapshot) => {
    temporary = (snapshot?.docs ?? []).map((doc) => doc.data() as RoomTemporaryPlayer);
    publish();
  }, (error) => {
    onError?.(error);
  });

  return () => {
    unsubscribeRoom();
    unsubscribeMembers();
    unsubscribeTemporary();
    unsubscribeLineup?.();
  };
}

export function subscribeRoomPlayers(roomId: string, sessionUid: string, cb: (players: ResolvedRoomPlayer[]) => void): () => void {
  let room: Room | null = null;
  let members: RoomMember[] = [];
  let temporary: RoomTemporaryPlayer[] = [];
  const publish = () => cb(room ? resolveRoomPlayers(room, members, temporary, sessionUid) : []);
  const unsubscribers = [
    roomRef(roomId).onSnapshot((snapshot) => { room = snapshot?.exists() ? (snapshot.data() as Room) : null; publish(); }, () => { room = null; publish(); }),
    membersRef(roomId).onSnapshot((snapshot) => { members = (snapshot?.docs ?? []).map((doc) => doc.data() as RoomMember).filter((member) => member.membershipStatus === 'active'); publish(); }, () => { members = []; publish(); }),
    temporaryPlayersRef(roomId).onSnapshot((snapshot) => { temporary = (snapshot?.docs ?? []).map((doc) => doc.data() as RoomTemporaryPlayer); publish(); }, () => { temporary = []; publish(); }),
  ];
  return () => unsubscribers.forEach((unsubscribe) => unsubscribe());
}

export function getDefaultStartSeats(players: ResolvedRoomPlayer[]): Record<SeatKey, RoomPlayerId> | null {
  if (players.length < 4) return null;
  return { '0': players[0].playerId, '1': players[1].playerId, '2': players[2].playerId, '3': players[3].playerId };
}

export function getBenchPlayers(players: ResolvedRoomPlayer[], lineup: RoomLineup | null): ResolvedRoomPlayer[] {
  const active = new Set(seatIds(lineup));
  return players.filter((player) => !active.has(player.playerId));
}
