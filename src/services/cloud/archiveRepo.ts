import { saveCloudArchive, loadCloudArchive } from '../../db/cloudArchiveRepo';
import { CloudArchivePayload } from '../../models/cloud';
import { loadSnapshot } from './storage';
import { getRoom, markArchiveSynced, markRoomArchived } from './roomRepo';

export async function buildArchivePayload(roomId: string): Promise<CloudArchivePayload> {
  const snapshot = await loadSnapshot();
  const room = snapshot.rooms.find((entry) => entry.roomId === roomId);
  if (!room) {
    throw new Error('Room not found');
  }
  if (room.status !== 'ended' && room.status !== 'archived') {
    throw new Error('Room is not ready to archive');
  }

  const members = snapshot.members
    .filter((entry) => entry.roomId === roomId && entry.membershipStatus === 'active')
    .sort((a, b) => a.joinedAt - b.joinedAt);
  const tempPlayers = snapshot.tempPlayers.filter((entry) => entry.roomId === roomId).sort((a, b) => a.createdAt - b.createdAt);
  const lineups = snapshot.lineups
    .filter((entry) => entry.roomId === roomId)
    .sort((a, b) => a.effectiveFromHandIndex - b.effectiveFromHandIndex || a.lineupVersion - b.lineupVersion);
  const hands = snapshot.hands.filter((entry) => entry.roomId === roomId).sort((a, b) => a.handIndex - b.handIndex);
  const archiveVersion = room.archiveVersion ?? 1;

  return {
    room,
    members,
    tempPlayers,
    lineups,
    hands,
    archivedFromCloudAt: room.archiveReadyAt ?? Date.now(),
    archiveVersion,
  };
}

export async function archiveRoomToLocal(roomId: string, actorUid: string) {
  const payload = await buildArchivePayload(roomId);
  const archivedRoom = await markRoomArchived(roomId, payload.archiveVersion);
  const persistedPayload = {
    ...payload,
    room: archivedRoom ?? payload.room,
  } satisfies CloudArchivePayload;
  const summary = await saveCloudArchive(persistedPayload);
  await markArchiveSynced(roomId, actorUid, payload.archiveVersion);
  return summary;
}

export async function loadArchivedGame(roomId: string): Promise<CloudArchivePayload | null> {
  return loadCloudArchive(roomId);
}

export async function isRoomArchived(roomId: string): Promise<boolean> {
  const room = await getRoom(roomId);
  return room?.status === 'archived';
}
