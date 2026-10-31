export type Locale = 'en' | 'bn';

export const DEFAULT_LOCALE: Locale = 'en';

export const SUPPORTED_LOCALES: readonly Locale[] = ['en', 'bn'] as const;

export const LOCALE_COOKIE_NAME = 'techsprout_locale';

export const LOCALE_METADATA: Record<Locale, { name: string; nativeName: string; code: string; flag: string }> = {
  en: {
    name: 'English',
    nativeName: 'English',
    code: 'en',
    flag: '🇺🇸',
  },
  bn: {
    name: 'Bangla',
    nativeName: 'বাংলা',
    code: 'bn',
    flag: '🇧🇩',
  },
};

export type TranslationParams = Record<string, string | number>;

export type TranslationFunction = (key: string, params?: TranslationParams) => string;

export interface I18nContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: TranslationFunction;
  formatDate: (date: Date | string | number, options?: Intl.DateTimeFormatOptions) => string;
  formatNumber: (value: number | string, options?: Intl.NumberFormatOptions) => string;
  formatPercent: (value: number | string, options?: Intl.NumberFormatOptions) => string;
  formatCurrency: (amount: number | string | null | undefined, currency?: string) => string;
}
