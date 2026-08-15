import en from '../../src/i18n/locales/en.json';
import zhHans from '../../src/i18n/locales/zh-Hans.json';
import zhHant from '../../src/i18n/locales/zh-Hant.json';

describe('RoomLobby invite copy', () => {
  it('uses the full invite-link model without a player-facing room code', () => {
    for (const locale of [zhHant, zhHans, en]) {
      expect(locale['roomLobby.hostTools.inviteHint']).toMatch(/invite|邀請|邀请/i);
      expect(locale['roomLobby.hostTools.inviteHint']).not.toMatch(/room code|房間代碼|房间代码/i);
      expect(locale['roomLobby.hostTools.shareSheetSubtitle']).toMatch(/camera|相機|相机/i);
    }
  });

  it('keeps lineup terminology player-facing in Chinese locales', () => {
    expect(zhHant['roomLobby.hostTools.noLineup']).not.toMatch(/active lineup/i);
    expect(zhHans['roomLobby.hostTools.noLineup']).not.toMatch(/active lineup/i);
    expect(en['roomLobby.seats.subtitle']).not.toMatch(/active lineup/i);
    expect(en['roomLobby.start.readyHint']).not.toMatch(/lineup/i);
    expect(en['roomLobby.hostTools.noLineup']).toBe('Seats have not been arranged yet. Wait until four players are seated.');
  });
});
