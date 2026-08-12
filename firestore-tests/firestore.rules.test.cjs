const fs = require('node:fs');
const path = require('node:path');
const { after, before, beforeEach, describe, test } = require('node:test');
const assert = require('node:assert/strict');
const {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} = require('@firebase/rules-unit-testing');
const {
  deleteDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  setDoc,
  runTransaction,
  updateDoc,
  writeBatch,
  Timestamp,
} = require('firebase/firestore');

const PROJECT_ID = 'demo-mahjong-fan';
const ROOM_ID = 'room-rules-test';
const HOST_UID = 'host-user';
const GUEST_UID = 'guest-user';
const SECOND_GUEST_UID = 'second-guest-user';
const OUTSIDER_UID = 'outsider-user';

let testEnvironment;

function roomData(status = 'ended') {
  return {
    roomId: ROOM_ID,
    title: 'Rules test room',
    hostUid: HOST_UID,
    status,
    maxSeats: 4,
    memberCap: 4,
    memberCount: 3,
    currentVersion: 2,
    currentHandIndex: 1,
    activeLineupVersion: 1,
    rulesSnapshot: {},
    archiveReadyAt: 1_000,
    expiresAt: null,
    archiveVersion: 1,
    createdAt: 500,
    updatedAt: 1_000,
  };
}

function memberData(uid, role = 'player') {
  return {
    uid,
    roomId: ROOM_ID,
    role,
    membershipStatus: 'active',
    joinedAt: 500,
    displayName: uid,
    avatarUrl: null,
    archiveSyncedAt: null,
    archiveSyncedVersion: null,
  };
}

async function seedRoom(status = 'ended') {
  await testEnvironment.withSecurityRulesDisabled(async (context) => {
    const database = context.firestore();
    await Promise.all([
      setDoc(doc(database, 'rooms', ROOM_ID), roomData(status)),
      setDoc(doc(database, 'rooms', ROOM_ID, 'members', HOST_UID), memberData(HOST_UID, 'host')),
      setDoc(doc(database, 'rooms', ROOM_ID, 'members', GUEST_UID), memberData(GUEST_UID)),
      setDoc(doc(database, 'rooms', ROOM_ID, 'members', SECOND_GUEST_UID), memberData(SECOND_GUEST_UID)),
    ]);
  });
}

async function seedJoinTickets() {
  await testEnvironment.withSecurityRulesDisabled(async (context) => {
    const database = context.firestore();
    await Promise.all([
      setDoc(doc(database, 'rooms', ROOM_ID, 'joinTickets', GUEST_UID), {
        uid: GUEST_UID,
        roomId: ROOM_ID,
      }),
      setDoc(doc(database, 'rooms', ROOM_ID, 'joinTickets', SECOND_GUEST_UID), {
        uid: SECOND_GUEST_UID,
        roomId: ROOM_ID,
      }),
    ]);
  });
}

function authenticatedDatabase(uid) {
  return testEnvironment.authenticatedContext(uid).firestore();
}

async function createGuardedRoom(database, uid, roomId) {
  const inviteToken = `invite-${roomId}-abcdefghijklmnop`;
  const batch = writeBatch(database);
  batch.set(doc(database, 'roomCreationGuards', uid), {
    activeRoomId: roomId,
    lastCreatedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  batch.set(doc(database, 'rooms', roomId), {
    ...roomData('open'),
    roomId,
    hostUid: uid,
    memberCount: 1,
  });
  batch.set(doc(database, 'rooms', roomId, 'members', uid), {
    ...memberData(uid, 'host'),
    roomId,
  });
  batch.set(doc(database, 'rooms', roomId, 'hostConfig', 'current'), {
    activeInviteToken: inviteToken,
    updatedAt: 500,
  });
  batch.set(doc(database, 'roomInvites', inviteToken), {
    roomId,
    createdByUid: uid,
    createdAt: 500,
    expiresAt: Timestamp.fromMillis(Date.now() + 60_000),
  });
  await batch.commit();
}

before(async () => {
  testEnvironment = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      rules: fs.readFileSync(path.join(__dirname, '..', 'firestore.rules'), 'utf8'),
    },
  });
});

beforeEach(async () => {
  await testEnvironment.clearFirestore();
});

after(async () => {
  await testEnvironment.cleanup();
});

describe('room archive rules', () => {
  test('an active member can archive an ended room once', async () => {
    await seedRoom();
    const database = authenticatedDatabase(GUEST_UID);
    const reference = doc(database, 'rooms', ROOM_ID);

    await assertSucceeds(updateDoc(reference, {
      status: 'archived',
      archiveReadyAt: 1_000,
      archiveVersion: 1,
      expiresAt: 172_801_000,
      updatedAt: 2_000,
    }));

    const snapshot = await assertSucceeds(getDoc(reference));
    assert.equal(snapshot.data().status, 'archived');
  });

  test('another member can read an archived room but cannot repeat the transition', async () => {
    await seedRoom('archived');
    const database = authenticatedDatabase(SECOND_GUEST_UID);
    const reference = doc(database, 'rooms', ROOM_ID);

    const snapshot = await assertSucceeds(getDoc(reference));
    assert.equal(snapshot.data().status, 'archived');
    await assertFails(updateDoc(reference, { updatedAt: 3_000 }));
  });

  test('a user outside the room cannot read it', async () => {
    await seedRoom('archived');
    await assertFails(getDoc(doc(authenticatedDatabase(OUTSIDER_UID), 'rooms', ROOM_ID)));
  });

  test('members can only confirm their own local archive', async () => {
    await seedRoom('archived');
    const database = authenticatedDatabase(GUEST_UID);

    await assertSucceeds(updateDoc(doc(database, 'rooms', ROOM_ID, 'members', GUEST_UID), {
      archiveSyncedAt: 3_000,
      archiveSyncedVersion: 1,
    }));
    await assertFails(updateDoc(doc(database, 'rooms', ROOM_ID, 'members', SECOND_GUEST_UID), {
      archiveSyncedAt: 3_000,
      archiveSyncedVersion: 1,
    }));
  });

  test('members can rename themselves only while the room is open', async () => {
    await seedRoom('open');
    const database = authenticatedDatabase(GUEST_UID);
    const memberReference = doc(database, 'rooms', ROOM_ID, 'members', GUEST_UID);

    await assertSucceeds(updateDoc(memberReference, {
      displayName: 'Guest Name',
    }));

    await testEnvironment.withSecurityRulesDisabled(async (context) => {
      await updateDoc(doc(context.firestore(), 'rooms', ROOM_ID), {
        status: 'active',
      });
    });

    await assertFails(updateDoc(memberReference, {
      displayName: 'Too Late',
    }));
  });

  test('only the host can delete archived room data', async () => {
    await seedRoom('archived');
    const guestDatabase = authenticatedDatabase(GUEST_UID);
    const hostDatabase = authenticatedDatabase(HOST_UID);

    await assertFails(deleteDoc(doc(guestDatabase, 'rooms', ROOM_ID, 'members', SECOND_GUEST_UID)));
    await assertFails(deleteDoc(doc(guestDatabase, 'rooms', ROOM_ID)));
    await assertSucceeds(deleteDoc(doc(hostDatabase, 'rooms', ROOM_ID, 'members', SECOND_GUEST_UID)));
    await assertSucceeds(deleteDoc(doc(hostDatabase, 'rooms', ROOM_ID)));
  });

  test('host can clear guest join tickets while members can only delete their own', async () => {
    await seedRoom('open');
    await seedJoinTickets();
    const guestDatabase = authenticatedDatabase(GUEST_UID);
    const secondGuestDatabase = authenticatedDatabase(SECOND_GUEST_UID);
    const hostDatabase = authenticatedDatabase(HOST_UID);

    await assertFails(deleteDoc(doc(secondGuestDatabase, 'rooms', ROOM_ID, 'joinTickets', GUEST_UID)));
    await assertSucceeds(deleteDoc(doc(guestDatabase, 'rooms', ROOM_ID, 'joinTickets', GUEST_UID)));
    await assertSucceeds(deleteDoc(doc(hostDatabase, 'rooms', ROOM_ID, 'joinTickets', SECOND_GUEST_UID)));
  });
});

describe('open room rules configuration', () => {
  test('host can update the existing rules snapshot before the room starts', async () => {
    await seedRoom('open');
    const reference = doc(authenticatedDatabase(HOST_UID), 'rooms', ROOM_ID);

    await assertSucceeds(updateDoc(reference, {
      rulesSnapshot: { serializedRules: 'updated' },
      updatedAt: 2_000,
    }));
  });

  test('members cannot update rules and the host cannot update them after start', async () => {
    await seedRoom('open');
    await assertFails(updateDoc(doc(authenticatedDatabase(GUEST_UID), 'rooms', ROOM_ID), {
      rulesSnapshot: { serializedRules: 'guest-change' },
      updatedAt: 2_000,
    }));

    await testEnvironment.withSecurityRulesDisabled(async (context) => {
      await updateDoc(doc(context.firestore(), 'rooms', ROOM_ID), { status: 'active' });
    });
    await assertFails(updateDoc(doc(authenticatedDatabase(HOST_UID), 'rooms', ROOM_ID), {
      rulesSnapshot: { serializedRules: 'late-change' },
      updatedAt: 3_000,
    }));
  });
});

describe('temporary player rules', () => {
  test('host can atomically add a temporary player while updating an open room', async () => {
    await seedRoom('open');
    const database = authenticatedDatabase(HOST_UID);

    await assertSucceeds(runTransaction(database, async (transaction) => {
      transaction.set(doc(database, 'rooms', ROOM_ID, 'tempPlayers', 'temp-host-added'), {
        tempPlayerId: 'temp-host-added',
        roomId: ROOM_ID,
        createdByUid: HOST_UID,
        displayName: 'Dev player',
        createdAt: 2_000,
        updatedAt: 2_000,
      });
      transaction.update(doc(database, 'rooms', ROOM_ID), { updatedAt: 2_000 });
    }));
  });

  test('a non-host member cannot add a temporary player', async () => {
    await seedRoom('open');
    const database = authenticatedDatabase(GUEST_UID);

    await assertFails(setDoc(doc(database, 'rooms', ROOM_ID, 'tempPlayers', 'temp-guest-added'), {
      tempPlayerId: 'temp-guest-added',
      roomId: ROOM_ID,
      createdByUid: GUEST_UID,
      displayName: 'Not allowed',
      createdAt: 2_000,
      updatedAt: 2_000,
    }));
  });
});

describe('room creation guard rules', () => {
  test('owner can atomically acquire a guard and create the referenced room', async () => {
    const database = authenticatedDatabase(HOST_UID);
    await assertSucceeds(createGuardedRoom(database, HOST_UID, ROOM_ID));
    assert.equal((await getDoc(doc(database, 'roomCreationGuards', HOST_UID))).data().activeRoomId, ROOM_ID);
  });

  test('room creation without an atomic guard acquisition is denied', async () => {
    const database = authenticatedDatabase(HOST_UID);
    await assertFails(setDoc(doc(database, 'rooms', ROOM_ID), {
      ...roomData('open'),
      memberCount: 1,
    }));
  });

  test('an active hosted room blocks acquiring a second room', async () => {
    const database = authenticatedDatabase(HOST_UID);
    await createGuardedRoom(database, HOST_UID, ROOM_ID);
    await assertFails(createGuardedRoom(database, HOST_UID, 'room-second'));
  });

  test('cancelling does not reset the five-minute cooldown', async () => {
    const database = authenticatedDatabase(HOST_UID);
    await createGuardedRoom(database, HOST_UID, ROOM_ID);
    await updateDoc(doc(database, 'rooms', ROOM_ID), { status: 'cancelling', updatedAt: 2_000 });
    const cleanup = writeBatch(database);
    cleanup.delete(doc(database, 'rooms', ROOM_ID));
    cleanup.update(doc(database, 'roomCreationGuards', HOST_UID), {
      activeRoomId: null,
      updatedAt: serverTimestamp(),
    });
    await assertSucceeds(cleanup.commit());
    await assertFails(createGuardedRoom(database, HOST_UID, 'room-too-soon'));
  });

  test('owner can create again after the stored cooldown has elapsed', async () => {
    await testEnvironment.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'roomCreationGuards', HOST_UID), {
        activeRoomId: null,
        lastCreatedAt: Timestamp.fromMillis(Date.now() - 6 * 60 * 1000),
        updatedAt: Timestamp.fromMillis(Date.now() - 6 * 60 * 1000),
      });
    });
    await assertSucceeds(createGuardedRoom(authenticatedDatabase(HOST_UID), HOST_UID, ROOM_ID));
  });

  test('other users cannot read, update, or delete a guard', async () => {
    const hostDatabase = authenticatedDatabase(HOST_UID);
    await createGuardedRoom(hostDatabase, HOST_UID, ROOM_ID);
    const outsiderDatabase = authenticatedDatabase(OUTSIDER_UID);
    const reference = doc(outsiderDatabase, 'roomCreationGuards', HOST_UID);
    await assertFails(getDoc(reference));
    await assertFails(updateDoc(reference, { activeRoomId: null }));
    await assertFails(deleteDoc(reference));
    await assertFails(deleteDoc(doc(hostDatabase, 'roomCreationGuards', HOST_UID)));
  });

  test('host can list join tickets during retryable cleanup', async () => {
    await seedRoom('open');
    await seedJoinTickets();
    const snapshot = await assertSucceeds(getDocs(collection(authenticatedDatabase(HOST_UID), 'rooms', ROOM_ID, 'joinTickets')));
    assert.equal(snapshot.size, 2);
  });
});
