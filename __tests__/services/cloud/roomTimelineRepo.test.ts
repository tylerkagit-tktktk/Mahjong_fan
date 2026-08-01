import firestore from '@react-native-firebase/firestore';
import { HandLog, RoomLineup } from '../../../src/models/cloud';
import { syncRoomTimeline } from '../../../src/services/cloud/roomTimelineRepo';

type TestCollectionRef = {
  doc: (id: string) => TestDocumentRef;
};

type TestDocumentRef = {
  set: (value: unknown) => Promise<void>;
  collection: (path: string) => TestCollectionRef;
};

type FirestoreTestApi = {
  (): {
    collection: (path: string) => TestCollectionRef;
  };
  __reset: () => void;
  __resetReadCount: () => void;
  __getReadCount: () => number;
};

const firestoreTestApi = firestore as unknown as FirestoreTestApi;
const roomId = 'room-timeline';

function createLineup(version = 1): RoomLineup {
  return {
    lineupId: `lineup-${version}`,
    roomId,
    effectiveFromHandIndex: version === 1 ? 0 : 201,
    seats: { '0': 'uid-1', '1': 'uid-2', '2': 'uid-3', '3': 'uid-4' },
    createdByUid: 'uid-1',
    createdAt: 1735689600000 + version,
    baseVersion: version,
    lineupVersion: version,
  };
}

function createHand(handIndex: number, lineupVersion = 1): HandLog {
  return {
    handId: String(handIndex),
    roomId,
    handIndex,
    type: 'draw',
    submittedByUid: 'uid-1',
    baseVersion: handIndex,
    serverVersion: handIndex + 1,
    lineupVersion,
    winnerPlayerId: null,
    discarderPlayerId: null,
    dealerAction: 'stick',
    fan: 3,
    createdAt: 1735689600000 + handIndex,
  };
}

async function seedLineup(lineup: RoomLineup): Promise<void> {
  await firestoreTestApi()
    .collection('rooms')
    .doc(roomId)
    .collection('lineups')
    .doc(String(lineup.lineupVersion))
    .set(lineup);
}

async function seedHands(hands: HandLog[]): Promise<void> {
  await Promise.all(
    hands.map((hand) =>
      firestoreTestApi()
        .collection('rooms')
        .doc(roomId)
        .collection('hands')
        .doc(String(hand.handIndex))
        .set(hand),
    ),
  );
}

beforeEach(() => {
  firestoreTestApi.__reset();
});

describe('room timeline incremental reads', () => {
  it('reads the initial 200 hands once, then only the newly added hand', async () => {
    const lineup = createLineup();
    const firstTwoHundred = Array.from({ length: 200 }, (_, index) => createHand(index + 1));
    await seedLineup(lineup);
    await seedHands(firstTwoHundred);
    firestoreTestApi.__resetReadCount();

    const initial = await syncRoomTimeline({
      roomId,
      currentHandIndex: 200,
      activeLineupVersion: 1,
      cache: { hands: [], lineups: [] },
    });

    expect(initial.hands).toHaveLength(200);
    expect(firestoreTestApi.__getReadCount()).toBe(201);

    const hand201 = createHand(201);
    await seedHands([hand201]);
    firestoreTestApi.__resetReadCount();
    const updated = await syncRoomTimeline({
      roomId,
      currentHandIndex: 201,
      activeLineupVersion: 1,
      cache: initial,
    });

    expect(updated.hands).toHaveLength(201);
    expect(updated.hands[200]).toEqual(hand201);
    expect(firestoreTestApi.__getReadCount()).toBe(1);
  });

  it('does not read Firestore when the recovery cache is already complete', async () => {
    const lineup = createLineup();
    const hands = Array.from({ length: 200 }, (_, index) => createHand(index + 1));
    firestoreTestApi.__resetReadCount();

    const recovered = await syncRoomTimeline({
      roomId,
      currentHandIndex: 200,
      activeLineupVersion: 1,
      cache: { hands, lineups: [lineup] },
      activeLineup: lineup,
    });

    expect(recovered.hands).toHaveLength(200);
    expect(firestoreTestApi.__getReadCount()).toBe(0);
  });

  it('fetches only a missing lineup version used by a new hand', async () => {
    const lineup1 = createLineup(1);
    const lineup2 = createLineup(2);
    const firstTwoHundred = Array.from({ length: 200 }, (_, index) => createHand(index + 1));
    await seedLineup(lineup2);
    await seedHands([createHand(201, 2)]);
    firestoreTestApi.__resetReadCount();

    const updated = await syncRoomTimeline({
      roomId,
      currentHandIndex: 201,
      activeLineupVersion: 2,
      cache: { hands: firstTwoHundred, lineups: [lineup1] },
    });

    expect(updated.lineups.map((entry) => entry.lineupVersion)).toEqual([1, 2]);
    expect(firestoreTestApi.__getReadCount()).toBe(2);
  });

  it('fills unused lineup versions when building an exact archive timeline', async () => {
    const lineup1 = createLineup(1);
    await seedLineup(createLineup(2));
    await seedLineup(createLineup(3));
    firestoreTestApi.__resetReadCount();

    const archived = await syncRoomTimeline({
      roomId,
      currentHandIndex: 1,
      activeLineupVersion: 3,
      cache: { hands: [createHand(1)], lineups: [lineup1] },
      requireAllLineupVersions: true,
    });

    expect(archived.lineups.map((entry) => entry.lineupVersion)).toEqual([1, 2, 3]);
    expect(firestoreTestApi.__getReadCount()).toBe(2);
  });
});
