# TECHSPROUT LMS — PHASE 11.2 WORK PACKAGE REPORT
## CERTIFICATE DESIGN, PDF GENERATION & DOWNLOADS (WP-P11-02)

**Repository:** `RafisGit/Techsprout`  
**Phase:** P11 — Certificate Lifecycle  
**Work Package:** WP-P11-02  
**Feature Branch:** `feat/p11-certificate-lifecycle`  
**Previous Work Package:** WP-P11-01 (Certificate Eligibility & Automated Issuance Engine)  
**Report Date:** 2026-11-01  
**Status:** COMPLETE & VERIFIED  

---

## 1. Executive Summary

Work Package WP-P11-02 delivers an enterprise-grade, deterministic, in-memory PDF generation and secure download architecture for course-completion certificates in TechSprout LMS.

Building directly on the idempotent issuance engine delivered in Phase 11.1, this work package provides:
1. **Academic Certificate Layout (A4 Landscape):** A formal academic certificate in A4 landscape format (841.89 × 595.28 pt) featuring dual-line gold/forest emerald and deep navy borders, academic branding, dynamic typography scaling, instructor and academic authority signature blocks, and scannable QR verification.
2. **Bilingual Engine (English & Bangla):** Full support for English (`en`) and natural Bangla (`bn`) certificate rendering. Open-source Google Fonts `Noto Sans Bengali` (Regular and Bold, SIL Open Font License) are bundled into the API asset distribution to guarantee zero glyph corruption or missing conjuncts across containerized environments without reliance on host system fonts.
3. **Deterministic In-Memory Generation:** High-performance, streaming PDFKit generator (`CertificatePdfService`) operating with zero external SaaS dependencies, zero headless browser/puppeteer overhead, and negligible RAM footprint.
4. **Secure Download Endpoints:** Two authenticated download endpoints enforcing enrollment ownership, role authorization, content negotiation (`lang=en|bn`), safe `Content-Disposition`, `application/pdf` MIME types, and private cache-control headers.
5. **Enhanced Student Experience:** Live integration in `/learn/[courseSlug]/certificate` with a bilingual download selector (`EN` / `বাং`), asynchronous PDF generation trigger with spinner loading states, automatic browser downloads, and reactive error handling.
6. **Zero-Regression Verification:** 147 passing backend certificate tests, 582 passing frontend tests, 100% i18n dictionary key parity (1,658 leaf keys), clean TypeScript typechecks, and clean Next.js production builds.

---

## 2. Deliverables Matrix

| Sub-Package | Description | Status | Verification Evidence |
| :--- | :--- | :--- | :--- |
| **WP-P11-02-A** | Professional A4 Landscape Academic Certificate Design | **COMPLETE** | Vector borders, TechSprout branding, snapshot fields, signature lines |
| **WP-P11-02-B** | English & Bangla Templates with Bundled Noto Sans Bengali Fonts | **COMPLETE** | Bundled `NotoSansBengali-Regular.ttf` & `Bold.ttf` in `apps/api/src/assets/fonts/` |
| **WP-P11-02-C** | Deterministic In-Memory PDF Generation Engine (`CertificatePdfService`) | **COMPLETE** | PDFKit in-memory buffer streaming, memory-safe, deterministic byte outputs |
| **WP-P11-02-D** | Secure Download REST APIs (`courses/.../download` & `certificates/.../download`) | **COMPLETE** | Authentication, student ownership, admin override, revoked certificate lock |
| **WP-P11-02-E** | Student Portal UI/UX Integration with Bilingual Download Selector | **COMPLETE** | Language toggle, download button with spinner, toast notifications, i18n |
| **WP-P11-02-F** | High-Resolution Scannable QR Code & Canonical Verification | **COMPLETE** | `qrcode` vector generation pointing to `https://techsprout.edu/verify/{certNumber}` |
| **WP-P11-02-G** | Security, Data Privacy & Document Integrity Standards | **COMPLETE** | Strict `Cache-Control`, `X-Content-Type-Options`, immutable snapshot immutability |

---

## 3. Architecture & Technical Implementation

### 3.1 Academic Layout & Typography

The certificate layout is engineered according to international academic credentials standards:
- **Format:** A4 Landscape (`841.89` pt width × `595.28` pt height).
- **Coordinate Geometry:**
  - Outer Frame: Deep Navy (`#0B192C`), line width `3.5` pt, coordinates `(22, 22)` to `(819.89, 573.28)`.
  - Middle Inset: Slate Line (`#CBD5E1`), line width `1.0` pt, coordinates `(26, 26)` to `(815.89, 569.28)`.
  - Inner Accent: TechSprout Forest Emerald (`#047857`), line width `1.5` pt, coordinates `(30, 30)` to `(811.89, 565.28)`.
  - Corner Flourishes: Emerald circular accent nodes at `(36, 36)`, `(805.89, 36)`, `(36, 559.28)`, and `(805.89, 559.28)`.
- **Branding Header:** Centered academic crest banner ("TECHSPROUT ACADEMY OF SOFTWARE ENGINEERING" / "টেকস্প্রাউট একাডেমি অব সফটওয়্যার ইঞ্জিনিয়ারিং") at `y: 52`.
- **Title Block:** Centered 25 pt bold title ("CERTIFICATE OF ACHIEVEMENT" / "কোর্স সমাপনী সার্টিফিকেট") at `y: 88`.
- **Presentation Subtitle:** 10.5 pt slate uppercase text ("THIS IS PROUDLY PRESENTED TO" / "গৌরবের সাথে এই সার্টিফিকেট প্রদান করা হচ্ছে") at `y: 130`.
- **Recipient Student Name:** Scaled dynamically (26 pt for normal names, 22 pt for >28 chars, 19 pt for >40 chars) to prevent line overflows or visual clipping, rendered in `#047857` at `y: 155`.
- **Completion Statement:** Centered 11 pt text ("for successfully completing all curriculum requirements, practical projects, and academic assessments for" / "যিনি নিষ্ঠার সাথে সমস্ত পাঠ, বাস্তবমুখী প্রজেক্ট এবং প্রয়োজনীয় মূল্যায়ন সফলভাবে সম্পন্ন করেছেন") at `y: 210`.
- **Course Title:** Centered 21 pt bold title (scaled down to 18 pt or 16 pt for long titles) rendered in `#0B192C` at `y: 245`.
- **Performance Evaluation:** Rendered dynamically if `finalScorePercentage != null` ("Final Assessment Score: 95%" / "চূড়ান্ত মূল্যায়ন স্কোর: ৯৫%") at `y: 295`.
- **Lower Section (Tri-Column Layout):**
  - **Left Column (x: 55):** Metadata snapshot (Certificate ID, Issue Date, Completion Date) formatted cleanly.
  - **Center Column (x: 285 - 625):** Twin signature blocks featuring Instructor Name + Title ("Course Instructor" / "কোর্স প্রশিক্ষক") and Academic Directorate + Title ("TechSprout Academy" / "টেকস্প্রাউট একাডেমি").
  - **Right Column (x: 680):** High-resolution QR code (`82 × 82` pt) with "Scan to Verify" label.
  - **Footer (y: 542):** Canonical verification URL banner ("Official Verification: https://techsprout.edu/verify/{certNumber}").

### 3.2 Bangla Font Bundling Strategy

To ensure deterministic rendering in Alpine Linux, Debian, Docker, and CI/CD containers without relying on host system packages (`fonts-noto-core` or `fontconfig`), the official Google SIL OFL-licensed TrueType fonts are bundled inside the API codebase:
- `apps/api/src/assets/fonts/NotoSansBengali-Regular.ttf` (138,780 bytes)
- `apps/api/src/assets/fonts/NotoSansBengali-Bold.ttf` (139,192 bytes)

A resilient multi-candidate resolver (`resolveFontPath`) ensures the font is located correctly during local development, test executions (Vitest), and production builds (`dist/`).

### 3.3 Backend Download Endpoints

#### Endpoint 1: Course-Context Download
`GET /api/v1/courses/:courseId/certificate/download?lang=en|bn`
- **Authentication:** Required (`@ApiBearerAuth()`, `@ApiCookieAuth('techsprout_session')`).
- **Course Resolution:** Resolves course by UUID or slug.
- **Enrollment Verification:** Ensures student holds an active/completed enrollment.
- **Issuance Check:** If no certificate exists, evaluates eligibility and issues idempotently; otherwise throws `403 COURSE_NOT_COMPLETED` or `404 ENROLLMENT_NOT_FOUND`.
- **Revocation Check:** If certificate status is `REVOKED`, throws `400 CERTIFICATE_REVOKED`.
- **Query Negotiation:** Validates `lang?: 'en' | 'bn'`, defaulting to `'en'`. Throws `400 INVALID_QUERY_PARAM` on invalid inputs.
- **Response Headers:**
  - `Content-Type: application/pdf`
  - `Content-Disposition: attachment; filename="TechSprout-Certificate-${certNumber}-${lang}.pdf"`
  - `Content-Length: <exact byte length>`
  - `Cache-Control: private, no-transform, max-age=0`
  - `X-Content-Type-Options: nosniff`

#### Endpoint 2: Direct Certificate Number Download
`GET /api/v1/certificates/:certificateNumber/download?lang=en|bn`
- **Access Control:** Verified against `cert.studentId === req.user.id` or `req.user.role === 'admin'`. Non-owning students receive `403 FORBIDDEN`.
- **Format Validation:** Validated against `certificateNumberSchema` (`TSP-YYYY-CXXXXXXXX`).
- **Revocation Check:** Revoked certificates cannot be downloaded (`400 CERTIFICATE_REVOKED`).

### 3.4 Student Frontend Integration

In `apps/web/src/app/learn/[courseSlug]/certificate/page.tsx`:
- **Language Toggle:** Pill-style bilingual toggle (`EN` / `বাং`) bound to local storage / current locale.
- **Download Action:** "Download PDF" button (`btn-download-certificate-pdf`) with `Download` icon and `Loader2` spinning indicator during in-memory generation.
- **Automatic Browser Trigger:** Creates temporary object URL (`window.URL.createObjectURL(blob)`), triggers simulated click with standard filename, and releases memory (`window.URL.revokeObjectURL(url)`).
- **Reactive Feedback Banner:** Accessible alert banner informing the student upon successful download or presenting clear error messages if network/eligibility issues arise.

---

## 4. Verification & Testing Matrix

### 4.1 Backend Test Coverage (`certificate-pdf-generation.spec.ts`)

| # | Test Condition | Target | Result |
| :---: | :--- | :--- | :---: |
| 1 | PDF Magic Bytes Verification | Starts with `%PDF-` and size > 10,000 bytes | **PASS** |
| 2 | English Template & Metadata Snapshot Integrity | Renders student name, course, instructor, score, cert ID, URL | **PASS** |
| 3 | Bangla Template & Conjunct Rendering | Bundled NotoSansBengali font, natural Bengali phrasing | **PASS** |
| 4 | Score Optionality | Score line cleanly omitted when `finalScorePercentage` is null | **PASS** |
| 5 | High-Density Text & Long Strings | Dynamic font scaling for >50 char names and >100 char courses | **PASS** |
| 6 | Custom Verification Base URL | QR code and footer respect custom frontend origins | **PASS** |
| 7 | Unauthenticated Course Download | Returns `401 UNAUTHORIZED` | **PASS** |
| 8 | Invalid Language Query Parameter | `?lang=fr` returns `400 INVALID_QUERY_PARAM` | **PASS** |
| 9 | Non-Enrolled Student Download | Returns `404 ENROLLMENT_NOT_FOUND` | **PASS** |
| 10 | Incomplete Course Download | Returns `403 COURSE_NOT_COMPLETED` | **PASS** |
| 11 | English PDF Download by UUID | Returns `200 application/pdf` with `...-en.pdf` filename | **PASS** |
| 12 | Default Language Fallback | Omitting `lang` parameter defaults to English | **PASS** |
| 13 | Bangla PDF Download by Course Slug | Resolves course slug and returns `...-bn.pdf` | **PASS** |
| 14 | Revoked Certificate Course Download Block | Returns `400 CERTIFICATE_REVOKED` | **PASS** |
| 15 | Unauthenticated Number Download | Returns `401 UNAUTHORIZED` | **PASS** |
| 16 | Non-Existent Certificate Number | Returns `404 CERTIFICATE_NOT_FOUND` | **PASS** |
| 17 | Student Authorization Boundary | Bob downloading Alice's certificate returns `403 FORBIDDEN` | **PASS** |
| 18 | Owning Student Direct Download | Alice downloads own certificate via certificate number | **PASS** |
| 19 | Admin Privilege Override | Administrator downloads any student certificate | **PASS** |
| 20 | Revoked Certificate Direct Download Block | Returns `400 CERTIFICATE_REVOKED` | **PASS** |
| 21 | Case-Insensitive Query Parameter | `?lang=BN` correctly normalizes to Bangla template | **PASS** |
| 22 | Exact Content-Length Match | `Content-Length` header strictly matches byte buffer size | **PASS** |
| 23 | Immutable Snapshot Invariance | Updated student profile name does not alter issued certificate text | **PASS** |
| 24 | Malformed Certificate Number Check | Returns `400 VALIDATION_ERROR` on malformed string | **PASS** |
| 25 | Strict Cache-Control Header Check | `private, no-transform, max-age=0` strictly enforced | **PASS** |

### 4.2 Frontend Test Coverage (`certificate-learning.spec.ts`)

| # | Test Condition | Target | Result |
| :---: | :--- | :--- | :---: |
| 1 | Course Download API Client Call | `downloadCertificatePdf(courseId, 'en')` sends `responseType: blob` | **PASS** |
| 2 | Default Language in API Client | Defaults to `'en'` when language omitted | **PASS** |
| 3 | Bangla Language in API Client | Passes `lang: 'bn'` in query params | **PASS** |
| 4 | Certificate Number Download Client Call | `downloadCertificateByNumberPdf` requests encoded endpoint | **PASS** |
| 5 | Full Web Test Suite (26 files) | All 582 unit and integration tests passing | **PASS** |

---

## 5. File System Artifacts

### 5.1 Added Files
1. `apps/api/src/assets/fonts/NotoSansBengali-Regular.ttf` — SIL OFL Bangla regular font.
2. `apps/api/src/assets/fonts/NotoSansBengali-Bold.ttf` — SIL OFL Bangla bold font.
3. `apps/api/src/modules/certificates/certificate-pdf.service.ts` — Deterministic in-memory PDF service.
4. `apps/api/src/test/certificate-pdf-generation.spec.ts` — Comprehensive 25-condition test suite.
5. `docs/research/p11.0/WP-P11-02_CERTIFICATE_PDF_AND_DOWNLOAD_REPORT.md` — This deliverable report.

### 5.2 Modified Files
1. `apps/api/package.json` & `pnpm-lock.yaml` — Added `qrcode` and `@types/qrcode`.
2. `apps/api/src/modules/certificates/certificates.module.ts` — Registered `CertificatePdfService`.
3. `apps/api/src/modules/certificates/certificates.controller.ts` — Added download endpoints.
4. `apps/api/src/modules/certificates/index.ts` — Exported `CertificatePdfService`.
5. `apps/web/src/lib/api/certificates.ts` — Added `downloadCertificatePdf` and `downloadCertificateByNumberPdf`.
6. `apps/web/src/app/learn/[courseSlug]/certificate/page.tsx` — Added language toggle, download button, loading spinner, and feedback banner.
7. `apps/web/src/i18n/messages/en.ts` & `bn.ts` — Added translation keys for bilingual download actions.
8. `apps/web/src/__tests__/certificate-learning.spec.ts` — Added frontend API client download tests.

---

## 6. Verification Summary

```text
Contracts Build:               SUCCESS (tsc 0 errors)
API Typecheck:                 SUCCESS (tsc --noEmit 0 errors)
API Certificate Test Suite:    SUCCESS (147 / 147 tests passed)
Web Tests:                     SUCCESS (582 / 582 tests passed)
Web i18n Dictionary Parity:    SUCCESS (1,658 leaf keys in exact parity)
Web ESLint:                    SUCCESS (0 errors, 0 warnings)
Next.js Production Build:      SUCCESS (Turbopack static & dynamic routes compiled)
```

**Conclusion:** Work Package WP-P11-02 is fully implemented, verified, and ready for commit on branch `feat/p11-certificate-lifecycle`.
