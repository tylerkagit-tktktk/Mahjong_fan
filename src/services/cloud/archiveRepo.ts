import {
  listCloudArchivesPendingStats,
  loadCloudArchive,
  markCloudArchiveStatsApplied,
  saveCloudArchive,
} from '../../db/cloudArchiveRepo';
import { CloudArchivePayload } from '../../models/cloud';
import {
  getRoom,
  listMembers,
  listTemporaryPlayers,
  markArchiveSynced,
  markRoomArchived,
} from './roomRepo';
import { applyArchiveStats } from './profileRepo';
import { syncRoomTimeline } from './roomTimelineRepo';
import {
  loadActiveRoomRecoverySnapshot,
  waitForActiveRoomRecoveryWrites,
} from './storage';

export async function buildArchivePayload(roomId: string): Promise<CloudArchivePayload> {
  const room = await getRoom(roomId);
  if (!room) {
    throw new Error('Room not found');
  }
  if (room.status !== 'ended' && room.status !== 'archived') {
    throw new Error('Room is not ready to archive');
  }

  await waitForActiveRoomRecoveryWrites(roomId);
  const recovery = await loadActiveRoomRecoverySnapshot(roomId);
  const [members, tempPlayers, timeline] = await Promise.all([
    listMembers(roomId),
    listTemporaryPlayers(roomId),
    syncRoomTimeline({
      roomId,
      currentHandIndex: room.currentHandIndex,
      activeLineupVersion: room.activeLineupVersion,
      cache: {
        hands: recovery?.hands ?? [],
        lineups: recovery?.lineups ?? (recovery?.lineup ? [recovery.lineup] : []),
      },
      activeLineup: recovery?.lineup,
      requireAllLineupVersions: true,
    }),
  ]);
  const archiveVersion = room.archiveVersion ?? 1;

  return {
    room,
    members,
    tempPlayers,
    lineups: timeline.lineups,
    hands: timeline.hands,
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
  try {
    await applyArchiveStats(actorUid, persistedPayload);
    await markCloudArchiveStatsApplied(roomId, persistedPayload.archiveVersion, actorUid);
  } catch {
    // The local archive remains the source for a later retry from Profile.
  }
  await markArchiveSynced(roomId, actorUid, payload.archiveVersion);
  return summary;
}

export async function syncPendingArchiveStats(uid: string): Promise<void> {
  const archives = await listCloudArchivesPendingStats(uid);
  for (const payload of archives) {
    if (!payload.members.some((member) => member.uid === uid)) continue;
    await applyArchiveStats(uid, payload);
    await markCloudArchiveStatsApplied(payload.room.roomId, payload.archiveVersion, uid);
  }
}

export async function loadArchivedGame(roomId: string): Promise<CloudArchivePayload | null> {
  return loadCloudArchive(roomId);
}
