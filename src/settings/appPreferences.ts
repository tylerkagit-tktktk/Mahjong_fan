import AsyncStorage from '@react-native-async-storage/async-storage';
import { CurrencyCode, DEFAULT_CURRENCY_CODE, isCurrencyCode } from '../models/currency';

const DEFAULT_CURRENCY_STORAGE_KEY = 'settings_default_currency_v1';
const TEXT_SIZE_STORAGE_KEY = 'settings_text_size_v1';

export type AppTextSize = 'small' | 'normal' | 'large';

const TEXT_SCALE_BY_SIZE: Record<AppTextSize, number> = {
  small: 0.9,
  normal: 1,
  large: 1.15,
};

let defaultCurrencyCode: CurrencyCode = DEFAULT_CURRENCY_CODE;
let textSize: AppTextSize = 'normal';
let initialized = false;
const listeners = new Set<(currencyCode: CurrencyCode) => void>();
const textSizeListeners = new Set<(nextTextSize: AppTextSize) => void>();

function notify() {
  listeners.forEach((listener) => listener(defaultCurrencyCode));
}

function notifyTextSize() {
  textSizeListeners.forEach((listener) => listener(textSize));
}

export function getDefaultCurrencyCode(): CurrencyCode {
  return defaultCurrencyCode;
}

export function getTextSize(): AppTextSize {
  return textSize;
}

export function getTextScale(): number {
  return TEXT_SCALE_BY_SIZE[textSize];
}

export async function initializeAppPreferences(): Promise<void> {
  if (initialized) {
    return;
  }
  initialized = true;

  try {
    const [storedCurrency, storedTextSize] = await Promise.all([
      AsyncStorage.getItem(DEFAULT_CURRENCY_STORAGE_KEY),
      AsyncStorage.getItem(TEXT_SIZE_STORAGE_KEY),
    ]);
    if (isCurrencyCode(storedCurrency)) {
      defaultCurrencyCode = storedCurrency;
      notify();
    }
    if (storedTextSize === 'small' || storedTextSize === 'normal' || storedTextSize === 'large') {
      textSize = storedTextSize;
      notifyTextSize();
    }
  } catch (error) {
    console.warn('[settings] failed to load default currency', error);
  }
}

export async function setDefaultCurrencyCode(currencyCode: CurrencyCode): Promise<void> {
  defaultCurrencyCode = currencyCode;
  notify();
  await AsyncStorage.setItem(DEFAULT_CURRENCY_STORAGE_KEY, currencyCode);
}

export function subscribeToDefaultCurrency(listener: (currencyCode: CurrencyCode) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export async function setTextSize(nextTextSize: AppTextSize): Promise<void> {
  textSize = nextTextSize;
  notifyTextSize();
  await AsyncStorage.setItem(TEXT_SIZE_STORAGE_KEY, nextTextSize);
}

export function subscribeToTextSize(listener: (nextTextSize: AppTextSize) => void): () => void {
  textSizeListeners.add(listener);
  return () => textSizeListeners.delete(listener);
}
