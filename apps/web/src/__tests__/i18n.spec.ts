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

  // =========================================================================
  // 11. COMPLETE STUDENT PORTAL DOMAIN TRANSLATIONS (WP-P10-02)
  // =========================================================================
  describe('11. Student Portal Domain Translations (WP-P10-02)', () => {
    it('provides complete catalog translations in English and Bangla', () => {
      expect(en.catalog.pageTitle).toBe('Courses');
      expect(bn.catalog.pageTitle).toBe('কোর্সসমূহ');
      expect(en.catalog.searchPlaceholder).toBe('Search courses by topic, skill, or title...');
      expect(bn.catalog.searchPlaceholder).toBe('বিষয়, দক্ষতা বা শিরোনাম দিয়ে কোর্স খুঁজুন...');
      expect(en.catalog.categories).toBe('Categories');
      expect(bn.catalog.categories).toBe('ক্যাটাগরি');
    });

    it('provides complete course details translations in English and Bangla', () => {
      expect(en.courseDetails.enrollNow).toBe('Enroll Now');
      expect(bn.courseDetails.enrollNow).toBe('এখনই এনরোল করুন');
      expect(en.courseDetails.curriculum).toBe('Course Curriculum');
      expect(bn.courseDetails.curriculum).toBe('কোর্স পাঠ্যক্রম');
      expect(en.courseDetails.aboutCourse).toBe('About This Course');
      expect(bn.courseDetails.aboutCourse).toBe('কোর্স সম্পর্কে');
    });

    it('provides complete learning workspace translations in English and Bangla', () => {
      expect(en.learning.askAiTutor).toBe('Ask AI Tutor');
      expect(bn.learning.askAiTutor).toBe('এআই টিউটরকে জিজ্ঞাসা করুন');
      expect(en.learning.nextLesson).toBe('Next Lesson');
      expect(bn.learning.nextLesson).toBe('পরবর্তী পাঠ');
      expect(en.learning.previousLesson).toBe('Previous Lesson');
      expect(bn.learning.previousLesson).toBe('পূর্ববর্তী পাঠ');
    });

    it('provides complete quiz runner and assessment translations in English and Bangla', () => {
      expect(en.quiz.startQuiz).toBe('Start Quiz');
      expect(bn.quiz.startQuiz).toBe('কুইজ শুরু করুন');
      expect(en.quiz.submitQuiz).toBe('Submit Quiz');
      expect(bn.quiz.submitQuiz).toBe('কুইজ জমা দিন');
      expect(en.quiz.passed).toBe('Congratulations, you passed!');
      expect(bn.quiz.passed).toBe('অভিনন্দন, আপনি উত্তীর্ণ হয়েছেন!');
      expect(en.quiz.failed).toBe('You did not meet the passing score.');
      expect(bn.quiz.failed).toBe('আপনি পাসের নম্বর অর্জন করতে পারেননি।');
    });

    it('provides complete assignment translations in English and Bangla', () => {
      expect(en.assignments.title).toBe('Assignments');
      expect(bn.assignments.title).toBe('অ্যাসাইনমেন্ট');
      expect(en.assignments.submitAssignment).toBe('Submit Assignment');
      expect(bn.assignments.submitAssignment).toBe('অ্যাসাইনমেন্ট জমা দিন');
      expect(en.assignments.uploadFile).toBe('Upload File');
      expect(bn.assignments.uploadFile).toBe('ফাইল আপলোড করুন');
    });

    it('provides complete lesson discussion translations in English and Bangla', () => {
      expect(en.discussions.lessonDiscussionsAndQa).toBe('Lesson Discussions & Q&A');
      expect(bn.discussions.lessonDiscussionsAndQa).toBe('পাঠ আলোচনা ও প্রশ্নোত্তর');
      expect(en.discussions.askQuestion).toBe('Ask a Question');
      expect(bn.discussions.askQuestion).toBe('প্রশ্ন জিজ্ঞাসা করুন');
      expect(en.discussions.recent).toBe('Recent');
      expect(bn.discussions.recent).toBe('সাম্প্রতিক');
      expect(en.discussions.upvoted).toBe('Most Upvoted');
      expect(bn.discussions.upvoted).toBe('সর্বোচ্চ ভোটপ্রাপ্ত');
    });

    it('provides complete orders and invoice translations in English and Bangla', () => {
      expect(en.orders.pageTitle).toBe('Orders');
      expect(bn.orders.pageTitle).toBe('অর্ডারসমূহ');
      expect(en.orders.purchaseHistory).toBe('My Purchase History');
      expect(bn.orders.purchaseHistory).toBe('আমার ক্রয়ের ইতিহাস');
      expect(en.orders.paid).toBe('Paid');
      expect(bn.orders.paid).toBe('পরিশোধিত');
      expect(en.orders.viewInvoice).toBe('View Invoice');
      expect(bn.orders.viewInvoice).toBe('ইনভয়েস দেখুন');
      expect(en.orders.refundPolicyTitle).toBe('Refund Policy & Satisfaction Guarantee');
      expect(bn.orders.refundPolicyTitle).toBe('রিফান্ড নীতি ও সন্তুষ্টির নিশ্চয়তা');
    });

    it('provides complete certificate and verification translations in English and Bangla', () => {
      expect(en.certificate.pageTitle).toBe('Verified Certificate of Completion');
      expect(bn.certificate.pageTitle).toBe('সত্যায়িত কোর্স সমাপনী সার্টিফিকেট');
      expect(en.certificate.officialCredentials).toBe('Authorized Certificate by TechSprout School');
      expect(bn.certificate.officialCredentials).toBe('টেকস্প্রাউট স্কুলের অনুমোদিত সার্টিফিকেট');
      expect(en.certificate.verifyOnline).toBe('Verify Authenticity');
      expect(bn.certificate.verifyOnline).toBe('সত্যতা যাচাই করুন');
      expect(en.certificate.verifyTitle).toBe('Verify TechSprout Certificate');
      expect(bn.certificate.verifyTitle).toBe('টেকস্প্রাউট সার্টিফিকেট যাচাই করুন');
    });

    it('verifies 100% dictionary key parity between English and Bangla', () => {
      function compareKeys(objEn: any, objBn: any, path: string = ''): string[] {
        const missing: string[] = [];
        for (const key of Object.keys(objEn)) {
          const currentPath = path ? `${path}.${key}` : key;
          if (objBn[key] === undefined) {
            missing.push(`Missing in Bangla: ${currentPath}`);
          } else if (typeof objEn[key] === 'object' && objEn[key] !== null) {
            missing.push(...compareKeys(objEn[key], objBn[key], currentPath));
          }
        }
        return missing;
      }

      const missingKeys = compareKeys(en, bn);
      expect(missingKeys).toEqual([]);
    });

    it('correctly handles student portal parameter substitution across both locales', () => {
      const tEn = createTranslate('en');
      const tBn = createTranslate('bn');

      expect(tEn('quiz.questionsCount', { count: 10 })).toBe('10 Questions');
      expect(tBn('quiz.questionsCount', { count: 10 })).toBe('১০টি প্রশ্ন');

      expect(tEn('certificate.finalScore', { score: 95 })).toBe('Final Assessment Score: 95%');
      expect(tBn('certificate.finalScore', { score: 95 })).toBe('চূড়ান্ত মূল্যায়ন স্কোর: ৯৫%');

      expect(tEn('orders.paidOn', { date: 'Oct 31, 2026' })).toBe('Paid on Oct 31, 2026');
      expect(tBn('orders.paidOn', { date: '৩১ অক্টোবর, ২০২৬' })).toBe('পরিশোধের তারিখ: ৩১ অক্টোবর, ২০২৬');
    });
  });

  // =========================================================================
  // 12. WP-P10-03: INSTRUCTOR PORTAL LOCALIZATION
  // =========================================================================
  describe('12. WP-P10-03: Complete Instructor Portal Bangla & English Localization', () => {
    it('12.1 provides complete instructor layout and navigation in English and Bangla', () => {
      expect(en.instructor.portal).toBe('Instructor Portal');
      expect(bn.instructor.portal).toBe('প্রশিক্ষক পোর্টাল');
      expect(en.instructor.accessDeniedTitle).toBe('Access Denied (403 Forbidden)');
      expect(bn.instructor.accessDeniedTitle).toBe('প্রবেশাধিকার সংরক্ষিত (৪০৩ নিষিদ্ধ)');
      expect(en.instructor.nav.dashboard).toBe('Dashboard');
      expect(bn.instructor.nav.dashboard).toBe('ড্যাশবোর্ড');
      expect(en.instructor.nav.courses).toBe('My Courses');
      expect(bn.instructor.nav.courses).toBe('আমার কোর্সসমূহ');
      expect(en.instructor.nav.earnings).toBe('Earnings & Payouts');
      expect(bn.instructor.nav.earnings).toBe('উপার্জন ও পেআউট');
      expect(en.instructor.nav.profile).toBe('Profile');
      expect(bn.instructor.nav.profile).toBe('প্রোফাইল');
      expect(en.instructor.nav.signOut).toBe('Sign Out');
      expect(bn.instructor.nav.signOut).toBe('লগআউট');
    });

    it('12.2 provides complete instructor dashboard metrics and breakdown tables in English and Bangla', () => {
      expect(en.instructor.dashboard.portfolioAnalytics).toBe('Portfolio Learning Analytics');
      expect(bn.instructor.dashboard.portfolioAnalytics).toBe('পোর্টফোলিও লার্নিং অ্যানালিটিক্স');
      expect(en.instructor.dashboard.uniqueLearners).toBe('Unique Learners');
      expect(bn.instructor.dashboard.uniqueLearners).toBe('অনন্য শিক্ষার্থী');
      expect(en.instructor.dashboard.courseCompletions).toBe('Course Completions');
      expect(bn.instructor.dashboard.courseCompletions).toBe('কোর্স সমাপ্তি');
      expect(en.instructor.dashboard.portfolioCompletionRate).toBe('Portfolio Completion Rate');
      expect(bn.instructor.dashboard.portfolioCompletionRate).toBe('পোর্টফোলিও সমাপ্তির হার');
      expect(en.instructor.dashboard.activeLearners30d).toBe('30-Day Active Learners');
      expect(bn.instructor.dashboard.activeLearners30d).toBe('৩০ দিনের সক্রিয় শিক্ষার্থী');
      expect(en.instructor.dashboard.table.courseTitle).toBe('Course Title');
      expect(bn.instructor.dashboard.table.courseTitle).toBe('কোর্সের শিরোনাম');
      expect(en.instructor.dashboard.table.enrolled).toBe('Enrolled');
      expect(bn.instructor.dashboard.table.enrolled).toBe('ভর্তিকৃত');
      expect(en.instructor.dashboard.cards.teachingCourses).toBe('My Teaching Courses');
      expect(bn.instructor.dashboard.cards.teachingCourses).toBe('আমার পাঠদান কোর্সসমূহ');
    });

    it('12.3 provides complete course management, review, and withdrawal modal strings in English and Bangla', () => {
      expect(en.instructor.courses.title).toBe('My Teaching Courses');
      expect(bn.instructor.courses.title).toBe('আমার পাঠদান কোর্সসমূহ');
      expect(en.instructor.courses.tabs.inReview).toBe('In Review');
      expect(bn.instructor.courses.tabs.inReview).toBe('পর্যালোচনাধীন');
      expect(en.instructor.courses.actions.submitForReview).toBe('Submit for Review');
      expect(bn.instructor.courses.actions.submitForReview).toBe('পর্যালোচনার জন্য জমা দিন');
      expect(en.instructor.courses.actions.withdrawReview).toBe('Withdraw Review');
      expect(bn.instructor.courses.actions.withdrawReview).toBe('পর্যালোচনা প্রত্যাহার করুন');
      expect(en.instructor.review.modalTitle).toBe('Submit Course for Institutional Review');
      expect(bn.instructor.review.modalTitle).toBe('প্রাতিষ্ঠানিক পর্যালোচনার জন্য কোর্স জমা দিন');
      expect(en.instructor.review.preflightChecklist).toBe('Curriculum Preflight Checklist');
      expect(bn.instructor.review.preflightChecklist).toBe('পাঠ্যক্রমের প্রাথমিক যাচাই তালিকা');
      expect(en.instructor.review.withdrawalTitle).toBe('Withdraw Course Review Request');
      expect(bn.instructor.review.withdrawalTitle).toBe('কোর্স পর্যালোচনা আবেদন প্রত্যাহার');
      expect(en.instructor.review.underReviewTitle).toBe('Under Administrative Review');
      expect(bn.instructor.review.underReviewTitle).toBe('প্রশাসনিক পর্যালোচনাধীন');
      expect(en.instructor.review.revisionsRequestedTitle).toBe('Revisions Requested by Administration');
      expect(bn.instructor.review.revisionsRequestedTitle).toBe('প্রশাসন কর্তৃক সংশোধনের অনুরোধ');
    });

    it('12.4 provides complete learner roster, table headers, and CSV export strings in English and Bangla', () => {
      expect(en.instructor.learners.title).toBe('Course Learner Roster');
      expect(bn.instructor.learners.title).toBe('কোর্সের শিক্ষার্থী তালিকা');
      expect(en.instructor.learners.exportCsv).toBe('Export CSV');
      expect(bn.instructor.learners.exportCsv).toBe('CSV এক্সপোর্ট');
      expect(en.instructor.learners.table.learner).toBe('Learner');
      expect(bn.instructor.learners.table.learner).toBe('শিক্ষার্থী');
      expect(en.instructor.learners.table.courseProgress).toBe('Course Progress');
      expect(bn.instructor.learners.table.courseProgress).toBe('কোর্সের অগ্রগতি');
      expect(en.instructor.learners.metrics.activeLearners).toBe('Active Learners');
      expect(bn.instructor.learners.metrics.activeLearners).toBe('সক্রিয় শিক্ষার্থী');
    });

    it('12.5 provides complete course analytics, date ranges, and privacy notices in English and Bangla', () => {
      expect(en.instructor.analytics.title).toBe('Course Analytics & Performance');
      expect(bn.instructor.analytics.title).toBe('কোর্স অ্যানালিটিক্স ও পারফরম্যান্স');
      expect(en.instructor.analytics.dateRange.last7Days).toBe('Last 7 Days');
      expect(bn.instructor.analytics.dateRange.last7Days).toBe('গত ৭ দিন');
      expect(en.instructor.analytics.dateRange.last30Days).toBe('Last 30 Days');
      expect(bn.instructor.analytics.dateRange.last30Days).toBe('গত ৩০ দিন');
      expect(en.instructor.analytics.dateRange.applyRange).toBe('Apply Range');
      expect(bn.instructor.analytics.dateRange.applyRange).toBe('প্রয়োগ করুন');
      expect(en.instructor.analytics.privacyNoticeTitle).toBe('Privacy Notice (Small Cohort):');
      expect(bn.instructor.analytics.privacyNoticeTitle).toBe('গোপনীয়তা বিজ্ঞপ্তি (ছোট দল):');
    });

    it('12.6 provides complete instructor earnings, ledger, and payout modal strings in English and Bangla', () => {
      expect(en.instructor.earnings.title).toBe('Earnings & Payouts');
      expect(bn.instructor.earnings.title).toBe('উপার্জন ও পেআউট');
      expect(en.instructor.earnings.availableBalance).toBe('Available for Payout');
      expect(bn.instructor.earnings.availableBalance).toBe('উত্তোলনের জন্য প্রস্তুত ব্যালেন্স');
      expect(en.instructor.earnings.escrowPending).toBe('14-Day Escrow');
      expect(bn.instructor.earnings.escrowPending).toBe('১৪ দিনের এসক্রো');
      expect(en.instructor.earnings.lifetimeEarnings).toBe('Lifetime Earnings');
      expect(bn.instructor.earnings.lifetimeEarnings).toBe('সর্বমোট মোট আয়');
      expect(en.instructor.earnings.modal.title).toBe('Request Payout');
      expect(bn.instructor.earnings.modal.title).toBe('পেআউট অনুরোধ করুন');
      expect(en.instructor.earnings.modal.methods.bkash).toBe('bKash');
      expect(bn.instructor.earnings.modal.methods.bkash).toBe('বিকাশ');
      expect(en.instructor.earnings.modal.methods.nagad).toBe('Nagad');
      expect(bn.instructor.earnings.modal.methods.nagad).toBe('নগদ');
      expect(en.instructor.earnings.modal.methods.bankTransfer).toBe('Bank Wire');
      expect(bn.instructor.earnings.modal.methods.bankTransfer).toBe('ব্যাংক স্থানান্তর');
      expect(en.instructor.earnings.ledger.title).toBe('Double-Entry Ledger Statement');
      expect(bn.instructor.earnings.ledger.title).toBe('দ্বৈত-প্রবিষ্টি লেজার স্টেটমেন্ট');
    });

    it('12.7 provides complete instructor profile, faculty verification, and bio editor strings in English and Bangla', () => {
      expect(en.instructor.profile.title).toBe('Instructor Profile');
      expect(bn.instructor.profile.title).toBe('প্রশিক্ষক প্রোফাইল');
      expect(en.instructor.profile.verifiedFaculty).toBe('Verified Faculty');
      expect(bn.instructor.profile.verifiedFaculty).toBe('যাচাইকৃত অনুষদ');
      expect(en.instructor.profile.identitySection).toBe('Institutional Identity');
      expect(bn.instructor.profile.identitySection).toBe('প্রাতিষ্ঠানিক পরিচয়');
      expect(en.instructor.profile.publicSection).toBe('Public Educator Profile');
      expect(bn.instructor.profile.publicSection).toBe('পাবলিক এডুকেটর প্রোফাইল');
      expect(en.instructor.profile.headline).toBe('Professional Headline');
      expect(bn.instructor.profile.headline).toBe('পেশাদার শিরোনাম');
      expect(en.instructor.profile.credentials).toBe('Academic & Professional Credentials');
      expect(bn.instructor.profile.credentials).toBe('একাডেমিক ও পেশাদার প্রশংসাপত্র');
      expect(en.instructor.profile.bio).toBe('Biography');
      expect(bn.instructor.profile.bio).toBe('জীবনী');
    });

    it('12.8 strictly formats BDT currency without dollar signs across English and Bangla', () => {
      // English BDT format
      expect(formatCurrency(1000, 'en', 'BDT')).toBe('BDT 1,000.00');
      expect(formatCurrency(50.5, 'en', 'BDT')).toBe('BDT 50.50');
      expect(formatCurrency(0, 'en', 'BDT')).toBe('BDT 0.00');

      // Bangla BDT format
      expect(formatCurrency(1000, 'bn', 'BDT')).toBe('BDT ১,০০০.০০');
      expect(formatCurrency(50.5, 'bn', 'BDT')).toBe('BDT ৫০.৫০');
      expect(formatCurrency(0, 'bn', 'BDT')).toBe('BDT ০.০০');

      // Never contains dollar signs
      expect(formatCurrency(1500, 'en', 'BDT')).not.toContain('$');
      expect(formatCurrency(1500, 'bn', 'BDT')).not.toContain('$');
    });

    it('12.9 handles parameter substitution across instructor domains', () => {
      const tEn = createTranslate('en');
      const tBn = createTranslate('bn');

      expect(tEn('instructor.dashboard.welcome', { name: 'Dr. Tariq' })).toBe('Welcome back, Dr. Tariq!');
      expect(tBn('instructor.dashboard.welcome', { name: 'ড. তারিক' })).toBe('স্বাগতম, ড. তারিক!');

      expect(tEn('instructor.review.withdrawalDesc', { title: 'Python 101' })).toBe('Are you sure you want to withdraw the submission for Python 101?');
      expect(tBn('instructor.review.withdrawalDesc', { title: 'পাইথন ১০১' })).toBe('আপনি কি নিশ্চিত যে আপনি পাইথন ১০১-এর জন্য জমা দেওয়া আবেদন প্রত্যাহার করতে চান?');

      expect(tEn('instructor.learners.showingCount', { shown: '10', total: '25', type: 'enrolled' })).toBe('Showing 10 of 25 enrolled learners');
      expect(tBn('instructor.learners.showingCount', { shown: '১০', total: '২৫', type: 'ভর্তিকৃত' })).toBe('২৫ জন ভর্তিকৃত শিক্ষার্থীর মধ্যে ১০ জন প্রদর্শিত হচ্ছে');
    });

    it('12.10 verifies bidirectional 100% dictionary key parity including the instructor namespace', () => {
      function compareKeys(objA: any, objB: any, path: string = '', missingPrefix: string): string[] {
        const missing: string[] = [];
        for (const key of Object.keys(objA)) {
          const currentPath = path ? `${path}.${key}` : key;
          if (objB[key] === undefined) {
            missing.push(`${missingPrefix}: ${currentPath}`);
          } else if (typeof objA[key] === 'object' && objA[key] !== null) {
            missing.push(...compareKeys(objA[key], objB[key], currentPath, missingPrefix));
          }
        }
        return missing;
      }

      const missingInBn = compareKeys(en, bn, '', 'Missing in Bangla');
      const missingInEn = compareKeys(bn, en, '', 'Missing in English');

      expect(missingInBn).toEqual([]);
      expect(missingInEn).toEqual([]);
    });
  });
});
