import { useEffect, useState } from 'react';
import { CurrencyCode } from '../models/currency';
import {
  getDefaultCurrencyCode,
  getTextScale,
  getTextSize,
  setDefaultCurrencyCode,
  setTextSize,
  subscribeToDefaultCurrency,
  subscribeToTextSize,
} from './appPreferences';

export function useAppPreferences() {
  const [defaultCurrencyCode, setLocalDefaultCurrencyCode] = useState<CurrencyCode>(getDefaultCurrencyCode());
  const [textSize, setLocalTextSize] = useState(getTextSize());

  useEffect(() => {
    const unsubscribeCurrency = subscribeToDefaultCurrency(setLocalDefaultCurrencyCode);
    const unsubscribeTextSize = subscribeToTextSize(setLocalTextSize);
    return () => {
      unsubscribeCurrency();
      unsubscribeTextSize();
    };
  }, []);

  return {
    defaultCurrencyCode,
    setDefaultCurrencyCode,
    textSize,
    textScale: getTextScale(),
    setTextSize,
  };
}
