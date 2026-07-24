import { ensureProfile, updateProfile } from '../../../src/services/cloud/profileRepo';
import { createInvite, createRoom, joinWithInvite, listMembers } from '../../../src/services/cloud/roomRepo';

describe('cloud profile updates', () => {
  it('updates the member name visible in rooms the player already joined', async () => {
    const hostUid = 'profile-host';
    const playerUid = 'profile-player';
    await ensureProfile(hostUid);
    await ensureProfile(playerUid);

    const room = await createRoom({ hostUid, title: '改名測試', memberCap: 4 });
    const invite = await createInvite(room.roomId);
    const joinResult = await joinWithInvite(room.roomId, invite.token, playerUid);
    expect(joinResult.ok).toBe(true);

    await updateProfile(playerUid, { displayName: '阿明' });

    const members = await listMembers(room.roomId);
    expect(members.find((member) => member.uid === playerUid)?.displayName).toBe('阿明');
  });
});
