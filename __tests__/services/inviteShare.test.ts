import { buildInviteShareMessage } from '../../src/services/cloud/inviteShare';

describe('invite sharing', () => {
  it('includes the room code and deep link in the system share message', () => {
    const invite = {
      roomId: 'room_demo',
      token: 'token_demo',
      expiresAt: Date.now() + 60_000,
      deepLink: 'mahjongfan://join?roomId=room_demo&token=token_demo',
    };

    expect(buildInviteShareMessage('同步房', '房間代碼', invite)).toBe(
      '同步房\n房間代碼: room_demo\nmahjongfan://join?roomId=room_demo&token=token_demo',
    );
  });
});
