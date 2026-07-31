import {
  applyArchiveStats,
  ensureProfile,
  getArchiveStatsContribution,
  getProfileStats,
  updateProfile,
} from '../../../src/services/cloud/profileRepo';
import { createInvite, createRoom, joinWithInvite, listMembers } from '../../../src/services/cloud/roomRepo';

describe('cloud profile updates', () => {
  it('updates the member name visible in rooms the player already joined', async () => {
    const hostUid = 'profile-host';
    const playerUid = 'profile-player';
    await ensureProfile(hostUid);
    await ensureProfile(playerUid);

    const room = await createRoom({ hostUid, title: '改名測試', memberCap: 4 });
    const invite = await createInvite(room.roomId, hostUid);
    const joinResult = await joinWithInvite(room.roomId, invite.token, playerUid);
    expect(joinResult.ok).toBe(true);

    await updateProfile(playerUid, { displayName: '阿明' }, room.roomId);

    const members = await listMembers(room.roomId);
    expect(members.find((member) => member.uid === playerUid)?.displayName).toBe('阿明');
  });

  it('calculates only the current player stats once after local archive', async () => {
    const uid = 'archive-player';
    await ensureProfile(uid);
    const payload = {
      room: { roomId: 'archive-room', archiveVersion: 1 },
      archiveVersion: 1,
      members: [{ uid }],
      lineups: [{
        lineupVersion: 1,
        seats: { '0': uid, '1': 'other-1', '2': 'other-2', '3': 'other-3' },
      }],
      hands: [
        { handIndex: 1, lineupVersion: 1, type: 'zimo', winnerPlayerId: uid, discarderPlayerId: null },
        { handIndex: 2, lineupVersion: 1, type: 'discard', winnerPlayerId: 'other-1', discarderPlayerId: uid },
        { handIndex: 3, lineupVersion: 1, type: 'draw', winnerPlayerId: null, discarderPlayerId: null },
      ],
    } as any;

    expect(getArchiveStatsContribution(payload, uid)).toEqual({
      handsParticipated: 3,
      wins: 1,
      zimoCount: 1,
      discardCount: 1,
      drawCount: 1,
    });

    await applyArchiveStats(uid, payload);
    await applyArchiveStats(uid, payload);

    await expect(getProfileStats(uid)).resolves.toMatchObject({
      handsParticipated: 3,
      wins: 1,
      zimoCount: 1,
      discardCount: 1,
      drawCount: 1,
    });
  });
});
