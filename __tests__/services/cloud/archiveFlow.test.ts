const mockSavedArchives = new Map<string, any>();

jest.mock('../../../src/db/cloudArchiveRepo', () => ({
  saveCloudArchive: jest.fn(async (payload) => {
    mockSavedArchives.set(payload.room.roomId, payload);
    return {
      roomId: payload.room.roomId,
      title: `雲端牌局 ${payload.room.roomId}`,
      createdAt: payload.room.createdAt,
      endedAt: payload.room.archiveReadyAt ?? payload.archivedFromCloudAt,
      archivedFromCloudAt: payload.archivedFromCloudAt,
      expiresAt: payload.room.expiresAt ?? null,
      archiveVersion: payload.archiveVersion,
      memberCount: payload.members.length,
      handCount: payload.hands.length,
    };
  }),
  loadCloudArchive: jest.fn(async (roomId: string) => mockSavedArchives.get(roomId) ?? null),
}));

import { archiveRoomToLocal, loadArchivedGame } from '../../../src/services/cloud/archiveRepo';
import { ensureSession, signInWithProvider } from '../../../src/services/cloud/authRepo';
import { submitHand } from '../../../src/services/cloud/handRepo';
import {
  cleanupExpiredArchivedRooms,
  createInvite,
  createRoom,
  endRoom,
  getActiveLineup,
  getRoom,
  joinWithInvite,
  startRoom,
} from '../../../src/services/cloud/roomRepo';
import { loadSnapshot, saveSessionRaw, saveSnapshot } from '../../../src/services/cloud/storage';

beforeEach(async () => {
  mockSavedArchives.clear();
  await saveSnapshot({ rooms: [], members: [], tempPlayers: [], lineups: [], hands: [], profiles: [], stats: [], archiveSyncs: [] });
  await saveSessionRaw(null);
});

describe('cloud archive flow', () => {
  it('archives ended room locally and blocks new submits', async () => {
    const host = await ensureSession('google');
    const room = await createRoom({ hostUid: host.uid, title: '測試封存房間', memberCap: 8 });
    const invite = await createInvite(room.roomId);

    for (let i = 0; i < 3; i += 1) {
      const session = await signInWithProvider('google');
      const joined = await joinWithInvite(room.roomId, invite.token, session.uid);
      expect(joined.ok).toBe(true);
    }

    const membersSnapshot = await loadSnapshot();
    const roomMembers = membersSnapshot.members.filter((entry) => entry.roomId === room.roomId);
    const started = await startRoom({
      roomId: room.roomId,
      startedByUid: host.uid,
      baseVersion: 1,
      nextSeats: {
        '0': roomMembers[0].uid,
        '1': roomMembers[1].uid,
        '2': roomMembers[2].uid,
        '3': roomMembers[3].uid,
      },
    });
    expect(started.ok).toBe(true);

    const lineup = await getActiveLineup(room.roomId);
    expect(lineup).not.toBeNull();

    const firstSubmit = await submitHand({
      roomId: room.roomId,
      submittedByUid: lineup!.seats['0']!,
      type: 'zimo',
      baseVersion: 2,
      winnerPlayerId: lineup!.seats['0'],
    });
    expect(firstSubmit.ok).toBe(true);

    const endResult = await endRoom(room.roomId, host.uid);
    expect(endResult.ok).toBe(true);

    const archiveSummary = await archiveRoomToLocal(room.roomId, host.uid);
    expect(archiveSummary.roomId).toBe(room.roomId);
    expect(archiveSummary.handCount).toBe(1);

    const archivedPayload = await loadArchivedGame(room.roomId);
    expect(archivedPayload?.hands).toHaveLength(1);

    const archivedRoom = await getRoom(room.roomId);
    expect(archivedRoom?.status).toBe('archived');

    const blockedSubmit = await submitHand({
      roomId: room.roomId,
      submittedByUid: lineup!.seats['0']!,
      type: 'draw',
      baseVersion: archivedRoom!.currentVersion,
    });
    expect(blockedSubmit.ok).toBe(false);
    if (!blockedSubmit.ok) {
      expect(blockedSubmit.code).toBe('ROOM_ENDED');
    }
  });

  it('cleans expired archived room from cloud snapshot while keeping local archive', async () => {
    const host = await ensureSession('google');
    const room = await createRoom({ hostUid: host.uid, title: '過期封存房間', memberCap: 4 });
    const invite = await createInvite(room.roomId);

    for (let i = 0; i < 3; i += 1) {
      const session = await signInWithProvider('apple');
      await joinWithInvite(room.roomId, invite.token, session.uid);
    }

    await endRoom(room.roomId, host.uid);
    await archiveRoomToLocal(room.roomId, host.uid);

    const snapshot = await loadSnapshot();
    const targetRoom = snapshot.rooms.find((entry) => entry.roomId === room.roomId);
    expect(targetRoom).toBeDefined();
    if (targetRoom) {
      targetRoom.expiresAt = Date.now() - 1;
    }
    await saveSnapshot(snapshot);

    await cleanupExpiredArchivedRooms();

    const cloudRoom = await getRoom(room.roomId);
    expect(cloudRoom).toBeNull();

    const localArchive = await loadArchivedGame(room.roomId);
    expect(localArchive?.room.roomId).toBe(room.roomId);
  });
});
