import { setBreadcrumb } from '../debug/breadcrumbs';
import {
  CurrencyCode,
  DEFAULT_CURRENCY_CODE,
  getCurrencyMeta,
  inferCurrencyCodeFromSymbol,
  resolveCurrencyCode,
} from './currency';
import { isDev } from '../debug/isDev';

export type RulesVersion = 1;
export type Variant = 'HK' | 'TW' | 'PMA';
export type GameMode = Variant;
export type SeatWind = 'E' | 'S' | 'W' | 'N';
export type HandSettlement = 'immediate' | 'endOfGame';
export type HkScoringPreset = 'traditionalFan' | 'customTable';
export type HkGunMode = 'halfGun' | 'fullGun';
export type HkStakePreset = 'TWO_FIVE_CHICKEN' | 'FIVE_ONE' | 'ONE_TWO';

export interface RulesV1 {
  version: 1;
  variant: Variant;
  mode: GameMode;
  languageDefault: 'zh-Hant' | 'zh-Hans' | 'en';
  currencyCode: CurrencyCode;
  currencySymbol: string;
  seats: { order: SeatWind[] };
  minFanToWin?: number;
  hk?: {
    scoring: 'fan' | 'points';
    scoringPreset: HkScoringPreset;
    gunMode: HkGunMode;
    stakePreset: HkStakePreset;
    unitPerFan?: number;
    capFan?: number | null;
    applyDealerMultiplier: boolean;
  };
  tw?: {
    scoring: 'fan';
  };
  pma?: {
    pricingMode: 'directAmount';
  };
  settlement: { mode: HandSettlement };
}

export function getDefaultRules(variant: Variant): RulesV1 {
  const base: RulesV1 = {
    version: 1,
    variant,
    mode: variant,
    languageDefault: 'zh-Hant',
    currencyCode: DEFAULT_CURRENCY_CODE,
    currencySymbol: getCurrencyMeta(DEFAULT_CURRENCY_CODE).symbol,
    seats: { order: ['E', 'S', 'W', 'N'] },
    settlement: { mode: 'immediate' },
  };

  if (variant === 'HK') {
    return {
      ...base,
      minFanToWin: 3,
      hk: {
        scoring: 'fan',
        scoringPreset: 'traditionalFan',
        gunMode: 'fullGun',
        stakePreset: 'TWO_FIVE_CHICKEN',
        unitPerFan: 1,
        capFan: null,
        applyDealerMultiplier: true,
      },
    };
  }

  if (variant === 'TW') {
    return {
      ...base,
      minFanToWin: 3,
      tw: {
        scoring: 'fan',
      },
    };
  }

  return {
    ...base,
    pma: {
      pricingMode: 'directAmount',
    },
  };
}

export function serializeRules(rules: RulesV1): string {
  return JSON.stringify(rules);
}

function normalizeVariant(value: unknown, fallback: Variant): Variant {
  if (value === 'HK' || value === 'TW' || value === 'PMA') {
    return value;
  }
  if (value === 'TW_SIMPLE') {
    return 'TW';
  }
  return fallback;
}

export function parseRules(
  json: string | null | undefined,
  fallbackVariant: Variant = 'HK',
): RulesV1 {
  if (isDev) {
    setBreadcrumb('Rules: parse start', { hasJson: Boolean(json) });
  }

  if (!json) {
    const fallback = getDefaultRules(fallbackVariant);
    if (isDev) {
      setBreadcrumb('Rules: parse fallback (empty)');
    }
    return fallback;
  }

  try {
    const parsed = JSON.parse(json) as Partial<RulesV1>;
    if (!parsed || parsed.version !== 1) {
      throw new Error('unsupported rules version');
    }

    const variant = normalizeVariant(parsed.mode ?? parsed.variant, fallbackVariant);
    const fallback = getDefaultRules(variant);
    const currencyCode = resolveCurrencyCode(
      parsed.currencyCode ?? inferCurrencyCodeFromSymbol(parsed.currencySymbol),
      fallback.currencyCode,
    );
    const currencySymbol = getCurrencyMeta(currencyCode).symbol;

    const normalized: RulesV1 = {
      ...fallback,
      ...parsed,
      variant,
      mode: variant,
      currencyCode,
      currencySymbol,
      hk:
        variant === 'HK'
          ? {
              scoring: parsed.hk?.scoring ?? fallback.hk!.scoring,
              scoringPreset: parsed.hk?.scoringPreset ?? fallback.hk!.scoringPreset,
              gunMode: parsed.hk?.gunMode ?? fallback.hk!.gunMode,
              stakePreset:
                parsed.hk?.stakePreset === 'TWO_FIVE_CHICKEN' ||
                parsed.hk?.stakePreset === 'FIVE_ONE' ||
                parsed.hk?.stakePreset === 'ONE_TWO'
                  ? parsed.hk.stakePreset
                  : parsed.hk?.stakePreset === 'CUSTOM'
                  ? 'TWO_FIVE_CHICKEN'
                  : fallback.hk!.stakePreset,
              unitPerFan:
                typeof parsed.hk?.unitPerFan === 'number' &&
                Number.isFinite(parsed.hk.unitPerFan) &&
                Number(parsed.hk.unitPerFan) >= 0.1
                  ? Number(parsed.hk?.unitPerFan)
                  : fallback.hk!.unitPerFan,
              capFan: parsed.hk?.capFan ?? fallback.hk!.capFan,
              applyDealerMultiplier:
                parsed.hk?.applyDealerMultiplier ?? fallback.hk!.applyDealerMultiplier,
            }
          : undefined,
      tw:
        variant === 'TW'
          ? {
              scoring: parsed.tw?.scoring ?? fallback.tw!.scoring,
            }
          : undefined,
      pma:
        variant === 'PMA'
          ? {
              pricingMode: parsed.pma?.pricingMode ?? fallback.pma!.pricingMode,
            }
          : undefined,
      minFanToWin:
        variant === 'PMA'
          ? undefined
          : Number.isInteger(parsed.minFanToWin)
          ? Number(parsed.minFanToWin)
          : fallback.minFanToWin,
    };

    if (isDev) {
      setBreadcrumb('Rules: parse success', { variant: normalized.variant });
    }
    return normalized;
  } catch (error) {
    console.warn('[Rules] parse failed', error, {
      rulesJsonSnippet: json?.slice(0, 80),
    });
    const fallback = getDefaultRules(fallbackVariant);
    if (isDev) {
      setBreadcrumb('Rules: parse fallback (exception)');
    }
    return fallback;
  }
}
