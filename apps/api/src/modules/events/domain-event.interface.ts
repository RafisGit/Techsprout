export type DomainEventType =
  | 'OrderPlaced'
  | 'OrderPaid'
  | 'RefundRequested'
  | 'RefundApproved'
  | 'RefundRejected'
  | 'RefundSettled'
  | 'EnrollmentCreated'
  | 'EnrollmentCancelled'
  | 'CourseSubmittedForReview'
  | 'CourseApproved'
  | 'CourseRejected'
  | 'LessonCompleted'
  | 'QuizPassed'
  | 'CertificateIssued';

export interface DomainEvent<T = Record<string, unknown>> {
  eventId: string;
  eventType: DomainEventType;
  occurredAt: string;
  actorUserId?: string;
  targetUserId?: string;
  entityId: string;
  entityType: string;
  payload: T;
  version: number;
}
