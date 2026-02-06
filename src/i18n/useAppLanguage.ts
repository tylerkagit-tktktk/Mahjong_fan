import { useEffect, useState } from 'react';
import { getLanguage, setLanguage, subscribe, t } from './i18n';
import { LanguageCode } from './types';

export function useAppLanguage() {
  const [language, setLocalLanguage] = useState<LanguageCode>(getLanguage());

  useEffect(() => {
    const unsubscribe = subscribe((next) => {
      setLocalLanguage(next);
    });
    return unsubscribe;
  }, []);

  return {
    language,
    setLanguage,
    t,
  };
}
