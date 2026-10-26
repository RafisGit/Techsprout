import { describe, expect, it } from 'vitest';
import {
  evaluateCourseEntitlement,
  type CourseEntitlementCheck,
  type EnrollmentRecord,
  type SubscriptionRecord,
} from './subscription-entitlement';

describe('Subscription Dual Entitlement Guard', () => {
  const course: CourseEntitlementCheck = {
    courseId: 'c-101',
    isSubscriptionEligible: true,
  };

  const now = new Date('2026-10-26T12:00:00Z');
  const pastDate = new Date('2026-10-01T00:00:00Z');
  const futureDate = new Date('2026-11-26T00:00:00Z');
  const expiredDate = new Date('2026-10-20T00:00:00Z');

  describe('Lifetime Enrollment Precedence', () => {
    it('grants access when student has ACTIVE lifetime enrollment regardless of subscription status', () => {
      const enrollment: EnrollmentRecord = { courseId: 'c-101', status: 'ACTIVE' };
      const subscriptions: SubscriptionRecord[] = [
        {
          id: 'sub-expired',
          status: 'EXPIRED',
          currentPeriodStart: pastDate,
          currentPeriodEnd: expiredDate,
          cancelAtPeriodEnd: false,
        },
      ];

      const result = evaluateCourseEntitlement(course, enrollment, subscriptions, now);

      expect(result.hasAccess).toBe(true);
      expect(result.accessType).toBe('LIFETIME_PURCHASE');
      expect(result.reason).toContain('lifetime enrollment');
    });

    it('grants access when student has COMPLETED lifetime enrollment', () => {
      const enrollment: EnrollmentRecord = { courseId: 'c-101', status: 'COMPLETED' };
      const result = evaluateCourseEntitlement(course, enrollment, [], now);

      expect(result.hasAccess).toBe(true);
      expect(result.accessType).toBe('LIFETIME_PURCHASE');
    });

    it('falls through to subscription evaluation if enrollment is CANCELLED', () => {
      const enrollment: EnrollmentRecord = { courseId: 'c-101', status: 'CANCELLED' };
      const subscriptions: SubscriptionRecord[] = [
        {
          id: 'sub-active',
          status: 'ACTIVE',
          currentPeriodStart: pastDate,
          currentPeriodEnd: futureDate,
          cancelAtPeriodEnd: false,
        },
      ];

      const result = evaluateCourseEntitlement(course, enrollment, subscriptions, now);

      expect(result.hasAccess).toBe(true);
      expect(result.accessType).toBe('SUBSCRIPTION_MEMBERSHIP');
      expect(result.activeSubscriptionId).toBe('sub-active');
    });
  });

  describe('Active Subscription Entitlement', () => {
    it('grants access when student has ACTIVE subscription within valid billing period', () => {
      const subscriptions: SubscriptionRecord[] = [
        {
          id: 'sub-1',
          status: 'ACTIVE',
          currentPeriodStart: pastDate,
          currentPeriodEnd: futureDate,
          cancelAtPeriodEnd: false,
        },
      ];

      const result = evaluateCourseEntitlement(course, null, subscriptions, now);

      expect(result.hasAccess).toBe(true);
      expect(result.accessType).toBe('SUBSCRIPTION_MEMBERSHIP');
      expect(result.expiresAt).toEqual(futureDate);
    });

    it('grants access when student has CANCELED subscription before currentPeriodEnd (cancel-at-period-end)', () => {
      const subscriptions: SubscriptionRecord[] = [
        {
          id: 'sub-canceled',
          status: 'CANCELED',
          currentPeriodStart: pastDate,
          currentPeriodEnd: futureDate,
          cancelAtPeriodEnd: true,
          canceledAt: pastDate,
        },
      ];

      const result = evaluateCourseEntitlement(course, null, subscriptions, now);

      expect(result.hasAccess).toBe(true);
      expect(result.accessType).toBe('SUBSCRIPTION_MEMBERSHIP');
      expect(result.reason).toContain('remains active until end of prepaid billing cycle');
    });

    it('grants access when student has PAST_DUE subscription within 7-day dunning grace period', () => {
      // Period ended 3 days ago (< 7 days grace)
      const periodEndThreeDaysAgo = new Date('2026-10-23T12:00:00Z');
      const subscriptions: SubscriptionRecord[] = [
        {
          id: 'sub-past-due',
          status: 'PAST_DUE',
          currentPeriodStart: pastDate,
          currentPeriodEnd: periodEndThreeDaysAgo,
          cancelAtPeriodEnd: false,
        },
      ];

      const result = evaluateCourseEntitlement(course, null, subscriptions, now);

      expect(result.hasAccess).toBe(true);
      expect(result.accessType).toBe('SUBSCRIPTION_MEMBERSHIP');
      expect(result.reason).toContain('grace period');
    });

    it('denies access when PAST_DUE subscription exceeds 7-day grace period', () => {
      // Period ended 10 days ago (> 7 days grace)
      const periodEndTenDaysAgo = new Date('2026-10-16T12:00:00Z');
      const subscriptions: SubscriptionRecord[] = [
        {
          id: 'sub-past-due-over',
          status: 'PAST_DUE',
          currentPeriodStart: pastDate,
          currentPeriodEnd: periodEndTenDaysAgo,
          cancelAtPeriodEnd: false,
        },
      ];

      const result = evaluateCourseEntitlement(course, null, subscriptions, now);

      expect(result.hasAccess).toBe(false);
      expect(result.accessType).toBe('NONE');
    });
  });

  describe('Suspended and Revoked Access', () => {
    it('immediately denies access when subscription is UNPAID (dunning exhausted)', () => {
      const subscriptions: SubscriptionRecord[] = [
        {
          id: 'sub-unpaid',
          status: 'UNPAID',
          currentPeriodStart: pastDate,
          currentPeriodEnd: futureDate,
          cancelAtPeriodEnd: false,
        },
      ];

      const result = evaluateCourseEntitlement(course, null, subscriptions, now);

      expect(result.hasAccess).toBe(false);
      expect(result.accessType).toBe('NONE');
      expect(result.reason).toContain('unpaid renewal charges');
    });

    it('denies access when subscription is EXPIRED', () => {
      const subscriptions: SubscriptionRecord[] = [
        {
          id: 'sub-expired',
          status: 'EXPIRED',
          currentPeriodStart: pastDate,
          currentPeriodEnd: expiredDate,
          cancelAtPeriodEnd: false,
        },
      ];

      const result = evaluateCourseEntitlement(course, null, subscriptions, now);

      expect(result.hasAccess).toBe(false);
      expect(result.accessType).toBe('NONE');
      expect(result.reason).toContain('has expired');
    });

    it('denies access when course is marked as not eligible for subscription', () => {
      const ineligibleCourse: CourseEntitlementCheck = {
        courseId: 'c-exclusive',
        isSubscriptionEligible: false,
      };

      const subscriptions: SubscriptionRecord[] = [
        {
          id: 'sub-active',
          status: 'ACTIVE',
          currentPeriodStart: pastDate,
          currentPeriodEnd: futureDate,
          cancelAtPeriodEnd: false,
        },
      ];

      const result = evaluateCourseEntitlement(ineligibleCourse, null, subscriptions, now);

      expect(result.hasAccess).toBe(false);
      expect(result.accessType).toBe('NONE');
      expect(result.reason).toContain('not included in platform subscription');
    });

    it('denies access when learner has no enrollments or subscriptions', () => {
      const result = evaluateCourseEntitlement(course, null, [], now);

      expect(result.hasAccess).toBe(false);
      expect(result.accessType).toBe('NONE');
      expect(result.reason).toContain('No active enrollment or platform membership');
    });
  });
});
