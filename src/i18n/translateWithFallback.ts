import type { TranslationKey } from './types';

export type TranslationVariables = Record<string, string | number>;
export type Translate = (key: TranslationKey, vars?: TranslationVariables) => string;

/**
 * Keeps user-facing fallback text working while a locale is being rolled out.
 * The i18n layer handles normal interpolation; this also interpolates fallback
 * strings and supports both {token} and {{token}} formats used by older copy.
 */
export function translateWithFallback(
  t: Translate,
  key: string,
  fallback: string,
  replacements?: TranslationVariables,
): string {
  const raw = t(key as TranslationKey, replacements);
  const base = raw === key ? fallback : raw;
  if (!replacements) {
    return base;
  }

  return Object.entries(replacements).reduce((result, [token, value]) => {
    const valueText = String(value);
    const doublePattern = new RegExp(`\\{\\{\\s*${token}\\s*\\}\\}`, 'g');
    const singlePattern = new RegExp(`\\{${token}\\}`, 'g');
    return result.replace(doublePattern, valueText).replace(singlePattern, valueText);
  }, base);
}
