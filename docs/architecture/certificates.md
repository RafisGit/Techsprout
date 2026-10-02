# TechSprout School LMS — P4 Certificates Architecture Specification

> **Phase Status:** P4.0 Architecture Freeze (Final Clarified Baseline)  
> **Applicability:** Certificate Issuance, Immutability Snapshots, Public Verification, PDF Generation, and Revocation Governance.  
> **Prerequisites:** P1 Security & RBAC, P2 Course Catalog, P3 Enrollment & Course Completion Invariant.  
> **No Implementation Permitted in P4.0:** This document specifies the architectural blueprint. Implementation begins in Phase P4.1 upon authorization.

---

## 1. Domain Model & Relational Schema

Certificates represent authentic educational credentials awarded to students who achieve 100% course completion (`enrollments.status === 'COMPLETED'`):

```
┌──────────────────┐               ┌──────────────────┐
│   enrollments    │               │      courses     │
│(Completed Record)│               │ (Course Context) │
└────────┬─────────┘               └────────┬─────────┘
         │ 1                                │ 1
         │                                  │
         │ 1 (ON DELETE RESTRICT)           │ * (ON DELETE RESTRICT)
┌────────▼──────────────────────────────────▼─────────┐
│                     certificates                     │
│──────────────────────────────────────────────────────│
│  id: uuid (PK)                                       │
│  certificate_number: varchar(50) (UQ)                │
│  enrollment_id: uuid (FK -> enrollments.id, RESTRICT)│
│  course_id: uuid (FK -> courses.id, RESTRICT)        │
│  student_id: uuid (FK -> users.id, RESTRICT)         │
│  student_name: varchar(200) (SNAPSHOT)               │
│  course_title: varchar(250) (SNAPSHOT)               │
│  instructor_name: varchar(200) (SNAPSHOT)            │
│  completed_at: timestamptz (NOT NULL)                │
│  issued_at: timestamptz (NOT NULL, default NOW())    │
│  final_score_percentage: integer (nullable)          │
│  status: certificate_status (ACTIVE / REVOKED)       │
│  revoked_at: timestamptz (nullable)                  │
│  revocation_reason: text (nullable)                  │
│  pdf_media_id: uuid (FK -> media.id, nullable)       │
│  pdf_url: text (nullable)                            │
│  created_at: timestamptz (NOT NULL)                  │
│  updated_at: timestamptz (NOT NULL)                  │
│                                                      │
│  CONSTRAINT: UNIQUE(enrollment_id)                   │
│  CONSTRAINT: UNIQUE(certificate_number)              │
└──────────────────────────────────────────────────────┘
```

---

## 2. Database Schema Specification (Drizzle ORM Proposal)

```typescript
import {
  pgTable,
  uuid,
  varchar,
  text,
  integer,
  timestamp,
  uniqueIndex,
  index,
  pgEnum,
} from 'drizzle-orm/pg-core';
import { enrollments } from './enrollments';
import { courses } from './courses';
import { users } from './users';
import { media } from './media';

// --- ENUMS ---
export const certificateStatusEnum = pgEnum('certificate_status', [
  'ACTIVE',
  'REVOKED',
]);

// --- CERTIFICATES TABLE ---
export const certificates = pgTable(
  'certificates',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    certificateNumber: varchar('certificate_number', { length: 50 }).notNull(),
    enrollmentId: uuid('enrollment_id')
      .references(() => enrollments.id, { onDelete: 'restrict' })
      .notNull(),
    courseId: uuid('course_id')
      .references(() => courses.id, { onDelete: 'restrict' })
      .notNull(),
    studentId: uuid('student_id')
      .references(() => users.id, { onDelete: 'restrict' })
      .notNull(),
    studentName: varchar('student_name', { length: 200 }).notNull(),
    courseTitle: varchar('course_title', { length: 250 }).notNull(),
    instructorName: varchar('instructor_name', { length: 200 }).notNull(),
    completedAt: timestamp('completed_at', { withTimezone: true }).notNull(),
    issuedAt: timestamp('issued_at', { withTimezone: true }).defaultNow().notNull(),
    finalScorePercentage: integer('final_score_percentage'),
    status: certificateStatusEnum('status').default('ACTIVE').notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    revocationReason: text('revocation_reason'),
    pdfMediaId: uuid('pdf_media_id').references(() => media.id, { onDelete: 'set null' }),
    pdfUrl: text('pdf_url'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('certificates_enrollment_id_uq').on(table.enrollmentId),
    uniqueIndex('certificates_number_uq').on(table.certificateNumber),
    index('certificates_student_id_idx').on(table.studentId),
    index('certificates_course_id_idx').on(table.courseId),
    index('certificates_issued_at_idx').on(table.issuedAt),
    index('certificates_status_idx').on(table.status),
  ]
);

export type Certificate = typeof certificates.$inferSelect;
export type NewCertificate = typeof certificates.$inferInsert;
```

---

## 3. Immutability & Historical Fact Snapshot

A common architectural vulnerability in LMS platforms is dynamically querying current database entities (e.g. `user.name`, `course.title`) when rendering historical certificates. If an instructor renames a course years later, previously issued credentials mutate silently.

### 3.1 Strict Snapshot Rules
At the moment of certificate issuance, the backend freezes:
1. **`studentName`:** The exact display name of the student (`users.name`) at completion.
2. **`courseTitle`:** The exact institutional title of the course (`courses.title`) at completion.
3. **`instructorName`:** The instructor of record (`instructor.name`) at completion.
4. **`completedAt`:** The exact graduation timestamp (`enrollments.completedAt`).
5. **`finalScorePercentage`:** The deterministic assessment score achieved by the learner upon graduation.

Any subsequent course updates, instructor reassignments, or user profile edits do **not** alter the issued certificate.

### 3.2 Exact Definition & Calculation of `finalScorePercentage`
The certificate's `finalScorePercentage` is a deterministic integer snapshot computed at the exact instant of graduation:
1. **Rule A (Designated Final Exam):** If the course contains a published quiz designated as `FINAL_EXAM` (`quizzes.quiz_type = 'FINAL_EXAM'`), `finalScorePercentage` is set directly to the highest passed score percentage achieved by the student on that `FINAL_EXAM` quiz.
2. **Rule B (Overall Quiz Score Fallback):** If there is **no** `FINAL_EXAM` quiz in the course, `finalScorePercentage` is set to the unweighted arithmetic mean of the student's highest passed attempt percentages across all published quizzes in the course:
   $$\text{finalScorePercentage} = \text{round}\left( \frac{\sum_{q \in \text{PublishedQuizzes}} \text{bestPassedPercentage}(q)}{|\text{PublishedQuizzes}|} \right)$$
3. **Rule C (Lessons-Only Courses):** If the course contains zero quizzes (only lessons), `finalScorePercentage` is set to `100` (representing 100% completion and mastery of all required curriculum materials).

Once written to `certificates.final_score_percentage`, this value is permanent and immutable.

### 3.3 Curriculum Evolution & Historical Completion Invariant
- **AN ALREADY-ISSUED CERTIFICATE IS A HISTORICAL COMPLETION RECORD.**
- Adding new required lessons or quizzes to a course later **MUST NOT** automatically revoke or invalidate a previously issued certificate.
- The learner's active enrollment may return to `ACTIVE` (with `completed_at = null`) and require completing the newly published content for renewed course completion, while the historical certificate remains fully valid (`status = 'ACTIVE'`) unless an administrator explicitly revokes it.

### 3.4 Historical Certificate Access Precedence (Student Endpoint Contract)
When a student requests their certificate via `GET /api/v1/courses/:courseId/certificate`, **certificate existence takes precedence over current enrollment status**:
1. **Case 1: No Certificate Exists + Incomplete Enrollment:**
   - The student has not yet satisfied all required lessons and assessments.
   - Response: `403 Forbidden` (`COURSE_NOT_COMPLETED`).
2. **Case 2: Certificate Exists + Currently COMPLETED Enrollment:**
   - The student completed the course and enrollment remains `COMPLETED`.
   - Response: `200 OK` with certificate DTO (`status = 'ACTIVE'`).
3. **Case 3: Certificate Exists + Enrollment Reverted to ACTIVE (Curriculum Expansion):**
   - New content was published after the student graduated, causing active enrollment progress to drop below 100% and enrollment status to revert to `ACTIVE`.
   - **Crucial Rule:** The student **MUST** retain full access to their valid historical certificate. Current enrollment status does not invalidate or block an already-issued certificate.
   - Response: `200 OK` with certificate DTO (`status = 'ACTIVE'`).
4. **Case 4: Certificate Exists + Administratively REVOKED:**
   - The certificate was revoked by an administrator for cause.
   - Response: `200 OK` with certificate DTO (`status = 'REVOKED'`, `revokedAt`, `revocationReason`), or distinct student revocation notice, ensuring transparent visibility into credential status.

---

## 4. Human-Readable Certificate Identifier Generation

Certificates require a standardized, tamper-evident verification code formatted as:

$$\text{TSP}-\text{YYYY}-\text{C}\langle\text{RANDOM\_ALPHANUMERIC}\rangle$$

- **Prefix:** `TSP` (TechSprout)
- **Year:** 4-digit completion year (e.g., `2026`)
- **Random Token:** 8 to 10 characters using an unambiguous alphabet (excluding easily confused glyphs like `0/O`, `1/I/l`):
  ```typescript
  import { customAlphabet } from 'nanoid';
  const nanoid = customAlphabet('23456789ABCDEFGHJKLMNPQRSTUVWXYZ', 8);
  export function generateCertificateNumber(): string {
    const year = new Date().getFullYear();
    return `TSP-${year}-C${nanoid()}`;
  }
  ```
- **Example:** `TSP-2026-CK7M9X2P`

---

## 5. Public Verification Model & Privacy Governance

Anyone in possession of a certificate number (such as an employer or academic institution) can verify the credential via a public, rate-limited endpoint.

### 5.1 Route
`GET /api/v1/certificates/verify/:certificateNumber` (`@Public()`)

### 5.2 Public Verification Response Payload
```json
{
  "success": true,
  "message": "Certificate verification successful",
  "data": {
    "isValid": true,
    "certificateNumber": "TSP-2026-CK7M9X2P",
    "status": "ACTIVE",
    "studentName": "Jane Doe",
    "courseTitle": "Fullstack Web Development with NestJS & Next.js",
    "instructorName": "Prof. Alan Turing",
    "completedAt": "2026-10-01T12:00:00.000Z",
    "issuedAt": "2026-10-01T12:00:05.000Z"
  }
}
```

### 5.3 Strict Privacy Boundary:
The public verification endpoint strictly **forbids** exposing:
- Student ID, Email, Phone, or User Account Metadata
- Internal Enrollment ID or Database Primary Keys
- Raw quiz scores or answer choices
- Session cookies, tokens, or IP addresses

### 5.4 Revoked Certificate Handling
If a certificate was administratively revoked due to academic dishonesty or tuition default:
```json
{
  "success": true,
  "message": "Certificate has been revoked",
  "data": {
    "isValid": false,
    "certificateNumber": "TSP-2026-CK7M9X2P",
    "status": "REVOKED",
    "studentName": "Jane Doe",
    "courseTitle": "Fullstack Web Development",
    "revokedAt": "2026-10-15T08:00:00.000Z",
    "revocationReason": "Academic integrity violation: unauthorized assessment assistance."
  }
}
```

---

## 6. PDF Generation Architecture

### 6.1 Technology Choice & Rationale: `pdf-lib`
We reject headless Chrome / Puppeteer for certificate generation:
- **Drawbacks of Puppeteer:** Consumes 200MB+ RAM per render process, introduces cold-start latency (1-3s), and frequently crashes on budget container hosting (e.g., Render Free tier, 512MB RAM).
- **Selection: `pdf-lib`:** Pure TypeScript/JavaScript PDF generation library.
  - Zero external browser dependencies.
  - Execution memory: `< 15MB`.
  - Execution speed: `< 50ms`.
  - Generates vector-sharp certificates with custom fonts, badges, borders, and verification QR codes.

### 6.2 Dual-Tier Rendering Strategy
1. **Interactive Web Certificate View (`/certificates/[certificateNumber]`):**
   - High-fidelity, responsive HTML/CSS certificate view.
   - Features verified authenticity seal, verification link, and print-optimized CSS (`@media print`).
2. **Cloudinary PDF Storage Artifact:**
   - PDF generated server-side via `pdf-lib` and uploaded to Cloudinary as an immutable document asset (`folder: 'certificates'`).
   - `certificates.pdfUrl` provides an instant download link for students.

---

## 7. Revocation & Governance Model

1. **Authorization:** Only users with `ADMIN` role (`RolesGuard(['admin'])`) may revoke an issued certificate. Instructors cannot revoke certificates.
2. **Revocation Endpoint:**
   `POST /api/v1/admin/certificates/:id/revoke` with `{ reason: string }` (required, trimmed, 5–1000 characters).
3. **Audit Trail:**
   Every certificate issuance and revocation emits an audit log event (`CERTIFICATE_ISSUED`, `CERTIFICATE_REVOKED`) recording the administrative actor, target certificate, and revocation rationale.

---

## 8. Single Authoritative CertificateService Architecture

To prevent duplicate eligibility checks or divergent score calculations across the codebase, a single centralized `CertificateService` manages all certificate issuance logic:

```
Lesson Completion (LearningService) ─────┐
                                         ├──► CertificateService.issueCertificateIfEligible(...)
Quiz Completion (StudentQuizzesService) ─┘
```

### 8.1 Responsibilities of `CertificateService`
`CertificateService` is the sole authority for:
1. **Eligibility Evaluation:** Verifying that the enrollment has satisfied 100% of required curriculum items (lessons and published quizzes).
2. **Final Score Percentage Calculation:** Determining the authoritative score snapshot per Rule A (`FINAL_EXAM`), Rule B (unweighted mean across published quizzes), or Rule C (lessons-only = 100).
3. **Certificate Snapshot Creation:** Freezing student name, course title, instructor of record, and completion timestamp.
4. **Certificate Number Generation:** Generating unique, unambiguous `TSP-YYYY-CXXXXXXXXX` serials.
5. **Idempotent Issuance:** Enforcing `UNIQUE(enrollment_id)` via atomic insert and conflict detection.
6. **Existing-Certificate Detection:** Re-completion of courses with existing certificates safely leaves the original certificate intact.
7. **Audit Logging:** Emitting `CERTIFICATE_ISSUED` and `CERTIFICATE_REVOKED` events via `AuditService`.

### 8.2 Calling Services Responsibilities
- `LearningService`: Manages lesson checkpoints and progress percentages; upon detecting that progress reached 100%, delegates to `CertificateService.issueCertificateIfEligible(enrollmentId)`.
- `StudentQuizzesService`: Manages attempt grading and pass/fail thresholds; upon detecting that passing a quiz completed the course, delegates to `CertificateService.issueCertificateIfEligible(enrollmentId)`.
- Neither calling service contains duplicate certificate eligibility, scoring, or issuance code.
