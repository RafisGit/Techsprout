'use client';

import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { DEFAULT_LOCALE, I18nContextValue, Locale } from './types';
import { getClientLocale, isValidLocale, setClientLocale } from './cookies';
import { createTranslate } from './messages';
import { formatDate, formatNumber, formatPercent, formatCurrency } from './format';

const I18nContext = createContext<I18nContextValue | null>(null);

export interface LocaleProviderProps {
  initialLocale?: Locale;
  children: React.ReactNode;
}

export function LocaleProvider({ initialLocale = DEFAULT_LOCALE, children }: LocaleProviderProps) {
  const router = useRouter();
  const [locale, setLocaleState] = useState<Locale>(initialLocale);

  // Sync client-side cookie if changed or on mount
  useEffect(() => {
    const clientCookieLocale = getClientLocale();
    if (clientCookieLocale !== locale && isValidLocale(clientCookieLocale)) {
      setLocaleState(clientCookieLocale);
      if (document.documentElement) {
        document.documentElement.lang = clientCookieLocale;
      }
    }
  }, []);

  const handleSetLocale = React.useCallback(
    (newLocale: Locale) => {
      const valid = isValidLocale(newLocale) ? newLocale : DEFAULT_LOCALE;
      setLocaleState(valid);
      setClientLocale(valid);
      // Trigger Next.js router refresh so server components re-render with new cookie
      router.refresh();
    },
    [router]
  );

  const t = useMemo(() => createTranslate(locale), [locale]);

  const value = useMemo<I18nContextValue>(
    () => ({
      locale,
      setLocale: handleSetLocale,
      t,
      formatDate: (date, options) => formatDate(date, locale, options),
      formatNumber: (val, options) => formatNumber(val, locale, options),
      formatPercent: (val, options) => formatPercent(val, locale, options),
      formatCurrency: (amount, currency) => formatCurrency(amount, locale, currency),
    }),
    [locale, handleSetLocale, t]
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

/**
 * Access internationalization context in React Client Components.
 * If called outside of LocaleProvider, safely falls back to default locale.
 */
export function useTranslation(): I18nContextValue {
  let context: I18nContextValue | null = null;
  try {
    context = useContext(I18nContext);
  } catch {
    context = null;
  }

  if (!context) {
    // Safe fallback for un-wrapped components or unit tests
    const t = createTranslate(DEFAULT_LOCALE);
    return {
      locale: DEFAULT_LOCALE,
      setLocale: () => {},
      t,
      formatDate: (d, opt) => formatDate(d, DEFAULT_LOCALE, opt),
      formatNumber: (v, opt) => formatNumber(v, DEFAULT_LOCALE, opt),
      formatPercent: (v, opt) => formatPercent(v, DEFAULT_LOCALE, opt),
      formatCurrency: (a, c) => formatCurrency(a, DEFAULT_LOCALE, c),
    };
  }
  return context;
}

export const useLocale = useTranslation;
