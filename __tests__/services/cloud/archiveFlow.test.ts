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
  listCloudArchivesPendingStats: jest.fn(async () => []),
  markCloudArchiveStatsApplied: jest.fn(async () => {}),
}));

import { archiveRoomToLocal, loadArchivedGame } from '../../../src/services/cloud/archiveRepo';
import { saveCloudArchive } from '../../../src/db/cloudArchiveRepo';
import { ensureSession, signInWithProvider, signOut } from '../../../src/services/cloud/authRepo';
import { submitHand } from '../../../src/services/cloud/handRepo';
import {
  createInvite,
  createRoom,
  deleteArchivedRoomAfterSync,
  endRoom,
  getArchiveSyncStatus,
  getActiveLineup,
  getRoom,
  joinWithInvite,
  listMembers,
  markRoomArchived,
  startRoom,
} from '../../../src/services/cloud/roomRepo';
import { saveSnapshot } from '../../../src/services/cloud/storage';

beforeEach(async () => {
  mockSavedArchives.clear();
  await signOut();
  await saveSnapshot({ rooms: [], members: [], tempPlayers: [], lineups: [], hands: [], profiles: [], stats: [], archiveSyncs: [] });
});

describe('cloud archive flow', () => {
  it('treats an already archived room as success without rewriting it', async () => {
    const host = await ensureSession('google');
    const room = await createRoom({ hostUid: host.uid, title: '重複封存房間', memberCap: 4 });
    await endRoom(room.roomId, host.uid);

    const first = await markRoomArchived(room.roomId, 1);
    expect(first?.status).toBe('archived');

    const firstUpdatedAt = first!.updatedAt;
    const nowSpy = jest.spyOn(Date, 'now').mockReturnValue(firstUpdatedAt + 10_000);
    try {
      const repeated = await markRoomArchived(room.roomId, 1);
      expect(repeated).toEqual(first);
      expect((await getRoom(room.roomId))?.updatedAt).toBe(firstUpdatedAt);
    } finally {
      nowSpy.mockRestore();
    }
  });

  it('can retry local persistence after the cloud room was archived', async () => {
    const host = await ensureSession('google');
    const room = await createRoom({ hostUid: host.uid, title: '封存重試房間', memberCap: 4 });
    await endRoom(room.roomId, host.uid);

    const mockedSaveCloudArchive = saveCloudArchive as jest.MockedFunction<typeof saveCloudArchive>;
    mockedSaveCloudArchive.mockRejectedValueOnce(new Error('Local write failed'));

    await expect(archiveRoomToLocal(room.roomId, host.uid)).rejects.toThrow('Local write failed');
    expect((await getRoom(room.roomId))?.status).toBe('archived');

    const retry = await archiveRoomToLocal(room.roomId, host.uid);
    expect(retry.roomId).toBe(room.roomId);
    expect((await getRoom(room.roomId))?.status).toBe('archived');
  });

  it('archives ended room locally and blocks new submits', async () => {
    const host = await ensureSession('google');
    const room = await createRoom({ hostUid: host.uid, title: '測試封存房間', memberCap: 8 });
    const invite = await createInvite(room.roomId, host.uid);

    for (let i = 0; i < 3; i += 1) {
      const session = await signInWithProvider('google');
      const joined = await joinWithInvite(room.roomId, invite.token, session.uid);
      expect(joined.ok).toBe(true);
    }

    const roomMembers = await listMembers(room.roomId);
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

  it('keeps an archived room available while its local archive remains readable', async () => {
    const host = await ensureSession('google');
    const room = await createRoom({ hostUid: host.uid, title: '過期封存房間', memberCap: 4 });
    const invite = await createInvite(room.roomId, host.uid);

    for (let i = 0; i < 3; i += 1) {
      const session = await signInWithProvider('apple');
      await joinWithInvite(room.roomId, invite.token, session.uid);
    }

    await endRoom(room.roomId, host.uid);
    await archiveRoomToLocal(room.roomId, host.uid);

    const cloudRoom = await getRoom(room.roomId);
    expect(cloudRoom?.status).toBe('archived');

    const localArchive = await loadArchivedGame(room.roomId);
    expect(localArchive?.room.roomId).toBe(room.roomId);
  });

  it('only lets the host delete cloud data after every real member has saved an archive', async () => {
    const host = await ensureSession('google');
    const room = await createRoom({ hostUid: host.uid, title: '清理同步房間', memberCap: 4 });
    const invite = await createInvite(room.roomId, host.uid);
    const guests = [];

    for (let i = 0; i < 3; i += 1) {
      const session = await signInWithProvider('apple');
      guests.push(session);
      await joinWithInvite(room.roomId, invite.token, session.uid);
    }

    await endRoom(room.roomId, host.uid);
    await archiveRoomToLocal(room.roomId, host.uid);

    const afterHostArchive = getArchiveSyncStatus(await listMembers(room.roomId), 1);
    expect(afterHostArchive).toMatchObject({ requiredMemberCount: 4, syncedMemberCount: 1, isReadyForCloudDeletion: false });
    await expect(deleteArchivedRoomAfterSync(room.roomId, host.uid)).rejects.toThrow('Waiting for');

    for (const guest of guests) {
      await archiveRoomToLocal(room.roomId, guest.uid);
    }

    const completedSync = getArchiveSyncStatus(await listMembers(room.roomId), 1);
    expect(completedSync).toMatchObject({ requiredMemberCount: 4, syncedMemberCount: 4, isReadyForCloudDeletion: true });

    await deleteArchivedRoomAfterSync(room.roomId, host.uid);
    expect(await getRoom(room.roomId)).toBeNull();
    expect((await loadArchivedGame(room.roomId))?.room.roomId).toBe(room.roomId);
  });
});
