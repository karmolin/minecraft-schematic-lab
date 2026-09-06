import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { en, type Messages } from './locales/en';
import { zh } from './locales/zh';

type Lang = 'en' | 'zh';

const LOCALES: Record<Lang, Messages> = { en, zh };
const STORAGE_KEY = 'msl-lang';

function detectLang(): Lang {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === 'en' || stored === 'zh') return stored;
  return navigator.language.startsWith('zh') ? 'zh' : 'en';
}

interface I18nContextValue {
  lang: Lang;
  t: Messages;
  toggleLang: () => void;
}

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLang] = useState<Lang>(detectLang);

  const toggleLang = useCallback(() => {
    setLang((prev) => {
      const next: Lang = prev === 'en' ? 'zh' : 'en';
      localStorage.setItem(STORAGE_KEY, next);
      document.documentElement.lang = next;
      return next;
    });
  }, []);

  const value = useMemo<I18nContextValue>(
    () => ({ lang, t: LOCALES[lang], toggleLang }),
    [lang, toggleLang],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used inside I18nProvider');
  return ctx;
}
