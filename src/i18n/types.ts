import en from './locales/en.json';

export type LanguageCode = 'zh-Hant' | 'zh-Hans' | 'en';

// Keep the type in lock-step with the canonical locale instead of maintaining
// a second, manually edited list of translation keys.
export type TranslationKey = keyof typeof en;
