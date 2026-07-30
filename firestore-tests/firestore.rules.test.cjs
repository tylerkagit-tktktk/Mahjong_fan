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
  doc,
  getDoc,
  setDoc,
  updateDoc,
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
