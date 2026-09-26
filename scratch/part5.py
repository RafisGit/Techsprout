# scratch/part5.py - Sections 21 to 25
import os

def get_part5_html():
    return '''
<!-- ================= SECTION 21: INFRASTRUCTURE & COSTS ================= -->
<div class="page-break">
  <h1 class="section-title"><span class="num">21</span> Infrastructure, Cloud Resources & Operational Costs</h1>
  <p>To ensure financial sustainability, the operational infrastructure is modeled across three growth stages: Early MVP (0–500 active students), Growth Stage (500–5,000 active students), and Scale Stage (5,000+ active students):</p>

  <table>
    <thead>
      <tr>
        <th style="width: 20%;">Resource Category</th>
        <th style="width: 25%;">Recommended Provider</th>
        <th style="width: 30%;">Technical Function</th>
        <th style="width: 25%;">Cost & Scaling Factors</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td><strong>Web & API Hosting</strong></td>
        <td>Vercel Pro / DigitalOcean App Platform</td>
        <td>Next.js 16 serverless route handlers, Edge middleware, automatic SSL.</td>
        <td>Vercel Pro ($20/dev/mo) handles up to 10k monthly visitors easily.</td>
      </tr>
      <tr>
        <td><strong>Managed Database</strong></td>
        <td>MongoDB Atlas (Dedicated Tier)</td>
        <td>High-availability replica set (M10/M20), automated daily backups, VPC peering.</td>
        <td>Free tier (M0) for staging; $57–$140/mo for M10 production cluster.</td>
      </tr>
      <tr>
        <td><strong>Video CDN & Transcoding</strong></td>
        <td>Bunny.net Stream / Cloudflare Stream</td>
        <td>Multi-bitrate HLS adaptive streaming, signed DRM tokens, watermark embedding.</td>
        <td>$0.01 per GB egress; approx. $0.005/min transcoding. Extremely cost-effective.</td>
      </tr>
      <tr>
        <td><strong>Document & Asset Storage</strong></td>
        <td>Cloudflare R2 / AWS S3</td>
        <td>Student assignment submissions, course PDFs, instructor thumbnails.</td>
        <td>Cloudflare R2 provides zero egress fees ($0.015/GB/mo storage).</td>
      </tr>
      <tr>
        <td><strong>In-Memory Cache & Limiter</strong></td>
        <td>Upstash Redis</td>
        <td>OTP code verification, rate limiting, session token invalidation.</td>
        <td>Free tier handles 10,000 requests/day; then $0.20 per 100k requests.</td>
      </tr>
      <tr>
        <td><strong>Transactional SMS Gateway</strong></td>
        <td>Greenweb BD / SSL Wireless</td>
        <td>6-digit OTP delivery to Grameenphone, Banglalink, Robi, Teletalk.</td>
        <td>Approx. ৳ 0.25 to ৳ 0.35 BDT per SMS. Masking sender IDs incur setup fee.</td>
      </tr>
      <tr>
        <td><strong>Transactional Email</strong></td>
        <td>Resend / Amazon SES</td>
        <td>Welcome emails, purchase receipts, certificate delivery.</td>
        <td>Resend offers 3,000 free emails/mo; then $20/mo for 50,000 emails.</td>
      </tr>
      <tr>
        <td><strong>Payment Gateway Processing</strong></td>
        <td>SSLCommerz / bKash Direct Merchant</td>
        <td>Processing bKash, Nagad, Rocket, Visa, Mastercard transactions.</td>
        <td>bKash merchant fee: 1.2%–1.5%; SSLCommerz MDR: 2.0%–3.5% per successful transaction.</td>
      </tr>
    </tbody>
  </table>
</div>

<!-- ================= SECTION 22: LAUNCH READINESS CHECKLIST ================= -->
<div class="page-break">
  <h1 class="section-title"><span class="num">22</span> Master Launch Readiness Checklist</h1>
  <p>Every item reflects the verified state of the current codebase. Items marked <em>Complete</em> have been verified through active source inspection:</p>

  <table>
    <thead>
      <tr>
        <th style="width: 25%;">Domain Category</th>
        <th style="width: 50%;">Verification Item</th>
        <th style="width: 25%;">Current Status</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td rowspan="3"><strong>Frontend & UI</strong></td>
        <td>Responsive landing page, banner, categories, and testimonials</td>
        <td><span class="status-tag status-complete">[x] Complete</span></td>
      </tr>
      <tr>
        <td>Course browsing catalog and search inputs functional</td>
        <td><span class="status-tag status-mock">[ ] In Progress (Mock)</span></td>
      </tr>
      <tr>
        <td>Course video player with curriculum drawer and progress bar</td>
        <td><span class="status-tag status-missing">[ ] Not Started</span></td>
      </tr>

      <tr>
        <td rowspan="3"><strong>Authentication</strong></td>
        <td>Registration endpoint with Argon2id password hashing</td>
        <td><span class="status-tag status-broken">[!] Needs Review (Broken)</span></td>
      </tr>
      <tr>
        <td>Phone number with 6-digit SMS OTP verification</td>
        <td><span class="status-tag status-mock">[ ] In Progress (UI Only)</span></td>
      </tr>
      <tr>
        <td>Role-based route guarding via Next.js middleware</td>
        <td><span class="status-tag status-broken">[!] Needs Review (Stub)</span></td>
      </tr>

      <tr>
        <td rowspan="3"><strong>Academic Engine</strong></td>
        <td>Course & Module schema with database relations</td>
        <td><span class="status-tag status-partial">[ ] In Progress (Loose)</span></td>
      </tr>
      <tr>
        <td>Online timed MCQ examination and auto-grading engine</td>
        <td><span class="status-tag status-missing">[ ] Not Started</span></td>
      </tr>
      <tr>
        <td>Automated PDF certificate generation with verification QR</td>
        <td><span class="status-tag status-missing">[ ] Not Started</span></td>
      </tr>

      <tr>
        <td rowspan="2"><strong>Monetization</strong></td>
        <td>Shopping cart and checkout summary interface</td>
        <td><span class="status-tag status-mock">[ ] In Progress (Cart Stub)</span></td>
      </tr>
      <tr>
        <td>bKash / Nagad / SSLCommerz IPN webhook integration</td>
        <td><span class="status-tag status-missing">[ ] Not Started</span></td>
      </tr>

      <tr>
        <td rowspan="2"><strong>Localization</strong></td>
        <td>Bilingual subpath routing (<code>/bn</code> and <code>/en</code>) via next-intl</td>
        <td><span class="status-tag status-missing">[ ] Not Started</span></td>
      </tr>
      <tr>
        <td>Bangla typography and localized Bengali numerals</td>
        <td><span class="status-tag status-missing">[ ] Not Started</span></td>
      </tr>

      <tr>
        <td rowspan="2"><strong>Dashboards</strong></td>
        <td>Student portal (enrolled courses, certificates, receipts)</td>
        <td><span class="status-tag status-missing">[ ] Not Started</span></td>
      </tr>
      <tr>
        <td>Admin moderation panel (approvals, revenues, users)</td>
        <td><span class="status-tag status-mock">[ ] In Progress (Stubs)</span></td>
      </tr>

      <tr>
        <td rowspan="2"><strong>QA & Security</strong></td>
        <td>OWASP Top 10 hardening and NoSQL sanitization</td>
        <td><span class="status-tag status-missing">[ ] Not Started</span></td>
      </tr>
      <tr>
        <td>Resolution of all active codebase bugs (BUG-001 to BUG-009)</td>
        <td><span class="status-tag status-broken">[!] Needs Review</span></td>
      </tr>
    </tbody>
  </table>
</div>

<!-- ================= SECTION 23: CRITICAL GAPS ================= -->
<div class="page-break">
  <h1 class="section-title"><span class="num">23</span> Critical Gaps Found in Current TechSprout</h1>
  <p>The following issues represent severe impediments to launching TechSprout School. They are prioritized by security risk, operational failure potential, and user experience impact:</p>

  <table>
    <thead>
      <tr>
        <th style="width: 14%;">Severity</th>
        <th style="width: 26%;">Identified Problem & Location</th>
        <th style="width: 35%;">Business & Security Impact</th>
        <th style="width: 25%;">Recommended Solution</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td><span class="badge badge-critical">CRITICAL</span></td>
        <td><strong>Plaintext Password Storage</strong><br><code>src/app/api/(user)/register/route.ts</code></td>
        <td>Data breach will expose user passwords in clear text, causing catastrophic brand damage and legal liability.</td>
        <td>Adopt Argon2id via <code>argon2</code> npm library with salt prior to MongoDB write.</td>
      </tr>
      <tr>
        <td><span class="badge badge-critical">CRITICAL</span></td>
        <td><strong>Mass Assignment / Role Theft</strong><br><code>src/app/api/(user)/register/route.ts</code></td>
        <td>Any attacker can send <code>role: 'admin'</code> in the registration body and gain full control over the platform.</td>
        <td>Strip <code>role</code> from user input; enforce <code>role = 'student'</code> on public signup.</td>
      </tr>
      <tr>
        <td><span class="badge badge-critical">CRITICAL</span></td>
        <td><strong>Register Form Field Overwrite</strong><br><code>src/components/forms/Register.tsx:169</code></td>
        <td>Typing a confirm password completely overwrites the user's Full Name, preventing successful registration.</td>
        <td>Bind form field correctly to <code>name="passwordConfirmation"</code>.</td>
      </tr>
      <tr>
        <td><span class="badge badge-high">HIGH</span></td>
        <td><strong>Broken Authentication Pipeline</strong><br><code>src/auth.ts:14</code></td>
        <td>NextAuth <code>authorize()</code> returns <code>null</code>. No student or teacher can log in to access purchased content.</td>
        <td>Implement credentials verification against MongoDB password hash.</td>
      </tr>
      <tr>
        <td><span class="badge badge-high">HIGH</span></td>
        <td><strong>100% Mock Data Dependency</strong><br><code>src/lib/mockData/mockData.ts</code></td>
        <td>Catalog is static; database updates do not reflect on frontend; dynamic purchases impossible.</td>
        <td>Migrate mock arrays to MongoDB collections and query via REST API handlers.</td>
      </tr>
      <tr>
        <td><span class="badge badge-high">HIGH</span></td>
        <td><strong>Missing Route Middleware</strong><br><code>src/middleware.ts</code></td>
        <td>Protected pages (admin, student) have no authentication checks and can be accessed by any visitor.</td>
        <td>Implement JWT token verification and redirect unauthenticated requests to <code>/login</code>.</td>
      </tr>
      <tr>
        <td><span class="badge badge-medium">MEDIUM</span></td>
        <td><strong>Dead Links across Footer</strong><br><code>src/components/Footer.tsx</code></td>
        <td>Visitors clicking About, Blog, or Terms receive jarring 404 error pages, eroding trust.</td>
        <td>Fix link hrefs to match existing file system paths (e.g., <code>/about-us</code>).</td>
      </tr>
      <tr>
        <td><span class="badge badge-low">LOW</span></td>
        <td><strong>Grammatical Inconsistencies</strong><br>Multiple form placeholder inputs</td>
        <td>Placeholders read "Enter you email" and "Enter you name", creating an unprofessional impression.</td>
        <td>Perform global search-and-replace updating "you" to "your".</td>
      </tr>
    </tbody>
  </table>
</div>

<!-- ================= SECTION 24: RECOMMENDED NEXT STEPS ================= -->
<div class="page-break">
  <h1 class="section-title"><span class="num">24</span> Recommended Immediate Next Steps (30-Day Plan)</h1>
  <p>To transition from planning into high-velocity execution, the engineering team should follow this prioritized 30-day tactical roadmap:</p>

  <div class="diagram-box">
  [ Days 1 - 5: Critical Bug & Security Patching ]
  &bull; Fix Register.tsx confirm password field binding (BUG-001)
  &bull; Route registration to /api/v1/auth/register instead of scratch /test
  &bull; Integrate Argon2id password hashing and Zod input sanitization
  &bull; Correct dead footer navigation links (BUG-004)
        |
        v
  [ Days 6 - 12: Database Schema & Migration ]
  &bull; Implement strict Mongoose schemas (User, Course, Module, Lesson, Enrollment, Exam)
  &bull; Create database migration script loading mockData.ts into MongoDB Atlas
  &bull; Establish compound indexes for fast course queries and unique phone/email lookups
        |
        v
  [ Days 13 - 20: Authentication & Session Engine ]
  &bull; Complete NextAuth v5 authorize handler with password verification
  &bull; Build Redis-backed 6-digit phone OTP verification service
  &bull; Implement route guard middleware protecting /dashboard/* routes
        |
        v
  [ Days 21 - 30: Course Catalog API & Player Prototype ]
  &bull; Replace mockApi.ts with real REST API endpoints (/api/v1/courses)
  &bull; Build functional course learning player UI with module/lesson sidebar
  &bull; Integrate test video stream via Bunny.net Stream or Cloudflare Stream
  </div>

  <div class="callout callout-success avoid-break">
    <div class="callout-title">Immediate Management Directive</div>
    <p>The senior engineering team should immediately create a new feature branch (<code>feat/security-auth-remediation</code>) to address BUG-001, BUG-002, and the plaintext password flaw before any further UI styling or marketing efforts take place.</p>
  </div>
</div>

<!-- ================= SECTION 25: REFERENCES ================= -->
<div class="avoid-break">
  <h1 class="section-title"><span class="num">25</span> Technical References & Industry Standards</h1>
  <p>The architectural recommendations, security frameworks, and technical standards detailed in this specification are grounded in authoritative industry documentation:</p>

  <ul>
    <li><strong>OWASP Foundation:</strong> <em>OWASP Top 10: 2021 (A01: Broken Access Control, A02: Cryptographic Failures, A07: Identification and Authentication Failures)</em>. Official documentation: <a href="https://owasp.org/Top10/">owasp.org/Top10</a>.</li>
    <li><strong>IETF RFC 7519:</strong> <em>JSON Web Token (JWT) Architecture and Best Current Practices</em>. Standards Track: <a href="https://datatracker.ietf.org/doc/html/rfc7519">rfc7519</a>.</li>
    <li><strong>IETF RFC 9110:</strong> <em>HTTP Semantics, Status Codes, and REST API Conventions</em>. Standards Track: <a href="https://datatracker.ietf.org/doc/html/rfc9110">rfc9110</a>.</li>
    <li><strong>Next.js 16 Documentation:</strong> <em>Route Handlers, Server Components, Turbopack, and Middleware Conventions</em>. Vercel: <a href="https://nextjs.org/docs">nextjs.org/docs</a>.</li>
    <li><strong>W3C Web Accessibility Initiative:</strong> <em>Web Content Accessibility Guidelines (WCAG) 2.1 AA Standards</em>. Official recommendation: <a href="https://www.w3.org/WAI/standards-guidelines/wcag/">w3.org/WAI</a>.</li>
    <li><strong>BTRC (Bangladesh Telecommunication Regulatory Commission):</strong> <em>National Regulatory Directives on A2P SMS Aggregation and Masking Standards</em>.</li>
    <li><strong>SSLCommerz & bKash Developer Portals:</strong> <em>Merchant Integration API Specification v4.0, IPN Webhook Verification, and Tokenized Checkout Guidelines</em>.</li>
  </ul>
</div>

</body>
</html>
'''

if __name__ == "__main__":
    print("Part 5 module loaded.")
