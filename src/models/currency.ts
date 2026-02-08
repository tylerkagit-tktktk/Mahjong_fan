export type CurrencyCode = 'HKD' | 'TWD' | 'CNY';

type CurrencyMeta = {
  code: CurrencyCode;
  symbol: string;
};

const CURRENCY_META: Record<CurrencyCode, CurrencyMeta> = {
  HKD: { code: 'HKD', symbol: 'HK$' },
  TWD: { code: 'TWD', symbol: 'NT$' },
  CNY: { code: 'CNY', symbol: '¥' },
};

export const DEFAULT_CURRENCY_CODE: CurrencyCode = 'HKD';

export function isCurrencyCode(value: unknown): value is CurrencyCode {
  return value === 'HKD' || value === 'TWD' || value === 'CNY';
}

export function getCurrencyMeta(code: CurrencyCode): CurrencyMeta {
  return CURRENCY_META[code];
}

export function resolveCurrencyCode(
  value: unknown,
  fallback: CurrencyCode = DEFAULT_CURRENCY_CODE,
): CurrencyCode {
  if (isCurrencyCode(value)) {
    return value;
  }
  return fallback;
}

export function inferCurrencyCodeFromSymbol(
  symbol: string | null | undefined,
  fallback: CurrencyCode = DEFAULT_CURRENCY_CODE,
): CurrencyCode {
  if (symbol === 'HK$' || symbol === '$') {
    return 'HKD';
  }
  if (symbol === 'NT$') {
    return 'TWD';
  }
  if (symbol === '¥') {
    return 'CNY';
  }
  return fallback;
}

function formatAmountRaw(amount: number): string {
  if (Number.isInteger(amount)) {
    return String(amount);
  }
  return amount.toFixed(2).replace(/\.00$/, '').replace(/(\.\d)0$/, '$1');
}

export function formatCurrencyAmount(amount: number, code: CurrencyCode): string {
  const { symbol, code: safeCode } = getCurrencyMeta(code);
  return `${symbol}${formatAmountRaw(amount)} (${safeCode})`;
}

export function formatCurrencyUnit(code: CurrencyCode): string {
  const { symbol, code: safeCode } = getCurrencyMeta(code);
  return `${symbol} (${safeCode})`;
}
