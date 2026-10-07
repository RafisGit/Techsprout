import { z } from 'zod';

export type UserRole = 'admin' | 'student' | 'instructor';

export interface UserDto {
  id: string;
  name: string;
  username: string;
  email: string;
  phone?: string | null;
  role: UserRole;
  isVerified: boolean;
  createdAt: string;
  updatedAt?: string;
}

export interface RegisterRequest {
  name: string;
  username: string;
  email: string;
  phone?: string;
  password: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface AuthResponse {
  success: boolean;
  message: string;
  user?: UserDto;
  token?: string;
}

export interface OtpSendRequest {
  phone: string;
}

export interface OtpVerifyRequest {
  phone: string;
  otp: string;
}

export interface ApiSuccessResponse<T = unknown> {
  success: true;
  message: string;
  data: T;
  requestId?: string;
  timestamp: string;
}

export interface ApiErrorResponse {
  success: false;
  message: string;
  errorCode: string;
  statusCode: number;
  timestamp: string;
  requestId?: string;
  details?: unknown;
}

export interface HealthResponse {
  status: 'ok' | 'degraded';
  timestamp: string;
  uptime: number;
  environment: string;
  services?: {
    database: 'up' | 'down';
    redis?: 'up' | 'down';
  };
}

export interface AuditLogDto {
  id: string;
  actorId?: string | null;
  action: string;
  targetType: string;
  targetId?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  requestId?: string | null;
  metadata?: Record<string, unknown> | null;
  createdAt: string;
}

// --- CATALOG CONTRACTS ---

export type CourseStatus = 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
export type CourseVisibility = 'PUBLIC' | 'PRIVATE';
export type CourseLevel = 'BEGINNER' | 'INTERMEDIATE' | 'ADVANCED' | 'ALL_LEVELS';
export type LessonType = 'VIDEO' | 'TEXT' | 'PDF';

export interface CategoryDto {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  isActive: boolean;
  courseCount?: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface CreateCategoryRequest {
  name: string;
  slug?: string;
  description?: string | null;
  isActive?: boolean;
}

export interface UpdateCategoryRequest {
  name?: string;
  slug?: string;
  description?: string | null;
  isActive?: boolean;
}

export interface LessonDto {
  id: string;
  moduleId: string;
  title: string;
  description?: string | null;
  lessonType: LessonType;
  position: number;
  durationSeconds: number;
  isPreview: boolean;
  mediaId?: string | null;
  mediaUrl?: string | null;
  content?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface CreateLessonRequest {
  title: string;
  description?: string | null;
  lessonType?: LessonType;
  position: number;
  durationSeconds?: number;
  isPreview?: boolean;
  mediaId?: string | null;
  content?: string | null;
}

export interface UpdateLessonRequest {
  title?: string;
  description?: string | null;
  lessonType?: LessonType;
  position?: number;
  durationSeconds?: number;
  isPreview?: boolean;
  mediaId?: string | null;
  content?: string | null;
}

export interface ModuleDto {
  id: string;
  courseId: string;
  title: string;
  description?: string | null;
  position: number;
  lessons?: LessonDto[];
  createdAt?: string;
  updatedAt?: string;
}

export interface CreateModuleRequest {
  title: string;
  description?: string | null;
  position: number;
}

export interface UpdateModuleRequest {
  title?: string;
  description?: string | null;
  position?: number;
}

export interface CourseDto {
  id: string;
  title: string;
  slug: string;
  shortDescription?: string | null;
  description?: string | null;
  status: CourseStatus;
  visibility: CourseVisibility;
  price: string;
  currency: string;
  level: CourseLevel;
  language: string;
  durationMinutes: number;
  thumbnailMediaId?: string | null;
  thumbnailUrl?: string | null;
  categoryId?: string;
  instructorId?: string;
  category?: {
    id: string;
    name: string;
    slug: string;
  };
  instructor?: {
    id: string;
    name: string;
    email?: string;
  };
  modulesCount?: number;
  lessonsCount?: number;
  modules?: ModuleDto[];
  publishedAt?: string | null;
  createdAt: string;
  updatedAt?: string;
}

export interface CreateCourseRequest {
  title: string;
  slug?: string;
  shortDescription?: string;
  description?: string;
  categoryId: string;
  instructorId?: string;
  price?: string | number;
  currency?: string;
  level?: CourseLevel;
  language?: string;
  durationMinutes?: number;
  visibility?: CourseVisibility;
  thumbnailMediaId?: string | null;
}

export interface UpdateCourseRequest {
  title?: string;
  slug?: string;
  shortDescription?: string | null;
  description?: string | null;
  categoryId?: string;
  instructorId?: string;
  price?: string | number;
  currency?: string;
  level?: CourseLevel;
  language?: string;
  durationMinutes?: number;
  visibility?: CourseVisibility;
  thumbnailMediaId?: string | null;
}

export interface PaginationMetadata {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}

export interface PaginatedCoursesData {
  items: CourseDto[];
  pagination: PaginationMetadata;
}

// --- ENROLLMENT & LEARNING CONTRACTS ---

export type EnrollmentStatus = 'ACTIVE' | 'COMPLETED' | 'CANCELLED';
export type LessonProgressStatus = 'IN_PROGRESS' | 'COMPLETED';

export interface EnrollmentDto {
  id: string;
  courseId: string;
  studentId: string;
  status: EnrollmentStatus;
  enrolledAt: string;
  startedAt?: string | null;
  completedAt?: string | null;
  progressPercentage?: number;
}

export interface CreateEnrollmentRequest {
  courseId: string;
}

export interface AdminAssignEnrollmentRequest {
  studentId: string;
}

export interface EnrolledCourseProgressDto {
  completedLessons: number;
  totalLessons: number;
  percentage: number;
}

export interface EnrolledCourseResumePointDto {
  lessonId: string;
  moduleId: string;
  lessonTitle: string;
  watchPositionSeconds: number;
}

export interface EnrolledCourseItemDto {
  enrollmentId: string;
  status: EnrollmentStatus;
  hasCertificate: boolean;
  enrolledAt: string;
  startedAt?: string | null;
  completedAt?: string | null;
  progress: EnrolledCourseProgressDto;
  resumePoint?: EnrolledCourseResumePointDto | null;
  course: {
    id: string;
    title: string;
    slug: string;
    status: CourseStatus;
    thumbnailUrl?: string | null;
    category?: {
      id: string;
      name: string;
      slug: string;
    };
    instructor?: {
      id: string;
      name: string;
    };
  };
}

export interface PaginatedEnrollmentsData {
  items: EnrolledCourseItemDto[];
  pagination: PaginationMetadata;
}

export interface EnrollmentStatusResponse {
  isEnrolled: boolean;
  enrollment?: {
    id: string;
    status: EnrollmentStatus;
    enrolledAt: string;
    progressPercentage: number;
  } | null;
}

export interface ResumePointDto {
  lessonId: string | null;
  moduleId: string | null;
  lessonTitle: string;
  lessonType: LessonType;
  watchPositionSeconds: number;
  progressPercentage: number;
  isCourseCompleted: boolean;
}

export interface LessonProgressDto {
  status: 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED';
  watchPositionSeconds: number;
  completedAt?: string | null;
}

export interface CurriculumLessonDto {
  id: string;
  title: string;
  position: number;
  lessonType: LessonType;
  durationSeconds: number;
  isPreview: boolean;
  progress: LessonProgressDto;
}

export interface CurriculumLessonItemDto extends CurriculumLessonDto {
  type: 'LESSON';
}

export interface CurriculumQuizItemDto {
  type: 'QUIZ';
  id: string;
  title: string;
  position: number;
  quizType: QuizType;
  passingScorePercentage: number;
  timeLimitMinutes?: number | null;
  totalPoints: number;
  questionsCount: number;
  maxAttempts?: number | null;
  isPassed: boolean;
  userAttemptsCount: number;
  bestScorePercentage: number | null;
}

export type CurriculumItemDto = CurriculumLessonItemDto | CurriculumQuizItemDto;

export interface CurriculumModuleDto {
  id: string;
  title: string;
  position: number;
  lessons: CurriculumLessonDto[];
  items?: CurriculumItemDto[];
}

export interface LearningCurriculumDto {
  courseId: string;
  courseStatus: CourseStatus;
  progressPercentage: number;
  completedLessonsCount: number;
  totalLessonsCount: number;
  publishedQuizzesCount?: number;
  passedQuizzesCount?: number;
  modules: CurriculumModuleDto[];
}

export interface LessonNavigationDto {
  previousLessonId: string | null;
  nextLessonId: string | null;
}

export interface LearningLessonContentDto {
  id: string;
  moduleId: string;
  courseId: string;
  title: string;
  lessonType: LessonType;
  durationSeconds: number;
  mediaUrl?: string | null;
  content?: string | null;
  progress: LessonProgressDto;
  navigation: LessonNavigationDto;
}

export interface UpdateProgressCheckpointRequest {
  watchPositionSeconds: number;
}

export interface ToggleLessonCompleteRequest {
  completed: boolean;
}

// --- QUIZ & ASSESSMENT AUTHORING CONTRACTS (P4.2) ---

export type QuizStatus = 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
export type QuizType = 'KNOWLEDGE_CHECK' | 'FINAL_EXAM';
export type QuestionType = 'SINGLE_CHOICE' | 'MULTIPLE_CHOICE' | 'TRUE_FALSE';

export interface QuizOptionDto {
  id: string;
  questionId: string;
  optionText: string;
  position: number;
  isCorrect?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface QuizQuestionDto {
  id: string;
  quizId: string;
  questionText: string;
  questionType: QuestionType;
  position: number;
  points: number;
  explanation?: string | null;
  options?: QuizOptionDto[];
  createdAt?: string;
  updatedAt?: string;
}

export interface QuizDto {
  id: string;
  moduleId: string;
  title: string;
  description?: string | null;
  position: number;
  quizType: QuizType;
  passingScorePercentage: number;
  maxAttempts?: number | null;
  timeLimitMinutes?: number | null;
  status: QuizStatus;
  module?: {
    id: string;
    title: string;
    courseId: string;
  };
  course?: {
    id: string;
    title: string;
  };
  totalPoints?: number;
  questionsCount?: number;
  questions?: QuizQuestionDto[];
  createdAt: string;
  updatedAt: string;
}

export interface CreateQuizRequest {
  title: string;
  description?: string | null;
  quizType?: QuizType;
  position: number;
  passingScorePercentage?: number;
  maxAttempts?: number | null;
  timeLimitMinutes?: number | null;
}

export interface UpdateQuizRequest {
  title?: string;
  description?: string | null;
  quizType?: QuizType;
  position?: number;
  passingScorePercentage?: number;
  maxAttempts?: number | null;
  timeLimitMinutes?: number | null;
}

export interface CreateQuestionOptionInput {
  optionText: string;
  position: number;
  isCorrect?: boolean;
}

export interface CreateQuestionRequest {
  questionText: string;
  questionType: QuestionType;
  position: number;
  points?: number;
  explanation?: string | null;
  options?: CreateQuestionOptionInput[];
}

export interface UpdateQuestionRequest {
  questionText?: string;
  questionType?: QuestionType;
  position?: number;
  points?: number;
  explanation?: string | null;
}

export interface CreateOptionRequest {
  optionText: string;
  position: number;
  isCorrect?: boolean;
}

export interface UpdateOptionRequest {
  optionText?: string;
  position?: number;
  isCorrect?: boolean;
}

export interface ReorderItem {
  id: string;
  position: number;
}

export interface ReorderRequest {
  items: ReorderItem[];
}

// --- STUDENT QUIZ & ATTEMPT CONTRACTS (P4.3) ---

export type AttemptStatus = 'IN_PROGRESS' | 'SUBMITTED' | 'ABANDONED';

export interface StudentQuizOptionDto {
  id: string;
  optionText: string;
  position: number;
}

export interface StudentQuizQuestionDto {
  id: string;
  questionText: string;
  questionType: QuestionType;
  position: number;
  points: number;
  options: StudentQuizOptionDto[];
}

export interface StudentQuizDto {
  id: string;
  moduleId: string;
  courseId: string;
  title: string;
  description?: string | null;
  quizType: QuizType;
  passingScorePercentage: number;
  maxAttempts?: number | null;
  timeLimitMinutes?: number | null;
  totalPoints: number;
  questionsCount: number;
  userAttemptsCount: number;
  bestScorePercentage: number | null;
  isPassed: boolean;
  questions: StudentQuizQuestionDto[];
}

export interface StudentAnswerItem {
  questionId: string;
  selectedOptionIds: string[];
}

export interface SaveAnswersRequest {
  answers: StudentAnswerItem[];
}

export interface SubmitAttemptRequest {
  answers?: StudentAnswerItem[];
}

export interface StudentActiveAttemptDto {
  id: string;
  quizId: string;
  attemptNumber: number;
  status: 'IN_PROGRESS';
  startedAt: string;
  lastSavedAt: string;
  expiresAt?: string | null;
  timeLimitMinutes?: number | null;
  questions: StudentQuizQuestionDto[];
  savedAnswers: StudentAnswerItem[];
}

export interface StudentQuizResultDto {
  attemptId: string;
  quizId: string;
  attemptNumber: number;
  status: 'SUBMITTED';
  score: number;
  totalPoints: number;
  percentage: number;
  isPassed: boolean;
  submittedAt: string;
  courseProgressPercentage: number;
  isCourseCompleted: boolean;
}

export interface QuestionReviewOptionDto {
  id: string;
  optionText: string;
  position: number;
  isCorrect: boolean;
}

export interface QuestionReviewDto {
  questionId: string;
  questionText: string;
  questionType: QuestionType;
  points: number;
  pointsAwarded: number;
  isCorrect: boolean;
  selectedOptionIds: string[];
  correctOptionIds: string[];
  explanation?: string | null;
  options: QuestionReviewOptionDto[];
}

export interface StudentQuizReviewDto {
  attemptId: string;
  quizId: string;
  attemptNumber: number;
  status: 'SUBMITTED';
  score: number;
  totalPoints: number;
  percentage: number;
  isPassed: boolean;
  submittedAt: string;
  questions: QuestionReviewDto[];
}

// --- CERTIFICATES CONTRACTS (P4.5) ---

export type CertificateStatus = 'ACTIVE' | 'REVOKED';

export interface CertificateDto {
  id: string;
  certificateNumber: string;
  studentName: string;
  courseTitle: string;
  instructorName: string;
  completedAt: string;
  issuedAt: string;
  finalScorePercentage: number | null;
  status: CertificateStatus;
  pdfUrl?: string | null;
  revokedAt?: string | null;
  revocationReason?: string | null;
}

export interface PublicCertificateVerificationDto {
  isValid: boolean;
  certificateNumber: string;
  status: CertificateStatus;
  studentName: string;
  courseTitle: string;
  instructorName?: string;
  completedAt?: string;
  issuedAt?: string;
  finalScorePercentage?: number | null;
  revokedAt?: string | null;
  revocationReason?: string | null;
}

export interface AdminCertificateDto {
  id: string;
  certificateNumber: string;
  enrollmentId: string;
  courseId: string;
  studentId: string;
  studentName: string;
  courseTitle: string;
  instructorName: string;
  completedAt: string;
  issuedAt: string;
  finalScorePercentage: number | null;
  status: CertificateStatus;
  revokedAt?: string | null;
  revocationReason?: string | null;
  pdfMediaId?: string | null;
  pdfUrl?: string | null;
  createdAt: string;
  updatedAt: string;
}

export const REVOCATION_REASON_MIN_LENGTH = 5;
export const REVOCATION_REASON_MAX_LENGTH = 1000;

export interface RevokeCertificateRequest {
  /**
   * Administrative revocation reason.
   * Required, trimmed, minimum 5 characters, maximum 1000 characters.
   */
  reason: string;
}

export interface AdminCertificateQuery {
  page?: number;
  limit?: number;
  status?: CertificateStatus;
  courseId?: string;
  search?: string;
}

export interface PaginatedCertificatesData {
  items: AdminCertificateDto[];
  pagination: PaginationMetadata;
}

export type CertificateErrorCode =
  | 'ENROLLMENT_NOT_FOUND'
  | 'COURSE_NOT_COMPLETED'
  | 'CERTIFICATE_NOT_FOUND'
  | 'CERTIFICATE_ALREADY_REVOKED';

// ==========================================
// --- P5: PAYMENTS & ADMIN CONTRACTS ---
// ==========================================

// --- P5 ENUMS ---

export type OrderStatus =
  | 'PENDING'
  | 'PAYMENT_PROCESSING'
  | 'PAID'
  | 'FAILED'
  | 'CANCELLED'
  | 'REFUNDED';

export type PaymentStatus = 'INITIATED' | 'VALIDATED' | 'FAILED' | 'CANCELLED';

export type CouponDiscountType = 'PERCENTAGE' | 'FIXED_AMOUNT';

export type CouponRedemptionStatus = 'RESERVED' | 'CONSUMED' | 'RELEASED';

export type InvoiceStatus = 'PAID' | 'REFUNDED' | 'VOID';

export type RefundStatus = 'PENDING' | 'PROCESSED' | 'FAILED';

export type RefundRequestStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

export type RefundRequestReasonCategory =
  | 'COURSE_CONTENT_MISMATCH'
  | 'TECHNICAL_ISSUES'
  | 'ACCIDENTAL_PURCHASE'
  | 'PERSONAL_REASONS'
  | 'OTHER';

export type Currency = 'BDT';

// --- P5 & P5.5 CONSTANTS ---

export const COUPON_CODE_MIN_LENGTH = 3;
export const COUPON_CODE_MAX_LENGTH = 30;
export const REFUND_REASON_MIN_LENGTH = 5;
export const REFUND_REASON_MAX_LENGTH = 1000;
export const REFUND_POLICY_WINDOW_DAYS = 7;
export const REFUND_POLICY_WINDOW_HOURS = 168;
export const REFUND_POLICY_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
export const REFUND_MAX_PROGRESS_PERCENTAGE = 20;
export const REFUND_REQUEST_REASON_MIN_LENGTH = 10;
export const REFUND_REQUEST_REASON_MAX_LENGTH = 1000;
export const REFUND_REQUEST_REJECTION_REASON_MIN_LENGTH = 5;
export const REFUND_REQUEST_REJECTION_REASON_MAX_LENGTH = 1000;

// --- ORDER CONTRACTS ---

export interface CreateOrderRequest {
  courseId: string;
  couponCode?: string;
}

export interface OrderItemDto {
  id: string;
  orderId: string;
  courseId: string;
  courseTitle: string;
  unitPriceCents: number;
  discountCents: number;
  payableCents: number;
  createdAt: string;
}

export interface OrderDto {
  id: string;
  orderNumber: string;
  studentId: string;
  studentName?: string;
  studentEmail?: string;
  status: OrderStatus;
  subtotalCents: number;
  discountCents: number;
  payableCents: number;
  currency: Currency;
  couponId?: string | null;
  couponCode?: string | null;
  invoiceId?: string | null;
  items: OrderItemDto[];
  expiresAt: string;
  paidAt?: string | null;
  cancelledAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface OrderListItemDto {
  id: string;
  orderNumber: string;
  studentId: string;
  studentName?: string;
  studentEmail?: string;
  status: OrderStatus;
  subtotalCents?: number;
  discountCents?: number;
  payableCents: number;
  currency: Currency;
  courseTitle: string;
  createdAt: string;
  paidAt?: string | null;
}

export interface OrderListQuery {
  page?: number;
  limit?: number;
  status?: OrderStatus;
  search?: string;
  startDate?: string;
  endDate?: string;
}

export interface PaginatedOrdersData {
  items: OrderListItemDto[];
  pagination: PaginationMetadata;
}

export type OrderListResponse = PaginatedOrdersData;

// --- PAYMENT CONTRACTS ---

export interface InitiatePaymentRequest {
  orderId: string;
}

export interface InitiatePaymentResponse {
  paymentId: string;
  merchantTranId: string;
  gatewayUrl: string;
  provider: 'SSLCOMMERZ';
}

export interface PaymentDto {
  id: string;
  orderId: string;
  merchantTranId: string;
  provider: string;
  valId?: string | null;
  bankTranId?: string | null;
  amountCents: number;
  currency: Currency;
  status: PaymentStatus;
  cardType?: string | null;
  cardBrand?: string | null;
  gatewayFeeCents?: number | null;
  initiatedAt: string;
  validatedAt?: string | null;
  createdAt: string;
}

export interface PaymentListItemDto {
  id: string;
  orderId: string;
  orderNumber?: string;
  merchantTranId: string;
  valId?: string | null;
  bankTranId?: string | null;
  amountCents: number;
  currency: Currency;
  status: PaymentStatus;
  cardType?: string | null;
  initiatedAt: string;
  validatedAt?: string | null;
}

export interface PaymentListQuery {
  page?: number;
  limit?: number;
  status?: PaymentStatus;
  orderId?: string;
  search?: string;
}

export interface PaginatedPaymentsData {
  items: PaymentListItemDto[];
  pagination: PaginationMetadata;
}

// --- SSLCommerz CALLBACK CONTRACTS (External input representations) ---

export interface SSLCommerzSuccessCallback {
  tran_id: string;
  val_id: string;
  amount: string;
  currency: string;
  bank_tran_id?: string;
  card_type?: string;
  card_brand?: string;
  card_issuer?: string;
  card_sub_brand?: string;
  card_issuer_country?: string;
  store_amount?: string;
  tran_date?: string;
  status: string;
  verify_sign?: string;
  verify_key?: string;
  risk_level?: string;
  risk_title?: string;
  value_a?: string;
  value_b?: string;
  value_c?: string;
  value_d?: string;
}

export interface SSLCommerzFailCallback {
  tran_id: string;
  status: string;
  error?: string;
  failedreason?: string;
  bank_tran_id?: string;
  currency?: string;
  amount?: string;
}

export interface SSLCommerzCancelCallback {
  tran_id: string;
  status: string;
}

export type SSLCommerzIpnCallback = SSLCommerzSuccessCallback;

// --- COUPON CONTRACTS ---

export interface ValidateCouponRequest {
  code: string;
  courseId: string;
}

export interface CouponPreviewDto {
  code: string;
  courseId: string;
  discountType: CouponDiscountType;
  discountValue: number;
  subtotalCents: number;
  originalPriceCents: number;
  discountCents: number;
  payableCents: number;
  isValid: boolean;
  message?: string;
}

export interface CouponDto {
  id: string;
  code: string;
  discountType: CouponDiscountType;
  discountValue: number;
  minOrderAmountCents: number;
  maxDiscountAmountCents?: number | null;
  courseId?: string | null;
  courseTitle?: string | null;
  usageLimit?: number | null;
  redemptionCount: number;
  perUserLimit: number;
  startsAt: string;
  expiresAt?: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateCouponRequest {
  code: string;
  discountType: CouponDiscountType;
  discountValue: number;
  minOrderAmountCents?: number;
  maxDiscountAmountCents?: number | null;
  courseId?: string | null;
  usageLimit?: number | null;
  perUserLimit?: number;
  startsAt: string;
  expiresAt?: string | null;
  isActive?: boolean;
}

export interface UpdateCouponRequest {
  minOrderAmountCents?: number;
  maxDiscountAmountCents?: number | null;
  usageLimit?: number | null;
  perUserLimit?: number;
  startsAt?: string;
  expiresAt?: string | null;
  isActive?: boolean;
}

export interface CouponListQuery {
  page?: number;
  limit?: number;
  isActive?: boolean;
  search?: string;
  courseId?: string;
}

export interface PaginatedCouponsData {
  items: CouponDto[];
  pagination: PaginationMetadata;
}

export type CouponListResponse = PaginatedCouponsData;

export interface CouponDetailResponse {
  success: boolean;
  message: string;
  data: CouponDto;
}

export interface ValidateCouponResponse {
  success: boolean;
  message: string;
  data: CouponPreviewDto;
}

export interface PaginatedCouponsResponse {
  success: boolean;
  message: string;
  data: PaginatedCouponsData;
}

// --- COUPON REDEMPTION CONTRACT ---

export interface CouponRedemptionDto {
  id: string;
  couponId: string;
  couponCode?: string;
  userId?: string;
  orderId: string;
  status: CouponRedemptionStatus;
  discountCents: number;
  reservedAt: string;
  consumedAt?: string | null;
  releasedAt?: string | null;
}

// --- INVOICE CONTRACTS ---

export interface InvoiceDto {
  id: string;
  invoiceNumber: string;
  orderId: string;
  studentId?: string;
  studentName: string;
  studentEmail: string;
  studentPhone?: string | null;
  courseTitle: string;
  subtotalCents: number;
  discountCents: number;
  payableCents: number;
  currency: Currency;
  paymentMethod: string;
  bankTranId: string;
  status: InvoiceStatus;
  issuedAt: string;
  createdAt: string;
  updatedAt?: string;
}

export interface InvoiceListItemDto {
  id: string;
  invoiceNumber: string;
  orderId: string;
  studentId?: string;
  studentName: string;
  studentEmail: string;
  courseTitle: string;
  payableCents: number;
  currency: Currency;
  status: InvoiceStatus;
  issuedAt: string;
}

export interface InvoiceListQuery {
  page?: number;
  limit?: number;
  status?: InvoiceStatus;
  orderId?: string;
  search?: string;
  startDate?: string;
  endDate?: string;
}

export interface PaginatedInvoicesData {
  items: InvoiceListItemDto[];
  pagination: PaginationMetadata;
}

export type InvoiceListResponse = PaginatedInvoicesData;
export type InvoiceDetailResponse = ApiSuccessResponse<InvoiceDto>;
export type PaginatedInvoicesResponse = ApiSuccessResponse<PaginatedInvoicesData>;


// --- REFUND CONTRACTS ---

export interface AdminRefundOrderRequest {
  reason: string;
}

export interface RefundDto {
  id: string;
  refundNumber: string;
  orderId: string;
  orderNumber?: string;
  paymentId: string;
  amountCents: number;
  currency: Currency;
  reason: string;
  status: RefundStatus;
  processedBy?: string | null;
  providerRefundRef?: string | null;
  processedAt?: string | null;
  createdAt: string;
  updatedAt?: string;
}

export interface RefundListQuery {
  page?: number;
  limit?: number;
  status?: RefundStatus;
  orderId?: string;
}

export interface PaginatedRefundsData {
  items: RefundDto[];
  pagination: PaginationMetadata;
}

export type RefundDetailResponse = ApiSuccessResponse<RefundDto>;
export type PaginatedRefundsResponse = ApiSuccessResponse<PaginatedRefundsData>;

// --- P5.5 REFUND REQUEST CONTRACTS ---

export interface RefundRequestDto {
  id: string;
  requestNumber: string;
  orderId: string;
  orderNumber?: string;
  studentId: string;
  studentName?: string;
  studentEmail?: string;
  courseId: string;
  courseTitle?: string;
  enrollmentId: string;
  reasonCategory: RefundRequestReasonCategory;
  reasonDetail: string;
  courseProgressAtRequest: number;
  status: RefundRequestStatus;
  reviewedBy?: string | null;
  reviewedByName?: string | null;
  reviewedAt?: string | null;
  rejectionReason?: string | null;
  adminNotes?: string | null;
  refundId?: string | null;
  refundStatus?: RefundStatus | null;
  currentProgress?: number;
  orderPaidAt?: string | null;
  orderStatus?: OrderStatus;
  payableCents?: number;
  subtotalCents?: number;
  discountCents?: number;
  currency?: Currency;
  invoiceId?: string | null;
  invoiceNumber?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface RefundRequestListItemDto {
  id: string;
  requestNumber: string;
  orderId: string;
  orderNumber: string;
  studentId: string;
  studentName: string;
  studentEmail: string;
  courseId: string;
  courseTitle: string;
  payableCents: number;
  currency: Currency;
  reasonCategory: RefundRequestReasonCategory;
  courseProgressAtRequest: number;
  status: RefundRequestStatus;
  refundStatus?: RefundStatus | null;
  createdAt: string;
  reviewedAt?: string | null;
}

export interface RefundEligibilityDto {
  isEligible: boolean;
  reason?: string | null;
  daysRemaining: number;
  courseProgressPercentage: number;
  maxAllowedProgressPercentage: number;
  orderPaidAt: string | null;
  payableCents: number;
  currency: Currency;
  existingRequestId?: string | null;
  existingRequestStatus?: RefundRequestStatus | null;
}

export interface CreateRefundRequestRequest {
  reasonCategory: RefundRequestReasonCategory;
  reasonDetail: string;
}

export interface AdminApproveRefundRequestRequest {
  adminNotes?: string;
}

export interface AdminRejectRefundRequestRequest {
  rejectionReason: string;
  adminNotes?: string;
}

export interface RefundRequestListQuery {
  page?: number;
  limit?: number;
  status?: RefundRequestStatus;
  search?: string;
  startDate?: string;
  endDate?: string;
}

export interface PaginatedRefundRequestsData {
  items: RefundRequestListItemDto[];
  pagination: PaginationMetadata;
}

export interface StudentRefundRequestDto {
  id: string;
  requestNumber: string;
  orderId: string;
  orderNumber?: string;
  courseId: string;
  courseTitle?: string;
  reasonCategory: RefundRequestReasonCategory;
  reasonDetail: string;
  courseProgressAtRequest: number;
  status: RefundRequestStatus;
  rejectionReason?: string | null;
  createdAt: string;
  reviewedAt?: string | null;
}

export interface PaginatedStudentRefundRequestsData {
  items: StudentRefundRequestDto[];
  pagination: PaginationMetadata;
}

export type StudentRefundRequestResponse = ApiSuccessResponse<StudentRefundRequestDto>;
export type PaginatedStudentRefundRequestsResponse = ApiSuccessResponse<PaginatedStudentRefundRequestsData>;
export type RefundRequestDetailResponse = ApiSuccessResponse<RefundRequestDto>;
export type PaginatedRefundRequestsResponse = ApiSuccessResponse<PaginatedRefundRequestsData>;
export type RefundEligibilityResponse = ApiSuccessResponse<RefundEligibilityDto>;

// --- FINANCE & RECONCILIATION CONTRACTS ---

export interface FinanceSummaryDto {
  totalGrossVolumeCents: number;
  totalDiscountCents: number;
  totalNetRevenueCents: number;
  totalRefundCents: number;
  totalPaidOrdersCount: number;
  totalRefundedOrdersCount: number;
  totalPendingOrdersCount: number;
  totalCancelledOrdersCount?: number;
  currency: Currency;
}

export type ReconciliationDiscrepancyType =
  | 'PAID_WITHOUT_ENROLLMENT'
  | 'GATEWAY_VALIDATED_INTERNAL_PENDING'
  | 'AMOUNT_MISMATCH'
  | 'CURRENCY_MISMATCH'
  | 'ABANDONED_SESSION';

export interface ReconciliationDiscrepancyDto {
  id: string;
  orderId: string;
  orderNumber: string;
  discrepancyType: ReconciliationDiscrepancyType;
  description: string;
  internalPayableCents: number;
  gatewayAmountCents?: number | null;
  detectedAt: string;
  autoResolvable: boolean;
}

export interface ReconciliationResultDto {
  totalOrdersScanned: number;
  discrepanciesFoundCount: number;
  autoResolvedCount: number;
  discrepancies: ReconciliationDiscrepancyDto[];
  executedAt: string;
}

export interface ReconciliationQuery {
  limit?: number;
  dryRun?: boolean;
}

// --- P5.5.7: FINANCIAL CSV EXPORT CONTRACTS ---
export type FinanceExportType = 'orders' | 'refunds' | 'reconciliation';

export const financeExportTypeSchema = z.enum(['orders', 'refunds', 'reconciliation']);

export const financeExportQuerySchema = z.object({
  type: financeExportTypeSchema,
  startDate: z.string().optional(),
  endDate: z.string().optional(),
});

export type FinanceExportQuery = z.infer<typeof financeExportQuerySchema>;

// --- P5 CONSTANTS & LIMITS ---
export const GATEWAY_MIN_AMOUNT_CENTS = 1000; // 10.00 BDT (Official SSLCommerz V4 minimum)
export const GATEWAY_MAX_AMOUNT_CENTS = 50_000_000; // 500,000.00 BDT (Official SSLCommerz V4 maximum)

// --- P5 ERROR CODES ---

export type PaymentErrorCode =
  | 'PAYMENT_REQUIRED'
  | 'ORDER_NOT_FOUND'
  | 'ORDER_ACCESS_DENIED'
  | 'INVALID_ORDER_STATE_TRANSITION'
  | 'PAYMENT_NOT_FOUND'
  | 'PAYMENT_VALIDATION_FAILED'
  | 'PAYMENT_AMOUNT_MISMATCH'
  | 'PAYMENT_AMOUNT_BELOW_GATEWAY_MINIMUM'
  | 'PAYMENT_AMOUNT_ABOVE_GATEWAY_MAXIMUM'
  | 'PAYMENT_CURRENCY_MISMATCH'
  | 'PAYMENT_REPLAY_DETECTED'
  | 'COUPON_NOT_FOUND'
  | 'COUPON_INVALID'
  | 'COUPON_EXPIRED'
  | 'COUPON_DISABLED'
  | 'COUPON_NOT_YET_ACTIVE'
  | 'COUPON_COURSE_MISMATCH'
  | 'COUPON_MIN_ORDER_NOT_MET'
  | 'COUPON_INVALID_DISCOUNT'
  | 'COUPON_CODE_ALREADY_EXISTS'
  | 'COUPON_USAGE_LIMIT_REACHED'
  | 'COUPON_USER_LIMIT_REACHED'
  | 'INVOICE_NOT_FOUND'
  | 'INVOICE_ACCESS_DENIED'
  | 'REFUND_NOT_ALLOWED'
  | 'REFUND_ALREADY_PROCESSED'
  | 'REFUND_ALREADY_PENDING'
  | 'REFUND_MANUAL_REVIEW_REQUIRED'
  | 'ORDER_NOT_REFUNDABLE'
  | 'PAYMENT_MISSING_BANK_TRAN_ID'
  | 'REFUND_PROVIDER_FAILED'
  | 'REFUND_PROVIDER_UNAVAILABLE'
  | 'REFUND_STATUS_QUERY_FAILED'
  | 'REFUND_NOT_FOUND'
  | 'REFUND_FINALIZATION_CONFLICT'
  | 'PARTIAL_REFUNDS_NOT_SUPPORTED'
  | 'RECONCILIATION_FAILED'
  | 'REFUND_REQUEST_NOT_FOUND'
  | 'REFUND_REQUEST_ALREADY_ACTIVE'
  | 'REFUND_REQUEST_ALREADY_REVIEWED'
  | 'REFUND_WINDOW_EXPIRED'
  | 'REFUND_PROGRESS_LIMIT_EXCEEDED'
  | 'ENROLLMENT_INELIGIBLE';

// ==========================================
// --- P5: SHARED ZOD VALIDATION SCHEMAS ---
// ==========================================

export const moneyCentsSchema = z
  .number({ invalid_type_error: 'Amount must be an integer number of cents/poisha' })
  .int('Amount must be an integer minor unit (no decimals)')
  .nonnegative('Amount cannot be negative');

export const currencySchema = z.literal('BDT');

export const orderStatusSchema = z.enum([
  'PENDING',
  'PAYMENT_PROCESSING',
  'PAID',
  'FAILED',
  'CANCELLED',
  'REFUNDED',
]);

export const paymentStatusSchema = z.enum(['INITIATED', 'VALIDATED', 'FAILED', 'CANCELLED']);

export const couponDiscountTypeSchema = z.enum(['PERCENTAGE', 'FIXED_AMOUNT']);

export const couponRedemptionStatusSchema = z.enum(['RESERVED', 'CONSUMED', 'RELEASED']);

export const invoiceStatusSchema = z.enum(['PAID', 'REFUNDED', 'VOID']);

export const refundStatusSchema = z.enum(['PENDING', 'PROCESSED', 'FAILED']);

export const refundRequestStatusSchema = z.enum(['PENDING', 'APPROVED', 'REJECTED']);

export const refundRequestReasonCategorySchema = z.enum([
  'COURSE_CONTENT_MISMATCH',
  'TECHNICAL_ISSUES',
  'ACCIDENTAL_PURCHASE',
  'PERSONAL_REASONS',
  'OTHER',
]);

export const reconciliationDiscrepancyTypeSchema = z.enum([
  'PAID_WITHOUT_ENROLLMENT',
  'GATEWAY_VALIDATED_INTERNAL_PENDING',
  'AMOUNT_MISMATCH',
  'CURRENCY_MISMATCH',
  'ABANDONED_SESSION',
]);

export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1, 'Page must be at least 1').optional().default(1),
  limit: z.coerce
    .number()
    .int()
    .min(1, 'Limit must be at least 1')
    .max(100, 'Limit cannot exceed 100')
    .optional()
    .default(20),
});

export const createOrderSchema = z
  .object({
    courseId: z.string().uuid('Invalid course ID format'),
    couponCode: z
      .string()
      .trim()
      .min(
        COUPON_CODE_MIN_LENGTH,
        `Coupon code must be at least ${COUPON_CODE_MIN_LENGTH} characters`
      )
      .max(COUPON_CODE_MAX_LENGTH, `Coupon code cannot exceed ${COUPON_CODE_MAX_LENGTH} characters`)
      .transform((val) => val.toUpperCase())
      .optional(),
  })
  .strict('Client-submitted pricing, discount, or payment fields are strictly prohibited');

export const orderListQuerySchema = paginationQuerySchema.extend({
  status: orderStatusSchema.optional(),
  search: z.string().trim().max(100).optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
});

export const initiatePaymentSchema = z
  .object({
    orderId: z.string().uuid('Invalid order ID format'),
  })
  .strict('Payment amount and currency must be derived server-side');

export const paymentListQuerySchema = paginationQuerySchema.extend({
  status: paymentStatusSchema.optional(),
  orderId: z.string().uuid().optional(),
  search: z.string().trim().max(100).optional(),
});

export const sslcommerzSuccessCallbackSchema = z.object({
  tran_id: z.string().min(1, 'Transaction ID is required'),
  val_id: z.string().min(1, 'Validation ID is required'),
  amount: z.string().min(1, 'Amount is required'),
  currency: z.string().min(1, 'Currency is required'),
  bank_tran_id: z.string().optional(),
  card_type: z.string().optional(),
  card_brand: z.string().optional(),
  card_issuer: z.string().optional(),
  card_sub_brand: z.string().optional(),
  card_issuer_country: z.string().optional(),
  store_amount: z.string().optional(),
  tran_date: z.string().optional(),
  status: z.string().min(1, 'Status is required'),
  verify_sign: z.string().optional(),
  verify_key: z.string().optional(),
  risk_level: z.string().optional(),
  risk_title: z.string().optional(),
  value_a: z.string().optional(),
  value_b: z.string().optional(),
  value_c: z.string().optional(),
  value_d: z.string().optional(),
});

export const sslcommerzFailCallbackSchema = z.object({
  tran_id: z.string().min(1, 'Transaction ID is required'),
  status: z.string().min(1, 'Status is required'),
  error: z.string().optional(),
  failedreason: z.string().optional(),
  bank_tran_id: z.string().optional(),
  currency: z.string().optional(),
  amount: z.string().optional(),
});

export const sslcommerzCancelCallbackSchema = z.object({
  tran_id: z.string().min(1, 'Transaction ID is required'),
  status: z.string().min(1, 'Status is required'),
});

export const sslcommerzIpnCallbackSchema = sslcommerzSuccessCallbackSchema;

export const validateCouponSchema = z.object({
  code: z
    .string({ required_error: 'Coupon code is required' })
    .trim()
    .min(
      COUPON_CODE_MIN_LENGTH,
      `Coupon code must be at least ${COUPON_CODE_MIN_LENGTH} characters`
    )
    .max(COUPON_CODE_MAX_LENGTH, `Coupon code cannot exceed ${COUPON_CODE_MAX_LENGTH} characters`)
    .transform((val) => val.toUpperCase()),
  courseId: z.string().uuid('Invalid course ID format'),
});

export const createCouponSchema = z
  .object({
    code: z
      .string({ required_error: 'Coupon code is required' })
      .trim()
      .min(
        COUPON_CODE_MIN_LENGTH,
        `Coupon code must be at least ${COUPON_CODE_MIN_LENGTH} characters`
      )
      .max(COUPON_CODE_MAX_LENGTH, `Coupon code cannot exceed ${COUPON_CODE_MAX_LENGTH} characters`)
      .transform((val) => val.toUpperCase()),
    discountType: couponDiscountTypeSchema,
    discountValue: z
      .number({ required_error: 'Discount value is required' })
      .int('Discount value must be an integer')
      .positive('Discount value must be greater than zero'),
    minOrderAmountCents: moneyCentsSchema.optional().default(0),
    maxDiscountAmountCents: moneyCentsSchema.nullable().optional(),
    courseId: z.string().uuid('Invalid course ID format').nullable().optional(),
    usageLimit: z.number().int().positive('Usage limit must be at least 1').nullable().optional(),
    perUserLimit: z
      .number()
      .int()
      .positive('Per-user limit must be at least 1')
      .optional()
      .default(1),
    startsAt: z.string().datetime({ message: 'Invalid start date format' }),
    expiresAt: z
      .string()
      .datetime({ message: 'Invalid expiration date format' })
      .nullable()
      .optional(),
    isActive: z.boolean().optional().default(true),
  })
  .refine(
    (data) => {
      if (data.discountType === 'PERCENTAGE') {
        return data.discountValue >= 1 && data.discountValue <= 100;
      }
      return true;
    },
    {
      message: 'Percentage discount must be between 1 and 100',
      path: ['discountValue'],
    }
  );

export const updateCouponSchema = z.object({
  minOrderAmountCents: moneyCentsSchema.optional(),
  maxDiscountAmountCents: moneyCentsSchema.nullable().optional(),
  usageLimit: z.number().int().positive('Usage limit must be at least 1').nullable().optional(),
  perUserLimit: z.number().int().positive('Per-user limit must be at least 1').optional(),
  startsAt: z.string().datetime({ message: 'Invalid start date format' }).optional(),
  expiresAt: z
    .string()
    .datetime({ message: 'Invalid expiration date format' })
    .nullable()
    .optional(),
  isActive: z.boolean().optional(),
});

export const couponListQuerySchema = paginationQuerySchema.extend({
  isActive: z.preprocess((val) => {
    if (val === 'true' || val === true) return true;
    if (val === 'false' || val === false) return false;
    return val;
  }, z.boolean().optional()),
  search: z.string().trim().max(100).optional(),
  courseId: z.string().uuid('Invalid course ID format').optional(),
});

export const adminRefundOrderSchema = z
  .object({
    reason: z
      .string({ required_error: 'Refund reason is required' })
      .trim()
      .min(
        REFUND_REASON_MIN_LENGTH,
        `Refund reason must be at least ${REFUND_REASON_MIN_LENGTH} characters`
      )
      .max(
        REFUND_REASON_MAX_LENGTH,
        `Refund reason cannot exceed ${REFUND_REASON_MAX_LENGTH} characters`
      ),
  })
  .strict('Arbitrary refund amounts are rejected; P5 is full-refund only');

export const adminReconcileRefundSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('LINK_PROVIDER_REFERENCE'),
    providerRefundRef: z
      .string({ required_error: 'Provider refund reference is required' })
      .trim()
      .min(1, 'Provider refund reference cannot be empty')
      .max(100, 'Provider refund reference cannot exceed 100 characters'),
  }),
  z.object({
    action: z.literal('MARK_FAILED'),
    reason: z
      .string({ required_error: 'Failure reason is required' })
      .trim()
      .min(
        REFUND_REASON_MIN_LENGTH,
        `Failure reason must be at least ${REFUND_REASON_MIN_LENGTH} characters`
      )
      .max(
        REFUND_REASON_MAX_LENGTH,
        `Failure reason cannot exceed ${REFUND_REASON_MAX_LENGTH} characters`
      ),
  }),
]);

export type AdminReconcileRefundRequest = z.infer<typeof adminReconcileRefundSchema>;

export const refundListQuerySchema = paginationQuerySchema.extend({
  status: refundStatusSchema.optional(),
  orderId: z.string().uuid().optional(),
});

export const invoiceListQuerySchema = paginationQuerySchema.extend({
  status: invoiceStatusSchema.optional(),
  search: z.string().trim().max(100).optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
});

export const reconciliationQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(500).optional().default(50),
  dryRun: z.boolean().optional().default(false),
});

export const createRefundRequestSchema = z.object({
  reasonCategory: refundRequestReasonCategorySchema,
  reasonDetail: z
    .string({ required_error: 'Reason details are required' })
    .trim()
    .min(
      REFUND_REQUEST_REASON_MIN_LENGTH,
      `Reason details must be at least ${REFUND_REQUEST_REASON_MIN_LENGTH} characters`
    )
    .max(
      REFUND_REQUEST_REASON_MAX_LENGTH,
      `Reason details cannot exceed ${REFUND_REQUEST_REASON_MAX_LENGTH} characters`
    ),
});

export const createRefundRequestWithOrderSchema = createRefundRequestSchema.extend({
  orderId: z.string().uuid('Invalid order ID format'),
});

export type CreateRefundRequestWithOrderRequest = z.infer<typeof createRefundRequestWithOrderSchema>;

export const studentRefundRequestListQuerySchema = paginationQuerySchema.extend({
  status: refundRequestStatusSchema.optional(),
});

export type StudentRefundRequestListQuery = z.infer<typeof studentRefundRequestListQuerySchema>;

export const adminApproveRefundRequestSchema = z.object({
  adminNotes: z.string().trim().max(1000).optional(),
});

export const adminRejectRefundRequestSchema = z.object({
  rejectionReason: z
    .string({ required_error: 'Rejection reason is required' })
    .trim()
    .min(
      REFUND_REQUEST_REJECTION_REASON_MIN_LENGTH,
      `Rejection reason must be at least ${REFUND_REQUEST_REJECTION_REASON_MIN_LENGTH} characters`
    )
    .max(
      REFUND_REQUEST_REJECTION_REASON_MAX_LENGTH,
      `Rejection reason cannot exceed ${REFUND_REQUEST_REJECTION_REASON_MAX_LENGTH} characters`
    ),
  adminNotes: z.string().trim().max(1000).optional(),
});

export const refundRequestListQuerySchema = paginationQuerySchema.extend({
  status: refundRequestStatusSchema.optional(),
  search: z.string().trim().max(100).optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
});

// --- REFUND EXECUTION CONTRACTS (P5.5.5) ---

export type RefundProcessingOutcome =
  | 'INITIATED'
  | 'RETRIED'
  | 'LINKED_DIRECT_REFUND'
  | 'LINKED_PENDING'
  | 'LINKED_PROCESSED'
  | 'SKIPPED_INVALID_ORDER_STATE';

export interface ProcessApprovedRefundItemResultDto {
  requestId: string;
  orderId: string;
  outcome: RefundProcessingOutcome;
  refundId?: string;
  refundNumber?: string;
  refundStatus?: string;
  orderStatus?: string;
  error?: string;
}

export interface ProcessApprovedRefundsResultDto {
  discovered: number;
  processed: number;
  results: ProcessApprovedRefundItemResultDto[];
}

export const processApprovedRefundsQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(100).optional().default(50),
});

export type ProcessApprovedRefundsQuery = z.infer<typeof processApprovedRefundsQuerySchema>;

// --- MONEY FORMATTING UTILITIES ---

function groupedFixed2(value: number): string {
  return value.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/**
 * Format a major-unit amount (e.g. "1000" or 1000) for a currency code.
 * BDT -> "BDT 1,000.00". Other codes are rendered as "<CODE> 1,000.00".
 */
export function formatMoney(
  amount: number | string | null | undefined,
  currency: string | null | undefined = 'BDT'
): string {
  const code = (currency || 'BDT').toUpperCase();
  const value = Number(amount);
  const safe = Number.isFinite(value) ? value : 0;
  return `${code} ${groupedFixed2(safe)}`;
}

/** Format integer minor units (poisha / cents) for a currency code. */
export function formatMinorUnits(
  minor: number | null | undefined,
  currency: string | null | undefined = 'BDT'
): string {
  if (minor === null || minor === undefined || isNaN(minor)) {
    return formatMoney(0, currency);
  }
  return formatMoney(minor / 100, currency);
}

