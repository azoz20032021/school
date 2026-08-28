import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { en } from './en';
import { setApiLang } from '../lib/api';

export type Lang = 'ar' | 'en';

const STORAGE_KEY = 'school_lang';

/**
 * Translation uses the Arabic source string as its own key.
 *
 * There is no separate key namespace to keep in sync, a missing translation
 * falls back to readable Arabic rather than a broken `screen.section.label`,
 * and the code stays legible in the language the app was written in.
 *
 * Only *display* text is translated. Values sent to the API — grade
 * categories, weekday names, payment methods — stay Arabic, because the server
 * validates against those exact strings.
 */
const DICTIONARIES: Record<Lang, Record<string, string>> = { ar: {}, en };

/**
 * The active language lives at module scope so `t()` can be a plain function
 * callable from anywhere, including helpers outside a component. Components do
 * not subscribe to it individually; instead the whole tree is remounted when
 * the language changes (see the `key` in App), which is cheap for an action
 * taken once in a session and keeps every call site a simple `t('...')`.
 */
let currentLang: Lang = 'ar';

/** Collapse newlines and repeated spaces so multi-line JSX text still matches. */
function normalize(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

/** Translate `text`, substituting `{name}` placeholders from `params`. */
export function t(text: string, params?: Record<string, string | number>): string {
  const dict = DICTIONARIES[currentLang];
  let out = dict[text] ?? dict[text.trim()] ?? dict[normalize(text)] ?? text;
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      out = out.split(`{${key}}`).join(String(value));
    }
  }
  return out;
}

/** Locale tag for `toLocaleDateString` and friends. */
export function localeOf(lang: Lang = currentLang): string {
  return lang === 'ar' ? 'ar-EG' : 'en-GB';
}

export function getLang(): Lang {
  return currentLang;
}

interface I18nValue {
  lang: Lang;
  dir: 'rtl' | 'ltr';
  setLang: (lang: Lang) => void;
  toggleLang: () => void;
  t: typeof t;
}

const I18nContext = createContext<I18nValue | undefined>(undefined);

function readStoredLang(): Lang {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'ar' || saved === 'en') return saved;
  } catch {
    /* private browsing */
  }
  // Arabic is the default for a first-time visitor, regardless of browser locale.
  return 'ar';
}

// Apply the stored choice before the first render so the initial paint is
// already in the right language and direction.
currentLang = readStoredLang();
setApiLang(currentLang);

export const I18nProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [lang, setLangState] = useState<Lang>(currentLang);
  const dir: 'rtl' | 'ltr' = lang === 'ar' ? 'rtl' : 'ltr';

  useEffect(() => {
    currentLang = lang;
    document.documentElement.lang = lang;
    document.documentElement.dir = dir;
    // The API returns validation and error text, so it needs to know too.
    setApiLang(lang);
  }, [lang, dir]);

  const setLang = useCallback((next: Lang) => {
    currentLang = next;
    setLangState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* ignore */
    }
  }, []);

  const toggleLang = useCallback(() => {
    setLang(currentLang === 'ar' ? 'en' : 'ar');
  }, [setLang]);

  const value = useMemo(() => ({ lang, dir, setLang, toggleLang, t }), [lang, dir, setLang, toggleLang]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
};

export function useI18n(): I18nValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used within an I18nProvider');
  return ctx;
}
