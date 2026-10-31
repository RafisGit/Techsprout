import { DEFAULT_LOCALE, LOCALE_COOKIE_NAME, Locale } from './types';
import { isValidLocale } from './cookies';
import { createTranslate } from './messages';
import { formatDate, formatNumber, formatPercent, formatCurrency } from './format';

/**
 * Retrieve the current locale in Next.js Server Components.
 * Reads the `techsprout_locale` cookie with fallback to DEFAULT_LOCALE ('en').
 */
export async function getServerLocale(): Promise<Locale> {
  try {
    const { cookies } = await import('next/headers');
    const cookieStore = await cookies();
    const cookieVal = cookieStore.get(LOCALE_COOKIE_NAME)?.value;
    if (isValidLocale(cookieVal)) {
      return cookieVal;
    }
    return DEFAULT_LOCALE;
  } catch {
    return DEFAULT_LOCALE;
  }
}

/**
 * Synchronous translation provider for a known locale.
 * Reusable in both Server and Client environments.
 */
export function getTranslations(locale: Locale = DEFAULT_LOCALE) {
  const t = createTranslate(locale);
  return {
    locale,
    t,
    formatDate: (date: Date | string | number, options?: Intl.DateTimeFormatOptions) =>
      formatDate(date, locale, options),
    formatNumber: (value: number | string, options?: Intl.NumberFormatOptions) =>
      formatNumber(value, locale, options),
    formatPercent: (value: number | string, options?: Intl.NumberFormatOptions) =>
      formatPercent(value, locale, options),
    formatCurrency: (amount: number | string | null | undefined, currency: string = 'BDT') =>
      formatCurrency(amount, locale, currency),
  };
}

/**
 * Convenience helper for Next.js Server Components to fetch both current locale
 * and translation helpers in a single call.
 */
export async function getServerTranslations() {
  const locale = await getServerLocale();
  return getTranslations(locale);
}

