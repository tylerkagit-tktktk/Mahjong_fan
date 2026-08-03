import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  clearActiveJoinedRoomPointer,
  clearActiveRoomRecoverySnapshot,
  clearPendingHostedRoomCleanup,
  loadActiveRoomRecoverySnapshot,
  loadActiveJoinedRoomPointer,
  loadPendingHostedRoomCleanup,
  mergeActiveRoomRecoverySnapshot,
  saveActiveJoinedRoomPointer,
  savePendingHostedRoomCleanup,
} from '../../../src/services/cloud/storage';

describe('active room recovery snapshot', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    await AsyncStorage.clear();
  });

  it('serializes queued partial updates without losing earlier room state', async () => {
    const room = { roomId: 'room-1', currentVersion: 3 } as any;
    const players = [{ playerId: 'uid-1', displayName: 'P1' }] as any;

    await Promise.all([
      mergeActiveRoomRecoverySnapshot('room-1', { room, players }),
      mergeActiveRoomRecoverySnapshot('room-1', {
        totalsQByPlayerId: { 'uid-1': 12 },
        dealerSeatIndex: 2,
        roundState: { dealerSeatIndex: 2, dealerAdvanceCount: 2, handCount: 5 },
      }),
    ]);

    expect(await loadActiveRoomRecoverySnapshot('room-1')).toEqual(expect.objectContaining({
      room,
      players,
      totalsQByPlayerId: { 'uid-1': 12 },
      dealerSeatIndex: 2,
      roundState: { dealerSeatIndex: 2, dealerAdvanceCount: 2, handCount: 5 },
    }));
  });

  it('clears only the requested room snapshot', async () => {
    await mergeActiveRoomRecoverySnapshot('room-1', { totalsQByPlayerId: {} });
    await mergeActiveRoomRecoverySnapshot('room-2', { totalsQByPlayerId: {} });

    await clearActiveRoomRecoverySnapshot('room-1');

    expect(await loadActiveRoomRecoverySnapshot('room-1')).toBeNull();
    expect(await loadActiveRoomRecoverySnapshot('room-2')).not.toBeNull();
  });

  it('keeps a pending hosted-room cleanup until the matching room is cleared', async () => {
    const cleanup = {
      uid: 'host-1',
      roomId: 'room-1',
      localGameId: 'local-game-1',
      createdAt: 1234,
    };
    await savePendingHostedRoomCleanup(cleanup);

    await clearPendingHostedRoomCleanup('another-room');
    expect(await loadPendingHostedRoomCleanup()).toEqual(cleanup);

    await clearPendingHostedRoomCleanup('room-1');
    expect(await loadPendingHostedRoomCleanup()).toBeNull();
  });

  it('persists and conditionally clears the joined-room pointer', async () => {
    const pointer = { uid: 'guest-1', roomId: 'room-1' };
    await saveActiveJoinedRoomPointer(pointer);

    expect(await loadActiveJoinedRoomPointer()).toEqual(pointer);

    await clearActiveJoinedRoomPointer({ uid: 'guest-2', roomId: 'room-1' });
    expect(await loadActiveJoinedRoomPointer()).toEqual(pointer);

    await clearActiveJoinedRoomPointer(pointer);
    expect(await loadActiveJoinedRoomPointer()).toBeNull();
  });
});
