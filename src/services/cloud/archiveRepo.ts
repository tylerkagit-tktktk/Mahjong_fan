import { saveCloudArchive, loadCloudArchive } from '../../db/cloudArchiveRepo';
import { CloudArchivePayload } from '../../models/cloud';
import { getRoom, listLineups, listMembers, listTemporaryPlayers, markArchiveSynced, markRoomArchived } from './roomRepo';
import { listHands } from './handRepo';

export async function buildArchivePayload(roomId: string): Promise<CloudArchivePayload> {
  const room = await getRoom(roomId);
  if (!room) {
    throw new Error('Room not found');
  }
  if (room.status !== 'ended' && room.status !== 'archived') {
    throw new Error('Room is not ready to archive');
  }

  const [members, tempPlayers, lineups, hands] = await Promise.all([
    listMembers(roomId),
    listTemporaryPlayers(roomId),
    listLineups(roomId),
    listHands(roomId),
  ]);
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
