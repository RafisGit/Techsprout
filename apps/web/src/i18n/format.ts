import { Locale } from './types';

const LOCALE_MAP: Record<Locale, string> = {
  en: 'en-US',
  bn: 'bn-BD',
};

/** Convert Western digits (0-9) to Bangla numerals (০-৯) */
export function toBanglaDigits(str: string | number): string {
  const banglaDigits = ['০', '১', '২', '৩', '৪', '৫', '৬', '৭', '৮', '৯'];
  return String(str).replace(/[0-9]/g, (w) => banglaDigits[+w]);
}

/** Format a date according to the specified locale */
export function formatDate(
  date: Date | string | number | null | undefined,
  locale: Locale = 'en',
  options: Intl.DateTimeFormatOptions = { dateStyle: 'medium' }
): string {
  if (date === null || date === undefined || date === '') return '';
  try {
    const d = date instanceof Date ? date : new Date(date);
    if (isNaN(d.getTime())) return '';
    const intlLocale = LOCALE_MAP[locale] || 'en-US';
    return new Intl.DateTimeFormat(intlLocale, options).format(d);
  } catch {
    return String(date);
  }
}

/** Format a number according to the specified locale */
export function formatNumber(
  value: number | string,
  locale: Locale = 'en',
  options?: Intl.NumberFormatOptions
): string {
  try {
    const num = Number(value);
    if (!Number.isFinite(num)) return locale === 'bn' ? '০' : '0';
    const intlLocale = LOCALE_MAP[locale] || 'en-US';
    return new Intl.NumberFormat(intlLocale, options).format(num);
  } catch {
    return String(value);
  }
}

/** Format a percentage according to the specified locale */
export function formatPercent(
  value: number | string,
  locale: Locale = 'en',
  options?: Intl.NumberFormatOptions
): string {
  try {
    const num = Number(value);
    if (!Number.isFinite(num)) return locale === 'bn' ? '০%' : '0%';
    const intlLocale = LOCALE_MAP[locale] || 'en-US';
    return new Intl.NumberFormat(intlLocale, {
      style: 'percent',
      minimumFractionDigits: 0,
      maximumFractionDigits: 1,
      ...options,
    }).format(num);
  } catch {
    return `${value}%`;
  }
}

/**
 * Format currency strictly adhering to TechSprout BDT platform standards.
 *
 * Requirements:
 * - Preserve BDT as platform currency.
 * - Never output '$' for BDT amounts.
 * - In English: "BDT 1,000.00" (consistent with canonical @techsprout/contracts formatMoney)
 * - In Bangla: "BDT ১,০০০.০০"
 */
export function formatCurrency(
  amount: number | string | null | undefined,
  locale: Locale = 'en',
  currency: string = 'BDT'
): string {
  const code = (currency || 'BDT').toUpperCase();
  const val = Number(amount);
  const safe = Number.isFinite(val) ? val : 0;

  if (locale === 'bn') {
    const intl = new Intl.NumberFormat('bn-BD', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(safe);
    return `${code} ${intl}`;
  }

  // English formatting
  const grouped = safe.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${code} ${grouped}`;
}

