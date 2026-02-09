import { TranslationKey } from '../../i18n/types';
import { HkGunMode, HkStakePreset } from '../../models/rules';

export function makeId(prefix: string): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return `${prefix}_${crypto.randomUUID()}`;
  }
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function parseMinFan(input: string, min: number, max: number): number | null {
  if (!/^\d+$/.test(input)) {
    return null;
  }
  const parsed = Number(input);
  if (!Number.isInteger(parsed)) {
    return null;
  }
  if (parsed < min || parsed > max) {
    return null;
  }
  return parsed;
}

export function getMinFanError(input: string, min: number, max: number, message: string): string | null {
  return parseMinFan(input, min, max) === null ? `${message} (${min}-${max})` : null;
}

export function splitHintLines(hint: string): string[] {
  const parts = hint
    .split('|')
    .map((part) => part.trim())
    .filter(Boolean);
  return parts.length > 0 ? parts : [hint];
}

export function getStakeBase(
  preset: HkStakePreset,
  gunMode: HkGunMode,
): { zimo: number; discard: number; others: number | null } {
  if (preset === 'TWO_FIVE_CHICKEN') {
    return gunMode === 'halfGun'
      ? { zimo: 1, discard: 1, others: 0.5 }
      : { zimo: 1, discard: 2, others: null };
  }
  if (preset === 'FIVE_ONE') {
    return gunMode === 'halfGun'
      ? { zimo: 2, discard: 2, others: 1 }
      : { zimo: 2, discard: 4, others: null };
  }
  return gunMode === 'halfGun'
    ? { zimo: 4, discard: 4, others: 2 }
    : { zimo: 4, discard: 8, others: null };
}

export function formatMoney(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1).replace(/\.0$/, '');
}

export function getStakePresetHintLines(
  preset: HkStakePreset,
  gunMode: HkGunMode,
  minFan: number,
  capFan: number | null,
  currencySymbol: string,
  t: (key: TranslationKey) => string,
): string[] {
  const fanText = String(minFan);
  const capFanText = capFan === null ? t('newGame.capMode.none') : String(capFan);
  const effectiveMinFan = Math.max(1, minFan);
  const effectiveCapFan = capFan === null ? effectiveMinFan : Math.max(1, capFan);
  const startMultiplier = 2 ** (effectiveMinFan - 1);
  const capMultiplier = 2 ** (effectiveCapFan - 1);

  const base = getStakeBase(preset, gunMode);
  const startZimo = base.zimo * startMultiplier;
  const startDiscard = base.discard * startMultiplier;
  const startOthers = base.others !== null ? base.others * startMultiplier : null;
  const capZimo = base.zimo * capMultiplier;
  const capDiscard = base.discard * capMultiplier;
  const capOthers = base.others !== null ? base.others * capMultiplier : null;

  const fill = (template: string) =>
    template
      .replaceAll('{fan}', fanText)
      .replaceAll('{capFan}', capFanText)
      .replaceAll('{startZimo}', `${currencySymbol}${formatMoney(startZimo)}`)
      .replaceAll('{startDiscard}', `${currencySymbol}${formatMoney(startDiscard)}`)
      .replaceAll('{startOthers}', `${currencySymbol}${formatMoney(startOthers ?? 0)}`)
      .replaceAll('{capZimo}', `${currencySymbol}${formatMoney(capZimo)}`)
      .replaceAll('{capDiscard}', `${currencySymbol}${formatMoney(capDiscard)}`)
      .replaceAll('{capOthers}', `${currencySymbol}${formatMoney(capOthers ?? 0)}`);

  if (preset === 'TWO_FIVE_CHICKEN') {
    const template =
      gunMode === 'halfGun'
        ? t('newGame.hkStakePreset.twoFiveChickenHalfHelp')
        : t('newGame.hkStakePreset.twoFiveChickenFullHelp');
    return splitHintLines(fill(template));
  }
  if (preset === 'FIVE_ONE') {
    const template =
      gunMode === 'halfGun' ? t('newGame.hkStakePreset.fiveOneHalfHelp') : t('newGame.hkStakePreset.fiveOneFullHelp');
    return splitHintLines(fill(template));
  }
  const template =
    gunMode === 'halfGun' ? t('newGame.hkStakePreset.oneTwoHalfHelp') : t('newGame.hkStakePreset.oneTwoFullHelp');
  return splitHintLines(fill(template));
}

export function shuffle(values: string[]): string[] {
  const next = [...values];
  for (let i = next.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [next[i], next[j]] = [next[j], next[i]];
  }
  return next;
}
