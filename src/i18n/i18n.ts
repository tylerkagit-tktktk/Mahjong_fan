import AsyncStorage from '@react-native-async-storage/async-storage';
import en from './locales/en.json';
import zhHans from './locales/zh-Hans.json';
import zhHant from './locales/zh-Hant.json';
import { LanguageCode, TranslationKey } from './types';

const STORAGE_KEY = 'app_language';

const dictionaries: Record<LanguageCode, Record<TranslationKey, string>> = {
  en,
  'zh-Hans': zhHans,
  'zh-Hant': zhHant,
};

let currentLanguage: LanguageCode = 'zh-Hant';
const listeners = new Set<(language: LanguageCode) => void>();
let initialized = false;

function notify(language: LanguageCode) {
  listeners.forEach((listener) => listener(language));
}

export function t(key: TranslationKey): string {
  const dict = dictionaries[currentLanguage] ?? dictionaries.en;
  return dict[key] ?? dictionaries.en[key] ?? key;
}

export function getLanguage(): LanguageCode {
  return currentLanguage;
}

export async function setLanguage(language: LanguageCode): Promise<void> {
  currentLanguage = language;
  await AsyncStorage.setItem(STORAGE_KEY, language);
  notify(language);
}

export async function initializeI18n(): Promise<void> {
  if (initialized) {
    return;
  }
  initialized = true;

  try {
    const stored = await AsyncStorage.getItem(STORAGE_KEY);
    if (stored === 'zh-Hant' || stored === 'zh-Hans' || stored === 'en') {
      currentLanguage = stored;
    } else {
      currentLanguage = 'zh-Hant';
    }
  } catch (error) {
    console.warn('[i18n] failed to load language, fallback to zh-Hant', error);
    currentLanguage = 'zh-Hant';
  }

  notify(currentLanguage);
}

export function subscribe(listener: (language: LanguageCode) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
