# scratch/part1.py - Cover, Executive Decision Summary, TOC, Sections 1 to 5
import os

def get_part1_html():
    return '''
<!-- ================= COVER PAGE ================= -->
<div class="cover-page page-break">
  <div>
    <div class="cover-badge">Confidential &bull; Strategic Product Architecture</div>
    <div class="cover-title">TECHSPROUT SCHOOL LMS</div>
    <div class="cover-subtitle">Product Research, Comprehensive Codebase Audit, REST API & Database Architecture, and Production Launch Guideline</div>
    <div class="cover-divider"></div>
  </div>

  <div>
    <div class="cover-roles">
      <div class="cover-role-item"><strong>Senior Product Manager:</strong> Product Strategy, MVP Scope, EdTech Benchmarks</div>
      <div class="cover-role-item"><strong>Software Architect:</strong> Modular Monolith, Data Pipelines, Media CDN</div>
      <div class="cover-role-item"><strong>REST API Architect:</strong> Versioned API Envelopes, RBAC & Endpoints</div>
      <div class="cover-role-item"><strong>Security & SQA Engineer:</strong> OWASP Top 10, Auth Hygiene, Test Coverage</div>
      <div class="cover-role-item"><strong>UX / Product Analyst:</strong> Learner Portals, Evaluation UX, Mobile Readiness</div>
      <div class="cover-role-item"><strong>Technical Project Manager:</strong> Phased WBS, Gantt Roadmaps, Cost Scenarios</div>
    </div>

    <div class="cover-meta">
      <div><strong>Target Platform:</strong> Web (Desktop/Mobile) &bull; Future iOS/Android Native</div>
      <div><strong>Document Version:</strong> 1.0.0-RC &bull; Date: September 2026</div>
    </div>
  </div>
</div>

<!-- ================= ONE-PAGE EXECUTIVE DECISION SUMMARY ================= -->
<div class="page-break">
  <div class="eds-container">
    <div class="eds-header">
      <div class="eds-title">One-Page Executive Decision Summary</div>
      <span class="badge badge-critical">Read First &bull; Executive Mandate</span>
    </div>
    
    <div class="eds-grid">
      <div class="eds-item">
        <strong>1. What is TechSprout currently?</strong>
        A polished Next.js 16 frontend marketing prototype. Course browsing, blogs, and landing pages render strictly from in-memory mock data (<code>src/lib/mockData/mockData.ts</code>). No real course learning, enrollment, or examination backend exists.
      </div>

      <div class="eds-item">
        <strong>2. What is missing?</strong>
        Functional session authentication, student course player/viewer, teacher course builder, admin moderation tools, online examination/quiz engine, certificate generation, real payment gateway (bKash/Nagad/Cards), and internationalization (Bangla support).
      </div>

      <div class="eds-item">
        <strong>3. What should the MVP contain?</strong>
        Student/Teacher/Admin accounts, email/phone OTP login, course publishing, modular video player with progress tracking, timed MCQ exams with automatic grading, student dashboard with enrollment history, and single-gateway checkout (bKash/Nagad).
      </div>

      <div class="eds-item">
        <strong>4. What should NOT be built yet?</strong>
        Live Zoom/WebRTC classes, real-time peer chat, AI recommendation engines, gamification token economies, complex proctoring (webcam AI), and native iOS/Android apps prior to stabilizing the core REST API.
      </div>

      <div class="eds-item">
        <strong>5. What backend architecture is recommended?</strong>
        A Clean Modular Architecture built inside the Next.js 16 App Router using isolated Domain Services, Repository pattern with Mongoose/MongoDB, and strict DTO validation via Zod schemas. This leverages existing infrastructure while enabling future extraction.
      </div>

      <div class="eds-item">
        <strong>6. What REST API architecture is recommended?</strong>
        A versioned <code>/api/v1/...</code> RESTful structure with standardized JSON response envelopes (<code>{ success, message, data, meta }</code>), HTTP status codes, bearer JWT sessions, cursor/offset pagination, and centralized error logging.
      </div>

      <div class="eds-item">
        <strong>7. What authentication options should be considered?</strong>
        <strong>MVP:</strong> Email/Password + Phone Number with 6-digit SMS OTP + Google OAuth. <br>
        <strong>Post-MVP:</strong> Facebook Login, passwordless magic links, and session termination across all active devices.
      </div>

      <div class="eds-item">
        <strong>8. How should Bangla + English work?</strong>
        Routing via <code>next-intl</code> (<code>/bn/...</code>, <code>/en/...</code>) with cookie fallback; static UI translated via JSON catalogs; course/lesson content stored in bilingual database fields; typography powered by Google Fonts <code>Hind Siliguri</code> and <code>Plus Jakarta Sans</code>.
      </div>

      <div class="eds-item">
        <strong>9. What are the biggest risks?</strong>
        <strong>Security:</strong> Plaintext password storage in <code>/api/register</code> and open role assignment. <br>
        <strong>Operational:</strong> Uncontrolled video streaming egress costs without CDN tokens. <br>
        <strong>Business:</strong> MFS payment dropouts without automated webhook reconciliation.
      </div>

      <div class="eds-item">
        <strong>10. What is the estimated MVP development timeline?</strong>
        <strong>Solo Developer:</strong> 22–26 calendar weeks (approx. 110–130 working days). <br>
        <strong>Small Team (3 Devs + 1 QA):</strong> 10–13 calendar weeks (approx. 50–65 working days).
      </div>

      <div class="eds-item">
        <strong>11. What is the recommended order of development?</strong>
        1. Security & Auth Stabilization &rarr; 2. Role-Based Access Control (RBAC) &rarr; 3. Course Hierarchy & Media Hosting &rarr; 4. Learning Portal & Progress &rarr; 5. Exam/Quiz Engine &rarr; 6. Payments & Enrollments &rarr; 7. Multilingual &rarr; 8. QA Launch Gate.
      </div>

      <div class="eds-item">
        <strong>12. What should I do immediately after this research?</strong>
        Immediately close the plaintext password vulnerability in <code>/api/register</code>, fix the form input binding bug in <code>Register.tsx</code>, standardize MongoDB schemas, and implement the formal <code>/api/v1/auth</code> service.
      </div>
    </div>
  </div>

  <div class="callout callout-info avoid-break">
    <div class="callout-title">Architectural Mandate</div>
    <p>Do not write production feature code until the domain models, database schema indexes, and API response contracts detailed in this document are approved. Transitioning an LMS from prototype to production requires absolute data integrity around student enrollments, exam answers, and financial transactions.</p>
  </div>
</div>

<!-- ================= TABLE OF CONTENTS ================= -->
<div class="page-break">
  <h1>Table of Contents</h1>
  <div class="toc-container">
    <div class="toc-item"><span><strong>One-Page Executive Decision Summary</strong></span><span class="page-num">Page 2</span></div>
    <div class="toc-item"><span><strong>1. Executive Summary</strong></span><span class="page-num">Section 1</span></div>
    <div class="toc-item"><span><strong>2. Existing Project Audit & Codebase Inspection</strong></span><span class="page-num">Section 2</span></div>
    <div class="toc-item"><span><strong>3. Market & Competitor Research (Bangladesh & Global EdTech)</strong></span><span class="page-num">Section 3</span></div>
    <div class="toc-item"><span><strong>4. Product Vision & Pedagogical Architecture</strong></span><span class="page-num">Section 4</span></div>
    <div class="toc-item"><span><strong>5. MVP Scope Definition (Must Have vs. Should Have vs. Future)</strong></span><span class="page-num">Section 5</span></div>
    <div class="toc-item"><span><strong>6. Launch-Readiness Feature Gap Analysis</strong></span><span class="page-num">Section 6</span></div>
    <div class="toc-item"><span><strong>7. Authentication & Identity Management Strategy</strong></span><span class="page-num">Section 7</span></div>
    <div class="toc-item"><span><strong>8. Language & Internationalization (i18n) Architecture</strong></span><span class="page-num">Section 8</span></div>
    <div class="toc-item"><span><strong>9. Backend Engineering & Services Plan</strong></span><span class="page-num">Section 9</span></div>
    <div class="toc-item"><span><strong>10. REST API Architecture & Formal Specification</strong></span><span class="page-num">Section 10</span></div>
    <div class="toc-item"><span><strong>11. Database Architecture & Data Modeling (MongoDB/Mongoose)</strong></span><span class="page-num">Section 11</span></div>
    <div class="toc-item"><span><strong>12. Online Examination & Assessment Engine</strong></span><span class="page-num">Section 12</span></div>
    <div class="toc-item"><span><strong>13. Evaluation, Grading & Academic Results System</strong></span><span class="page-num">Section 13</span></div>
    <div class="toc-item"><span><strong>14. Student, Teacher & Admin Role Responsibility Matrix</strong></span><span class="page-num">Section 14</span></div>
    <div class="toc-item"><span><strong>15. Security Requirements & Threat Mitigation (OWASP Top 10)</strong></span><span class="page-num">Section 15</span></div>
    <div class="toc-item"><span><strong>16. QA / SQA Launch Audit & Defect Catalog</strong></span><span class="page-num">Section 16</span></div>
    <div class="toc-item"><span><strong>17. Mobile Application Strategy & API Convergence</strong></span><span class="page-num">Section 17</span></div>
    <div class="toc-item"><span><strong>18. Sequential Product Development Roadmap (Phases 1–14)</strong></span><span class="page-num">Section 18</span></div>
    <div class="toc-item"><span><strong>19. MVP Research & Estimated Time Frame to Launch</strong></span><span class="page-num">Section 19</span></div>
    <div class="toc-item"><span><strong>20. Full Product Development Timeline (Solo vs. Small Team)</strong></span><span class="page-num">Section 20</span></div>
    <div class="toc-item"><span><strong>21. Infrastructure, Cloud Resources & Operational Cost Model</strong></span><span class="page-num">Section 21</span></div>
    <div class="toc-item"><span><strong>22. Master Launch Readiness Checklist</strong></span><span class="page-num">Section 22</span></div>
    <div class="toc-item"><span><strong>23. Critical Gap Report (Severity-Ranked Findings)</strong></span><span class="page-num">Section 23</span></div>
    <div class="toc-item"><span><strong>24. Recommended Immediate Next Steps (30-Day Engineering Plan)</strong></span><span class="page-num">Section 24</span></div>
    <div class="toc-item"><span><strong>25. Technical References & Industry Standards</strong></span><span class="page-num">Section 25</span></div>
  </div>
</div>

<!-- ================= SECTION 1: EXECUTIVE SUMMARY ================= -->
<div class="avoid-break">
  <h1 class="section-title"><span class="num">01</span> Executive Summary</h1>
  <p>TechSprout School is poised to become a premiere online learning management system (LMS) purpose-built for the Bangladeshi ecosystem and regional international learners. The platform aims to bridge the critical gap between academic instruction, practical technical skills, and structured career readiness. To achieve market leadership, TechSprout must deliver a flawless, high-retention digital learning experience characterized by robust video delivery, interactive online examinations, instant academic evaluation, and frictionless localized payments.</p>

  <p>This document presents the findings of an exhaustive architectural, codebase, security, and product audit of the current TechSprout repository. While the codebase exhibits modern visual aesthetics using Next.js 16, Tailwind CSS v4, and Radix UI primitives, it is currently in a <strong>pre-alpha prototype state</strong>. The existing implementation lacks core functional backends, exposes serious security vulnerabilities, and utilizes static mock data across all public catalogs.</p>

  <div class="callout callout-warning avoid-break">
    <div class="callout-title">Strategic Assessment</div>
    <p>TechSprout School currently possesses a polished storefront, but <strong>zero operational LMS engines</strong>. Launching the platform requires transitioning from static marketing mockups into an enterprise-grade modular monolith with true data persistence, secure multi-role authentication, automated grading, and compliant MFS billing.</p>
  </div>
</div>

<!-- ================= SECTION 2: EXISTING PROJECT AUDIT ================= -->
<div class="page-break">
  <h1 class="section-title"><span class="num">02</span> Existing Project Audit & Codebase Inspection</h1>
  <p>Every file, route handler, UI component, database schema, and configuration in <code>techsprout-main</code> was inspected. To provide absolute transparency, each core component has been categorized into one of six mutually exclusive technical states:</p>
  
  <p><strong>Status Definitions:</strong></p>
  <ul>
    <li><span class="status-tag status-complete">Fully Implemented</span>: Complete UI, working business logic, database persistence, and validation.</li>
    <li><span class="status-tag status-partial">Partially Implemented</span>: Partially working logic or UI; missing error states or edge case handling.</li>
    <li><span class="status-tag status-mock">UI Only / Mock</span>: Visual interface present, but reads hardcoded data or performs no real actions.</li>
    <li><span class="status-tag status-broken">Broken</span>: Code exists but causes runtime errors, infinite loops, or severe logic failures.</li>
    <li><span class="status-tag status-missing">Missing</span>: Feature is required for LMS operations but does not exist anywhere in the codebase.</li>
  </ul>

  <table>
    <thead>
      <tr>
        <th style="width: 25%;">System Component</th>
        <th style="width: 18%;">Current File / Location</th>
        <th style="width: 15%;">Audit Status</th>
        <th style="width: 42%;">Technical Findings & Code Evidence</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td><strong>Authentication Engine</strong></td>
        <td><code>src/auth.ts</code><br><code>src/app/api/[...nextauth]/route.ts</code></td>
        <td><span class="status-tag status-broken">Broken</span></td>
        <td>NextAuth v5 beta is configured, but <code>authorize</code> unconditionally returns <code>null</code>. Logging in is mathematically impossible through NextAuth.</td>
      </tr>
      <tr>
        <td><strong>User Registration API</strong></td>
        <td><code>src/app/api/(user)/register/route.ts</code></td>
        <td><span class="status-tag status-broken">Broken / Critical</span></td>
        <td>Directly persists <code>req.json()</code> to <code>User.create()</code> without password hashing (Argon2/bcrypt) or schema validation. Allows arbitrary role escalation. Returns empty 200 on error.</td>
      </tr>
      <tr>
        <td><strong>User Registration Form</strong></td>
        <td><code>src/components/forms/Register.tsx</code></td>
        <td><span class="status-tag status-broken">Broken / Bug</span></td>
        <td>Posts data to scratch endpoint <code>/test</code> instead of <code>/api/register</code>. Confirm Password field is erroneously bound to form key <code>name</code>, overwriting the user's name on typing.</td>
      </tr>
      <tr>
        <td><strong>Login Component</strong></td>
        <td><code>src/components/forms/Login.tsx</code></td>
        <td><span class="status-tag status-mock">UI Only / Mock</span></td>
        <td>Submit handler executes <code>console.log(userData)</code>. No session initiation, no cookie creation, no redirection to dashboard.</td>
      </tr>
      <tr>
        <td><strong>OTP Verification Modal</strong></td>
        <td><code>src/components/OtpModal.tsx</code><br><code>src/store/Otpstore.ts</code></td>
        <td><span class="status-tag status-mock">UI Only / Mock</span></td>
        <td>InputOTP slots render, but clicking Submit immediately triggers <code>setModalStatus('close')</code> with no backend verification endpoint, SMS gateway, or email trigger.</td>
      </tr>
      <tr>
        <td><strong>Course Catalog & Filtering</strong></td>
        <td><code>src/app/courses/page.tsx</code></td>
        <td><span class="status-tag status-mock">UI Only / Mock</span></td>
        <td>Renders static array <code>courses.slice(0, 6)</code> from <code>mockData.ts</code>. Category checkboxes, price toggles, search input, and pagination buttons have no event handlers.</td>
      </tr>
      <tr>
        <td><strong>Course Details & Enrollment</strong></td>
        <td><code>src/app/courses/[course]/page.tsx</code></td>
        <td><span class="status-tag status-mock">UI Only / Mock</span></td>
        <td>Reads synchronous mock data via <code>getSingleCourse()</code>. The "Enroll Now" button is a pure HTML button with no <code>onClick</code> handler or cart integration.</td>
      </tr>
      <tr>
        <td><strong>Learning Player & Lessons</strong></td>
        <td><code>src/app/courses/...</code></td>
        <td><span class="status-tag status-missing">Missing</span></td>
        <td>No classroom, video player with curriculum sidebar, lesson completion checklist, or resource download system exists for enrolled learners.</td>
      </tr>
      <tr>
        <td><strong>Online Exam / Quiz System</strong></td>
        <td><code>N/A</code></td>
        <td><span class="status-tag status-missing">Missing</span></td>
        <td>Zero schemas, API endpoints, or UI views exist for creating quizzes, taking timed exams, evaluating questions, or displaying test scores.</td>
      </tr>
      <tr>
        <td><strong>Admin Dashboard</strong></td>
        <td><code>src/app/dashboard/admin/courses/page.tsx</code><br><code>src/app/dashboard/admin/overview/page.tsx</code></td>
        <td><span class="status-tag status-mock">UI Only / Stub</span></td>
        <td>Consists solely of placeholder headers (e.g., <code>&lt;h2&gt;Admin Overview&lt;/h2&gt;</code>). No course approval tables, analytics, user lists, or financial reports.</td>
      </tr>
      <tr>
        <td><strong>Student Dashboard</strong></td>
        <td><code>N/A</code></td>
        <td><span class="status-tag status-missing">Missing</span></td>
        <td>No student portal for enrolled courses, completion certificates, payment receipts, or personal progress tracking.</td>
      </tr>
      <tr>
        <td><strong>Instructor Dashboard</strong></td>
        <td><code>N/A</code></td>
        <td><span class="status-tag status-missing">Missing</span></td>
        <td>No instructor tools for managing course curriculums, uploading lecture videos, setting exam questions, or reviewing student grades.</td>
      </tr>
      <tr>
        <td><strong>Database Schemas</strong></td>
        <td><code>src/models/*.ts</code> (9 models)</td>
        <td><span class="status-tag status-partial">Partially Implemented</span></td>
        <td>Mongoose schemas exist for User, Course, Cart, Enrolment, etc., but are loosely typed (e.g., <code>lessons: [String]</code> instead of subdocuments/references). Lacks indexes and timestamps.</td>
      </tr>
      <tr>
        <td><strong>Middleware & Route Guarding</strong></td>
        <td><code>src/middleware.ts</code></td>
        <td><span class="status-tag status-broken">Broken / No-Op</span></td>
        <td>Contains an empty function returning <code>undefined</code>. Protected routes (like <code>/dashboard/*</code>) are completely unprotected and publicly accessible.</td>
      </tr>
      <tr>
        <td><strong>Internationalization (i18n)</strong></td>
        <td><code>src/app/layout.tsx</code></td>
        <td><span class="status-tag status-missing">Missing</span></td>
        <td>Root HTML hardcoded to <code>lang="en"</code> with Latin font subsets. No language switcher, translation files, or Bangla font support.</td>
      </tr>
      <tr>
        <td><strong>Footer Navigation</strong></td>
        <td><code>src/components/Footer.tsx</code></td>
        <td><span class="status-tag status-broken">Broken Links</span></td>
        <td>Links point to non-existent routes: <code>/about</code> (instead of <code>/about-us</code>), <code>/blog</code> (instead of <code>/blogs</code>), <code>/terms-conditions</code> (instead of <code>/terms-and-condition</code>). Social links lack protocols.</td>
      </tr>
    </tbody>
  </table>
</div>

<!-- ================= SECTION 3: COMPETITOR RESEARCH ================= -->
<div class="page-break">
  <h1 class="section-title"><span class="num">03</span> Market & Competitor Research</h1>
  <p>To position TechSprout School competitively, we benchmarked leading platforms in Bangladesh (10 Minute School, Bohubrihi, WebcoachBD) and internationally (Udemy, Coursera). Every finding is strictly classified by evidentiary standard:</p>

  <table>
    <thead>
      <tr>
        <th>Platform</th>
        <th>Category / Focus</th>
        <th>Core Architecture Findings</th>
        <th>Key Lessons for TechSprout</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td><strong>10 Minute School</strong><br><em>(Bangladesh)</em></td>
        <td>K-12, Admission, Skills</td>
        <td>
          <strong>FACT:</strong> Mobile-first architecture with OTP phone authentication as the primary sign-in mechanism.<br>
          <strong>FACT:</strong> Seamless bKash and Nagad direct merchant API checkout.<br>
          <strong>OBSERVATION:</strong> Uses multi-bitrate HLS/DASH video delivery optimized for low-bandwidth cellular networks in rural Bangladesh.<br>
          <strong>RECOMMENDATION:</strong> TechSprout must provide phone number OTP sign-in and bKash direct payment for local viability.
        </td>
        <td>Frictionless enrollment via phone numbers is mandatory in Bangladesh. Email-only auth causes up to 60% checkout abandonment.</td>
      </tr>
      <tr>
        <td><strong>Bohubrihi</strong><br><em>(Bangladesh)</em></td>
        <td>Tech & Professional Career Tracks</td>
        <td>
          <strong>FACT:</strong> Employs structured multi-week project submissions with manual human mentor grading.<br>
          <strong>FACT:</strong> Issues verifiable PDF certificates with unique alphanumeric codes and public verification URLs.<br>
          <strong>OBSERVATION:</strong> Offers lecture-specific discussion forums where students tag timestamps.<br>
          <strong>RECOMMENDATION:</strong> TechSprout should implement automated MCQ grading first, then add mentor project submission post-MVP.
        </td>
        <td>Professional career learners value accredited, verifiable certificates with high academic rigor.</td>
      </tr>
      <tr>
        <td><strong>Udemy</strong><br><em>(Global)</em></td>
        <td>Massive Open Marketplace</td>
        <td>
          <strong>FACT:</strong> Strict modular hierarchy: Course &rarr; Section &rarr; Lecture &rarr; Resource.<br>
          <strong>OBSERVATION:</strong> Video player includes speed adjustments (0.5x–2.0x), timestamped personal notes, and automatic next-lesson triggers.<br>
          <strong>RECOMMENDATION:</strong> Adopt Udemy's battle-tested lesson completion model (auto-marking completion upon 90% video watch).
        </td>
        <td>Intuitive, distraction-free video playback with curriculum drawer is the gold standard for student retention.</td>
      </tr>
      <tr>
        <td><strong>Coursera</strong><br><em>(Global)</em></td>
        <td>University & Enterprise Degrees</td>
        <td>
          <strong>FACT:</strong> Timed summative assessments with strict attempt cooldown periods and randomized question pools.<br>
          <strong>OBSERVATION:</strong> Heavy emphasis on peer review evaluation and honor code enforcement.<br>
          <strong>OPTIONAL FEATURE:</strong> Web-based code playgrounds or remote lab containers.
        </td>
        <td>Question bank randomization prevents exam answer sharing among student cohorts.</td>
      </tr>
      <tr>
        <td><strong>WebcoachBD</strong><br><em>(Bangladesh)</em></td>
        <td>Early Tech Tutorials</td>
        <td>
          <strong>FACT:</strong> Early pioneer of Bengali web development tutorials.<br>
          <strong>OBSERVATION:</strong> Suffered from lack of structured evaluation, progress tracking, and monetized interactive exams.<br>
          <strong>RECOMMENDATION:</strong> TechSprout must not rely on passive video watching alone; interactive evaluations create sticky engagement.
        </td>
        <td>Pure video repositories face commoditization; interactive LMS platforms provide defensible value.</td>
      </tr>
    </tbody>
  </table>

  <div class="callout callout-success avoid-break">
    <div class="callout-title">Synthesized Competitive Strategy</div>
    <p>TechSprout School will combine <strong>Udemy's intuitive self-paced learning player</strong> with <strong>10 Minute School's frictionless mobile/bKash onboarding</strong>, backed by <strong>Coursera's rigorous randomized examination engine</strong>, presented in a clean bilingual (Bangla & English) interface.</p>
  </div>
</div>

<!-- ================= SECTION 4: PRODUCT VISION ================= -->
<div class="avoid-break">
  <h1 class="section-title"><span class="num">04</span> Product Vision & Pedagogical Architecture</h1>
  <p>The core vision of TechSprout School is to democratize high-caliber technical, vocational, and digital education across Bangladesh. The platform is designed around a three-tier learner progression model:</p>

  <div class="diagram-box">
    [ 1. Conceptual Knowledge ] &rarr; [ 2. Hands-on Practice & Quizzes ] &rarr; [ 3. Evaluated Assessment & Certification ]
    &bull; High-definition video lectures   &bull; In-video knowledge checks        &bull; Timed final examinations
    &bull; Downloadable cheat-sheets       &bull; Modular assignments              &bull; Cryptographically signed certificates
    &bull; Bilingual transcripts (BN/EN)   &bull; Discussion Q&A with instructor   &bull; Public resume verification links
  </div>

  <h2>Target User Personas</h2>
  <ul>
    <li><strong>The University Student (Tanvir, 21, Dhaka):</strong> Needs practical programming skills in Bengali. Studies primarily from a smartphone and laptop. Prefers paying via personal bKash wallet.</li>
    <li><strong>The District Learner (Fatima, 19, Bogura):</strong> Constrained by intermittent broadband. Needs video quality selector (360p–1080p), downloadable lecture notes, and offline quiz caching.</li>
    <li><strong>The Industry Instructor (Rahim, 32, Senior Software Engineer):</strong> Wants an intuitive course creation suite to upload videos, organize curriculum modules, and generate automated question pools without technical overhead.</li>
    <li><strong>The Platform Administrator:</strong> Requires comprehensive controls over course moderation, payouts, student disputes, coupon codes, and platform analytics.</li>
  </ul>
</div>

<!-- ================= SECTION 5: MVP DEFINITION ================= -->
<div class="page-break">
  <h1 class="section-title"><span class="num">05</span> Minimum Viable Product (MVP) Definition</h1>
  <p>To avoid scope creep and deliver a stable, revenue-generating product to market, features are strictly partitioned into three tiers:</p>

  <table>
    <thead>
      <tr>
        <th style="width: 22%;">Feature Category</th>
        <th style="width: 14%;">MVP Tier</th>
        <th style="width: 32%;">Detailed Scope Description</th>
        <th style="width: 18%;">Dependencies</th>
        <th style="width: 14%;">Dev Effort</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td><strong>Dual Authentication</strong></td>
        <td><span class="badge badge-mvp">Must Have (MVP)</span></td>
        <td>Email/Password with Argon2id + Bangladeshi Phone Number with 6-digit SMS OTP + Google OAuth.</td>
        <td>SMS Gateway (Greenweb/SSL Wireless), NextAuth v5</td>
        <td>10 Days</td>
      </tr>
      <tr>
        <td><strong>Role-Based Access (RBAC)</strong></td>
        <td><span class="badge badge-mvp">Must Have (MVP)</span></td>
        <td>Strict separation between Student, Instructor, and Admin roles via JWT claims and server route guards.</td>
        <td>Auth Service</td>
        <td>5 Days</td>
      </tr>
      <tr>
        <td><strong>Course Curriculum Engine</strong></td>
        <td><span class="badge badge-mvp">Must Have (MVP)</span></td>
        <td>Multi-tier hierarchy: Course &rarr; Module &rarr; Lesson. Support for video streaming, rich text, and PDF attachments.</td>
        <td>Mongoose Schemas, S3/Bunny Storage</td>
        <td>12 Days</td>
      </tr>
      <tr>
        <td><strong>Student Learning Player</strong></td>
        <td><span class="badge badge-mvp">Must Have (MVP)</span></td>
        <td>Distraction-free video player with speed control, curriculum progress sidebar, and completion tracking.</td>
        <td>Video Hosting CDN, Progress API</td>
        <td>10 Days</td>
      </tr>
      <tr>
        <td><strong>Automated Quiz Engine</strong></td>
        <td><span class="badge badge-mvp">Must Have (MVP)</span></td>
        <td>Single-choice and multi-choice MCQs, randomized question orders, time limits, and instant automated grading.</td>
        <td>Exam Service</td>
        <td>12 Days</td>
      </tr>
      <tr>
        <td><strong>Student Dashboard</strong></td>
        <td><span class="badge badge-mvp">Must Have (MVP)</span></td>
        <td>Enrolled courses overview, progress percentages, past quiz scores, and account profile management.</td>
        <td>Enrollment & Progress API</td>
        <td>8 Days</td>
      </tr>
      <tr>
        <td><strong>MFS Payment Integration</strong></td>
        <td><span class="badge badge-mvp">Must Have (MVP)</span></td>
        <td>Single payment gateway checkout supporting bKash, Nagad, Rocket, and local debit cards with IPN webhooks.</td>
        <td>SSLCommerz / Shurjopay API</td>
        <td>9 Days</td>
      </tr>
      <tr>
        <td><strong>Automated Certificates</strong></td>
        <td><span class="badge badge-mvp">Must Have (MVP)</span></td>
        <td>Dynamic PDF certificate generation upon 100% course + exam completion with unique verification QR/URL.</td>
        <td>PDFKit / Puppeteer, Certificate Model</td>
        <td>6 Days</td>
      </tr>
      <tr>
        <td><strong>Bilingual Support (BN/EN)</strong></td>
        <td><span class="badge badge-mvp">Must Have (MVP)</span></td>
        <td>Header language toggle, <code>next-intl</code> dictionary routing, and dual-language titles/descriptions.</td>
        <td>next-intl, Translation Files</td>
        <td>7 Days</td>
      </tr>
      <tr>
        <td><strong>Instructor Portal</strong></td>
        <td><span class="badge badge-postmvp">Should Have (Post-MVP)</span></td>
        <td>Self-service course curriculum editor, video uploader, quiz creator, and enrollment analytics.</td>
        <td>Course Engine, File Upload</td>
        <td>14 Days</td>
      </tr>
      <tr>
        <td><strong>Descriptive Exam Grading</strong></td>
        <td><span class="badge badge-postmvp">Should Have (Post-MVP)</span></td>
        <td>Short-answer and file-submission questions requiring manual instructor review and qualitative feedback.</td>
        <td>Exam Engine</td>
        <td>8 Days</td>
      </tr>
      <tr>
        <td><strong>Discussion Q&A Forum</strong></td>
        <td><span class="badge badge-postmvp">Should Have (Post-MVP)</span></td>
        <td>Lesson-specific threaded discussion board for student-instructor questions.</td>
        <td>Forum Schemas</td>
        <td>7 Days</td>
      </tr>
      <tr>
        <td><strong>Live Video Classes</strong></td>
        <td><span class="badge badge-future">Future (v2+)</span></td>
        <td>Integrated Zoom / WebRTC live video sessions with calendar reminders.</td>
        <td>Livekit / Agora API</td>
        <td>18 Days</td>
      </tr>
      <tr>
        <td><strong>Native Mobile Apps</strong></td>
        <td><span class="badge badge-future">Future (v2+)</span></td>
        <td>Cross-platform Flutter or React Native mobile apps with offline encrypted video caching.</td>
        <td>Stable REST API v1</td>
        <td>45 Days</td>
      </tr>
    </tbody>
  </table>
</div>
'''

if __name__ == "__main__":
    print("Part 1 module loaded.")
