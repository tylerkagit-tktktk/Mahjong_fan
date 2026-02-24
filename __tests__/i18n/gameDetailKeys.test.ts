import en from '../../src/i18n/locales/en.json';
import zhHant from '../../src/i18n/locales/zh-Hant.json';
import zhHans from '../../src/i18n/locales/zh-Hans.json';

const touchedKeys = [
  'game.detail.header.title',
  'game.detail.header.date',
  'game.detail.players.title',
  'game.detail.result.winner',
  'game.detail.result.loser',
  'game.detail.stats.title',
  'game.detail.stats.wins',
  'game.detail.stats.zimo',
  'game.detail.stats.discards',
  'game.detail.stats.mostDiscard',
  'game.detail.stats.mostZimo',
  'game.detail.share.settlementTitle',
  'game.detail.share.settlementArrow',
  'game.detail.rules.mode.custom',
  'game.detail.rules.custom.unitPerFanLabel',
  'game.detail.rules.custom.multiplierSummary',
] as const;

type Dict = Record<string, string>;

function assertKeys(dict: Dict) {
  touchedKeys.forEach((key) => {
    expect(dict[key]).toBeDefined();
    expect(dict[key]).not.toBe(key);
    expect(dict[key]).not.toHaveLength(0);
  });
}

describe('game detail i18n keys', () => {
  it('contains touched keys for en', () => {
    assertKeys(en as Dict);
  });

  it('contains touched keys for zh-Hant', () => {
    assertKeys(zhHant as Dict);
  });

  it('contains touched keys for zh-Hans', () => {
    assertKeys(zhHans as Dict);
  });
});
