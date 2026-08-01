import firestore from '@react-native-firebase/firestore';
import { ensureProfile } from '../../../src/services/cloud/profileRepo';
import {
  addTemporaryPlayers,
  createRoom,
  listRoomPlayers,
} from '../../../src/services/cloud/roomRepo';

type FirestoreTestApi = {
  __reset: () => void;
  __resetReadCount: () => void;
  __getReadCount: () => number;
};

const firestoreTestApi = firestore as unknown as FirestoreTestApi;
const hostUid = 'temporary-player-host';

beforeEach(async () => {
  firestoreTestApi.__reset();
  await ensureProfile(hostUid);
});

describe('temporary player batch creation', () => {
  it('adds multiple players with one authoritative room read', async () => {
    const created = await createRoom({
      hostUid,
      hostDisplayName: '房主',
      title: '批次玩家',
      memberCap: 4,
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    firestoreTestApi.__resetReadCount();
    const players = await addTemporaryPlayers({
      roomId: created.room.roomId,
      createdByUid: hostUid,
      displayNames: ['南位', '西位'],
    });

    expect(players.map((player) => player.displayName)).toEqual(['南位', '西位']);
    expect(firestoreTestApi.__getReadCount()).toBe(1);
    await expect(listRoomPlayers(created.room.roomId)).resolves.toHaveLength(3);
  });

  it('rejects an over-cap batch without creating a partial player', async () => {
    const created = await createRoom({
      hostUid,
      hostDisplayName: '房主',
      title: '人數上限',
      memberCap: 4,
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    await addTemporaryPlayers({
      roomId: created.room.roomId,
      createdByUid: hostUid,
      displayNames: ['南位', '西位'],
    });
    await expect(addTemporaryPlayers({
      roomId: created.room.roomId,
      createdByUid: hostUid,
      displayNames: ['北位', '後備'],
    })).rejects.toThrow('Room member cap reached');
    await expect(listRoomPlayers(created.room.roomId)).resolves.toHaveLength(3);
  });
});
