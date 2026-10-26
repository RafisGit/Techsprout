import type { SubscriptionStatus } from './subscription-lifecycle';

export interface EnrollmentRecord {
  courseId: string;
  status: 'ACTIVE' | 'COMPLETED' | 'CANCELLED';
}

export interface SubscriptionRecord {
  id: string;
  status: SubscriptionStatus;
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  cancelAtPeriodEnd: boolean;
  canceledAt?: Date | null;
}

export interface CourseEntitlementCheck {
  courseId: string;
  isSubscriptionEligible?: boolean;
}

export interface EntitlementEvaluationResult {
  hasAccess: boolean;
  accessType: 'LIFETIME_PURCHASE' | 'SUBSCRIPTION_MEMBERSHIP' | 'NONE';
  reason: string;
  activeSubscriptionId?: string;
  expiresAt?: Date;
}

/**
 * Pure entitlement evaluator determining whether a learner has access to a course.
 *
 * Rules:
 * 1. Lifetime purchase: An ACTIVE or COMPLETED direct course enrollment unconditionally grants lifetime access.
 * 2. Subscription access:
 *    - Course must be subscription-eligible (defaults to true).
 *    - Subscription in ACTIVE status grants access until currentPeriodEnd.
 *    - Subscription in PAST_DUE status grants grace-period access (within 7 days of period end).
 *    - Subscription in CANCELED status retains access until currentPeriodEnd (cancel-at-period-end).
 *    - Subscription in UNPAID status immediately suspends access.
 *    - Subscription in EXPIRED status terminates access.
 *    - Subscription in INCOMPLETE status does not grant access.
 */
export function evaluateCourseEntitlement(
  course: CourseEntitlementCheck,
  enrollment: EnrollmentRecord | null | undefined,
  subscriptions: SubscriptionRecord[],
  currentTime: Date = new Date()
): EntitlementEvaluationResult {
  // 1. Direct course enrollment check (Lifetime access)
  if (enrollment && (enrollment.status === 'ACTIVE' || enrollment.status === 'COMPLETED')) {
    return {
      hasAccess: true,
      accessType: 'LIFETIME_PURCHASE',
      reason: 'Learner owns permanent lifetime enrollment in this course',
    };
  }

  // 2. Subscription eligibility check
  const isEligible = course.isSubscriptionEligible !== false;
  if (!isEligible) {
    return {
      hasAccess: false,
      accessType: 'NONE',
      reason: 'Course is not included in platform subscription membership',
    };
  }

  // 3. Search for active or valid subscription
  for (const sub of subscriptions) {
    // A. ACTIVE subscription within period
    if (sub.status === 'ACTIVE' && currentTime <= sub.currentPeriodEnd) {
      return {
        hasAccess: true,
        accessType: 'SUBSCRIPTION_MEMBERSHIP',
        reason: 'Active platform membership grants catalog access',
        activeSubscriptionId: sub.id,
        expiresAt: sub.currentPeriodEnd,
      };
    }

    // B. CANCELED subscription still within paid billing cycle
    if (sub.status === 'CANCELED' && sub.cancelAtPeriodEnd && currentTime <= sub.currentPeriodEnd) {
      return {
        hasAccess: true,
        accessType: 'SUBSCRIPTION_MEMBERSHIP',
        reason: 'Canceled membership remains active until end of prepaid billing cycle',
        activeSubscriptionId: sub.id,
        expiresAt: sub.currentPeriodEnd,
      };
    }

    // C. PAST_DUE subscription within 7-day dunning grace period
    if (sub.status === 'PAST_DUE') {
      const gracePeriodEnd = new Date(sub.currentPeriodEnd.getTime() + 7 * 24 * 60 * 60 * 1000);
      if (currentTime <= gracePeriodEnd) {
        return {
          hasAccess: true,
          accessType: 'SUBSCRIPTION_MEMBERSHIP',
          reason: 'Membership in grace period pending payment retry',
          activeSubscriptionId: sub.id,
          expiresAt: gracePeriodEnd,
        };
      }
    }
  }

  // Check if student has unpaid/expired subscription for tailored reason
  const hasUnpaid = subscriptions.some((s) => s.status === 'UNPAID');
  if (hasUnpaid) {
    return {
      hasAccess: false,
      accessType: 'NONE',
      reason: 'Subscription access is suspended due to unpaid renewal charges',
    };
  }

  const hasExpired = subscriptions.some((s) => s.status === 'EXPIRED');
  if (hasExpired) {
    return {
      hasAccess: false,
      accessType: 'NONE',
      reason: 'Subscription membership has expired',
    };
  }

  return {
    hasAccess: false,
    accessType: 'NONE',
    reason: 'No active enrollment or platform membership found',
  };
}
