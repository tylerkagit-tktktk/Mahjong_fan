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

export function parseDecimalWithinRange(input: string, min: number, max: number): number | null {
  const normalized = input.trim();
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) {
    return null;
  }
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed)) {
    return null;
  }
  if (parsed < min || parsed > max) {
    return null;
  }
  return parsed;
}

export function getDecimalRangeError(input: string, min: number, max: number, message: string): string | null {
  return parseDecimalWithinRange(input, min, max) === null ? `${message} (${min}-${max})` : null;
}

export function getStakePresetHintLines(
  preset: HkStakePreset,
  gunMode: HkGunMode,
  minFan: number,
  capFan: number | null,
  t: (key: TranslationKey) => string,
): string[] {
  const capFanText = capFan === null ? t('newGame.capMode.none') : String(capFan);
  const gunModeText = gunMode === 'halfGun' ? t('newGame.hkGunMode.half') : t('newGame.hkGunMode.full');
  const stakePresetText =
    preset === 'TWO_FIVE_CHICKEN'
      ? t('newGame.hkStakePreset.twoFiveChicken')
      : preset === 'FIVE_ONE'
      ? t('newGame.hkStakePreset.fiveOne')
      : t('newGame.hkStakePreset.oneTwo');

  const configLine = t('newGame.hkStakePreview.config')
    .replaceAll('{gunMode}', gunModeText)
    .replaceAll('{stakePreset}', stakePresetText)
    .replaceAll('{minFan}', String(minFan))
    .replaceAll('{capFan}', capFanText);
  const ruleLine = t('newGame.hkStakePreview.ruleLine')
    .replaceAll('{minFan}', String(minFan))
    .replaceAll('{capFan}', capFanText);
  const capLine = t('newGame.hkStakePreview.capLine')
    .replaceAll('{capFan}', capFanText);

  return [configLine, ruleLine, capLine];
}

export function shuffle(values: string[]): string[] {
  const next = [...values];
  for (let i = next.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [next[i], next[j]] = [next[j], next[i]];
  }
  return next;
}

export function rotatePlayersToEast(values: string[], eastIndex: number): string[] {
  if (values.length === 0) {
    return values;
  }
  const offset = ((eastIndex % values.length) + values.length) % values.length;
  return values.slice(offset).concat(values.slice(0, offset));
}
