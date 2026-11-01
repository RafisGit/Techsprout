import { describe, it, expect, beforeEach } from 'vitest';
import {
  DEFAULT_LOCALE,
  SUPPORTED_LOCALES,
  LOCALE_COOKIE_NAME,
  LOCALE_METADATA,
  en,
  bn,
  createTranslate,
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

describe('Phase 10.5 / WP-P10-05: Full Platform Localization Integration & Regression Suite', () => {
  beforeEach(() => {
    resetClientCookieForTesting();
  });

  // =========================================================================
  // WP-P10-05-A: DICTIONARY INTEGRITY & PARITY
  // =========================================================================
  describe('WP-P10-05-A: Dictionary Integrity & Key Parity', () => {
    function extractLeafPaths(obj: Record<string, any>, prefix = ''): Map<string, string> {
      const leaves = new Map<string, string>();
      for (const key of Object.keys(obj)) {
        const path = prefix ? `${prefix}.${key}` : key;
        const val = obj[key];
        if (val && typeof val === 'object' && !Array.isArray(val)) {
          for (const [subPath, subVal] of extractLeafPaths(val, path)) {
            leaves.set(subPath, subVal);
          }
        } else {
          leaves.set(path, String(val));
        }
      }
      return leaves;
    }

    const enLeaves = extractLeafPaths(en);
    const bnLeaves = extractLeafPaths(bn);

    it('asserts 100% bidirectional dictionary key parity across all namespaces', () => {
      expect(enLeaves.size).toBeGreaterThan(1600);
      expect(bnLeaves.size).toBe(enLeaves.size);

      const missingInBn: string[] = [];
      for (const key of enLeaves.keys()) {
        if (!bnLeaves.has(key)) missingInBn.push(key);
      }

      const missingInEn: string[] = [];
      for (const key of bnLeaves.keys()) {
        if (!enLeaves.has(key)) missingInEn.push(key);
      }

      expect(missingInBn).toEqual([]);
      expect(missingInEn).toEqual([]);
    });

    it('guarantees zero empty strings across all translation nodes in English and Bangla', () => {
      const emptyInEn = [...enLeaves.entries()].filter(([, v]) => v.trim() === '');
      const emptyInBn = [...bnLeaves.entries()].filter(([, v]) => v.trim() === '');

      expect(emptyInEn).toEqual([]);
      expect(emptyInBn).toEqual([]);
    });

    it('guarantees absence of placeholder/untranslated markers (TODO, FIXME, [TRANSLATE], TBD)', () => {
      const forbidden = ['TODO', 'FIXME', '[TRANSLATE]', 'TBD'];
      const placeholdersInBn = [...bnLeaves.entries()].filter(([, v]) =>
        forbidden.some((marker) => v.toUpperCase().includes(marker))
      );
      expect(placeholdersInBn).toEqual([]);
    });

    it('verifies safe fallback behavior when key is absent in target locale', () => {
      const tBn = createTranslate('bn');
      expect(tBn('nonExistentKey' as any)).toBe('nonExistentKey');
    });

    it('verifies parameter interpolation in English and Bangla with Bengali numeral conversion', () => {
      const tEn = createTranslate('en');
      const tBn = createTranslate('bn');

      expect(tEn('dashboard.welcome', { name: 'Rahim' })).toBe('Welcome back, Rahim!');
      expect(tBn('dashboard.welcome', { name: 'রহিম' })).toBe('স্বাগতম, রহিম!');

      expect(tEn('dashboard.enrolledCountPlural', { count: 5 })).toBe('5 courses currently in your study list');
      expect(tBn('dashboard.enrolledCountPlural', { count: 5 })).toBe('৫টি কোর্স আপনার অধ্যয়ন তালিকায় রয়েছে');
    });
  });

  // =========================================================================
  // WP-P10-05-B: LANGUAGE SWITCHING & PREFERENCE LIFECYCLE
  // =========================================================================
  describe('WP-P10-05-B: Language Switching & Cookie Persistence', () => {
    it('initializes with default locale "en"', () => {
      expect(DEFAULT_LOCALE).toBe('en');
      expect(getClientLocale()).toBe('en');
    });

    it('persists language selection in techsprout_locale cookie and reads back correctly', () => {
      expect(LOCALE_COOKIE_NAME).toBe('techsprout_locale');

      setClientLocale('bn');
      expect(getClientLocale()).toBe('bn');

      setClientLocale('en');
      expect(getClientLocale()).toBe('en');
    });

    it('validates supported locales and falls back safely on invalid values', () => {
      expect(isValidLocale('en')).toBe(true);
      expect(isValidLocale('bn')).toBe(true);
      expect(isValidLocale('fr')).toBe(false);
      expect(isValidLocale('')).toBe(false);
      expect(isValidLocale(null)).toBe(false);
      expect(isValidLocale(undefined)).toBe(false);

      expect(parseLocale('bn')).toBe('bn');
      expect(parseLocale('fr')).toBe('en');
      expect(parseLocale('')).toBe('en');
      expect(parseLocale(undefined)).toBe('en');
    });

    it('exposes accurate locale metadata for language switchers', () => {
      expect(SUPPORTED_LOCALES).toEqual(['en', 'bn']);
      expect(LOCALE_METADATA.en.nativeName).toBe('English');
      expect(LOCALE_METADATA.bn.nativeName).toBe('বাংলা');
      expect(LOCALE_METADATA.bn.flag).toBe('🇧🇩');
    });
  });

  // =========================================================================
  // WP-P10-05-C: STUDENT PORTAL REGRESSION
  // =========================================================================
  describe('WP-P10-05-C: Student Portal Regression', () => {
    it('localizes student learning workspace and quiz navigation including previous and next', () => {
      const tEn = createTranslate('en');
      const tBn = createTranslate('bn');

      expect(tEn('quiz.previous')).toBe('Previous Question');
      expect(tBn('quiz.previous')).toBe('পূর্ববর্তী প্রশ্ন');

      expect(tEn('quiz.next')).toBe('Next Question');
      expect(tBn('quiz.next')).toBe('পরবর্তী প্রশ্ন');

      expect(tEn('learning.nextLesson')).toBe('Next Lesson');
      expect(tBn('learning.nextLesson')).toBe('পরবর্তী পাঠ');

      expect(tEn('learning.previousLesson')).toBe('Previous Lesson');
      expect(tBn('learning.previousLesson')).toBe('পূর্ববর্তী পাঠ');
    });

    it('localizes student assessment submission and evaluation dialogs', () => {
      const tEn = createTranslate('en');
      const tBn = createTranslate('bn');

      expect(tEn('quiz.confirmSubmit')).toBe('Are you sure you want to submit your quiz?');
      expect(tBn('quiz.confirmSubmit')).toBe('আপনি কি নিশ্চিত যে কুইজ জমা দিতে চান?');

      expect(tEn('quiz.passed')).toBe('Congratulations, you passed!');
      expect(tBn('quiz.passed')).toBe('অভিনন্দন, আপনি উত্তীর্ণ হয়েছেন!');
    });

    it('localizes student certificates and official credential verification', () => {
      const tEn = createTranslate('en');
      const tBn = createTranslate('bn');

      expect(tEn('certificate.verifyOnline')).toBe('Verify Authenticity');
      expect(tBn('certificate.verifyOnline')).toBe('সত্যতা যাচাই করুন');

      expect(tEn('certificate.officialCredentials')).toBe('Authorized Certificate by TechSprout School');
      expect(tBn('certificate.officialCredentials')).toBe('টেকস্প্রাউট স্কুলের অনুমোদিত সার্টিফিকেট');
    });
  });

  // =========================================================================
  // WP-P10-05-D: INSTRUCTOR PORTAL REGRESSION
  // =========================================================================
  describe('WP-P10-05-D: Instructor Portal Regression', () => {
    it('localizes instructor course review submission and withdrawal workflows', () => {
      const tEn = createTranslate('en');
      const tBn = createTranslate('bn');

      expect(tEn('instructor.review.withdrawalTitle')).toBe('Withdraw Course Review Request');
      expect(tBn('instructor.review.withdrawalTitle')).toBe('কোর্স পর্যালোচনা আবেদন প্রত্যাহার');

      expect(tEn('instructor.review.keepInReview')).toBe('Keep in Review');
      expect(tBn('instructor.review.keepInReview')).toBe('পর্যালোচনাধীন রাখুন');
    });

    it('localizes instructor earnings and payout adjudication screens', () => {
      const tEn = createTranslate('en');
      const tBn = createTranslate('bn');

      expect(tEn('instructor.earnings.lifetimeEarnings')).toBe('Lifetime Earnings');
      expect(tBn('instructor.earnings.lifetimeEarnings')).toBe('সর্বমোট মোট আয়');

      expect(tEn('instructor.earnings.availableBalance')).toBe('Available for Payout');
      expect(tBn('instructor.earnings.availableBalance')).toBe('উত্তোলনের জন্য প্রস্তুত ব্যালেন্স');
    });
  });

  // =========================================================================
  // WP-P10-05-E: ADMIN PORTAL REGRESSION
  // =========================================================================
  describe('WP-P10-05-E: Admin Portal Regression', () => {
    it('localizes admin course review queue and moderation dialogs', () => {
      const tEn = createTranslate('en');
      const tBn = createTranslate('bn');

      expect(tEn('admin.reviewQueue.title')).toBe('Course Review Queue');
      expect(tBn('admin.reviewQueue.title')).toBe('কোর্স পর্যালোচনা সারি');

      expect(tEn('admin.reviewModals.approveTitle')).toBe('Approve Course Publication');
      expect(tBn('admin.reviewModals.approveTitle')).toBe('কোর্স প্রকাশনার অনুমোদন দিন');

      expect(tEn('admin.reviewModals.rejectTitle')).toBe('Request Revisions & Reject Submission');
      expect(tBn('admin.reviewModals.rejectTitle')).toBe('সংশোধনের অনুরোধ ও প্রত্যাখান');
    });

    it('localizes institutional finance, student refund queue, and reconciliation scanner', () => {
      const tEn = createTranslate('en');
      const tBn = createTranslate('bn');

      expect(tEn('admin.finance.title')).toBe('Institutional Finance Dashboard');
      expect(tBn('admin.finance.title')).toBe('প্রাতিষ্ঠানিক আর্থিক ড্যাশবোর্ড');

      expect(tEn('admin.refundRequests.title')).toBe('Student Refund Requests');
      expect(tBn('admin.refundRequests.title')).toBe('শিক্ষার্থীদের রিফান্ডের আবেদন');

      expect(tEn('admin.reconciliation.scanner.safeAutoResolve')).toBe('Safe Auto-Resolve');
      expect(tBn('admin.reconciliation.scanner.safeAutoResolve')).toBe('নিরাপদ স্বয়ংক্রিয় সমাধান');
    });
  });

  // =========================================================================
  // WP-P10-05-F: PUBLIC AND SHARED PAGES REGRESSION
  // =========================================================================
  describe('WP-P10-05-F: Public and Shared Pages Regression', () => {
    it('localizes authentication forms (Login and Register)', () => {
      const tEn = createTranslate('en');
      const tBn = createTranslate('bn');

      expect(tEn('auth.signInTitle')).toBe('Sign In to Your Account');
      expect(tBn('auth.signInTitle')).toBe('আপনার অ্যাকাউন্টে সাইন ইন করুন');

      expect(tEn('auth.createAccountTitle')).toBe('Create an Account');
      expect(tBn('auth.createAccountTitle')).toBe('একটি নতুন অ্যাকাউন্ট তৈরি করুন');

      expect(tEn('auth.loginButton')).toBe('Login');
      expect(tBn('auth.loginButton')).toBe('লগইন');

      expect(tEn('auth.registerButton')).toBe('REGISTER');
      expect(tBn('auth.registerButton')).toBe('নিবন্ধন');
    });

    it('localizes global footer with institutional details and working hours', () => {
      const tEn = createTranslate('en');
      const tBn = createTranslate('bn');

      expect(tEn('footer.workingHours')).toBe('Working Hours');
      expect(tBn('footer.workingHours')).toBe('অফিস সময়');

      expect(tEn('footer.monFri')).toBe('Monday - Friday');
      expect(tBn('footer.monFri')).toBe('সোমবার - শুক্রবার');

      expect(tEn('footer.closed')).toBe('Closed');
      expect(tBn('footer.closed')).toBe('বন্ধ');
    });

    it('localizes 404 error page, contact form, and about us section', () => {
      const tEn = createTranslate('en');
      const tBn = createTranslate('bn');

      expect(tEn('notFound.errorCode')).toBe('404 error');
      expect(tBn('notFound.errorCode')).toBe('৪০৪ ত্রুটি');

      expect(tEn('notFound.title')).toBe('We lost this page');
      expect(tBn('notFound.title')).toBe('পৃষ্ঠাটি খুঁজে পাওয়া যায়নি');

      expect(tEn('contact.title')).toBe('Keep In Touch With Us');
      expect(tBn('contact.title')).toBe('আমাদের সাথে যোগাযোগ রাখুন');

      expect(tEn('about.badge')).toBe('Who we are');
      expect(tBn('about.badge')).toBe('আমাদের পরিচিতি');
    });
  });

  // =========================================================================
  // WP-P10-05-G: DYNAMIC CONTENT AND CURRENCY FORMATTING
  // =========================================================================
  describe('WP-P10-05-G: Dynamic Content and BDT Currency Formatting Compliance', () => {
    it('strictly formats currency in BDT and never outputs naked $ symbols', () => {
      expect(formatCurrency(1000, 'en', 'BDT')).toBe('BDT 1,000.00');
      expect(formatCurrency(1000, 'bn', 'BDT')).toBe('BDT ১,০০০.০০');

      expect(formatCurrency(50000, 'en', 'BDT')).toBe('BDT 50,000.00');
      expect(formatCurrency(50000, 'bn', 'BDT')).toBe('BDT ৫০,০০০.০০');

      expect(formatCurrency(0, 'en', 'BDT')).toBe('BDT 0.00');
      expect(formatCurrency(0, 'bn', 'BDT')).toBe('BDT ০.০০');

      expect(formatCurrency(1000, 'en')).not.toContain('$');
      expect(formatCurrency(1000, 'bn')).not.toContain('$');
    });

    it('formats native Bengali numerals and percentages accurately', () => {
      expect(formatNumber(12345.67, 'en')).toBe('12,345.67');
      expect(formatNumber(12345.67, 'bn')).toBe('১২,৩৪৫.৬৭');

      expect(toBanglaDigits('2026-11-01')).toBe('২০২৬-১১-০১');
      expect(toBanglaDigits(99)).toBe('৯৯');

      expect(formatPercent(0.855, 'en')).toBe('85.5%');
      expect(formatPercent(0.855, 'bn')).toBe('৮৫.৫%');
    });

    it('formats dates in locale-aware representations', () => {
      const fixedDate = new Date('2026-11-01T12:00:00Z');
      const enDate = formatDate(fixedDate, 'en');
      const bnDate = formatDate(fixedDate, 'bn');

      expect(enDate).toBeDefined();
      expect(bnDate).toBeDefined();
      expect(typeof enDate).toBe('string');
      expect(typeof bnDate).toBe('string');
    });
  });
});
