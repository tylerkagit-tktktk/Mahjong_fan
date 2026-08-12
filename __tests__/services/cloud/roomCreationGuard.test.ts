import firestore from '@react-native-firebase/firestore';
import { ensureProfile, getProfile } from '../../../src/services/cloud/profileRepo';
import {
  createRoom,
  deleteRoomAndFallbackToLocal,
  getRoom,
  recoverHostedRoom,
  ROOM_CREATION_COOLDOWN_MS,
  updateOpenRoomRules,
} from '../../../src/services/cloud/roomRepo';

const HOST_UID = 'guard-host';

beforeEach(async () => {
  (firestore as unknown as { __reset: () => void }).__reset();
  await ensureProfile(HOST_UID);
});

describe('guarded room creation', () => {
  it('restores the one active hosted room instead of creating another', async () => {
    const first = await createRoom({ hostUid: HOST_UID, hostDisplayName: '房主', title: '第一房' });
    expect(first.ok).toBe(true);
    if (!first.ok) return;

    const second = await createRoom({ hostUid: HOST_UID, hostDisplayName: '房主', title: '第二房' });
    expect(second).toMatchObject({ ok: true, kind: 'restored' });
    if (!second.ok) return;
    expect(second.room.roomId).toBe(first.room.roomId);
  });

  it('keeps the cooldown after cancellation and allows creation after five minutes', async () => {
    const start = Date.now();
    const nowSpy = jest.spyOn(Date, 'now').mockReturnValue(start);
    try {
      const first = await createRoom({ hostUid: HOST_UID, hostDisplayName: '房主', title: '第一房' });
      expect(first.ok).toBe(true);
      if (!first.ok) return;
      await deleteRoomAndFallbackToLocal(first.room.roomId, HOST_UID);

      nowSpy.mockReturnValue(start + 60_000);
      const blocked = await createRoom({ hostUid: HOST_UID, hostDisplayName: '房主', title: '太早' });
      expect(blocked).toEqual({ ok: false, code: 'RATE_LIMITED', retryAt: start + ROOM_CREATION_COOLDOWN_MS });

      nowSpy.mockReturnValue(start + ROOM_CREATION_COOLDOWN_MS + 1);
      const allowed = await createRoom({ hostUid: HOST_UID, hostDisplayName: '房主', title: '新房' });
      expect(allowed).toMatchObject({ ok: true, kind: 'created' });
    } finally {
      nowSpy.mockRestore();
    }
  });

  it('recovers an open room and keeps the profile after cloud cleanup', async () => {
    const created = await createRoom({ hostUid: HOST_UID, hostDisplayName: '新名', title: '可恢復房' });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const recovered = await recoverHostedRoom(HOST_UID, created.room.roomId);
    expect(recovered).toMatchObject({ kind: 'open', room: { roomId: created.room.roomId } });

    await deleteRoomAndFallbackToLocal(created.room.roomId, HOST_UID);
    expect(await getRoom(created.room.roomId)).toBeNull();
    expect(await getProfile(HOST_UID)).not.toBeNull();
    await expect(recoverHostedRoom(HOST_UID, created.room.roomId)).resolves.toMatchObject({ kind: 'none' });
  });

  it('lets the host update the existing rules snapshot while the room is open', async () => {
    const created = await createRoom({
      hostUid: HOST_UID,
      hostDisplayName: '房主',
      title: '改規則房',
      rulesSnapshot: { serializedRules: 'before' },
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const updated = await updateOpenRoomRules({
      roomId: created.room.roomId,
      hostUid: HOST_UID,
      rulesSnapshot: { serializedRules: 'after' },
    });
    expect(updated.rulesSnapshot).toEqual({ serializedRules: 'after' });
    await expect(getRoom(created.room.roomId)).resolves.toMatchObject({
      rulesSnapshot: { serializedRules: 'after' },
    });
  });
});
