# TECHSPROUT LMS — PHASE 11.3 WORK PACKAGE REPORT
## PUBLIC CERTIFICATE VERIFICATION & QR VALIDATION (WP-P11-03)

**Repository:** `RafisGit/Techsprout`  
**Phase:** P11 — Certificate Lifecycle  
**Work Package:** WP-P11-03  
**Feature Branch:** `feat/p11-certificate-lifecycle`  
**Previous Work Packages:** WP-P11-01 (Eligibility & Issuance), WP-P11-02 (PDF Design & Downloads)  
**Report Date:** 2026-11-01  
**Status:** COMPLETE & VERIFIED  

---

## 1. Executive Summary

Work Package WP-P11-03 completes the public verification and QR validation lifecycle of TechSprout LMS academic credentials.

This work package establishes an authoritative, tamper-proof, public credential authentication pipeline:
1. **Public Verification REST API (`GET /api/v1/certificates/verify/:certificateNumber`):** An unauthenticated, rate-limited public endpoint protected by `@Throttle({ default: { limit: 20, ttl: 60000 } })`. It returns unambiguous verification status (`VALID`, `REVOKED`, or `NOT_FOUND`), canonical verification URLs, and historical snapshot data.
2. **Zero-PII Privacy & Security Architecture:** Strict database projection ensures zero internal database identifiers, UUIDs, student emails, phone numbers, enrollment IDs, or quiz attempt histories are disclosed to the public or indexed by search engines.
3. **Public Verification Page (`/verify/[certificateNumber]` and `/verify`):** A responsive, accessible bilingual verification page built with Next.js App Router and Tailwind CSS. It visually and textually differentiates authentic credentials (emerald badge), administratively revoked certificates (rose banner with revocation reasons), and unissued/invalid certificates (amber warning).
4. **Search Engine Indexing Prevention:** Enforces `<meta name="robots" content="noindex, nofollow" />` across the entire `/verify` route tree via `apps/web/src/app/verify/layout.tsx` to safeguard student anonymity.
5. **Real QR Barcode Extraction & Matrix Decoding:** Concrete end-to-end integration testing utilizing `pdf-parse` v2, `pngjs`, and `jsQR` to extract embedded QR images directly from generated PDF streams, decode the raw matrix, and confirm that the barcode resolves to canonical URL `https://techsprout.edu/verify/${certificateNumber}`.
6. **Bilingual Localization Integrity:** 100% key parity between English (`en`) and Bangla (`bn`) translation dictionaries (1,671 leaf keys each), with verified context-aware translations for academic verification status, explanations, dates, and copy actions.
7. **Comprehensive Verification Suite:** 12 backend verification tests, 8 frontend verification tests, 82 certificate-specific API tests, 1,400 total API regression tests, and 590 web tests passing with zero failures.

---

## 2. Deliverables & Acceptance Matrix

| Sub-Package | Description | Status | Verification Evidence |
| :--- | :--- | :--- | :--- |
| **WP-P11-03-A** | Public Rate-Limited Verification REST API | **COMPLETE** | `@Public()`, `@Throttle(20 req/min)`, safe cache headers, status determination |
| **WP-P11-03-B** | Zero-PII Security Model & Safe Projection | **COMPLETE** | `mapToPublicVerificationDto` filters all UUIDs, emails, phones, and DB keys |
| **WP-P11-03-C** | Public Verification Page (`/verify/[certificateNumber]`) | **COMPLETE** | SSR + Client hydration, emerald valid card, rose revoked card, amber 404 card |
| **WP-P11-03-D** | Search Engine Robots Restrictions | **COMPLETE** | `metadata.robots = { index: false, follow: false }` in `/verify/layout.tsx` |
| **WP-P11-03-E** | Bilingual Support (English & Bangla) | **COMPLETE** | 1:1 parity (1,671 keys), `validate:i18n` passes, verified in SSR test suite |
| **WP-P11-03-F** | Real QR Extraction & Matrix Decoding Test | **COMPLETE** | `pdf-parse` v2 image buffer extraction + `pngjs` + `jsQR` automated decode test |
| **WP-P11-03-G** | Side-Effect Free Invariant & Immutability | **COMPLETE** | Read-only verification queries; zero state mutation on enrollments or certs |

---

## 3. Architecture & Public Verification Design

### 3.1 REST API Endpoint Architecture
The verification API is exposed at:
`GET /api/v1/certificates/verify/:certificateNumber`

Key structural properties:
- **Authentication:** Unauthenticated via `@Public()`. Third parties, employers, and academic institutions can verify credentials without registration or login.
- **Abuse Prevention:** Rate-limited via NestJS `@Throttle({ default: { limit: 20, ttl: 60000 } })`. Requests exceeding 20 queries per minute from a given IP address receive HTTP 429 (`Too Many Requests`).
- **Input Sanitization:** Parameter `:certificateNumber` is validated against `certificateNumberSchema`:
  ```ts
  export const certificateNumberSchema = z
    .string({ required_error: 'Certificate number is required' })
    .trim()
    .min(1, 'Certificate number is required')
    .max(50, 'Certificate number cannot exceed 50 characters')
    .regex(/^[a-zA-Z0-9_\-]+$/, 'Certificate number contains invalid characters');
  ```
  Malformed inputs, control characters, SQL injection attempts (`' OR 1=1 --`), and directory traversal payloads (`../../etc/passwd`) are rejected with HTTP 400 (`VALIDATION_ERROR`) before executing database queries.
- **Case-Insensitive Resolution:** Queries match certificate numbers case-insensitively using `or(eq(certificateNumber, trimmed), eq(certificateNumber, trimmed.toUpperCase()), ilike(certificateNumber, trimmed))`.
- **Side-Effect Free:** The endpoint executes strictly read-only queries. It never creates certificates, updates enrollments, or triggers notifications.
- **Safe Caching Headers:**
  - On valid (200) responses: `Cache-Control: public, max-age=60, s-maxage=300, stale-while-revalidate=600`.
  - On error (400, 404) responses: `Cache-Control: no-cache, no-store, must-revalidate`.
  - `X-Content-Type-Options: nosniff` on all responses.

### 3.2 Canonical Verification URL
The single authoritative canonical URL format across all platform components is:
`https://techsprout.edu/verify/${certificateNumber}`

If `WEB_PUBLIC_ORIGIN` is configured in production, it is adopted dynamically; otherwise, `https://techsprout.edu` is the immutable academic default. Both PDF footer text, PDF embedded QR code, verification API response, and web page share this identical canonical URL.

### 3.3 Zero-PII Projection
Public responses are projected through `mapToPublicVerificationDto`:
```ts
export function mapToPublicVerificationDto(
  cert: typeof certificates.$inferSelect,
  baseUrl: string = 'https://techsprout.edu'
): PublicCertificateVerificationDto {
  const isRevoked = cert.status === 'REVOKED';
  return {
    isValid: !isRevoked,
    verificationStatus: isRevoked ? 'REVOKED' : 'VALID',
    certificateNumber: cert.certificateNumber,
    status: cert.status,
    studentName: cert.studentName,
    courseTitle: cert.courseTitle,
    instructorName: cert.instructorName || undefined,
    completedAt: cert.completedAt ? cert.completedAt.toISOString() : undefined,
    issuedAt: cert.issuedAt ? cert.issuedAt.toISOString() : undefined,
    finalScorePercentage: cert.finalScorePercentage ?? null,
    verificationUrl: `${baseUrl}/verify/${cert.certificateNumber}`,
    ...(isRevoked && {
      revokedAt: cert.revokedAt ? cert.revokedAt.toISOString() : undefined,
      revocationReason: cert.revocationReason || undefined,
    }),
  };
}
```
**Forbidden Fields Omitted from Payload:** `id` (database UUID), `studentId`, `userId`, `enrollmentId`, `courseId`, `email`, `phone`, `pdfMediaId`, `metadata`, and password hashes.

---

## 4. Response Contracts & Canonical Formats

### 4.1 Valid Certificate Response (HTTP 200)
```json
{
  "success": true,
  "message": "Certificate verification successful",
  "data": {
    "isValid": true,
    "verificationStatus": "VALID",
    "certificateNumber": "TSP-2026-CA1B2C3D4",
    "status": "ACTIVE",
    "studentName": "Ayesha Siddiqua",
    "courseTitle": "Fullstack Next.js and NestJS Mastery",
    "instructorName": "Dr. Tariqul Islam",
    "completedAt": "2026-10-10T12:00:00.000Z",
    "issuedAt": "2026-10-10T12:05:00.000Z",
    "finalScorePercentage": 96,
    "verificationUrl": "https://techsprout.edu/verify/TSP-2026-CA1B2C3D4"
  }
}
```

### 4.2 Revoked Certificate Response (HTTP 200)
```json
{
  "success": true,
  "message": "Certificate has been administratively revoked",
  "data": {
    "isValid": false,
    "verificationStatus": "REVOKED",
    "certificateNumber": "TSP-2026-CREVOKED1",
    "status": "REVOKED",
    "studentName": "Kamran Hossain",
    "courseTitle": "Enterprise TypeScript Architecture",
    "instructorName": "Dr. Tariqul Islam",
    "completedAt": "2026-09-15T10:00:00.000Z",
    "issuedAt": "2026-09-15T10:05:00.000Z",
    "finalScorePercentage": 82,
    "verificationUrl": "https://techsprout.edu/verify/TSP-2026-CREVOKED1",
    "revokedAt": "2026-10-01T14:30:00.000Z",
    "revocationReason": "Academic policy integrity violation"
  }
}
```

### 4.3 Certificate Not Found Response (HTTP 404)
```json
{
  "success": false,
  "errorCode": "CERTIFICATE_NOT_FOUND",
  "message": "Certificate not found"
}
```

### 4.4 Malformed Request Response (HTTP 400)
```json
{
  "success": false,
  "errorCode": "VALIDATION_ERROR",
  "message": "Invalid certificate number format",
  "details": {
    "": ["Certificate number contains invalid characters"]
  }
}
```

---

## 5. QR Code Extraction & Real Decoding Evidence

To guarantee that QR codes embedded in generated certificate PDFs actually work in the physical world without relying on mock string assertions, WP-P11-03 implemented an automated barcode extraction and decoding pipeline in `apps/api/src/test/certificate-public-verification.spec.ts` (Test 10):

### 5.1 Pipeline Stages
1. **PDF Generation:** `CertificatePdfService.generateCertificatePdf` generates an in-memory PDF buffer with vector borders, typography, and an embedded PNG QR code generated via `qrcode.toBuffer(canonicalUrl)`.
2. **Image Extraction:** `PDFParse(new Uint8Array(pdfBuffer)).getImage({ imageBuffer: true })` extracts page image streams. The first image is confirmed as a valid PNG buffer starting with magic bytes `89 50 4e 47`.
3. **Pixel Parsing:** `PNG.sync.read(qrImageBuffer)` decodes PNG image bytes into width, height, and raw RGBA pixel arrays.
4. **Barcode Matrix Decoding:** `jsQR(new Uint8ClampedArray(png.data), png.width, png.height)` identifies finder patterns, timing patterns, and Reed-Solomon error correction codewords to decode the barcode matrix.
5. **Payload Validation:** The decoded payload string is asserted to match:
   `https://techsprout.edu/verify/${validCertificate.certificateNumber}`
6. **Live End-to-End Resolution:** The certificate number is parsed from the decoded URL and passed into `GET /api/v1/certificates/verify/:certificateNumber`, returning HTTP 200 with `verificationStatus: 'VALID'`.

### 5.2 Verification Log Excerpt
```
✓ Test 10: QR Code Decoding & Canonical URL Validation — generates PDF, decodes embedded QR, validates URL and API
  - Generated PDF Buffer: 8,421 bytes
  - Extracted Page Images: 1 image (magic bytes: 89504e47)
  - Decoded PNG Matrix: 236 x 236 px
  - Decoded QR URL: https://techsprout.edu/verify/TSP-2026-C8A2B9C1
  - Verified API Status: 200 OK (VALID)
```

---

## 6. Bilingual Localization Parity

Both English (`apps/web/src/i18n/messages/en.ts`) and Bangla (`apps/web/src/i18n/messages/bn.ts`) translation dictionaries have been synchronized:

| Key | English Translation | Bangla Translation |
| :--- | :--- | :--- |
| `certificateVerification` | `Certificate Verification` | `সনদপত্র যাচাইকরণ` |
| `validCertificate` | `Valid Certificate` | `বৈধ সনদপত্র` |
| `revokedCertificate` | `Revoked Certificate` | `বাতিলকৃত সনদপত্র` |
| `certificateHolder` | `Certificate Holder` | `সনদধারী` |
| `courseLabel` | `Course` | `কোর্স` |
| `instructorLabel` | `Instructor` | `প্রশিক্ষক` |
| `issueDateLabel` | `Issue Date` | `ইস্যুর তারিখ` |
| `verificationExplanation` | `Verification Meaning` | `যাচাইকরণের তাৎপর্য` |
| `validExplanation` | `This certificate is authentic, officially issued by TechSprout Academy, and active.` | `এই সনদটি টেকস্প্রাউট একাডেমি কর্তৃক আনুষ্ঠানিকভাবে ইস্যুকৃত এবং সক্রিয় রয়েছে।` |
| `revokedExplanation` | `This certificate has been administratively revoked and is no longer recognized.` | `এই সনদপত্রটি প্রশাসনিকভাবে বাতিল করা হয়েছে এবং প্রাতিষ্ঠানিকভাবে আর গ্রহণযোগ্য নয়।` |
| `notFoundExplanation` | `No certificate record matches this code. Please check the spelling or format.` | `এই কোডের বিপরীতে কোনো সনদ পাওয়া যায়নি। অনুগ্রহ করে কোডের বানান অথবা ফরম্যাট যাচাই করুন।` |
| `temporaryFailure` | `Temporary Verification Failure` | `যাচাইকরণে সাময়িক সমস্যা` |
| `temporaryFailureDesc` | `Unable to connect to registry. Please try again.` | `রেজিস্ট্রির সাথে যোগাযোগ করা সম্ভব হয়নি। অনুগ্রহ করে পুনরায় চেষ্টা করুন।` |

### Parity Audit
```bash
$ pnpm --filter @techsprout/web validate:i18n
[CHECK 1] Dictionary Key Parity:
  - English total leaf keys: 1671
  - Bangla total leaf keys:  1671
  PASS: Zero missing keys in Bangla dictionary.
  PASS: Zero missing/orphan keys in English dictionary.
[SUCCESS] All i18n checks passed with 100% integrity.
```

---

## 7. Automated Test Results

### 7.1 Backend Test Suite (`certificate-public-verification.spec.ts`)
| Test # | Test Scenario | Expected Outcome | Status |
| :---: | :--- | :--- | :---: |
| **1** | Valid certificate verification | Returns `VALID`, `isValid: true`, and complete historical snapshot data | **PASS** |
| **2** | Revoked certificate verification | Returns `REVOKED`, `isValid: false`, reason, and timestamp without PII | **PASS** |
| **3** | Non-existent certificate number | Returns HTTP 404 with `CERTIFICATE_NOT_FOUND` | **PASS** |
| **4** | Malformed certificate number | Returns HTTP 400 `VALIDATION_ERROR` without leaking DB internals | **PASS** |
| **5** | Unauthenticated verification | Succeeds without session cookie or Bearer token | **PASS** |
| **6** | Zero PII disclosure | Student email, phone, user UUID, enrollment ID are completely omitted | **PASS** |
| **7** | Side-effect free verification | Verifying 5 times produces zero mutations in certs/enrollments tables | **PASS** |
| **8** | Rate limiting enforcement | Exceeding 20 req/min triggers HTTP 429 Too Many Requests | **PASS** |
| **9** | Safe caching headers | `public, max-age=60` on 200; `no-cache, no-store` on errors | **PASS** |
| **10** | QR Barcode Decoding Integration | Generates PDF, extracts QR PNG, decodes URL via jsQR, verifies API | **PASS** |
| **11** | Case-insensitivity | Lowercase queries (`tsp-2026-cactive1`) return matching canonical record | **PASS** |
| **12** | Injection / Traversal safety | Path traversal and SQL injection payloads safely rejected as HTTP 400 | **PASS** |

### 7.2 Frontend Test Suite (`public-certificate-verification.spec.ts`)
| Test # | Test Scenario | Expected Outcome | Status |
| :---: | :--- | :--- | :---: |
| **1** | Valid certificate rendering | Renders authentic badge, student name, course title, instructor, score | **PASS** |
| **2** | Revoked certificate rendering | Renders revoked banner, revocation notice, reason, and date | **PASS** |
| **3** | Unknown certificate (404) | Renders `verification-not-found` state with search another button | **PASS** |
| **4** | Network / temporary error | Renders `temporaryFailure` state with `tryAgain` retry button | **PASS** |
| **5** | English & Bangla switching | English and Bangla translations render correctly without missing keys | **PASS** |
| **6** | Canonical verification link | Canonical URL displays and copy link button is rendered | **PASS** |
| **7** | Robots layout metadata | `<meta name="robots" content="noindex, nofollow" />` verified | **PASS** |
| **8** | Zero PII in DOM | No email, phone, or internal DB ID is ever rendered in HTML | **PASS** |

### 7.3 Monorepo Regression Summary
- **API Test Suite:** 1,400 passed, 0 failed (57 test files).
- **Web Test Suite:** 590 passed, 0 failed (27 test files).
- **TypeScript:** Clean compilation (`tsc --noEmit`) across `@techsprout/contracts`, `@techsprout/api`, and `@techsprout/web`.
- **ESLint:** 0 errors, 0 warnings across `@techsprout/web`.
- **Production Build:** `@techsprout/web` Next.js production build succeeded with 33 static and dynamic routes.

---

## 8. Git Commit & Repository State

- **Branch:** `feat/p11-certificate-lifecycle`
- **Base Commit:** `3a8cc17`
- **Commit Message:** `feat(p11): add public certificate verification and QR validation`
- **Modified / Created Files:**
  - `packages/contracts/src/index.ts`
  - `apps/api/package.json`
  - `apps/api/src/modules/certificates/certificates.controller.ts`
  - `apps/api/src/modules/certificates/certificates.service.ts`
  - `apps/api/src/modules/certificates/dto/certificate.dto.ts`
  - `apps/api/src/test/certificate-public-verification.spec.ts`
  - `apps/web/src/app/verify/layout.tsx`
  - `apps/web/src/app/verify/[certificateNumber]/page.tsx`
  - `apps/web/src/i18n/messages/en.ts`
  - `apps/web/src/i18n/messages/bn.ts`
  - `apps/web/src/__tests__/public-certificate-verification.spec.ts`
  - `pnpm-lock.yaml`
  - `docs/research/p11.0/WP-P11-03_PUBLIC_CERTIFICATE_VERIFICATION_REPORT.md`
