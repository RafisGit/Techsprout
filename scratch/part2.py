# scratch/part2.py - Sections 6 to 10
import os

def get_part2_html():
    return '''
<!-- ================= SECTION 6: FEATURE GAP ANALYSIS ================= -->
<div class="page-break">
  <h1 class="section-title"><span class="num">06</span> Launch-Readiness Feature Gap Analysis</h1>
  <p>To establish production readiness, we conducted a granular capability gap analysis comparing expected LMS functionalities against current repository implementations:</p>

  <table>
    <thead>
      <tr>
        <th style="width: 25%;">Functional Domain</th>
        <th style="width: 25%;">Target LMS Production Requirement</th>
        <th style="width: 25%;">Current TechSprout Implementation</th>
        <th style="width: 15%;">Launch Blockage</th>
        <th style="width: 10%;">Priority</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td><strong>Credential Security</strong></td>
        <td>Password hashing via Argon2id or Bcrypt (cost factor 12) + salt.</td>
        <td>Plain text JSON stored in <code>User.create()</code> at <code>/api/register</code>.</td>
        <td><span class="badge badge-critical">Immediate Blocker</span></td>
        <td>P0</td>
      </tr>
      <tr>
        <td><strong>Form Data Integrity</strong></td>
        <td>Password confirmation equality check; strict regex for BD numbers.</td>
        <td><code>Register.tsx</code> binds Confirm Password to <code>name</code>; posts to <code>/test</code>.</td>
        <td><span class="badge badge-critical">Immediate Blocker</span></td>
        <td>P0</td>
      </tr>
      <tr>
        <td><strong>Course Delivery</strong></td>
        <td>Protected video streaming (HLS) with signed playback tokens.</td>
        <td>Static mock HTML5 <code>&lt;video src=demoVideo&gt;</code> without token protection.</td>
        <td><span class="badge badge-high">High Blocker</span></td>
        <td>P0</td>
      </tr>
      <tr>
        <td><strong>Enrollment Engine</strong></td>
        <td>Atomic transaction enrolling user upon verified payment IPN webhook.</td>
        <td>"Enroll Now" button has no click handler; no purchase pipeline.</td>
        <td><span class="badge badge-critical">Immediate Blocker</span></td>
        <td>P0</td>
      </tr>
      <tr>
        <td><strong>Progress Tracking</strong></td>
        <td>Event-driven lesson completion and course percentage calculations.</td>
        <td>Zero progress tracking models or endpoints exist.</td>
        <td><span class="badge badge-high">High Blocker</span></td>
        <td>P1</td>
      </tr>
      <tr>
        <td><strong>Assessment / Exams</strong></td>
        <td>Timed MCQ engine with server-side validation and question randomization.</td>
        <td>No exam schemas, questions, or result tables exist.</td>
        <td><span class="badge badge-high">High Blocker</span></td>
        <td>P1</td>
      </tr>
      <tr>
        <td><strong>Admin Oversight</strong></td>
        <td>Admin portal to approve courses, audit revenues, and manage roles.</td>
        <td>Two static pages displaying placeholder <code>&lt;h2&gt;</code> text.</td>
        <td><span class="badge badge-medium">Moderate Blocker</span></td>
        <td>P1</td>
      </tr>
      <tr>
        <td><strong>Bilingual Localization</strong></td>
        <td>Full Bengali and English UI with localized number & currency strings.</td>
        <td>English-only hardcoded strings; no font support for complex Bangla script.</td>
        <td><span class="badge badge-high">High Blocker</span></td>
        <td>P1</td>
      </tr>
    </tbody>
  </table>
</div>

<!-- ================= SECTION 7: AUTHENTICATION STRATEGY ================= -->
<div class="page-break">
  <h1 class="section-title"><span class="num">07</span> Authentication & Identity Management Strategy</h1>
  <p>A critical comparative benchmark between modern e-commerce/LMS authentication (phone OTP + social login) and TechSprout's current state reveals vital strategic requirements for the Bangladeshi market:</p>

  <div class="diagram-box">
                    [ User Registration / Sign-In Request ]
                                   |
           +-----------------------+-----------------------+
           |                                               |
     [ Phone Number ]                              [ Email / Social ]
           |                                               |
     Validate BD Regex (+8801...)                 Check User Table
           |                                               |
     Generate 6-Digit OTP                         Verify Argon2id Hash / OAuth Token
     Store in Redis (TTL: 180s)                            |
     Send via SMS Gateway                                  |
           |                                               |
     Verify OTP Code                                       |
           +-----------------------+-----------------------+
                                   |
                        [ Issue Secure Session ]
                     - HttpOnly Cookie (NextAuth JWT)
                     - Refresh Token & Device Fingerprint
                     - Role Claims: Student | Teacher | Admin
  </div>

  <h2>Authentication Feature Classification</h2>
  <table>
    <thead>
      <tr>
        <th style="width: 25%;">Authentication Method</th>
        <th style="width: 15%;">Classification</th>
        <th style="width: 40%;">Architectural & Market Rationale</th>
        <th style="width: 20%;">Security Controls</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td><strong>Email + Strong Password</strong></td>
        <td><span class="badge badge-mvp">Required (MVP)</span></td>
        <td>Essential for instructors, corporate learners, and administrative personnel who manage formal credentials.</td>
        <td>Argon2id hashing, min 8 chars, 1 uppercase, 1 symbol. Zod validation.</td>
      </tr>
      <tr>
        <td><strong>Phone Number + 6-Digit OTP</strong></td>
        <td><span class="badge badge-mvp">Required (MVP)</span></td>
        <td>The primary login standard in Bangladesh. Most students use smartphones and lack active email habits.</td>
        <td>Redis rate limiting (max 3 OTP requests / 15 mins), 3-minute TTL, constant-time compare.</td>
      </tr>
      <tr>
        <td><strong>Google OAuth 2.0</strong></td>
        <td><span class="badge badge-mvp">Required (MVP)</span></td>
        <td>One-tap sign-in reduces friction on desktop browsers and Android smartphones dramatically.</td>
        <td>PKCE verification, strict redirect URI validation, automatic email linking.</td>
      </tr>
      <tr>
        <td><strong>Facebook Login</strong></td>
        <td><span class="badge badge-postmvp">Recommended</span></td>
        <td>Widely utilized in Bangladesh, but frequent API policy shifts and Meta developer review delays make it risky for initial MVP launch.</td>
        <td>Strict state token validation to prevent CSRF authentication hijack.</td>
      </tr>
      <tr>
        <td><strong>Password Reset via SMS/Email</strong></td>
        <td><span class="badge badge-mvp">Required (MVP)</span></td>
        <td>Without automated password resets, support teams will be overwhelmed with locked account tickets.</td>
        <td>Signed, single-use, cryptographically random token with 15-minute expiration.</td>
      </tr>
      <tr>
        <td><strong>Session Management & Invalidation</strong></td>
        <td><span class="badge badge-mvp">Required (MVP)</span></td>
        <td>NextAuth JWT with HttpOnly cookies. Support revoking tokens upon role change or password reset.</td>
        <td>HttpOnly, Secure, SameSite=Lax cookie flags; token rotation.</td>
      </tr>
      <tr>
        <td><strong>Logout from All Devices</strong></td>
        <td><span class="badge badge-postmvp">Recommended</span></td>
        <td>Prevents credential sharing where multiple students pool money to access a single paid account.</td>
        <td>User <code>tokenVersion</code> integer incremented on global logout.</td>
      </tr>
      <tr>
        <td><strong>Brute-Force & Abuse Protection</strong></td>
        <td><span class="badge badge-mvp">Required (MVP)</span></td>
        <td>Prevents SMS gateway drainage (financial loss) and credential stuffing attacks.</td>
        <td>Upstash Redis sliding-window rate limiting per IP and per phone number.</td>
      </tr>
    </tbody>
  </table>
</div>

<!-- ================= SECTION 8: INTERNATIONALIZATION (i18n) ================= -->
<div class="page-break">
  <h1 class="section-title"><span class="num">08</span> Language & Internationalization Strategy</h1>
  <p>To serve Bangladeshi students while maintaining institutional rigor, TechSprout School must support both <strong>বাংলা (Bangla)</strong> and <strong>English</strong> as first-class languages. The architecture must avoid hardcoded string conditionals and establish an extensible i18n foundation:</p>

  <h2>1. Routing & Locale Persistence Architecture</h2>
  <ul>
    <li><strong>Subpath Routing:</strong> Utilize Next.js 16 with <code>next-intl</code> to support canonical localized paths:
      <br><code>techsprout.edu/bn/courses</code> (Bangla) and <code>techsprout.edu/en/courses</code> (English).
    </li>
    <li><strong>Default Locale:</strong> Default to <code>bn</code> for visitors originating from Bangladesh IP addresses (detected via Cloudflare <code>CF-IPCountry</code> header), with cookie fallback (<code>NEXT_LOCALE=bn</code>).</li>
    <li><strong>Language Switcher:</strong> An accessible language toggle in the primary navigation header and mobile drawer, persisting user choice across sessions.</li>
  </ul>

  <h2>2. Content Translation Strategy</h2>
  <div class="diagram-box">
                          [ Content Layer Separation ]
                                       |
           +---------------------------+---------------------------+
           |                                                       |
  [ Static UI Chrome ]                                    [ Dynamic Dynamic LMS Content ]
  &bull; Navigation, buttons, labels                        &bull; Course titles, descriptions
  &bull; Validation & error messages                        &bull; Lessons, syllabus, exam questions
  &bull; Handled via JSON Dictionaries                     &bull; Stored as localized database subdocuments
    <code>messages/bn.json</code>, <code>messages/en.json</code>           <code>{ title: { bn: "...", en: "..." } }</code>
  </div>

  <h2>3. Typography, Number & Currency Formatting</h2>
  <ul>
    <li><strong>Bangla Typography:</strong> Google Font <strong>Hind Siliguri</strong> or <strong>Noto Sans Bengali</strong> loaded via <code>next/font/google</code> with appropriate font-display swap to eliminate FOIT (Flash of Invisible Text).</li>
    <li><strong>Numeral Localization:</strong> A centralized utility function converting western digits to Bengali numerals in Bangla mode (e.g., <code>15</code> &rarr; <code>১৫</code>).</li>
    <li><strong>Currency Standards:</strong> Display course pricing in Bangladeshi Taka (<code>৳ ১,৫০০</code>) for local currency and USD (<code>$ 20.00</code>) for international visitors.</li>
    <li><strong>Date & Time:</strong> Formatting dates using native <code>Intl.DateTimeFormat('bn-BD', { ... })</code> for natural Bengali calendar displays.</li>
  </ul>
</div>

<!-- ================= SECTION 9: BACKEND ENGINEERING PLAN ================= -->
<div class="page-break">
  <h1 class="section-title"><span class="num">09</span> Backend Engineering & Services Plan</h1>
  <p>The backend of TechSprout School will be structured as a <strong>Clean Modular Monolith</strong> built directly on Next.js 16 App Router Route Handlers. This provides serverless scalability, low latency, and zero deployment friction while strictly isolating business domains:</p>

  <div class="diagram-box">
  [ Client Application / Web UI ] &lt;---( HTTPS JSON )---&gt; [ REST API Route Handlers (/api/v1/...) ]
                                                                      |
                                                          +-----------+-----------+
                                                          |                       |
                                                  [ Zod DTO Validation ]  [ JWT Auth & RBAC Guard ]
                                                          |                       |
                                                          +-----------+-----------+
                                                                      |
                                                          [ Domain Service Layer ]
                                                  (Auth, Course, Progress, Exam, Payment)
                                                                      |
                                                          +-----------+-----------+
                                                          |                       |
                                                  [ Mongoose Repository ]  [ External Cloud Integrations ]
                                                          |                 &bull; Cloudflare Stream / Bunny.net
                                                  [ MongoDB Atlas Cluster ] &bull; SSLCommerz / bKash Gateway
                                                  (Replica Sets, Indexes)   &bull; SMS Gateway (SSL Wireless)
                                                                            &bull; Email Dispatch (Resend/SES)
  </div>

  <h2>Core Backend Architectural Pillars</h2>
  <ul>
    <li><strong>Standardized API Response Envelopes:</strong>
      All endpoints return a uniform envelope ensuring client predictability:
      <pre><code>// Success Response (HTTP 200/201)
{
  "success": true,
  "message": "Operation completed successfully",
  "data": { ... },
  "meta": { "page": 1, "limit": 20, "total": 142, "totalPages": 8 }
}

// Error Response (HTTP 400/401/403/404/422/500)
{
  "success": false,
  "message": "Validation failed for one or more fields",
  "errorCode": "VALIDATION_ERROR",
  "errors": [{ "field": "email", "message": "Invalid email address format" }]
}</code></pre>
    </li>
    <li><strong>Database Transactions:</strong> Atomic multi-document transactions (via <code>mongoose.startSession()</code>) for checkout, enrollment, and exam submission to prevent data corruption during network drops.</li>
    <li><strong>Media Storage Pipeline:</strong> Direct client-to-cloud uploads using presigned S3/Cloudflare R2 URLs for avatars, lecture PDFs, and assignment files. Video lectures ingested through Bunny.net Stream or Cloudflare Stream with automatic HLS transcode.</li>
    <li><strong>Background Jobs:</strong> Lightweight asynchronous processing using Upstash QStash or BullMQ for sending enrollment emails, SMS OTP alerts, and certificate PDF generation.</li>
  </ul>
</div>

<!-- ================= SECTION 10: REST API ARCHITECTURE ================= -->
<div class="page-break">
  <h1 class="section-title"><span class="num">10</span> REST API Architecture & Specification</h1>
  <p>The REST API is strictly versioned under the <code>/api/v1</code> prefix. Below is the proposed endpoint map covering all core domains:</p>

  <table>
    <thead>
      <tr>
        <th style="width: 10%;">Method</th>
        <th style="width: 25%;">Endpoint Path</th>
        <th style="width: 15%;">Auth / Role</th>
        <th style="width: 25%;">Request Payload</th>
        <th style="width: 25%;">Purpose & Security Rules</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td><code>POST</code></td>
        <td><code>/api/v1/auth/register</code></td>
        <td>Public</td>
        <td><code>{ name, phone, password, role? }</code></td>
        <td>Registers student; hashes password with Argon2id; dispatches OTP.</td>
      </tr>
      <tr>
        <td><code>POST</code></td>
        <td><code>/api/v1/auth/verify-otp</code></td>
        <td>Public</td>
        <td><code>{ phone, otp }</code></td>
        <td>Verifies 6-digit OTP against Redis; marks account verified.</td>
      </tr>
      <tr>
        <td><code>POST</code></td>
        <td><code>/api/v1/auth/login</code></td>
        <td>Public</td>
        <td><code>{ identifier, password }</code></td>
        <td>Authenticates via phone/email; issues secure HttpOnly JWT.</td>
      </tr>
      <tr>
        <td><code>GET</code></td>
        <td><code>/api/v1/users/me</code></td>
        <td>Bearer (All)</td>
        <td>None</td>
        <td>Fetches authenticated user profile, roles, and preferences.</td>
      </tr>
      <tr>
        <td><code>GET</code></td>
        <td><code>/api/v1/courses</code></td>
        <td>Public</td>
        <td>Query: <code>page, limit, category, sort</code></td>
        <td>Returns paginated published courses with price and ratings.</td>
      </tr>
      <tr>
        <td><code>POST</code></td>
        <td><code>/api/v1/courses</code></td>
        <td>Instructor / Admin</td>
        <td><code>{ title, category, price, ... }</code></td>
        <td>Creates course draft; validates instructor ownership.</td>
      </tr>
      <tr>
        <td><code>GET</code></td>
        <td><code>/api/v1/courses/:id</code></td>
        <td>Public</td>
        <td>None</td>
        <td>Returns full course syllabus, instructor bio, and reviews.</td>
      </tr>
      <tr>
        <td><code>GET</code></td>
        <td><code>/api/v1/courses/:id/learn</code></td>
        <td>Enrolled Student</td>
        <td>None</td>
        <td>Returns full video stream URLs, lecture notes, and quiz links.</td>
      </tr>
      <tr>
        <td><code>POST</code></td>
        <td><code>/api/v1/progress/complete</code></td>
        <td>Enrolled Student</td>
        <td><code>{ lessonId, timeWatched }</code></td>
        <td>Records lesson completion; updates overall course progress.</td>
      </tr>
      <tr>
        <td><code>POST</code></td>
        <td><code>/api/v1/exams/:id/start</code></td>
        <td>Enrolled Student</td>
        <td>None</td>
        <td>Initiates exam attempt; starts server timer; locks questions.</td>
      </tr>
      <tr>
        <td><code>POST</code></td>
        <td><code>/api/v1/exams/:id/submit</code></td>
        <td>Enrolled Student</td>
        <td><code>{ attemptId, answers: [...] }</code></td>
        <td>Evaluates answers; computes grade; creates Result record.</td>
      </tr>
      <tr>
        <td><code>POST</code></td>
        <td><code>/api/v1/payments/initiate</code></td>
        <td>Student</td>
        <td><code>{ courseId, gateway }</code></td>
        <td>Creates pending Order; returns bKash/SSLCommerz redirect URL.</td>
      </tr>
      <tr>
        <td><code>POST</code></td>
        <td><code>/api/v1/payments/webhook</code></td>
        <td>Gateway IPN</td>
        <td>Gateway signature & payload</td>
        <td>Verifies HMAC signature; creates Enrollment; grants access.</td>
      </tr>
      <tr>
        <td><code>GET</code></td>
        <td><code>/api/v1/certificates/:id</code></td>
        <td>Public</td>
        <td>None</td>
        <td>Validates authenticity of student completion certificate.</td>
      </tr>
    </tbody>
  </table>
</div>
'''

if __name__ == "__main__":
    print("Part 2 module loaded.")
