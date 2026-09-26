# scratch/part3.py - Sections 11 to 15
import os

def get_part3_html():
    return '''
<!-- ================= SECTION 11: DATABASE ARCHITECTURE ================= -->
<div class="page-break">
  <h1 class="section-title"><span class="num">11</span> Database Architecture & Data Modeling</h1>
  <p>The persistence layer will utilize <strong>MongoDB with Mongoose</strong> on a high-availability MongoDB Atlas replica set. The data model transitions TechSprout away from loose string arrays to strongly normalized documents with compound indexes, referential integrity, and soft deletion:</p>

  <div class="diagram-box">
  +-------------------+       1:N       +-------------------+       1:N       +-------------------+
  |       User        | --------------> |      Course       | --------------> |      Module       |
  |-------------------|                 |-------------------|                 |-------------------|
  | _id: ObjectId     |                 | _id: ObjectId     |                 | _id: ObjectId     |
  | name, email, phone|                 | instructor: Ref   |                 | courseId: Ref     |
  | passwordHash      |                 | title, category   |                 | title, sortOrder  |
  | role: enum        |                 | price, status     |                 +-------------------+
  +-------------------+                 +-------------------+                           | 1:N
            |                                     |                                     v
            | 1:N                                 | 1:N                       +-------------------+
            v                                     v                           |      Lesson       |
  +-------------------+                 +-------------------+                 |-------------------|
  |    Enrollment     | <-------------- |      Order        |                 | _id: ObjectId     |
  |-------------------|      M:1        |-------------------|                 | moduleId: Ref     |
  | userId, courseId  |                 | userId, courseId  |                 | title, type, video|
  | status, enrolledAt|                 | amount, trxId, bK |                 | duration, sort    |
  +-------------------+                 +-------------------+                 +-------------------+
            |                                                                           |
            v                                                                           v
  +-------------------+                                                       +-------------------+
  | CourseProgress    |                                                       |    Exam / Quiz    |
  |-------------------|                                                       |-------------------|
  | completedLessons[]|                                                       | courseId/lessonId |
  | percentComplete   |                                                       | title, duration   |
  +-------------------+                                                       | passingMarks      |
                                                                              +-------------------+
  </div>

  <h2>Key Entity Specifications</h2>
  <table>
    <thead>
      <tr>
        <th style="width: 20%;">Entity Name</th>
        <th style="width: 30%;">Key Fields & Types</th>
        <th style="width: 25%;">Indexes & Constraints</th>
        <th style="width: 25%;">Integrity & Lifecycle Rules</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td><strong>User</strong></td>
        <td><code>_id, name, email, phone, passwordHash, role, isVerified, authProvider</code></td>
        <td><code>{ email: 1 } (unique, sparse)</code><br><code>{ phone: 1 } (unique, sparse)</code></td>
        <td>Soft delete with <code>isDeleted: Boolean</code>. Role strictly restricted to <code>['student', 'instructor', 'admin']</code>.</td>
      </tr>
      <tr>
        <td><strong>Course</strong></td>
        <td><code>_id, title, slug, instructorId, category, price, isPublished, thumbnail, duration</code></td>
        <td><code>{ slug: 1 } (unique)</code><br><code>{ instructorId: 1, isPublished: 1 }</code></td>
        <td>Cascade prevents deletion if active enrollments exist. Draft/Published workflow.</td>
      </tr>
      <tr>
        <td><strong>Module</strong></td>
        <td><code>_id, courseId, title, sortOrder, isFreePreview</code></td>
        <td><code>{ courseId: 1, sortOrder: 1 }</code></td>
        <td>Ordered sub-unit. Modules contain one or more sequential Lessons.</td>
      </tr>
      <tr>
        <td><strong>Lesson</strong></td>
        <td><code>_id, moduleId, title, type (video/quiz/text), videoStreamId, duration, resources[]</code></td>
        <td><code>{ moduleId: 1, sortOrder: 1 }</code></td>
        <td>Stores video streaming identifier (e.g. Bunny video ID) rather than raw public MP4 URLs.</td>
      </tr>
      <tr>
        <td><strong>Enrollment</strong></td>
        <td><code>_id, userId, courseId, orderId, enrolledAt, expiresAt, status (active/expired)</code></td>
        <td><code>{ userId: 1, courseId: 1 } (unique)</code></td>
        <td>Atomic creation during payment webhook. Idempotency guarantees access is granted exactly once.</td>
      </tr>
      <tr>
        <td><strong>CourseProgress</strong></td>
        <td><code>_id, userId, courseId, completedLessons: [ObjectId], percentComplete, lastAccessedLesson</code></td>
        <td><code>{ userId: 1, courseId: 1 } (unique)</code></td>
        <td>Updated whenever student completes a lesson. Triggers certificate generation at 100%.</td>
      </tr>
      <tr>
        <td><strong>Exam & Question</strong></td>
        <td><code>_id, title, courseId, durationMinutes, totalMarks, passingScore, questions[]</code></td>
        <td><code>{ courseId: 1 }</code></td>
        <td>Embedded questions array for high-performance retrieval during student test sessions.</td>
      </tr>
      <tr>
        <td><strong>ExamAttempt</strong></td>
        <td><code>_id, examId, userId, startedAt, submittedAt, answers[], score, isPassed</code></td>
        <td><code>{ userId: 1, examId: 1, startedAt: -1 }</code></td>
        <td>Server calculates score on submission. Immutable audit record of student examination performance.</td>
      </tr>
    </tbody>
  </table>
</div>

<!-- ================= SECTION 12: ONLINE EXAM SYSTEM ================= -->
<div class="page-break">
  <h1 class="section-title"><span class="num">12</span> Online Examination & Assessment Engine</h1>
  <p>The online examination engine delivers rigorous, tamper-resistant academic testing. It supports formative quizzes (end-of-lesson knowledge checks) and summative final exams (required for course certificates):</p>

  <h2>1. Question Formats & Randomization</h2>
  <ul>
    <li><strong>Single-Choice MCQ:</strong> Traditional question with 4 options and exactly one correct answer.</li>
    <li><strong>Multiple-Answer MCQ:</strong> Questions with multiple correct options (partial credit logic applied).</li>
    <li><strong>True / False:</strong> Rapid conceptual verification questions.</li>
    <li><strong>Question Pool Randomization:</strong> If an exam requires 20 questions, the server draws randomly from an instructor-curated pool of 50 questions, ensuring adjacent students receive different tests.</li>
    <li><strong>Option Shuffling:</strong> The order of options (A, B, C, D) is cryptographically shuffled for each attempt.</li>
  </ul>

  <h2>2. Examination Lifecycle & Integrity Controls</h2>
  <div class="diagram-box">
  [ Student Clicks Start Exam ]
                |
                v
  [ Server Generates Attempt Record ] &rarr; Records <code>startedAt</code> timestamp; Computes <code>hardDeadline = startedAt + duration</code>
                |
                v
  [ Client Displays Questions ] &rarr; Client timer countdown (synced with server via Heartbeat)
                |
  +-------------+-------------+
  |                           |
  v                           v
  [ Normal Submission ]       [ Hard Timeout Triggered ] &rarr; Server worker automatically auto-submits attempt upon <code>hardDeadline</code>
  |                           |
  +-------------+-------------+
                |
                v
  [ Server Evaluation Worker ] &rarr; Matches answers against answer keys; Applies negative marking if enabled; Creates Result
  </div>

  <h2>3. Anti-Cheating & Proctoring Mechanisms (MVP vs. Post-MVP)</h2>
  <ul>
    <li><strong>Full-Screen Lock & Blur Detection (MVP):</strong> Browser <code>window.onblur</code> events trigger warning dialogs. Exceeding 3 blur events auto-submits the exam with an academic integrity infraction flag.</li>
    <li><strong>Copy-Paste & Context Menu Disable (MVP):</strong> CSS and JavaScript restrictions preventing learners from copying question text to search engines.</li>
    <li><strong>IP / Multiple Device Lock (MVP):</strong> An active exam attempt locks the user session; concurrent logins from another IP address are blocked until the exam completes.</li>
    <li><strong>Webcam AI Proctoring (Future v2+):</strong> Facial detection, tab monitoring, and periodic snapshots deferred until post-MVP.</li>
  </ul>
</div>

<!-- ================= SECTION 13: EVALUATION SYSTEM ================= -->
<div class="avoid-break">
  <h1 class="section-title"><span class="num">13</span> Evaluation, Grading & Academic Results System</h1>
  <p>The evaluation system determines learner competency and dictates certificate eligibility. It combines automated computation with instructor moderation:</p>

  <h2>Grading Algorithms & Negative Marking</h2>
  <ul>
    <li><strong>Instant Scoring:</strong> For objective questions (MCQ, True/False), evaluation executes in under 200ms upon submission. Correct options yield positive points; incorrect choices apply negative marking if designated by the instructor (e.g., -0.25 marks per error to penalize guessing).</li>
    <li><strong>Passing Score Thresholds:</strong> Courses enforce a configurable passing percentage (default 70%). Students falling below threshold receive actionable breakdown feedback and must observe a 24-hour retake cooldown period.</li>
    <li><strong>Grading Curves & Letter Grades:</strong>
      A+ (80-100%), A (70-79%), B (60-69%), C (50-59%), F (&lt;50%).
    </li>
  </ul>

  <h2>Certificate Issuance Pipeline</h2>
  <p>Upon achieving &ge;70% on the final course exam AND 100% lesson watch completion, the system automatically dispatches an asynchronous job to generate an accredited completion certificate. The PDF features a cryptographically generated SHA-256 hash, student full name, instructor signature, completion date, and an interactive QR code linking to <code>techsprout.edu/verify/:certificateId</code>.</p>
</div>

<!-- ================= SECTION 14: ROLES & RBAC MATRIX ================= -->
<div class="page-break">
  <h1 class="section-title"><span class="num">14</span> Student, Teacher & Admin Role Matrix</h1>
  <p>Access control is strictly enforced via Role-Based Access Control (RBAC). Below is the comprehensive permissions matrix across the three core personas:</p>

  <table>
    <thead>
      <tr>
        <th style="width: 35%;">Platform Feature / Operation</th>
        <th style="width: 20%; text-align: center;">Student</th>
        <th style="width: 20%; text-align: center;">Instructor / Teacher</th>
        <th style="width: 25%; text-align: center;">Administrator</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td>Browse Public Course Catalog & Syllabus</td>
        <td style="text-align: center;">&#10004; Allowed</td>
        <td style="text-align: center;">&#10004; Allowed</td>
        <td style="text-align: center;">&#10004; Allowed</td>
      </tr>
      <tr>
        <td>Enroll in Free & Paid Courses</td>
        <td style="text-align: center;">&#10004; Allowed</td>
        <td style="text-align: center;">&#10004; Allowed</td>
        <td style="text-align: center;">&#10004; Allowed (Bypass Pay)</td>
      </tr>
      <tr>
        <td>Watch Paid Course Video Lectures</td>
        <td style="text-align: center;">&#10004; Enrolled Only</td>
        <td style="text-align: center;">&#10004; Own Courses</td>
        <td style="text-align: center;">&#10004; All Courses</td>
      </tr>
      <tr>
        <td>Take Quizzes & Final Exams</td>
        <td style="text-align: center;">&#10004; Enrolled Only</td>
        <td style="text-align: center;">&#10004; Preview Mode</td>
        <td style="text-align: center;">&#10004; Preview Mode</td>
      </tr>
      <tr>
        <td>Create Course Drafts & Modules</td>
        <td style="text-align: center;">&#10008; Forbidden</td>
        <td style="text-align: center;">&#10004; Allowed</td>
        <td style="text-align: center;">&#10004; Allowed</td>
      </tr>
      <tr>
        <td>Publish Course Directly to Public Storefront</td>
        <td style="text-align: center;">&#10008; Forbidden</td>
        <td style="text-align: center;">&#10008; Requires Admin Review</td>
        <td style="text-align: center;">&#10004; Direct Publish</td>
      </tr>
      <tr>
        <td>Create Question Pools & Final Exams</td>
        <td style="text-align: center;">&#10008; Forbidden</td>
        <td style="text-align: center;">&#10004; Own Courses</td>
        <td style="text-align: center;">&#10004; All Courses</td>
      </tr>
      <tr>
        <td>Grade Subjective Student Assignments</td>
        <td style="text-align: center;">&#10008; Forbidden</td>
        <td style="text-align: center;">&#10004; Own Students</td>
        <td style="text-align: center;">&#10004; Allowed</td>
      </tr>
      <tr>
        <td>View Course Financials & Royalties</td>
        <td style="text-align: center;">&#10008; Forbidden</td>
        <td style="text-align: center;">&#10004; Own Earnings</td>
        <td style="text-align: center;">&#10004; Platform-Wide</td>
      </tr>
      <tr>
        <td>Manage User Accounts & Elevate Roles</td>
        <td style="text-align: center;">&#10008; Forbidden</td>
        <td style="text-align: center;">&#10008; Forbidden</td>
        <td style="text-align: center;">&#10004; Full Control</td>
      </tr>
      <tr>
        <td>Issue Refunds & Void Enrollments</td>
        <td style="text-align: center;">&#10008; Forbidden</td>
        <td style="text-align: center;">&#10008; Forbidden</td>
        <td style="text-align: center;">&#10004; Allowed</td>
      </tr>
    </tbody>
  </table>
</div>

<!-- ================= SECTION 15: SECURITY AUDIT ================= -->
<div class="page-break">
  <h1 class="section-title"><span class="num">15</span> Security Requirements & Threat Mitigation</h1>
  <p>An enterprise LMS processes sensitive personal identifiable information (PII), proprietary curriculum intellectual property, and financial transactions. Below is the security audit and OWASP Top 10 mitigation framework:</p>

  <div class="callout callout-critical avoid-break">
    <div class="callout-title">Critical Vulnerabilities Detected in Current TechSprout Repository</div>
    <ul>
      <li><strong>Plaintext Passwords (CWE-312):</strong> In <code>src/app/api/(user)/register/route.ts</code>, <code>User.create({ ...bodyData })</code> persists passwords directly to MongoDB without cryptographic hashing. <em>Remediation: Hash passwords using Argon2id with 64MB memory cost prior to insert.</em></li>
      <li><strong>Mass Assignment & Role Escalation (CWE-915):</strong> The register endpoint accepts unchecked JSON objects. A malicious request specifying <code>{ "role": "admin" }</code> immediately gains superuser privileges. <em>Remediation: Explicit DTO sanitization via Zod schemas, hardcoding new registrations to <code>role: 'student'</code>.</em></li>
      <li><strong>Missing Route Guarding (CWE-285):</strong> <code>src/middleware.ts</code> is an empty stub. Admin dashboards and internal user data are vulnerable to unauthenticated scraping. <em>Remediation: Implement NextAuth middleware enforcing valid JWT sessions and role matching.</em></li>
      <li><strong>Unbounded SMS / OTP Abuse (CWE-307):</strong> The OTP mechanism lacks sliding-window rate limiting. Attackers could spam requests, depleting platform SMS gateway funds. <em>Remediation: Redis rate limiter restricting requests to 3 per phone number per 15 minutes.</em></li>
    </ul>
  </div>

  <h2>OWASP Top 10 LMS Hardening Guidelines</h2>
  <table>
    <thead>
      <tr>
        <th style="width: 25%;">OWASP Threat Category</th>
        <th style="width: 35%;">LMS Attack Vector</th>
        <th style="width: 40%;">Architectural Countermeasure</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td><strong>A01: Broken Access Control</strong></td>
        <td>Student modifies lesson ID in URL to view unpurchased lectures.</td>
        <td>Server-side enrollment verification before returning video streaming tokens.</td>
      </tr>
      <tr>
        <td><strong>A02: Cryptographic Failures</strong></td>
        <td>Cleartext credentials intercepted in transit.</td>
        <td>Enforce TLS 1.3, HSTS headers, and Argon2id password hashing with distinct per-user salts.</td>
      </tr>
      <tr>
        <td><strong>A03: Injection</strong></td>
        <td>NoSQL query injection via malicious MongoDB operators (<code>$gt</code>, <code>$or</code>).</td>
        <td>Strict Zod schema validation; Mongoose parameterized models; sanitize user input.</td>
      </tr>
      <tr>
        <td><strong>A04: Insecure Design</strong></td>
        <td>Exam answers sent in client payload and inspected via DevTools.</td>
        <td>Answer keys NEVER sent to client. Evaluation performed strictly on server upon submission.</td>
      </tr>
      <tr>
        <td><strong>A05: Security Misconfiguration</strong></td>
        <td>Exposing stack traces or database connection URIs in error responses.</td>
        <td>Sanitize production API errors via <code>errorResponse()</code>; disable verbose Next.js error overlays.</td>
      </tr>
      <tr>
        <td><strong>A07: Identification & Auth Failures</strong></td>
        <td>Brute-forcing 6-digit OTP codes or passwords.</td>
        <td>Maximum 5 incorrect attempts before invalidating OTP and locking account for 30 minutes.</td>
      </tr>
      <tr>
        <td><strong>A08: Software & Data Integrity</strong></td>
        <td>Tampered payment webhook payloads granting free course access.</td>
        <td>HMAC-SHA256 signature verification on all SSLCommerz and bKash IPN webhooks.</td>
      </tr>
    </tbody>
  </table>
</div>
'''

if __name__ == "__main__":
    print("Part 3 module loaded.")
