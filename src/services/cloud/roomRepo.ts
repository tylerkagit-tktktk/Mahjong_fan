import {
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
import { createToken, hashToken, loadSnapshot, makeId, now, saveSnapshot } from './storage';

export type InvitePayload = {
  roomId: string;
  token: string;
  expiresAt: number;
  deepLink: string;
};

const POLL_MS = 1200;
const ARCHIVE_RETENTION_MS = 48 * 60 * 60 * 1000;
const MEMBER_CAP = 8;
const SEAT_KEYS: SeatKey[] = ['0', '1', '2', '3'];

export function isTemporaryPlayerId(playerId: string | null | undefined): playerId is string {
  return typeof playerId === 'string' && playerId.startsWith('temp_');
}

function seatIds(lineup: RoomLineup | null): RoomPlayerId[] {
  if (!lineup) {
    return [];
  }
  return SEAT_KEYS.map((seatKey) => lineup.seats[seatKey]).filter((value): value is string => Boolean(value));
}

function findLatestLineup(roomId: string, lineups: RoomLineup[]): RoomLineup | null {
  const filtered = lineups.filter((lineup) => lineup.roomId === roomId);
  if (!filtered.length) {
    return null;
  }
  filtered.sort((a, b) => b.lineupVersion - a.lineupVersion);
  return filtered[0];
}

function normalizeLineup(raw: RoomLineup): RoomLineup {
  return {
    ...raw,
    seats: {
      '0': raw.seats['0'] ?? null,
      '1': raw.seats['1'] ?? null,
      '2': raw.seats['2'] ?? null,
      '3': raw.seats['3'] ?? null,
    },
  };
}

function resolveRoomPlayers(room: Room, members: RoomMember[], tempPlayers: RoomTemporaryPlayer[], sessionUid?: string): ResolvedRoomPlayer[] {
  const realPlayers = members
    .filter((member) => member.roomId === room.roomId && member.membershipStatus === 'active')
    .map<ResolvedRoomPlayer>((member) => ({
      playerId: member.uid,
      roomId: member.roomId,
      kind: 'member',
      uid: member.uid,
      displayName: member.displayName,
      avatarUrl: member.avatarUrl,
      isHost: member.uid === room.hostUid,
      isSelf: member.uid === sessionUid,
      joinedAt: member.joinedAt,
    }));

  const temporaryPlayers = tempPlayers
    .filter((player) => player.roomId === room.roomId)
    .map<ResolvedRoomPlayer>((player) => ({
      playerId: player.tempPlayerId,
      roomId: player.roomId,
      kind: 'temporary',
      uid: null,
      displayName: player.displayName,
      avatarUrl: null,
      isHost: false,
      isSelf: false,
      joinedAt: player.createdAt,
    }));

  return [...realPlayers, ...temporaryPlayers].sort((a, b) => a.joinedAt - b.joinedAt);
}

async function purgeExpiredArchivedRoomsInSnapshot(): Promise<void> {
  const snapshot = await loadSnapshot();
  const expiredRoomIds = snapshot.rooms
    .filter((room) => room.status === 'archived' && typeof room.expiresAt === 'number' && room.expiresAt <= now())
    .map((room) => room.roomId);

  if (expiredRoomIds.length === 0) {
    return;
  }

  const expiredSet = new Set(expiredRoomIds);
  snapshot.hands = snapshot.hands.filter((hand) => !expiredSet.has(hand.roomId));
  snapshot.lineups = snapshot.lineups.filter((lineup) => !expiredSet.has(lineup.roomId));
  snapshot.members = snapshot.members.filter((member) => !expiredSet.has(member.roomId));
  snapshot.tempPlayers = snapshot.tempPlayers.filter((player) => !expiredSet.has(player.roomId));
  snapshot.archiveSyncs = snapshot.archiveSyncs.filter((entry) => !expiredSet.has(entry.roomId));
  snapshot.rooms = snapshot.rooms.filter((room) => !expiredSet.has(room.roomId));
  await saveSnapshot(snapshot);
}

function buildSeatRecord(nextSeatIds: RoomPlayerId[]): Record<SeatKey, RoomPlayerId> {
  return {
    '0': nextSeatIds[0],
    '1': nextSeatIds[1],
    '2': nextSeatIds[2],
    '3': nextSeatIds[3],
  };
}

function validateSeatSelection(
  room: Room,
  roomPlayers: ResolvedRoomPlayer[],
  nextSeats: Record<SeatKey, RoomPlayerId>,
): SubmitResult | null {
  const playerIds = SEAT_KEYS.map((seatKey) => nextSeats[seatKey]);
  if (playerIds.some((value) => !value)) {
    return { ok: false, code: 'INVALID_LINEUP', message: 'All four seats must be filled' };
  }

  const unique = new Set(playerIds);
  if (unique.size !== 4) {
    return { ok: false, code: 'INVALID_LINEUP', message: 'Duplicate players in seats' };
  }

  const validIds = new Set(roomPlayers.map((player) => player.playerId));
  for (const playerId of unique) {
    if (!validIds.has(playerId)) {
      return { ok: false, code: 'INVALID_LINEUP', message: 'Seat contains non-room player' };
    }
  }

  const realPlayersOnSeats = playerIds.filter((playerId) => !isTemporaryPlayerId(playerId));
  if (realPlayersOnSeats.length < 2) {
    return { ok: false, code: 'NEED_MORE_REAL_PLAYERS', message: 'Need at least two real players to start online room' };
  }

  if (room.status === 'ended' || room.status === 'archived') {
    return { ok: false, code: 'ROOM_ENDED', message: 'Room is already ended' };
  }

  return null;
}

export async function createRoom(input: {
  hostUid: string;
  title: string;
  rulesSnapshot?: Record<string, unknown>;
  memberCap?: number;
}): Promise<Room> {
  await purgeExpiredArchivedRoomsInSnapshot();
  const snapshot = await loadSnapshot();
  const roomId = makeId('room');
  const ts = now();
  const room: Room = {
    roomId,
    title: input.title.trim() || '未命名牌局',
    hostUid: input.hostUid,
    status: 'open',
    maxSeats: 4,
    memberCap: Math.max(4, Math.min(input.memberCap ?? MEMBER_CAP, MEMBER_CAP)),
    currentVersion: 1,
    currentHandIndex: 0,
    activeLineupVersion: 0,
    inviteTokenHash: '',
    inviteExpiresAt: ts,
    rulesSnapshot: input.rulesSnapshot ?? {},
    archiveReadyAt: null,
    expiresAt: null,
    archiveVersion: null,
    createdAt: ts,
    updatedAt: ts,
  };

  const hostProfile = await getProfile(input.hostUid);
  const member: RoomMember = {
    uid: input.hostUid,
    roomId,
    role: 'host',
    membershipStatus: 'active',
    joinedAt: ts,
    displayName: hostProfile?.displayName ?? 'Host',
    avatarUrl: hostProfile?.avatarUrl ?? null,
  };

  snapshot.rooms.push(room);
  snapshot.members.push(member);
  await saveSnapshot(snapshot);
  return room;
}

export async function createInvite(roomId: string): Promise<InvitePayload> {
  await purgeExpiredArchivedRoomsInSnapshot();
  const snapshot = await loadSnapshot();
  const room = snapshot.rooms.find((entry) => entry.roomId === roomId);
  if (!room) {
    throw new Error('Room not found');
  }
  const token = createToken();
  const expiresAt = now() + 2 * 60 * 60 * 1000;
  room.inviteTokenHash = hashToken(token);
  room.inviteExpiresAt = expiresAt;
  room.updatedAt = now();
  await saveSnapshot(snapshot);
  return {
    roomId,
    token,
    expiresAt,
    deepLink: `mahjongfan://join?roomId=${encodeURIComponent(roomId)}&token=${encodeURIComponent(token)}`,
  };
}

export async function joinWithInvite(roomId: string, token: string, uid: string): Promise<SubmitResult> {
  await purgeExpiredArchivedRoomsInSnapshot();
  const snapshot = await loadSnapshot();
  const room = snapshot.rooms.find((entry) => entry.roomId === roomId);
  if (!room) {
    return { ok: false, code: 'INVITE_EXPIRED', message: 'Room not found' };
  }
  if (room.status === 'ended' || room.status === 'archived') {
    return { ok: false, code: 'ROOM_ENDED', message: 'Room already ended' };
  }
  if (!token || hashToken(token) !== room.inviteTokenHash || now() > room.inviteExpiresAt) {
    return { ok: false, code: 'INVITE_EXPIRED', message: 'Invite expired or invalid' };
  }

  const activeMembers = snapshot.members.filter((member) => member.roomId === roomId && member.membershipStatus === 'active');
  const existing = activeMembers.find((member) => member.uid === uid);
  if (existing) {
    return { ok: true, nextVersion: room.currentVersion, nextHandIndex: room.currentHandIndex };
  }

  const totalPlayers = activeMembers.length + snapshot.tempPlayers.filter((player) => player.roomId === roomId).length;
  if (totalPlayers >= room.memberCap) {
    return { ok: false, code: 'ROOM_FULL', message: 'Room member cap reached' };
  }

  const profile = await getProfile(uid);
  snapshot.members.push({
    uid,
    roomId,
    role: 'player',
    membershipStatus: 'active',
    joinedAt: now(),
    displayName: profile?.displayName ?? `Player-${uid.slice(-4)}`,
    avatarUrl: profile?.avatarUrl ?? null,
  });

  room.updatedAt = now();
  await saveSnapshot(snapshot);
  return { ok: true, nextVersion: room.currentVersion, nextHandIndex: room.currentHandIndex };
}

export async function getRoom(roomId: string): Promise<Room | null> {
  await purgeExpiredArchivedRoomsInSnapshot();
  const snapshot = await loadSnapshot();
  return snapshot.rooms.find((entry) => entry.roomId === roomId) ?? null;
}

export async function listMembers(roomId: string): Promise<RoomMember[]> {
  await purgeExpiredArchivedRoomsInSnapshot();
  const snapshot = await loadSnapshot();
  return snapshot.members
    .filter((member) => member.roomId === roomId && member.membershipStatus === 'active')
    .sort((a, b) => a.joinedAt - b.joinedAt);
}

export async function listTemporaryPlayers(roomId: string): Promise<RoomTemporaryPlayer[]> {
  await purgeExpiredArchivedRoomsInSnapshot();
  const snapshot = await loadSnapshot();
  return snapshot.tempPlayers.filter((player) => player.roomId === roomId).sort((a, b) => a.createdAt - b.createdAt);
}

export async function listRoomPlayers(roomId: string, sessionUid = ''): Promise<ResolvedRoomPlayer[]> {
  await purgeExpiredArchivedRoomsInSnapshot();
  const snapshot = await loadSnapshot();
  const room = snapshot.rooms.find((entry) => entry.roomId === roomId);
  if (!room) {
    return [];
  }
  return resolveRoomPlayers(room, snapshot.members, snapshot.tempPlayers, sessionUid);
}

export async function getActiveLineup(roomId: string): Promise<RoomLineup | null> {
  await purgeExpiredArchivedRoomsInSnapshot();
  const snapshot = await loadSnapshot();
  const latest = findLatestLineup(roomId, snapshot.lineups);
  return latest ? normalizeLineup(latest) : null;
}

export async function listLineups(roomId: string): Promise<RoomLineup[]> {
  await purgeExpiredArchivedRoomsInSnapshot();
  const snapshot = await loadSnapshot();
  return snapshot.lineups
    .filter((lineup) => lineup.roomId === roomId)
    .sort((a, b) => a.lineupVersion - b.lineupVersion)
    .map(normalizeLineup);
}

export async function addTemporaryPlayer(input: {
  roomId: string;
  createdByUid: string;
  displayName: string;
}): Promise<ResolvedRoomPlayer> {
  await purgeExpiredArchivedRoomsInSnapshot();
  const snapshot = await loadSnapshot();
  const room = snapshot.rooms.find((entry) => entry.roomId === input.roomId);
  if (!room) {
    throw new Error('Room not found');
  }
  if (room.hostUid !== input.createdByUid) {
    throw new Error('Only host can add temporary players');
  }
  if (room.status === 'ended' || room.status === 'archived') {
    throw new Error('Room already ended');
  }

  const totalPlayers =
    snapshot.members.filter((member) => member.roomId === room.roomId && member.membershipStatus === 'active').length +
    snapshot.tempPlayers.filter((player) => player.roomId === room.roomId).length;
  if (totalPlayers >= room.memberCap) {
    throw new Error('Room member cap reached');
  }

  const displayName = input.displayName.trim();
  if (!displayName) {
    throw new Error('Temporary player name is required');
  }

  const tempPlayer: RoomTemporaryPlayer = {
    tempPlayerId: makeId('temp'),
    roomId: room.roomId,
    createdByUid: input.createdByUid,
    displayName,
    createdAt: now(),
    updatedAt: now(),
  };

  snapshot.tempPlayers.push(tempPlayer);
  room.updatedAt = now();
  await saveSnapshot(snapshot);

  return {
    playerId: tempPlayer.tempPlayerId,
    roomId: tempPlayer.roomId,
    kind: 'temporary',
    uid: null,
    displayName: tempPlayer.displayName,
    avatarUrl: null,
    isHost: false,
    isSelf: false,
    joinedAt: tempPlayer.createdAt,
  };
}

export async function startRoom(input: StartRoomInput): Promise<SubmitResult> {
  await purgeExpiredArchivedRoomsInSnapshot();
  const snapshot = await loadSnapshot();
  const room = snapshot.rooms.find((entry) => entry.roomId === input.roomId);
  if (!room) {
    return { ok: false, code: 'ROOM_NOT_FOUND', message: 'Room not found' };
  }
  if (room.hostUid !== input.startedByUid) {
    return { ok: false, code: 'ROOM_NOT_OPEN', message: 'Only host can start room' };
  }
  if (room.status !== 'open') {
    return { ok: false, code: 'ROOM_NOT_OPEN', message: 'Room already started' };
  }
  if (input.baseVersion !== room.currentVersion) {
    return {
      ok: false,
      code: 'VERSION_CONFLICT',
      message: 'Version conflict',
      latestVersion: room.currentVersion,
    };
  }

  const roomPlayers = resolveRoomPlayers(room, snapshot.members, snapshot.tempPlayers);
  const validation = validateSeatSelection(room, roomPlayers, input.nextSeats);
  if (validation) {
    return validation;
  }

  const nextLineupVersion = room.activeLineupVersion + 1;
  snapshot.lineups.push({
    lineupId: makeId('lineup'),
    roomId: room.roomId,
    effectiveFromHandIndex: room.currentHandIndex,
    seats: {
      '0': input.nextSeats['0'],
      '1': input.nextSeats['1'],
      '2': input.nextSeats['2'],
      '3': input.nextSeats['3'],
    },
    createdByUid: input.startedByUid,
    createdAt: now(),
    baseVersion: input.baseVersion,
    lineupVersion: nextLineupVersion,
  });

  room.activeLineupVersion = nextLineupVersion;
  room.currentVersion += 1;
  room.status = 'active';
  room.updatedAt = now();
  await saveSnapshot(snapshot);
  return {
    ok: true,
    nextVersion: room.currentVersion,
    nextHandIndex: room.currentHandIndex,
  };
}

export async function proposeLineupChange(input: LineupChangeInput): Promise<SubmitResult> {
  await purgeExpiredArchivedRoomsInSnapshot();
  const snapshot = await loadSnapshot();
  const room = snapshot.rooms.find((entry) => entry.roomId === input.roomId);
  if (!room) {
    return { ok: false, code: 'ROOM_NOT_FOUND', message: 'Room not found' };
  }
  if (room.hostUid !== input.createdByUid) {
    return { ok: false, code: 'LINEUP_CHANGE_WINDOW_CLOSED', message: 'Only host can change lineup' };
  }
  if (room.status !== 'active') {
    return { ok: false, code: 'ROOM_NOT_OPEN', message: 'Room is not active' };
  }
  if (input.baseVersion !== room.currentVersion) {
    return {
      ok: false,
      code: 'VERSION_CONFLICT',
      message: 'Version conflict',
      latestVersion: room.currentVersion,
    };
  }

  const roomPlayers = resolveRoomPlayers(room, snapshot.members, snapshot.tempPlayers);
  const validation = validateSeatSelection(room, roomPlayers, input.nextSeats);
  if (validation) {
    return validation;
  }

  const nextLineupVersion = room.activeLineupVersion + 1;
  snapshot.lineups.push({
    lineupId: makeId('lineup'),
    roomId: room.roomId,
    effectiveFromHandIndex: room.currentHandIndex + 1,
    seats: {
      '0': input.nextSeats['0'],
      '1': input.nextSeats['1'],
      '2': input.nextSeats['2'],
      '3': input.nextSeats['3'],
    },
    createdByUid: input.createdByUid,
    createdAt: now(),
    baseVersion: input.baseVersion,
    lineupVersion: nextLineupVersion,
  });

  room.activeLineupVersion = nextLineupVersion;
  room.currentVersion += 1;
  room.updatedAt = now();
  await saveSnapshot(snapshot);
  return {
    ok: true,
    nextVersion: room.currentVersion,
    nextHandIndex: room.currentHandIndex,
  };
}

export async function mergeTemporaryPlayerIntoRealPlayer(input: {
  roomId: string;
  tempPlayerId: string;
  targetUid: string;
  mergedByUid: string;
}): Promise<SubmitResult> {
  await purgeExpiredArchivedRoomsInSnapshot();
  const snapshot = await loadSnapshot();
  const room = snapshot.rooms.find((entry) => entry.roomId === input.roomId);
  if (!room) {
    return { ok: false, code: 'ROOM_NOT_FOUND', message: 'Room not found' };
  }
  if (room.hostUid !== input.mergedByUid) {
    return { ok: false, code: 'LINEUP_CHANGE_WINDOW_CLOSED', message: 'Only host can merge temporary players' };
  }
  const tempPlayer = snapshot.tempPlayers.find(
    (player) => player.roomId === input.roomId && player.tempPlayerId === input.tempPlayerId,
  );
  const targetMember = snapshot.members.find(
    (member) => member.roomId === input.roomId && member.uid === input.targetUid && member.membershipStatus === 'active',
  );
  if (!tempPlayer || !targetMember) {
    return { ok: false, code: 'INVALID_LINEUP', message: 'Cannot find temporary player or target member' };
  }

  for (const lineup of snapshot.lineups) {
    if (lineup.roomId !== input.roomId) {
      continue;
    }
    for (const seatKey of SEAT_KEYS) {
      if (lineup.seats[seatKey] === input.tempPlayerId) {
        lineup.seats[seatKey] = input.targetUid;
      }
    }
  }

  for (const hand of snapshot.hands) {
    if (hand.roomId !== input.roomId) {
      continue;
    }
    if (hand.winnerPlayerId === input.tempPlayerId) {
      hand.winnerPlayerId = input.targetUid;
    }
    if (hand.discarderPlayerId === input.tempPlayerId) {
      hand.discarderPlayerId = input.targetUid;
    }
  }

  snapshot.tempPlayers = snapshot.tempPlayers.filter((player) => player.tempPlayerId !== input.tempPlayerId);
  room.updatedAt = now();
  await saveSnapshot(snapshot);
  return { ok: true, nextVersion: room.currentVersion, nextHandIndex: room.currentHandIndex };
}

export async function deleteRoomAndFallbackToLocal(roomId: string, actorUid: string): Promise<void> {
  await purgeExpiredArchivedRoomsInSnapshot();
  const snapshot = await loadSnapshot();
  const room = snapshot.rooms.find((entry) => entry.roomId === roomId);
  if (!room) {
    return;
  }
  if (room.hostUid !== actorUid) {
    throw new Error('Only host can remove room');
  }

  snapshot.hands = snapshot.hands.filter((hand) => hand.roomId !== roomId);
  snapshot.lineups = snapshot.lineups.filter((lineup) => lineup.roomId !== roomId);
  snapshot.members = snapshot.members.filter((member) => member.roomId !== roomId);
  snapshot.tempPlayers = snapshot.tempPlayers.filter((player) => player.roomId !== roomId);
  snapshot.archiveSyncs = snapshot.archiveSyncs.filter((entry) => entry.roomId !== roomId);
  snapshot.rooms = snapshot.rooms.filter((entry) => entry.roomId !== roomId);
  await saveSnapshot(snapshot);
}

export async function endRoom(roomId: string, endedByUid: string): Promise<SubmitResult> {
  await purgeExpiredArchivedRoomsInSnapshot();
  const snapshot = await loadSnapshot();
  const room = snapshot.rooms.find((entry) => entry.roomId === roomId);
  if (!room) {
    return { ok: false, code: 'ROOM_NOT_FOUND', message: 'Room not found' };
  }

  const member = snapshot.members.find(
    (entry) => entry.roomId === roomId && entry.uid === endedByUid && entry.membershipStatus === 'active',
  );
  if (!member) {
    return { ok: false, code: 'LINEUP_CHANGE_WINDOW_CLOSED', message: 'Only active members can end room' };
  }
  if (room.status === 'ended' || room.status === 'archived') {
    return { ok: true, nextVersion: room.currentVersion, nextHandIndex: room.currentHandIndex };
  }

  room.status = 'ended';
  room.archiveReadyAt = now();
  room.archiveVersion = (room.archiveVersion ?? 0) + 1;
  room.updatedAt = now();
  await saveSnapshot(snapshot);
  return { ok: true, nextVersion: room.currentVersion, nextHandIndex: room.currentHandIndex };
}

export async function markRoomArchived(roomId: string, archiveVersion: number): Promise<Room | null> {
  await purgeExpiredArchivedRoomsInSnapshot();
  const snapshot = await loadSnapshot();
  const room = snapshot.rooms.find((entry) => entry.roomId === roomId);
  if (!room) {
    return null;
  }
  room.status = 'archived';
  room.archiveReadyAt = room.archiveReadyAt ?? now();
  room.archiveVersion = archiveVersion;
  room.expiresAt = room.expiresAt ?? now() + ARCHIVE_RETENTION_MS;
  room.updatedAt = now();
  await saveSnapshot(snapshot);
  return room;
}

export async function markArchiveSynced(roomId: string, actorUid: string, archiveVersion: number): Promise<void> {
  await purgeExpiredArchivedRoomsInSnapshot();
  const snapshot = await loadSnapshot();
  const existing = snapshot.archiveSyncs.find(
    (entry) => entry.roomId === roomId && entry.actorUid === actorUid && entry.archiveVersion === archiveVersion,
  );
  if (existing) {
    existing.syncedAt = now();
  } else {
    snapshot.archiveSyncs.push({
      roomId,
      actorUid,
      archiveVersion,
      syncedAt: now(),
    });
  }
  await saveSnapshot(snapshot);
}

export async function cleanupExpiredArchivedRooms(): Promise<void> {
  await purgeExpiredArchivedRoomsInSnapshot();
}

export function subscribeMembers(roomId: string, cb: (members: RoomMember[]) => void): () => void {
  let alive = true;
  const tick = async () => {
    if (!alive) {
      return;
    }
    cb(await listMembers(roomId));
  };
  tick().catch(() => {});
  const timer = setInterval(() => {
    tick().catch(() => {});
  }, POLL_MS);
  return () => {
    alive = false;
    clearInterval(timer);
  };
}

export function subscribeRoomPlayers(roomId: string, sessionUid: string, cb: (players: ResolvedRoomPlayer[]) => void): () => void {
  let alive = true;
  const tick = async () => {
    if (!alive) {
      return;
    }
    cb(await listRoomPlayers(roomId, sessionUid));
  };
  tick().catch(() => {});
  const timer = setInterval(() => {
    tick().catch(() => {});
  }, POLL_MS);
  return () => {
    alive = false;
    clearInterval(timer);
  };
}

export function subscribeRoom(roomId: string, cb: (room: Room | null) => void): () => void {
  let alive = true;
  const tick = async () => {
    if (!alive) {
      return;
    }
    cb(await getRoom(roomId));
  };
  tick().catch(() => {});
  const timer = setInterval(() => {
    tick().catch(() => {});
  }, POLL_MS);
  return () => {
    alive = false;
    clearInterval(timer);
  };
}

export function subscribeActiveLineup(roomId: string, cb: (lineup: RoomLineup | null) => void): () => void {
  let alive = true;
  const tick = async () => {
    if (!alive) {
      return;
    }
    cb(await getActiveLineup(roomId));
  };
  tick().catch(() => {});
  const timer = setInterval(() => {
    tick().catch(() => {});
  }, POLL_MS);
  return () => {
    alive = false;
    clearInterval(timer);
  };
}

export function getDefaultStartSeats(roomPlayers: ResolvedRoomPlayer[]): Record<SeatKey, RoomPlayerId> | null {
  if (roomPlayers.length < 4) {
    return null;
  }
  return buildSeatRecord(roomPlayers.slice(0, 4).map((player) => player.playerId));
}

export function getBenchPlayers(roomPlayers: ResolvedRoomPlayer[], lineup: RoomLineup | null): ResolvedRoomPlayer[] {
  const activeIds = new Set(seatIds(lineup));
  return roomPlayers.filter((player) => !activeIds.has(player.playerId));
}
