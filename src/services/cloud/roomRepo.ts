import {
  ArchiveSyncStatus,
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
import { createToken, hashToken, makeId } from './storage';
import { getFirestore } from '../firebase/firebase';

export type InvitePayload = { roomId: string; token: string; expiresAt: number; deepLink: string };

const MEMBER_CAP = 8;
const ARCHIVE_RETENTION_MS = 48 * 60 * 60 * 1000;
const DELETE_BATCH_SIZE = 450;
const SEAT_KEYS: SeatKey[] = ['0', '1', '2', '3'];
const rooms = () => getFirestore().collection('rooms');
const roomRef = (roomId: string) => rooms().doc(roomId);
const membersRef = (roomId: string) => roomRef(roomId).collection('members');
const temporaryPlayersRef = (roomId: string) => roomRef(roomId).collection('tempPlayers');
const lineupsRef = (roomId: string) => roomRef(roomId).collection('lineups');
const handsRef = (roomId: string) => roomRef(roomId).collection('hands');

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
  if (room.status === 'ended' || room.status === 'archived') return { ok: false, code: 'ROOM_ENDED', message: 'Room is already ended' };
  return null;
}

export async function createRoom(input: { hostUid: string; title: string; rulesSnapshot?: Record<string, unknown>; memberCap?: number }): Promise<Room> {
  const timestamp = Date.now();
  const roomId = makeId('room');
  const room: Room = {
    roomId, title: input.title.trim() || '未命名牌局', hostUid: input.hostUid, status: 'open', maxSeats: 4,
    memberCap: Math.max(4, Math.min(input.memberCap ?? MEMBER_CAP, MEMBER_CAP)), currentVersion: 1, currentHandIndex: 0,
    activeLineupVersion: 0, inviteTokenHash: '', inviteExpiresAt: timestamp, rulesSnapshot: input.rulesSnapshot ?? {},
    archiveReadyAt: null, expiresAt: null, archiveVersion: null, createdAt: timestamp, updatedAt: timestamp,
  };
  const profile = await getProfile(input.hostUid);
  const member: RoomMember = {
    uid: input.hostUid, roomId, role: 'host', membershipStatus: 'active', joinedAt: timestamp,
    displayName: profile?.displayName ?? `Player-${input.hostUid.slice(-4)}`, avatarUrl: profile?.avatarUrl ?? null,
    archiveSyncedAt: null, archiveSyncedVersion: null,
  };
  const batch = getFirestore().batch();
  batch.set(roomRef(roomId), room);
  batch.set(membersRef(roomId).doc(member.uid), member);
  await batch.commit();
  return room;
}

export async function createInvite(roomId: string): Promise<InvitePayload> {
  const ref = roomRef(roomId);
  const snapshot = await ref.get();
  if (!snapshot.exists()) throw new Error('Room not found');
  const token = createToken();
  const expiresAt = Date.now() + 2 * 60 * 60 * 1000;
  await ref.update({ inviteTokenHash: hashToken(token), inviteExpiresAt: expiresAt, updatedAt: Date.now() });
  return { roomId, token, expiresAt, deepLink: `mahjongfan://join?roomId=${encodeURIComponent(roomId)}&token=${encodeURIComponent(token)}` };
}

export async function joinWithInvite(roomId: string, token: string, uid: string): Promise<SubmitResult> {
  const ref = roomRef(roomId);
  const result = await getFirestore().runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists()) return { ok: false, code: 'INVITE_EXPIRED', message: 'Room not found' } as SubmitResult;
    const room = snapshot.data() as Room;
    if (room.status === 'ended' || room.status === 'archived') return { ok: false, code: 'ROOM_ENDED', message: 'Room already ended' } as SubmitResult;
    if (!token || hashToken(token) !== room.inviteTokenHash || Date.now() > room.inviteExpiresAt) return { ok: false, code: 'INVITE_EXPIRED', message: 'Invite expired or invalid' } as SubmitResult;
    const memberRef = membersRef(roomId).doc(uid);
    const member = await transaction.get(memberRef);
    if (member.exists()) return { ok: true, nextVersion: room.currentVersion, nextHandIndex: room.currentHandIndex } as SubmitResult;
    const [members, temporary] = await Promise.all([membersRef(roomId).get(), temporaryPlayersRef(roomId).get()]);
    if (members.docs.filter((doc) => (doc.data() as RoomMember).membershipStatus === 'active').length + temporary.size >= room.memberCap) return { ok: false, code: 'ROOM_FULL', message: 'Room member cap reached' } as SubmitResult;
    const profile = await getProfile(uid);
    transaction.set(memberRef, {
      uid, roomId, role: 'player', membershipStatus: 'active', joinedAt: Date.now(),
      displayName: profile?.displayName ?? `Player-${uid.slice(-4)}`, avatarUrl: profile?.avatarUrl ?? null,
      archiveSyncedAt: null, archiveSyncedVersion: null,
    } satisfies RoomMember);
    return { ok: true, nextVersion: room.currentVersion, nextHandIndex: room.currentHandIndex } as SubmitResult;
  });
  return result;
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

export async function listLineups(roomId: string): Promise<RoomLineup[]> {
  const snapshot = await lineupsRef(roomId).orderBy('lineupVersion').get();
  return snapshot.docs.map((doc) => normalizeLineup(doc.data() as RoomLineup));
}

export async function addTemporaryPlayer(input: { roomId: string; createdByUid: string; displayName: string }): Promise<ResolvedRoomPlayer> {
  const room = await getRoom(input.roomId);
  if (!room) throw new Error('Room not found');
  if (room.hostUid !== input.createdByUid) throw new Error('Only host can add temporary players');
  if (room.status === 'ended' || room.status === 'archived') throw new Error('Room already ended');
  const displayName = input.displayName.trim();
  if (!displayName) throw new Error('Temporary player name is required');
  const total = (await listRoomPlayers(input.roomId)).length;
  if (total >= room.memberCap) throw new Error('Room member cap reached');
  const timestamp = Date.now();
  const tempPlayer: RoomTemporaryPlayer = { tempPlayerId: makeId('temp'), roomId: input.roomId, createdByUid: input.createdByUid, displayName, createdAt: timestamp, updatedAt: timestamp };
  await getFirestore().runTransaction(async (transaction) => {
    const current = await transaction.get(roomRef(input.roomId));
    if (!current.exists()) throw new Error('Room not found');
    transaction.set(temporaryPlayersRef(input.roomId).doc(tempPlayer.tempPlayerId), tempPlayer);
    transaction.update(roomRef(input.roomId), { updatedAt: timestamp });
  });
  return { playerId: tempPlayer.tempPlayerId, roomId: tempPlayer.roomId, kind: 'temporary', uid: null, displayName, avatarUrl: null, isHost: false, isSelf: false, joinedAt: timestamp };
}

async function writeLineup(input: StartRoomInput | LineupChangeInput, expectedStatus: 'open' | 'active'): Promise<SubmitResult> {
  const players = await listRoomPlayers(input.roomId);
  const room = await getRoom(input.roomId);
  if (!room) return { ok: false, code: 'ROOM_NOT_FOUND', message: 'Room not found' };
  if (room.hostUid !== ('startedByUid' in input ? input.startedByUid : input.createdByUid)) return { ok: false, code: 'LINEUP_CHANGE_WINDOW_CLOSED', message: 'Only host can change lineup' };
  if (room.status !== expectedStatus) return { ok: false, code: 'ROOM_NOT_OPEN', message: 'Room is not available for this change' };
  const validation = validateSeatSelection(room, players, input.nextSeats);
  if (validation) return validation;
  const actorUid = 'startedByUid' in input ? input.startedByUid : input.createdByUid;
  return getFirestore().runTransaction(async (transaction) => {
    const snapshot = await transaction.get(roomRef(input.roomId));
    if (!snapshot.exists()) return { ok: false, code: 'ROOM_NOT_FOUND', message: 'Room not found' } as SubmitResult;
    const current = snapshot.data() as Room;
    if (current.currentVersion !== input.baseVersion) return { ok: false, code: 'VERSION_CONFLICT', message: 'Version conflict', latestVersion: current.currentVersion } as SubmitResult;
    if (current.status !== expectedStatus) return { ok: false, code: 'ROOM_NOT_OPEN', message: 'Room is not available for this change' } as SubmitResult;
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
  const room = await getRoom(roomId);
  if (!room || room.hostUid !== actorUid) {
    if (room) throw new Error('Only host can remove room');
    return;
  }
  const [members, temporaryPlayers, lineups, hands] = await Promise.all([
    membersRef(roomId).get(),
    temporaryPlayersRef(roomId).get(),
    lineupsRef(roomId).get(),
    handsRef(roomId).get(),
  ]);
  const documents = [...members.docs, ...temporaryPlayers.docs, ...lineups.docs, ...hands.docs];
  for (let index = 0; index < documents.length; index += DELETE_BATCH_SIZE) {
    const batch = getFirestore().batch();
    documents.slice(index, index + DELETE_BATCH_SIZE).forEach((doc) => batch.delete(doc.ref));
    await batch.commit();
  }
  await roomRef(roomId).delete();
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
  const room = await getRoom(roomId);
  if (!room) return null;
  const next = { ...room, status: 'archived' as const, archiveReadyAt: room.archiveReadyAt ?? Date.now(), archiveVersion, expiresAt: room.expiresAt ?? Date.now() + ARCHIVE_RETENTION_MS, updatedAt: Date.now() };
  await roomRef(roomId).set(next);
  return next;
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
export async function cleanupExpiredArchivedRooms(): Promise<void> {}

export function subscribeMembers(roomId: string, cb: (members: RoomMember[]) => void): () => void {
  return membersRef(roomId).orderBy('joinedAt').onSnapshot((snapshot) => cb(snapshot.docs.map((doc) => doc.data() as RoomMember).filter((member) => member.membershipStatus === 'active')), () => cb([]));
}

export function subscribeRoom(roomId: string, cb: (room: Room | null) => void): () => void {
  return roomRef(roomId).onSnapshot((snapshot) => cb(snapshot.exists() ? (snapshot.data() as Room) : null), () => cb(null));
}

export function subscribeActiveLineup(roomId: string, cb: (lineup: RoomLineup | null) => void): () => void {
  return roomRef(roomId).onSnapshot((roomSnapshot) => {
    const room = roomSnapshot.exists() ? (roomSnapshot.data() as Room) : null;
    if (!room?.activeLineupVersion) { cb(null); return; }
    lineupsRef(roomId).doc(String(room.activeLineupVersion)).get().then((snapshot) => cb(snapshot.exists() ? normalizeLineup(snapshot.data() as RoomLineup) : null)).catch(() => cb(null));
  }, () => cb(null));
}

export function subscribeRoomPlayers(roomId: string, sessionUid: string, cb: (players: ResolvedRoomPlayer[]) => void): () => void {
  let room: Room | null = null;
  let members: RoomMember[] = [];
  let temporary: RoomTemporaryPlayer[] = [];
  const publish = () => cb(room ? resolveRoomPlayers(room, members, temporary, sessionUid) : []);
  const unsubscribers = [
    roomRef(roomId).onSnapshot((snapshot) => { room = snapshot.exists() ? (snapshot.data() as Room) : null; publish(); }),
    membersRef(roomId).onSnapshot((snapshot) => { members = snapshot.docs.map((doc) => doc.data() as RoomMember).filter((member) => member.membershipStatus === 'active'); publish(); }),
    temporaryPlayersRef(roomId).onSnapshot((snapshot) => { temporary = snapshot.docs.map((doc) => doc.data() as RoomTemporaryPlayer); publish(); }),
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
