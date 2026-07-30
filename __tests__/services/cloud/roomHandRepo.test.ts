import { ensureSession, signInWithProvider } from '../../../src/services/cloud/authRepo';
import { listHands, submitHand } from '../../../src/services/cloud/handRepo';
import { createInvite, createRoom, getActiveLineup, joinWithInvite, proposeLineupChange, startRoom } from '../../../src/services/cloud/roomRepo';
import { saveSnapshot } from '../../../src/services/cloud/storage';

beforeEach(async () => {
  await saveSnapshot({ rooms: [], members: [], tempPlayers: [], lineups: [], hands: [], profiles: [], stats: [], archiveSyncs: [] });
});

describe('cloud room + hand flow', () => {
  it('only lets the host issue an invite and invalidates a replaced invite', async () => {
    const host = await ensureSession('google');
    const guest = await signInWithProvider('apple');
    const room = await createRoom({ hostUid: host.uid, title: '邀請權限測試', memberCap: 4 });

    await expect(createInvite(room.roomId, guest.uid)).rejects.toThrow('Only host');

    const originalInvite = await createInvite(room.roomId, host.uid);
    const replacementInvite = await createInvite(room.roomId, host.uid);
    expect(originalInvite.token).toMatch(/^[0-9a-f]{64}$/);
    expect(originalInvite.deepLink).toContain(`token=${originalInvite.token}`);
    expect(replacementInvite.token).not.toBe(originalInvite.token);

    const oldInviteResult = await joinWithInvite(room.roomId, originalInvite.token, guest.uid);
    expect(oldInviteResult).toMatchObject({ ok: false, code: 'INVITE_EXPIRED' });
    const newInviteResult = await joinWithInvite(room.roomId, replacementInvite.token, guest.uid);
    expect(newInviteResult.ok).toBe(true);
  });

  it('allows 5th player join as bench and lineup change applies next hand', async () => {
    const host = await ensureSession('google');
    const room = await createRoom({ hostUid: host.uid, title: '測試多人房', memberCap: 8 });
    const invite = await createInvite(room.roomId, host.uid);

    const players = [host];
    for (let i = 0; i < 4; i += 1) {
      const session = await signInWithProvider(i % 2 === 0 ? 'apple' : 'google');
      const joined = await joinWithInvite(room.roomId, invite.token, session.uid);
      expect(joined.ok).toBe(true);
      players.push(session);
    }

    const startResult = await startRoom({
      roomId: room.roomId,
      startedByUid: host.uid,
      baseVersion: 1,
      nextSeats: {
        '0': players[0].uid,
        '1': players[1].uid,
        '2': players[2].uid,
        '3': players[3].uid,
      },
    });
    expect(startResult.ok).toBe(true);

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

    const benchUid = players[4].uid;
    const nextSeats = {
      '0': lineup!.seats['0']!,
      '1': lineup!.seats['1']!,
      '2': benchUid,
      '3': lineup!.seats['3']!,
    };
    const lineupResult = await proposeLineupChange({
      roomId: room.roomId,
      createdByUid: host.uid,
      baseVersion: 3,
      nextSeats,
    });
    expect(lineupResult.ok).toBe(true);
  });

  it('rejects submit from bench member', async () => {
    const host = await ensureSession('google');
    const room = await createRoom({ hostUid: host.uid, title: '測試後備房', memberCap: 8 });
    const invite = await createInvite(room.roomId, host.uid);

    const members = [host];
    for (let i = 0; i < 4; i += 1) {
      const session = await signInWithProvider('google');
      await joinWithInvite(room.roomId, invite.token, session.uid);
      members.push(session);
    }

    const started = await startRoom({
      roomId: room.roomId,
      startedByUid: host.uid,
      baseVersion: 1,
      nextSeats: {
        '0': members[0].uid,
        '1': members[1].uid,
        '2': members[2].uid,
        '3': members[3].uid,
      },
    });
    expect(started.ok).toBe(true);

    const benchUid = members[4].uid;
    const result = await submitHand({
      roomId: room.roomId,
      submittedByUid: benchUid,
      type: 'draw',
      baseVersion: 2,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('NOT_IN_ACTIVE_LINEUP');
    }
  });

  it('stores draw dealer action for pass/stick dealer decisions', async () => {
    const host = await ensureSession('google');
    const room = await createRoom({ hostUid: host.uid, title: '流局過莊測試', memberCap: 8 });
    const invite = await createInvite(room.roomId, host.uid);

    const members = [host];
    for (let i = 0; i < 3; i += 1) {
      const session = await signInWithProvider('google');
      await joinWithInvite(room.roomId, invite.token, session.uid);
      members.push(session);
    }

    const started = await startRoom({
      roomId: room.roomId,
      startedByUid: host.uid,
      baseVersion: 1,
      nextSeats: {
        '0': members[0].uid,
        '1': members[1].uid,
        '2': members[2].uid,
        '3': members[3].uid,
      },
    });
    expect(started.ok).toBe(true);

    const result = await submitHand({
      roomId: room.roomId,
      submittedByUid: members[0].uid,
      type: 'draw',
      baseVersion: 2,
      dealerAction: 'pass',
    });
    expect(result.ok).toBe(true);

    const hands = await listHands(room.roomId);
    expect(hands).toHaveLength(1);
    expect(hands[0].dealerAction).toBe('pass');
  });
});
