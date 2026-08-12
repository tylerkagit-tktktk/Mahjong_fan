import { parseInviteLink } from '../../src/navigation/inviteLink';

describe('parseInviteLink', () => {
  it('trims and extracts the current complete invite URL', () => {
    expect(parseInviteLink('  mahjongfan://join?roomId=room_demo&token=token_demo  ')).toEqual({
      ok: true,
      invite: { roomId: 'room_demo', token: 'token_demo' },
    });
  });

  it.each([
    '',
    'not a URL',
    'https://join?roomId=room_demo&token=token_demo',
    'mahjongfan://other?roomId=room_demo&token=token_demo',
    'mahjongfan://join?token=token_demo',
    'mahjongfan://join?roomId=room_demo',
    'mahjongfan://join?roomId=&token=token_demo',
  ])('rejects structurally invalid input: %s', (value) => {
    expect(parseInviteLink(value)).toEqual({ ok: false });
  });
});
