# scratch/part4.py - Sections 16 to 20
import os

def get_part4_html():
    return '''
<!-- ================= SECTION 16: QA / SQA LAUNCH AUDIT ================= -->
<div class="page-break">
  <h1 class="section-title"><span class="num">16</span> QA / SQA Launch Audit & Defect Catalog</h1>
  <p>A rigorous quality assurance audit of the active repository identified numerous functional, visual, and linking defects that must be resolved prior to public beta release:</p>

  <h2>Active Codebase Defect Log</h2>
  <table>
    <thead>
      <tr>
        <th style="width: 15%;">Defect ID</th>
        <th style="width: 25%;">File / Location</th>
        <th style="width: 15%;">Severity</th>
        <th style="width: 45%;">Defect Description & Root Cause</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td><strong>BUG-001</strong></td>
        <td><code>src/components/forms/Register.tsx</code> (Lines 169-170)</td>
        <td><span class="badge badge-critical">Critical</span></td>
        <td>Confirm Password field is bound to form control <code>name="name"</code>. Entering a password confirmation overwrites the user's Full Name.</td>
      </tr>
      <tr>
        <td><strong>BUG-002</strong></td>
        <td><code>src/components/forms/Register.tsx</code> (Line 60)</td>
        <td><span class="badge badge-critical">Critical</span></td>
        <td>Submit handler posts user credentials to scratch endpoint <code>/test</code> instead of <code>/api/register</code>.</td>
      </tr>
      <tr>
        <td><strong>BUG-003</strong></td>
        <td><code>src/auth.ts</code> (Lines 13-17)</td>
        <td><span class="badge badge-critical">Critical</span></td>
        <td>Credentials provider <code>authorize()</code> returns <code>user = null</code> unconditionally. Authentication always fails.</td>
      </tr>
      <tr>
        <td><strong>BUG-004</strong></td>
        <td><code>src/components/Footer.tsx</code> (Lines 24, 32, 44)</td>
        <td><span class="badge badge-high">High</span></td>
        <td>Dead links to non-existent routes: <code>/about</code> (404), <code>/blog</code> (404), <code>/terms-conditions</code> (404). Correct paths are <code>/about-us</code>, <code>/blogs</code>, <code>/terms-and-condition</code>.</td>
      </tr>
      <tr>
        <td><strong>BUG-005</strong></td>
        <td><code>src/components/Footer.tsx</code> (Lines 11-14)</td>
        <td><span class="badge badge-medium">Medium</span></td>
        <td>Social links lack scheme protocols (e.g. <code>www.x.com</code> instead of <code>https://x.com</code>). Causes Next.js router to navigate to relative broken routes.</td>
      </tr>
      <tr>
        <td><strong>BUG-006</strong></td>
        <td><code>src/components/header/Header.tsx</code> (Line 282)</td>
        <td><span class="badge badge-high">High</span></td>
        <td>Mobile navigation sheet renders Register as a standalone <code>&lt;Button&gt;</code> without an enclosing <code>&lt;Link&gt;</code>. Clicking Register on mobile is completely non-responsive.</td>
      </tr>
      <tr>
        <td><strong>BUG-007</strong></td>
        <td><code>src/components/MouseFollower.tsx</code> (Lines 11-27)</td>
        <td><span class="badge badge-medium">Medium</span></td>
        <td>Animation frame loop is initiated in <code>useEffect</code> without returning a cleanup function to invoke <code>cancelAnimationFrame()</code>. Leads to memory leaks during route transitions.</td>
      </tr>
      <tr>
        <td><strong>BUG-008</strong></td>
        <td><code>src/components/forms/Login.tsx</code> (Line 95)</td>
        <td><span class="badge badge-low">Low</span></td>
        <td>Password input placeholder reads <em>"Enter you name"</em> instead of <em>"Enter your password"</em>. Multiple occurrences of "you" instead of "your" across forms.</td>
      </tr>
      <tr>
        <td><strong>BUG-009</strong></td>
        <td><code>src/app/courses/[course]/page.tsx</code> (Line 200)</td>
        <td><span class="badge badge-low">Low</span></td>
        <td>Spelling error in course sidebar title: <em>"Recourses"</em> instead of <em>"Resources"</em>.</td>
      </tr>
    </tbody>
  </table>

  <h2>Pre-Launch QA Test Plan & Coverage Matrix</h2>
  <ul>
    <li><strong>Functional Automated Testing (Jest + Playwright):</strong> End-to-end testing for User Registration &rarr; OTP Verification &rarr; Course Purchase via Sandbox bKash &rarr; Lesson Playback &rarr; Final Quiz &rarr; Certificate Generation.</li>
    <li><strong>Load & Performance Stress Testing (k6):</strong> Validate that Next.js Route Handlers and MongoDB Atlas can comfortably handle 500 concurrent students taking an exam simultaneously without latency spiking above 500ms.</li>
    <li><strong>Accessibility (WCAG 2.1 AA):</strong> Ensure color contrast ratios &ge; 4.5:1 on all text badges, full keyboard tab navigation through curriculum drawers, and proper ARIA labels on all modal dialogs.</li>
  </ul>
</div>

<!-- ================= SECTION 17: MOBILE STRATEGY ================= -->
<div class="page-break">
  <h1 class="section-title"><span class="num">17</span> Mobile Application Strategy & API Convergence</h1>
  <p>While the immediate focus is web launch, more than 75% of Bangladeshi learners access educational content via Android smartphones. A deliberate mobile convergence strategy prevents architectural duplication:</p>

  <div class="diagram-box">
  +-----------------------------------------------------------------------------------+
  |                       Unified Backend REST API (/api/v1/...)                      |
  +-----------------------------------------------------------------------------------+
                                           |
           +-------------------------------+-------------------------------+
           |                                                               |
  [ Web Application (Next.js 16) ]                         [ Mobile App (React Native / Flutter) ]
  &bull; Server-Side Rendering (SEO)                         &bull; Native Video Surface (ExoPlayer/AVPlayer)
  &bull; Desktop Curriculum Management                      &bull; Offline Encrypted Video Downloads
  &bull; Comprehensive Admin & Instructor Dashboards        &bull; Biometric Authentication (Fingerprint/FaceID)
  &bull; Browser Cookie Session                             &bull; Push Notifications (FCM / OneSignal)
  </div>

  <h2>Architectural Rules for Mobile Readiness</h2>
  <ul>
    <li><strong>Stateless REST Contracts:</strong> All <code>/api/v1/</code> endpoints must support Authorization Bearer headers in addition to browser cookies, enabling native mobile apps to authenticate without session workarounds.</li>
    <li><strong>Offline Video DRM & Encryption:</strong> Video downloads on mobile must use AES-128 encrypted HLS segments stored within secure app sandboxes, preventing students from ripping video files.</li>
    <li><strong>Mobile Exam Experience:</strong> The mobile exam screen must feature large touch-friendly radio targets (&ge;48px height) and background-pause safeguards in case of incoming cellular phone calls.</li>
  </ul>
</div>

<!-- ================= SECTION 18: DEVELOPMENT ROADMAP ================= -->
<div class="page-break">
  <h1 class="section-title"><span class="num">18</span> Sequential Product Development Roadmap</h1>
  <p>To ensure engineering rigor, the transformation of TechSprout School is organized into 14 sequential phases. Each phase represents a strict delivery gate:</p>

  <table>
    <thead>
      <tr>
        <th style="width: 12%;">Phase</th>
        <th style="width: 25%;">Phase Name</th>
        <th style="width: 45%;">Core Deliverables & Engineering Scope</th>
        <th style="width: 18%;">Exit Gate Criteria</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td><strong>Phase 1</strong></td>
        <td>Product & Technical Audit</td>
        <td>Complete codebase inspection, competitor benchmark, MVP definition, architecture document (Current Phase).</td>
        <td>Approved Specification PDF</td>
      </tr>
      <tr>
        <td><strong>Phase 2</strong></td>
        <td>Security & Core Sanitization</td>
        <td>Fix registration bug (BUG-001/002), sanitize schemas, implement Argon2id hashing, clean dead footer links.</td>
        <td>Zero Critical Security Flaws</td>
      </tr>
      <tr>
        <td><strong>Phase 3</strong></td>
        <td>Database & Domain Modeling</td>
        <td>Deploy MongoDB Atlas Mongoose models with compound indexes, soft deletes, and automated database seed scripts.</td>
        <td>Validated Database Seeds</td>
      </tr>
      <tr>
        <td><strong>Phase 4</strong></td>
        <td>Authentication & RBAC</td>
        <td>Build <code>/api/v1/auth</code> endpoints, Redis OTP sliding-window limiter, SMS gateway integration, NextAuth session guards.</td>
        <td>Working Phone OTP & Login</td>
      </tr>
      <tr>
        <td><strong>Phase 5</strong></td>
        <td>Course & Media Infrastructure</td>
        <td>Curriculum schemas (Course &rarr; Module &rarr; Lesson), Bunny.net video transcode pipeline, presigned S3 upload URLs.</td>
        <td>HLS Video Ingest Working</td>
      </tr>
      <tr>
        <td><strong>Phase 6</strong></td>
        <td>Student Learning Portal</td>
        <td>Distraction-free video player, curriculum drawer, lesson completion tracking, and progress percentage computation.</td>
        <td>Live Course Player Tested</td>
      </tr>
      <tr>
        <td><strong>Phase 7</strong></td>
        <td>Examination & Evaluation</td>
        <td>Timed MCQ engine, randomized question draws, anti-cheating blur detection, auto-grading, and Results table.</td>
        <td>Automated Quiz Grading</td>
      </tr>
      <tr>
        <td><strong>Phase 8</strong></td>
        <td>MFS Payments & Checkout</td>
        <td>SSLCommerz / bKash merchant gateway integration, atomic enrollment transactions, IPN webhook signature verification.</td>
        <td>Successful Sandbox Payments</td>
      </tr>
      <tr>
        <td><strong>Phase 9</strong></td>
        <td>Student & Admin Portals</td>
        <td>Student dashboard with active enrollments and quiz scores; Admin moderation dashboard for courses and revenues.</td>
        <td>Functional Role Dashboards</td>
      </tr>
      <tr>
        <td><strong>Phase 10</strong></td>
        <td>Bilingual Localization (i18n)</td>
        <td>Integrate <code>next-intl</code> dictionary routing, Google Fonts Hind Siliguri, localized Bengali numbers and Taka currency.</td>
        <td>100% Bilingual UI Verified</td>
      </tr>
      <tr>
        <td><strong>Phase 11</strong></td>
        <td>Accredited Certificates</td>
        <td>PDFKit dynamic certificate generation upon 100% completion, cryptographic hash generation, public verification page.</td>
        <td>Scannable QR Verification</td>
      </tr>
      <tr>
        <td><strong>Phase 12</strong></td>
        <td>Comprehensive SQA & Hardening</td>
        <td>Automated end-to-end Playwright test suite, k6 stress testing, OWASP Top 10 penetration review.</td>
        <td>Zero P0/P1 Defects Remaining</td>
      </tr>
      <tr>
        <td><strong>Phase 13</strong></td>
        <td>Production Staging & Launch</td>
        <td>Vercel production deployment, MongoDB Atlas production cluster, Cloudflare CDN rules, DNS setup, Public Beta.</td>
        <td>Live Production Launch</td>
      </tr>
      <tr>
        <td><strong>Phase 14</strong></td>
        <td>Native Mobile Apps (v2)</td>
        <td>React Native / Flutter mobile app leveraging existing <code>/api/v1/</code> REST endpoints with offline video caching.</td>
        <td>Google Play & App Store Release</td>
      </tr>
    </tbody>
  </table>
</div>

<!-- ================= SECTION 19: MVP TIMELINE ================= -->
<div class="page-break">
  <h1 class="section-title"><span class="num">19</span> MVP Research & Estimated Time Frame to Launch</h1>
  <p>Building a professional, launch-ready LMS requires methodical execution across database design, secure payment handling, and media streaming. The estimated timeline to achieve a public MVP release is detailed below:</p>

  <h2>1. Minimum Launchable Product (MLP) Definition</h2>
  <p>The absolute minimum product capable of accepting paying students and delivering educational value must include:
    <strong>Functional Phone OTP Auth</strong>, <strong>10 Live Video Courses</strong>, <strong>HLS Player with Progress Tracking</strong>, <strong>End-of-Course MCQ Exam</strong>, <strong>bKash/Nagad Checkout</strong>, <strong>Automated PDF Certificate</strong>, and <strong>Bilingual UI Chrome</strong>. Everything else can be added iteratively post-launch.
  </p>

  <h2>2. Critical Launch Blockers & Risk Factors</h2>
  <ul>
    <li><strong>Payment Gateway Merchant Onboarding:</strong> Merchant account approval for bKash, Nagad, and SSLCommerz typically takes 10 to 20 business days in Bangladesh due to trade license and KYC compliance verification. <em>Action: Initiate merchant registration immediately.</em></li>
    <li><strong>SMS Aggregator Sender ID Approval:</strong> Non-masking or masking SMS sender ID approval from BTRC can take 5 to 10 days. <em>Action: Secure SMS gateway credentials during Phase 2.</em></li>
    <li><strong>Curriculum Video Production:</strong> Technical platforms fail when engineering completes but course content is delayed. At least 5 complete courses must be fully recorded, edited, and encoded prior to public launch.</li>
  </ul>
</div>

<!-- ================= SECTION 20: FULL PRODUCT TIMELINE ================= -->
<div class="avoid-break">
  <h1 class="section-title"><span class="num">20</span> Full Product Development Timeline</h1>
  <p>To provide realistic planning estimates for stakeholders, we present two staffing scenarios:</p>

  <table>
    <thead>
      <tr>
        <th style="width: 30%;">Development Phase</th>
        <th style="width: 25%; text-align: center;">Scenario A: Solo Full-Stack Engineer</th>
        <th style="width: 25%; text-align: center;">Scenario B: Small Cross-Functional Team<br><em>(2 Full-Stack + 1 Frontend + 1 QA)</em></th>
        <th style="width: 20%;">Key Dependencies</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td>Phases 1–3: Research, Fixes & DB</td>
        <td style="text-align: center;">15 Working Days (3 Weeks)</td>
        <td style="text-align: center;">6 Working Days (1.2 Weeks)</td>
        <td>Approved Architecture</td>
      </tr>
      <tr>
        <td>Phases 4–5: Auth, RBAC & Media</td>
        <td style="text-align: center;">22 Working Days (4.4 Weeks)</td>
        <td style="text-align: center;">10 Working Days (2 Weeks)</td>
        <td>SMS & Bunny.net Accounts</td>
      </tr>
      <tr>
        <td>Phases 6–7: Player, Progress & Exams</td>
        <td style="text-align: center;">25 Working Days (5 Weeks)</td>
        <td style="text-align: center;">12 Working Days (2.4 Weeks)</td>
        <td>Course & Media Engine</td>
      </tr>
      <tr>
        <td>Phases 8–9: Payments & Dashboards</td>
        <td style="text-align: center;">20 Working Days (4 Weeks)</td>
        <td style="text-align: center;">10 Working Days (2 Weeks)</td>
        <td>Payment Gateway Sandbox</td>
      </tr>
      <tr>
        <td>Phases 10–11: i18n & Certificates</td>
        <td style="text-align: center;">14 Working Days (2.8 Weeks)</td>
        <td style="text-align: center;">7 Working Days (1.4 Weeks)</td>
        <td>Translation Catalogs</td>
      </tr>
      <tr>
        <td>Phases 12–13: SQA, Staging & Launch</td>
        <td style="text-align: center;">18 Working Days (3.6 Weeks)</td>
        <td style="text-align: center;">9 Working Days (1.8 Weeks)</td>
        <td>All Features Deployed</td>
      </tr>
      <tr style="background: #F1F5F9; font-weight: bold;">
        <td>TOTAL ESTIMATED EFFORT</td>
        <td style="text-align: center; color: #0284C7;">114 Working Days (~23 Calendar Weeks)</td>
        <td style="text-align: center; color: #059669;">54 Working Days (~11 Calendar Weeks)</td>
        <td>Ready for Public Beta</td>
      </tr>
    </tbody>
  </table>

  <div class="callout callout-info avoid-break">
    <div class="callout-title">Schedule Assumptions</div>
    <p>Estimates assume standard 5-day work weeks, timely availability of merchant payment credentials, and no major scope pivots. A small dedicated team reduces calendar time by more than 50% through parallel development of frontend portals, backend services, and test automation suites.</p>
  </div>
</div>
'''

if __name__ == "__main__":
    print("Part 4 module loaded.")
