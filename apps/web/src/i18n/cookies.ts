import { DEFAULT_LOCALE, LOCALE_COOKIE_NAME, Locale, SUPPORTED_LOCALES } from './types';

let memoryCookie = '';

export function isValidLocale(val: unknown): val is Locale {
  return typeof val === 'string' && (SUPPORTED_LOCALES as readonly string[]).includes(val);
}

export function parseLocale(value: string | null | undefined): Locale {
  if (!value) return DEFAULT_LOCALE;
  const clean = value.trim().toLowerCase();
  return isValidLocale(clean) ? clean : DEFAULT_LOCALE;
}

export function getClientLocale(): Locale {
  const cookieStr = typeof document !== 'undefined' ? document.cookie : memoryCookie;
  if (!cookieStr) return DEFAULT_LOCALE;
  const match = cookieStr.match(new RegExp(`(?:^|;\\s*)${LOCALE_COOKIE_NAME}=([^;]+)`));
  if (match) {
    return parseLocale(decodeURIComponent(match[1]));
  }
  return DEFAULT_LOCALE;
}

export function setClientLocale(locale: Locale): void {
  const validLocale = isValidLocale(locale) ? locale : DEFAULT_LOCALE;
  const maxAge = 60 * 60 * 24 * 365;
  const cookieEntry = `${LOCALE_COOKIE_NAME}=${encodeURIComponent(validLocale)}; path=/; max-age=${maxAge}; SameSite=Lax`;

  if (typeof document !== 'undefined') {
    document.cookie = cookieEntry;
    if (document.documentElement) {
      document.documentElement.lang = validLocale;
    }
  }
  memoryCookie = cookieEntry;
}

export function resetClientCookieForTesting(): void {
  memoryCookie = '';
  if (typeof document !== 'undefined') {
    document.cookie = `${LOCALE_COOKIE_NAME}=; max-age=0; path=/`;
  }
}
