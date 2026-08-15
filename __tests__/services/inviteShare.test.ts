import { buildInviteShareMessage } from '../../src/services/cloud/inviteShare';

describe('invite sharing', () => {
  it('includes only the title and full invite link in the system share message', () => {
    const invite = {
      roomId: 'room_demo',
      token: 'token_demo',
      expiresAt: Date.now() + 60_000,
      deepLink: 'mahjongfan://join?roomId=room_demo&token=token_demo',
    };

    expect(buildInviteShareMessage('同步房', invite)).toBe(
      '同步房\nmahjongfan://join?roomId=room_demo&token=token_demo',
    );
  });
});
