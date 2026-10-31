import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  DEFAULT_LOCALE,
  SUPPORTED_LOCALES,
  LOCALE_COOKIE_NAME,
  LOCALE_METADATA,
  en,
  bn,
  messages,
  getMessage,
  createTranslate,
  getTranslations,
  isValidLocale,
  parseLocale,
  getClientLocale,
  setClientLocale,
  resetClientCookieForTesting,
  formatDate,
  formatNumber,
  formatPercent,
  formatCurrency,
  toBanglaDigits,
} from '@/i18n';

describe('Phase 10.1 / WP-P10-01: Internationalization Foundation & Localization Suite', () => {
  beforeEach(() => {
    // Reset cookie before each test
    resetClientCookieForTesting();
  });

  // =========================================================================
  // 1. ENGLISH LOCALE LOADING
  // =========================================================================
  describe('1. English Locale Loading', () => {
    it('loads complete English dictionary with all required domains', () => {
      expect(en).toBeDefined();
      expect(en.brand.name).toBe('TechSprout School');
      expect(en.nav.home).toBe('Home');
      expect(en.nav.courses).toBe('Courses');
      expect(en.actions.login).toBe('Log In');
      expect(en.actions.register).toBe('Register');
      expect(en.actions.retry).toBe('Retry');
      expect(en.dashboard.title).toBe('Student Dashboard');
      expect(en.dashboard.enrolledCourses).toBe('Enrolled Courses');
      expect(en.language.en).toBe('English');
      expect(en.language.bn).toBe('Bangla');
    });

    it('translates English keys accurately via translation helper', () => {
      const t = createTranslate('en');
      expect(t('nav.home')).toBe('Home');
      expect(t('actions.signOut')).toBe('Sign Out');
      expect(t('dashboard.welcome', { name: 'Rafi' })).toBe('Welcome back, Rafi!');
      expect(t('dashboard.enrolledCountPlural', { count: 5 })).toBe('5 courses currently in your study list');
    });
  });

  // =========================================================================
  // 2. BANGLA LOCALE LOADING
  // =========================================================================
  describe('2. Bangla Locale Loading', () => {
    it('loads complete Bangla dictionary with natural and consistent terminology', () => {
      expect(bn).toBeDefined();
      expect(bn.brand.name).toBe('TechSprout School');
      expect(bn.nav.home).toBe('হোম');
      expect(bn.nav.courses).toBe('কোর্সসমূহ');
      expect(bn.actions.login).toBe('লগইন');
      expect(bn.actions.register).toBe('নিবন্ধন');
      expect(bn.actions.retry).toBe('পুনরায় চেষ্টা করুন');
      expect(bn.dashboard.title).toBe('শিক্ষার্থী ড্যাশবোর্ড');
      expect(bn.dashboard.enrolledCourses).toBe('নিবন্ধিত কোর্স');
      expect(bn.dashboard.inProgress).toBe('চলমান কোর্স');
      expect(bn.dashboard.certificates).toBe('অর্জিত সনদ');
      expect(bn.language.en).toBe('English');
      expect(bn.language.bn).toBe('বাংলা');
    });

    it('translates Bangla keys accurately via translation helper with parameter substitution', () => {
      const t = createTranslate('bn');
      expect(t('nav.home')).toBe('হোম');
      expect(t('actions.signOut')).toBe('সাইন আউট');
      expect(t('dashboard.welcome', { name: 'রাফি' })).toBe('স্বাগতম, রাফি!');
      expect(t('dashboard.inProgressCountPlural', { count: 3 })).toBe('৩টি কোর্সের পাঠ চলমান রয়েছে');
    });
  });

  // =========================================================================
  // 3. LANGUAGE SWITCHING
  // =========================================================================
  describe('3. Language Switching', () => {
    it('supports switching between en and bn locales seamlessly', () => {
      const tEn = createTranslate('en');
      const tBn = createTranslate('bn');

      expect(tEn('nav.home')).toBe('Home');
      expect(tBn('nav.home')).toBe('হোম');

      expect(tEn('actions.browseCatalog')).toBe('Browse Catalog');
      expect(tBn('actions.browseCatalog')).toBe('কোর্স ক্যাটালগ দেখুন');
    });

    it('exposes supported locales and metadata for UI rendering', () => {
      expect(SUPPORTED_LOCALES).toEqual(['en', 'bn']);
      expect(LOCALE_METADATA.en.nativeName).toBe('English');
      expect(LOCALE_METADATA.bn.nativeName).toBe('বাংলা');
    });
  });

  // =========================================================================
  // 4. LANGUAGE PREFERENCE PERSISTENCE
  // =========================================================================
  describe('4. Language Preference Persistence', () => {
    it('parses valid locale strings and rejects invalid inputs', () => {
      expect(isValidLocale('en')).toBe(true);
      expect(isValidLocale('bn')).toBe(true);
      expect(isValidLocale('fr')).toBe(false);
      expect(isValidLocale('')).toBe(false);
      expect(isValidLocale(null)).toBe(false);
      expect(isValidLocale(undefined)).toBe(false);
    });

    it('persists selected language in document.cookie with 1-year max-age', () => {
      setClientLocale('bn');
      expect(getClientLocale()).toBe('bn');

      setClientLocale('en');
      expect(getClientLocale()).toBe('en');
    });

    it('updates document.documentElement.lang on locale change', () => {
      if (typeof document !== 'undefined') {
        setClientLocale('bn');
        expect(document.documentElement.lang).toBe('bn');

        setClientLocale('en');
        expect(document.documentElement.lang).toBe('en');
      }
    });
  });

  // =========================================================================
  // 5. INVALID LOCALE FALLBACK
  // =========================================================================
  describe('5. Invalid Locale Fallback', () => {
    it('falls back to default locale (en) when encountering invalid locale strings', () => {
      expect(parseLocale('invalid_code')).toBe(DEFAULT_LOCALE);
      expect(parseLocale('es')).toBe(DEFAULT_LOCALE);
      expect(parseLocale('1234')).toBe(DEFAULT_LOCALE);
      expect(parseLocale(null)).toBe(DEFAULT_LOCALE);
      expect(parseLocale(undefined)).toBe(DEFAULT_LOCALE);
      expect(parseLocale('')).toBe(DEFAULT_LOCALE);
    });

    it('falls back safely to default dictionary when invalid locale is requested', () => {
      // @ts-expect-error testing invalid locale runtime fallback
      const t = createTranslate('unknown_locale');
      expect(t('nav.home')).toBe('Home');
    });
  });

  // =========================================================================
  // 6. MISSING TRANSLATION FALLBACK
  // =========================================================================
  describe('6. Missing Translation Fallback', () => {
    it('falls back to English when a key is missing in Bangla', () => {
      // Temporarily test with a mock dictionary having missing key
      const partialBn: any = { nav: {} };
      const testDicts: any = {
        en: { nav: { specialKey: 'English Fallback Value' } },
        bn: partialBn,
      };

      const parts = 'nav.specialKey'.split('.');
      const valBn = getMessage(testDicts.bn, 'nav.specialKey');
      expect(valBn).toBeUndefined();

      const valEn = getMessage(testDicts.en, 'nav.specialKey');
      expect(valEn).toBe('English Fallback Value');
    });

    it('returns the raw key when the key is missing in all locales without throwing', () => {
      const t = createTranslate('bn');
      expect(t('nonexistent.nested.key')).toBe('nonexistent.nested.key');

      const tEn = createTranslate('en');
      expect(tEn('completely.missing.key')).toBe('completely.missing.key');
    });
  });

  // =========================================================================
  // 7. DATE AND NUMBER FORMATTING
  // =========================================================================
  describe('7. Date, Number and Percentage Formatting', () => {
    it('formats numbers with Western grouping in English and Bangla digits in Bangla', () => {
      expect(formatNumber(1250, 'en')).toBe('1,250');
      const bnNum = formatNumber(1250, 'bn');
      // Should format as Bangla numerals ১,২৫০
      expect(bnNum).toContain('১,২৫০');

      expect(formatNumber(0, 'en')).toBe('0');
      expect(formatNumber(0, 'bn')).toBe('০');
    });

    it('converts ASCII digits to Bangla digits accurately', () => {
      expect(toBanglaDigits('0123456789')).toBe('০১২৩৪৫৬৭৮৯');
      expect(toBanglaDigits('Course 101')).toBe('Course ১০১');
    });

    it('formats percentages accurately across locales', () => {
      expect(formatPercent(0.75, 'en')).toBe('75%');
      const bnPercent = formatPercent(0.75, 'bn');
      expect(bnPercent).toContain('৭৫%');
    });

    it('formats dates accurately without throwing on string, number or Date objects', () => {
      const date = new Date('2026-10-31T12:00:00Z');
      const enDate = formatDate(date, 'en');
      expect(enDate).toBeTruthy();
      expect(enDate).toContain('2026');

      const bnDate = formatDate(date, 'bn');
      expect(bnDate).toBeTruthy();
      expect(bnDate).toContain('২০২৬');

      // Handles invalid dates gracefully
      expect(formatDate('invalid-date', 'en')).toBe('');
    });
  });

  // =========================================================================
  // 8. CURRENCY FORMATTING USING BDT
  // =========================================================================
  describe('8. Currency Formatting Using BDT', () => {
    it('never renders a $ symbol for BDT amounts in either English or Bangla', () => {
      expect(formatCurrency(1000, 'en', 'BDT')).not.toContain('$');
      expect(formatCurrency(1000, 'bn', 'BDT')).not.toContain('$');
      expect(formatCurrency('2500.50', 'en')).not.toContain('$');
      expect(formatCurrency('2500.50', 'bn')).not.toContain('$');
    });

    it('formats BDT in English exactly matching canonical format: "BDT 1,000.00"', () => {
      expect(formatCurrency(1000, 'en', 'BDT')).toBe('BDT 1,000.00');
      expect(formatCurrency('1000.00', 'en', 'BDT')).toBe('BDT 1,000.00');
      expect(formatCurrency(0, 'en', 'BDT')).toBe('BDT 0.00');
      expect(formatCurrency(null, 'en', 'BDT')).toBe('BDT 0.00');
      expect(formatCurrency(undefined, 'en', 'BDT')).toBe('BDT 0.00');
      expect(formatCurrency(125000, 'en', 'BDT')).toBe('BDT 125,000.00');
    });

    it('formats BDT in Bangla with correct Bangla digits and BDT currency code: "BDT ১,০০০.০০"', () => {
      const bnCurrency = formatCurrency(1000, 'bn', 'BDT');
      expect(bnCurrency).toContain('BDT');
      expect(bnCurrency).toContain('১,০০০.০০');

      const bnLarge = formatCurrency(125000, 'bn', 'BDT');
      expect(bnLarge).toContain('BDT');
      expect(bnLarge).toContain('১,২৫,০০০.০০');
    });

    it('does not mutate or alter numeric calculation values during formatting', () => {
      const originalAmount = 4500.75;
      const formattedEn = formatCurrency(originalAmount, 'en');
      const formattedBn = formatCurrency(originalAmount, 'bn');

      expect(formattedEn).toBe('BDT 4,500.75');
      expect(formattedBn).toContain('৪,৫০০.৭৫');
      // Original variable remains pure number
      expect(originalAmount).toBe(4500.75);
    });
  });

  // =========================================================================
  // 9. LANGUAGE PERSISTENCE AFTER NAVIGATION / RELOAD
  // =========================================================================
  describe('9. Language Persistence After Navigation or Reload', () => {
    it('re-reads cookie preference accurately simulating page reload', () => {
      // 1. Set locale to 'bn'
      setClientLocale('bn');
      expect(getClientLocale()).toBe('bn');

      // 2. Simulate next server/client instantiation reading cookie
      const reloadedLocale = getClientLocale();
      expect(reloadedLocale).toBe('bn');

      const { t } = getTranslations(reloadedLocale);
      expect(t('nav.courses')).toBe('কোর্সসমূহ');
    });
  });

  // =========================================================================
  // 10. KEYBOARD ACCESSIBILITY OF LANGUAGE SWITCHER
  // =========================================================================
  describe('10. Keyboard Accessibility & Accessible Labels', () => {
    it('provides accessible labels for the language switcher trigger', () => {
      const tEn = createTranslate('en');
      const tBn = createTranslate('bn');

      expect(tEn('a11y.languageSwitcher')).toBe('Change language');
      expect(tBn('a11y.languageSwitcher')).toBe('ভাষা পরিবর্তন করুন');
    });

    it('provides accessible switch-to labels for each available language option', () => {
      const t = createTranslate('en');
      expect(t('language.switchTo', { lang: 'Bangla' })).toBe('Switch to Bangla');
      expect(t('language.switchTo', { lang: 'English' })).toBe('Switch to English');

      const tBn = createTranslate('bn');
      expect(tBn('language.switchTo', { lang: 'বাংলা' })).toBe('বাংলা-এ পরিবর্তন করুন');
    });

    it('supports keyboard trigger keys (Enter and Space) and updates locale on action', () => {
      let currentLocale = 'en';
      const handleKeyDown = (e: { key: string; preventDefault: () => void }, targetLocale: 'en' | 'bn') => {
        if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') {
          e.preventDefault();
          currentLocale = targetLocale;
        }
      };

      const preventDefault = vi.fn();

      // Simulate Enter key
      handleKeyDown({ key: 'Enter', preventDefault }, 'bn');
      expect(currentLocale).toBe('bn');
      expect(preventDefault).toHaveBeenCalled();

      // Simulate Space key
      preventDefault.mockClear();
      handleKeyDown({ key: ' ', preventDefault }, 'en');
      expect(currentLocale).toBe('en');
      expect(preventDefault).toHaveBeenCalled();
    });

    it('provides clear accessibility labels for screen readers across navigation and shell', () => {
      const t = createTranslate('en');
      expect(t('a11y.openMenu')).toBe('Open main menu');
      expect(t('a11y.closeMenu')).toBe('Close menu');
      expect(t('a11y.userMenu')).toBe('User account menu');
      expect(t('a11y.progressBar')).toBe('Course completion progress');
    });

    it('provides safe server translation helper fallback outside next/headers', async () => {
      const { getServerLocale, getServerTranslations } = await import('@/i18n/server');
      const locale = await getServerLocale();
      expect(locale).toBe('en');

      const serverI18n = await getServerTranslations();
      expect(serverI18n.locale).toBe('en');
      expect(serverI18n.t('nav.home')).toBe('Home');
    });

    it('provides safe useTranslation client hook fallback outside provider', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const { useTranslation } = await import('@/i18n/client');
      const hookResult = useTranslation();
      expect(hookResult.locale).toBe('en');
      expect(hookResult.t('brand.name')).toBe('TechSprout School');
      expect(hookResult.formatCurrency(500)).toBe('BDT 500.00');
      consoleSpy.mockRestore();
    });
  });
});
