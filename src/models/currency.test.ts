import { formatCurrencyAmount, formatCurrencyUnit } from './currency';

describe('currency formatting', () => {
  it('uses a concise symbol-first format', () => {
    expect(formatCurrencyAmount(12, 'HKD')).toBe('HK$12');
    expect(formatCurrencyAmount(12.5, 'TWD')).toBe('NT$12.5');
    expect(formatCurrencyUnit('CNY')).toBe('¥');
  });
});
