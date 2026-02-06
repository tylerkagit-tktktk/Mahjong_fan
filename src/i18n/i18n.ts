import AsyncStorage from '@react-native-async-storage/async-storage';
import * as RNLocalize from 'react-native-localize';
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

let currentLanguage: LanguageCode = 'en';
const listeners = new Set<(language: LanguageCode) => void>();
let initialized = false;

function resolveSystemLanguage(): LanguageCode {
  const locales = RNLocalize.getLocales();
  const primary = locales[0];
  if (!primary) {
    return 'en';
  }

  if (primary.languageCode === 'zh') {
    if (primary.scriptCode === 'Hant') {
      return 'zh-Hant';
    }
    if (primary.scriptCode === 'Hans') {
      return 'zh-Hans';
    }
    if (primary.countryCode && ['HK', 'TW', 'MO'].includes(primary.countryCode)) {
      return 'zh-Hant';
    }
    return 'zh-Hans';
  }

  return 'en';
}

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
      currentLanguage = resolveSystemLanguage();
    }
  } catch (error) {
    console.warn('[i18n] failed to load language, fallback to system', error);
    currentLanguage = resolveSystemLanguage();
  }

  notify(currentLanguage);
}

export function subscribe(listener: (language: LanguageCode) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
