describe('app preferences', () => {
  beforeEach(() => {
    jest.resetModules();
  });

  it('loads a saved default currency and persists later changes', async () => {
    const getItem = jest.fn().mockResolvedValue('TWD');
    const setItem = jest.fn().mockResolvedValue(undefined);
    jest.doMock('@react-native-async-storage/async-storage', () => ({ getItem, setItem }));

    const preferences = require('../../src/settings/appPreferences');
    await preferences.initializeAppPreferences();

    expect(preferences.getDefaultCurrencyCode()).toBe('TWD');

    await preferences.setDefaultCurrencyCode('CNY');

    expect(setItem).toHaveBeenCalledWith('settings_default_currency_v1', 'CNY');
    expect(preferences.getDefaultCurrencyCode()).toBe('CNY');
  });

  it('stores the selected text size and exposes its scale', async () => {
    const setItem = jest.fn().mockResolvedValue(undefined);
    jest.doMock('@react-native-async-storage/async-storage', () => ({
      getItem: jest.fn().mockResolvedValue(null),
      setItem,
    }));

    const preferences = require('../../src/settings/appPreferences');
    await preferences.setTextSize('large');

    expect(preferences.getTextSize()).toBe('large');
    expect(preferences.getTextScale()).toBe(1.15);
    expect(setItem).toHaveBeenCalledWith('settings_text_size_v1', 'large');
  });

  it('keeps HKD when storage has an unsupported value', async () => {
    jest.doMock('@react-native-async-storage/async-storage', () => ({
      getItem: jest.fn().mockResolvedValue('USD'),
      setItem: jest.fn(),
    }));

    const preferences = require('../../src/settings/appPreferences');
    await preferences.initializeAppPreferences();

    expect(preferences.getDefaultCurrencyCode()).toBe('HKD');
  });
});
