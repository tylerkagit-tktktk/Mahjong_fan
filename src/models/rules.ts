import { setBreadcrumb } from '../debug/breadcrumbs';

export type RulesVersion = 1;
export type Variant = 'HK' | 'TW_SIMPLE';
export type SeatWind = 'E' | 'S' | 'W' | 'N';
export type HandSettlement = 'immediate' | 'endOfGame';

export interface RulesV1 {
  version: 1;
  variant: Variant;
  languageDefault: 'zh-Hant' | 'zh-Hans' | 'en';
  currencySymbol: string;
  seats: { order: SeatWind[] };
  hk?: {
    scoring: 'fan' | 'points';
    minFanToWin: number;
    capFan?: number | null;
    applyDealerMultiplier: boolean;
  };
  twSimple?: {
    base: number;
    dealerExtra: number;
  };
  settlement: { mode: HandSettlement };
}

export function getDefaultRules(variant: Variant): RulesV1 {
  const base: RulesV1 = {
    version: 1,
    variant,
    languageDefault: 'zh-Hant',
    currencySymbol: '$',
    seats: { order: ['E', 'S', 'W', 'N'] },
    settlement: { mode: 'immediate' },
  };

  if (variant === 'HK') {
    return {
      ...base,
      hk: {
        scoring: 'fan',
        minFanToWin: 3,
        capFan: null,
        applyDealerMultiplier: true,
      },
    };
  }

  return {
    ...base,
    twSimple: {
      base: 1,
      dealerExtra: 1,
    },
  };
}

export function serializeRules(rules: RulesV1): string {
  return JSON.stringify(rules);
}

export function parseRules(
  json: string | null | undefined,
  fallbackVariant: Variant = 'HK',
): RulesV1 {
  if (__DEV__) {
    setBreadcrumb('Rules: parse start', { hasJson: Boolean(json) });
  }
  if (!json) {
    const fallback = getDefaultRules(fallbackVariant);
    if (__DEV__) {
      setBreadcrumb('Rules: parse fallback (empty)');
    }
    return fallback;
  }

  try {
    const parsed = JSON.parse(json) as RulesV1;
    if (parsed && parsed.version === 1) {
      if (__DEV__) {
        setBreadcrumb('Rules: parse success', { variant: parsed.variant });
      }
      return parsed;
    }
    console.warn('[Rules] parse failed', null, {
      rulesJsonSnippet: json?.slice(0, 80),
    });
    const fallback = getDefaultRules(fallbackVariant);
    if (__DEV__) {
      setBreadcrumb('Rules: parse fallback (invalid)');
    }
    return fallback;
  } catch (error) {
    console.warn('[Rules] parse failed', error, {
      rulesJsonSnippet: json?.slice(0, 80),
    });
    const fallback = getDefaultRules(fallbackVariant);
    if (__DEV__) {
      setBreadcrumb('Rules: parse fallback (exception)');
    }
    return fallback;
  }
}
