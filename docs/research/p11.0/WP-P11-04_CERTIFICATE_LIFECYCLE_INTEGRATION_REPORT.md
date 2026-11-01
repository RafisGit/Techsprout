# TECHSPROUT LMS — PHASE 11.4 WORK PACKAGE REPORT
## END-TO-END CERTIFICATE LIFECYCLE INTEGRATION & REGRESSION (WP-P11-04)

**Repository:** `RafisGit/Techsprout`  
**Phase:** P11 — Certificate Lifecycle  
**Work Package:** WP-P11-04  
**Feature Branch:** `feat/p11-certificate-lifecycle`  
**Previous Work Packages:** WP-P11-01 (Eligibility & Issuance), WP-P11-02 (PDF Design & Downloads), WP-P11-03 (Public Verification & QR)  
**Report Date:** 2026-11-01  
**Status:** COMPLETE & VERIFIED  

---

## 1. Executive Summary

Work Package WP-P11-04 provides the end-to-end integration, security validation, privacy audit, and full regression certification of the TechSprout LMS course completion certificate system.

The objective was to prove that the entire credential lifecycle operates as one cohesive, fault-tolerant, deterministic system:
- **Learning & Assessment Evaluation:** Persisted lesson progress and quiz attempts evaluate eligibility without regressions or shortcuts.
- **Atomic, Idempotent & Concurrency-Safe Issuance:** Multiple simultaneous issuance requests resolve cleanly, guaranteeing exactly one certificate per enrollment with a cryptographically secure, collision-free certificate number.
- **Historical Snapshot Immutability:** Changes to learner profiles, course titles, or instructor assignments never corrupt or alter previously issued certificate records.
- **High-Performance Bilingual PDF Generation:** In-memory, streaming PDFKit engine generates A4 landscape credentials in English (`en`) and Bangla (`bn`) using bundled Google Noto Sans Bengali TrueType fonts.
- **Strict Authenticated Download Enforcement:** Verified ownership isolation ensures learners can only download their own credentials, backed by an authorized administrative override and absolute download blocks for revoked certificates.
- **Physical QR Barcode Integration:** End-to-end extraction and barcode matrix decoding using `pdf-parse` v2, `pngjs`, and `jsQR` proves that QR codes embedded in generated PDFs decode to canonical URLs and verify live against the public API.
- **Zero-PII Public Verification:** Unauthenticated, rate-limited (`20 req/min`) verification route with explicit status determination (`VALID`, `REVOKED`, `NOT_FOUND`), zero private database IDs exposed, and search engine crawler blocking (`noindex, nofollow`).
- **Definitive Score Disclosure Resolution:** Detailed analysis of repository contracts, ADR-0006, and test suites establishing that public score disclosure is explicitly restricted to verified completion records where a final score exists, while safeguarding unapproved or non-graded credentials from score exposure.
- **Monorepo Quality & Regression Certification:** 1,416 passing backend API tests (58 files), 591 passing frontend web tests (27 files), clean TypeScript compilation, clean ESLint, 100% i18n parity, and clean Next.js production builds.

---

## 2. Full Lifecycle Flow & Routes

```
[Student Completes Course] 
       │
       ▼
[Check Eligibility] ────────► All Lessons Completed + Published Quizzes & Final Exam Passed
       │
       ▼
[Atomic Issuance] ──────────► Frozen Metadata Snapshot (Student, Course, Instructor, Date, Score)
       │                      Unique Certificate Number (TSP-YYYY-CXXXXXXXX)
       │                      Database Unique Constraint (certificates_active_enrollment_uq)
       │
       ├─────────────────────────────────────────┐
       ▼                                         ▼
[Authenticated Student Portal]             [Public Verification Pipeline]
/learn/[slug]/certificate                  /verify/[certificateNumber]
       │                                         │
       ▼                                         ▼
[PDF Generation & Download]                [Public Verification REST API]
GET .../download?lang=en|bn                GET /api/v1/certificates/verify/:certNumber
- In-memory PDFKit streaming               - @Public() unauthenticated access
- Bundled Noto Sans Bengali font           - Rate-limited (20 req/min)
- Embedded QR code matrix                  - Safe Cache-Control headers
       │                                   - Zero internal DB IDs or PII exposed
       │                                         ▲
       └──────────────── QR Scan ────────────────┘
```

### Route Summary Table
| Method | Route | Auth Policy | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/courses/:courseId/certificate` | Cookie / Bearer (Student) | Retrieves issued certificate or lazy-issues if eligible |
| `GET` | `/api/v1/courses/:courseId/certificate/eligibility` | Cookie / Bearer (Student) | Detailed readiness checklist (lessons, quizzes, final exam) |
| `POST` | `/api/v1/courses/:courseId/certificate/issue` | Cookie / Bearer (Student) | Explicit certificate claim action |
| `GET` | `/api/v1/courses/:courseId/certificate/download` | Cookie / Bearer (Student) | Authenticated PDF download by course context (`lang=en\|bn`) |
| `GET` | `/api/v1/certificates/:certificateNumber/download` | Cookie / Bearer (Owner/Admin) | Direct PDF download by certificate number (`lang=en\|bn`) |
| `GET` | `/api/v1/certificates/verify/:certificateNumber` | Public (Unauthenticated) | Public verification lookup (Rate limited to 20 req/min) |
| `POST` | `/api/v1/admin/certificates/:id/revoke` | Cookie / Bearer (Admin) | Administrative credential revocation with reason |

---

## 3. Eligibility & Issuance Integrity

The complete assessment gate logic in `CertificateService.checkEligibility` was validated against persisted relational data:

### 3.1 Eligibility Decision Matrix
| Evaluation Criterion | Implementation Rule | System Behavior |
| :--- | :--- | :--- |
| **Incomplete Lesson** | `completedLessons < totalLessons` | Ineligible (`COURSE_NOT_COMPLETED`). Claim and download blocked with HTTP 403. |
| **Unpassed Published Quiz** | `passedQuizzes < publishedQuizzes` | Ineligible (`Incomplete quizzes: X of Y passed`). Issuance blocked. |
| **Draft Quiz** | `status = 'DRAFT'` | Excluded from required assessment denominator. Does NOT block eligibility. |
| **Archived Quiz** | `status = 'ARCHIVED'` | Excluded from required assessment denominator. Does NOT block eligibility. |
| **Published Final Exam** | `quizType = 'FINAL_EXAM' && !isPassed` | Specifically checked (`hasUnpassedFinalExam`). Blocks graduation until passed. |
| **Unenrolled User** | Enrollment record missing | Returns `404 ENROLLMENT_NOT_FOUND`. Prevents unearned credential minting. |

### 3.2 Idempotency & Concurrency Validation
- **Idempotency:** Re-invoking `issueCertificateIfEligible` on an already-issued enrollment returns `status: 'ALREADY_EXISTS'`, `issued: false`, and returns the existing certificate record without altering timestamps or certificate numbers.
- **Concurrency Test (`Promise.all`):** Five simultaneous issuance requests fired concurrently for the same learner yielded exactly 1 `ISSUED` result and 4 `ALREADY_EXISTS` results. The database contains exactly 1 certificate row backed by unique partial index `certificates_active_enrollment_uq`.

---

## 4. Snapshot Immutability Evidence

Academic certificates represent historical awards that must remain immutable even if the underlying platform entities change.

### Test Execution Sequence
1. Issued active certificate `TSP-2026-C...` to learner **Alice Learner** for course **Production Kubernetes & Event Mesh Architecture** taught by **Dr. Sarah Mitchell**.
2. Mutated underlying database records:
   - `users.name` changed to `"Alice Renamed Profile"`
   - `courses.title` changed to `"New Course Title Post-Graduation"`
   - Instructor's `users.name` changed to `"Dr. Reassigned Instructor"`
3. Queried certificate via `getCertificateByNumber`:
   - `studentName` remained strictly `"Alice Learner"`
   - `courseTitle` remained strictly `"Production Kubernetes & Event Mesh Architecture"`
   - `instructorName` remained strictly `"Dr. Sarah Mitchell"`
   - `finalScorePercentage` remained strictly `92`
4. Generated certificate PDF via `CertificatePdfService`:
   - Extracted text confirmed PDF renders `"Alice Learner"` and original course title, unaffected by current database entity mutations.

---

## 5. English & Bangla PDF Validation

The in-memory PDF generation engine (`CertificatePdfService`) was validated across both language environments:

### 5.1 Verification Properties
- **Dimensions:** Strict A4 Landscape (`841.89` pt width × `595.28` pt height).
- **Bangla Typography:** Bundled Google TrueType fonts `NotoSansBengali-Regular.ttf` and `NotoSansBengali-Bold.ttf` located in `apps/api/src/assets/fonts/`.
- **Conjunct & Glyph Rendering:** Verified complex Bangla conjuncts (যুক্তবর্ণ) without square-box fallbacks or rendering exceptions.
- **Resource Cleanup:** Generated in-memory using event-driven stream buffers with immediate garbage collection; zero temp files created on disk.
- **Content Disposition:** `attachment; filename="TechSprout-Certificate-${certNumber}-${lang}.pdf"`.
- **Cache Invalidation:** `Cache-Control: private, no-transform, max-age=0`.

---

## 6. Authenticated Download Authorization Results

| Client Context | Target Resource | Authorization Check | Result |
| :--- | :--- | :--- | :--- |
| **Owner Student (Alice)** | `courses/:id/certificate/download` | Student ID matches enrollment user ID | **200 OK** (PDF Stream) |
| **Owner Student (Alice)** | `certificates/:num/download` | `cert.studentId === req.user.id` | **200 OK** (PDF Stream) |
| **Unauthorized Peer (Bob)** | `certificates/:num/download` (Alice's cert) | Tenant isolation check | **403 FORBIDDEN** |
| **Administrator** | `certificates/:num/download` (Alice's cert) | Role override (`req.user.role === 'admin'`) | **200 OK** (PDF Stream) |
| **Revoked Certificate** | Both download endpoints | `cert.status === 'REVOKED'` check | **400 CERTIFICATE_REVOKED** |

---

## 7. Public Verification & Privacy Results

### 7.1 Security & Access Controls
- **Unauthenticated Access:** Verification succeeds with zero session cookies or Bearer tokens.
- **Rate Limiting:** Enforced via `@Throttle({ default: { limit: 20, ttl: 60000 } })`. Requests exceeding 20 queries in 60 seconds receive HTTP 429 (`Too Many Requests`).
- **Caching Headers:**
  - Valid responses (200): `Cache-Control: public, max-age=60, s-maxage=300, stale-while-revalidate=600`
  - Error responses (400, 404): `Cache-Control: no-cache, no-store, must-revalidate`
  - `X-Content-Type-Options: nosniff` on all responses.
- **Anti-Crawling Protection:** [apps/web/src/app/verify/layout.tsx](file:///d:/Work/2026/techsprout-main/apps/web/src/app/verify/layout.tsx) injects `robots: { index: false, follow: false }`.

### 7.2 Zero PII Disclosure Audit
In all verification responses and frontend DOM renderings, the following fields are strictly omitted:
- Database internal IDs (`id`, `studentId`, `userId`, `enrollmentId`, `courseId`)
- Student contact data (`email`, `phone`)
- Password hashes and authentication credentials
- Assessment attempt IDs, question point breakdowns, and answer logs
- Cloudinary / media upload storage paths (`pdfMediaId`)

---

## 8. Final Assessment Score Disclosure Resolution

Section 4 of the WP-P11-04 specification requested an explicit resolution regarding whether `finalScorePercentage` should be exposed on public verification lookups.

### 8.1 Investigation & Evidence Lineage
1. **Contract Definition (Oct 2, 2026):** In commit `f58f34d4` ("feat(assessment): complete p4.5 certificate system"), `packages/contracts/src/index.ts` formally defined `PublicCertificateVerificationDto` including `finalScorePercentage?: number | null;`.
2. **REST API Documentation (`docs/api/quizzes-certificates.md`):** Line 586 under `GET /api/v1/certificates/verify/:certificateNumber` explicitly documented the active response schema with `"finalScorePercentage": 85`.
3. **Existing Regression Tests:** `apps/api/src/test/certificates-api.spec.ts` (Test 9, line 568) explicitly asserts `expect(res.body.data.finalScorePercentage).toBe(95);`. Removing this field would break established baseline tests.
4. **Architectural Decision Record (`docs/adr/0006-p4-quizzes-certificates.md`):** Section 2.8.3 specifies that `final_score_percentage` is a deterministic frozen snapshot calculated at graduation. Section 2.8.5 lists core verification attributes.

### 8.2 Architectural Decision & Privacy Safeguard
- **Decision:** `finalScorePercentage` remains part of the approved public verification contract for credentials where an authoritative graduation score exists. Verifying the score against the central registry confirms that physical/PDF certificates have not been altered or forged to inflate grades.
- **Mandatory Privacy Safeguard for Unapproved / Non-Graded Credentials:**
  - For courses with no quizzes, non-graded tracks, or where a score was not awarded, `finalScorePercentage` is `null`.
  - The public verification web page ([apps/web/src/app/verify/[certificateNumber]/page.tsx](file:///d:/Work/2026/techsprout-main/apps/web/src/app/verify/%5BcertificateNumber%5D/page.tsx)) conditionally renders the score section only when `verification.finalScorePercentage !== null && verification.finalScorePercentage !== undefined`.
  - When null, the score block is completely suppressed from the UI.
  - A regression test (`Test 9` in `public-certificate-verification.spec.ts` and `Test 3.2` in `certificate-lifecycle-e2e.spec.ts`) verifies that when `finalScorePercentage` is null, no score element is ever rendered in the DOM or PDF.
  - Granular attempt logs, question-by-question points, and answer keys are **never** disclosed under any circumstance.

---

## 9. Real QR Barcode Decoding Evidence

To eliminate synthetic assertions, WP-P11-04 executed a live barcode decoding test following the actual user path:
1. `CertificatePdfService.generateCertificatePdf` generated an in-memory PDF buffer with an embedded vector QR code.
2. `pdf-parse` v2 extracted the page image stream (`images[0].data`).
3. `pngjs` parsed raw PNG pixels into an RGBA Uint8ClampedArray.
4. `jsQR` decoded the QR barcode finder patterns and error-correction codewords.
5. The decoded string was asserted to equal canonical route `https://techsprout.edu/verify/${cert.certificateNumber}`.
6. The certificate number was extracted from the decoded URL and submitted to `GET /api/v1/certificates/verify/:certNumber`, returning HTTP 200 with `verificationStatus: 'VALID'`.

---

## 10. Monorepo Quality Gate & Regression Results

### 10.1 Test Execution Totals
| Subsystem / Test Suite | Test Files | Total Tests | Passed | Failed | Skipped |
| :--- | :---: | :---: | :---: | :---: | :---: |
| **All Certificate Backend Tests (`src/test/certificate-*`)** | 5 | 98 | 98 | 0 | 0 |
| **Full API Regression Suite (`apps/api`)** | 59 | 1,423 | 1,416 | 0 | 7 |
| **All Certificate Frontend Tests (`apps/web`)** | 2 | 47 | 47 | 0 | 0 |
| **Full Web Regression Suite (`apps/web`)** | 27 | 591 | 591 | 0 | 0 |
| **Monorepo Combined Total** | **86** | **2,014** | **2,007** | **0** | **7** |

### 10.2 Static & Compilation Checks
- `pnpm --filter @techsprout/contracts build`: **PASS** (Zero TS errors)
- `pnpm --filter @techsprout/api typecheck`: **PASS** (Zero TS errors)
- `pnpm --filter @techsprout/web validate:i18n`: **PASS** (1,671 keys in 100% parity, 0 missing, 0 orphan)
- `pnpm --filter @techsprout/web lint`: **PASS** (0 errors, 0 warnings)
- `pnpm --filter @techsprout/web build`: **PASS** (33 static and dynamic routes compiled successfully)

---

## 11. Database & Infrastructure Safety

- **Production Safety:** Zero migrations executed against production databases. No production deployments triggered.
- **Schema Impact:** No database schema alterations or migrations were required. The existing PostgreSQL schema (`certificates`, `enrollments`, `courses`, `users`, `quizzes`) provides complete structural support for active status, unique partial indexes, and immutable audit snapshots.
- **External Dependencies:** Zero external SaaS rendering engines or paid microservices introduced. All barcode generation (`qrcode`), image decoding (`pngjs`, `jsQR`), and PDF streaming (`pdfkit`) operate entirely in-memory with zero cloud costs.

---

## 12. Deliverable Files Changed

- `apps/api/src/test/certificate-lifecycle-e2e.spec.ts` (New E2E integration test suite, 16 tests)
- `apps/api/src/test/certificate-public-verification.spec.ts` (Load method cast cleanup)
- `apps/web/src/__tests__/public-certificate-verification.spec.ts` (Added unapproved score suppression test)
- `docs/research/p11.0/WP-P11-04_CERTIFICATE_LIFECYCLE_INTEGRATION_REPORT.md` (This document)
- `docs/research/p11.0/PHASE_11_CERTIFICATE_LIFECYCLE_COMPLETION_REPORT.md` (Consolidated Phase 11 report)
