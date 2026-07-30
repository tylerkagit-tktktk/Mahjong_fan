describe('i18n default language', () => {
  beforeEach(() => {
    jest.resetModules();
  });

  it('defaults to zh-Hant when no stored language exists', async () => {
    jest.doMock('@react-native-async-storage/async-storage', () => ({
      getItem: jest.fn().mockResolvedValue(null),
      setItem: jest.fn(),
    }));
    const i18n = require('../../src/i18n/i18n');
    await i18n.initializeI18n();

    expect(i18n.getLanguage()).toBe('zh-Hant');
  });
});
