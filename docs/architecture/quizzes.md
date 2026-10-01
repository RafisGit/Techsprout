# TechSprout School LMS — P4 Quizzes & Assessment Architecture Specification

> **Phase Status:** P4.0 Architecture Freeze (Final Clarified Baseline)  
> **Applicability:** Quiz Management, Question & Option Authoring, Quiz-Taking Engine, Server-Side Grading, and Progress Integration.  
> **Prerequisites:** P1 Security & RBAC, P2 Institutional Catalog, P3 Enrollment & Progress Subsystem.  
> **No Implementation Permitted in P4.0:** This document specifies the architectural blueprint. Implementation begins in Phase P4.1 upon authorization.

---

## 1. Domain Model & Relational Schema

Quizzes are structured as first-class curricular assessment nodes positioned within a Course Module:

```
┌──────────────────┐               ┌──────────────────┐
│     modules      │               │   enrollments    │
│  (Course Section)│               │ (Student Access) │
└────────┬─────────┘               └────────┬─────────┘
         │ 1                                │ 1
         │                                  │
         │ * (ON DELETE CASCADE)            │ * (ON DELETE CASCADE)
┌────────▼──────────────────────────────────┼─────────────────────┐
│                     quizzes               │                     │
│───────────────────────────────────────────│                     │
│  id: uuid (PK)                            │                     │
│  module_id: uuid (FK -> modules.id)       │                     │
│  title: varchar(200)                      │                     │
│  description: text                        │                     │
│  quiz_type: enum (KNOWLEDGE_CHECK/FINAL)  │                     │
│  position: integer                        │                     │
│  passing_score_percentage: integer (70)   │                     │
│  max_attempts: integer (nullable, def 3)  │                     │
│  time_limit_minutes: integer (nullable)   │                     │
│  status: quiz_status (DRAFT/PUB/ARCHIVED) │                     │
└────────┬──────────────────────────────────┘                     │
         │ 1                                                      │
         │                                                        │
         │ * (ON DELETE CASCADE)                                  │
┌────────▼──────────────────┐                                     │
│      quiz_questions       │                                     │
│───────────────────────────│                                     │
│  id: uuid (PK)            │                                     │
│  quiz_id: uuid (FK)       │                                     │
│  question_text: text      │                                     │
│  question_type: enum      │                                     │
│  position: integer        │                                     │
│  points: integer (def 1)  │                                     │
│  explanation: text        │                                     │
└────────┬──────────────────┘                                     │
         │ 1                                                      │
         │                                                        │
         │ * (ON DELETE CASCADE)                                  │
┌────────▼──────────────────┐                              ┌──────▼────────────┐
│   quiz_question_options   │                              │   quiz_attempts   │
│───────────────────────────│                              │───────────────────│
│  id: uuid (PK)            │                              │  id: uuid (PK)    │
│  question_id: uuid (FK)   │                              │  quiz_id: uuid(FK)│
│  option_text: text        │                              │  enrollment_id:FK │
│  position: integer        │                              │  student_id:FK    │
│  is_correct: boolean      │                              │  attempt_number   │
└───────────────────────────┘                              │  status: enum     │
                                                           │  score: integer   │
                                                           │  percentage: num  │
                                                           │  is_passed: bool  │
                                                           └────────┬──────────┘
                                                                    │ 1
                                                                    │ * (CASCADE)
                                                           ┌────────▼──────────┐
                                                           │quiz_attempt_answer│
                                                           │───────────────────│
                                                           │  id: uuid (PK)    │
                                                           │  attempt_id: (FK) │
                                                           │  question_id:(FK) │
                                                           │  selected_opts:[] │
                                                           │  is_correct: bool │
                                                           │  points_awarded   │
                                                           └───────────────────┘
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
  numeric,
  boolean,
  timestamp,
  uniqueIndex,
  index,
  pgEnum,
} from 'drizzle-orm/pg-core';
import { modules } from './modules';
import { enrollments } from './enrollments';
import { users } from './users';

// --- ENUMS ---
export const quizStatusEnum = pgEnum('quiz_status', ['DRAFT', 'PUBLISHED', 'ARCHIVED']);
export const quizTypeEnum = pgEnum('quiz_type', ['KNOWLEDGE_CHECK', 'FINAL_EXAM']);
export const questionTypeEnum = pgEnum('question_type', [
  'SINGLE_CHOICE',
  'MULTIPLE_CHOICE',
  'TRUE_FALSE',
]);
export const attemptStatusEnum = pgEnum('attempt_status', [
  'IN_PROGRESS',
  'SUBMITTED',
  'ABANDONED',
]);

// --- QUIZZES TABLE ---
export const quizzes = pgTable(
  'quizzes',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    moduleId: uuid('module_id')
      .references(() => modules.id, { onDelete: 'cascade' })
      .notNull(),
    title: varchar('title', { length: 200 }).notNull(),
    description: text('description'),
    quizType: quizTypeEnum('quiz_type').default('KNOWLEDGE_CHECK').notNull(),
    position: integer('position').notNull(),
    passingScorePercentage: integer('passing_score_percentage').default(70).notNull(),
    maxAttempts: integer('max_attempts').default(3), // null = unlimited
    timeLimitMinutes: integer('time_limit_minutes'), // null = untimed
    status: quizStatusEnum('status').default('DRAFT').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('quizzes_module_position_uq').on(table.moduleId, table.position),
    index('quizzes_module_id_idx').on(table.moduleId),
    index('quizzes_status_idx').on(table.status),
    index('quizzes_quiz_type_idx').on(table.quizType),
  ]
);

// --- QUIZ QUESTIONS TABLE ---
export const quizQuestions = pgTable(
  'quiz_questions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    quizId: uuid('quiz_id')
      .references(() => quizzes.id, { onDelete: 'cascade' })
      .notNull(),
    questionText: text('question_text').notNull(),
    questionType: questionTypeEnum('question_type').default('SINGLE_CHOICE').notNull(),
    position: integer('position').notNull(),
    points: integer('points').default(1).notNull(),
    explanation: text('explanation'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('quiz_questions_quiz_position_uq').on(table.quizId, table.position),
    index('quiz_questions_quiz_id_idx').on(table.quizId),
  ]
);

// --- QUIZ QUESTION OPTIONS TABLE ---
export const quizQuestionOptions = pgTable(
  'quiz_question_options',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    questionId: uuid('question_id')
      .references(() => quizQuestions.id, { onDelete: 'cascade' })
      .notNull(),
    optionText: text('option_text').notNull(),
    position: integer('position').notNull(),
    isCorrect: boolean('is_correct').default(false).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('quiz_question_options_q_pos_uq').on(table.questionId, table.position),
    index('quiz_question_options_question_id_idx').on(table.questionId),
  ]
);

// --- QUIZ ATTEMPTS TABLE ---
export const quizAttempts = pgTable(
  'quiz_attempts',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    quizId: uuid('quiz_id')
      .references(() => quizzes.id, { onDelete: 'restrict' })
      .notNull(),
    enrollmentId: uuid('enrollment_id')
      .references(() => enrollments.id, { onDelete: 'cascade' })
      .notNull(),
    studentId: uuid('student_id')
      .references(() => users.id, { onDelete: 'restrict' })
      .notNull(),
    attemptNumber: integer('attempt_number').notNull(),
    status: attemptStatusEnum('status').default('IN_PROGRESS').notNull(),
    score: integer('score').default(0).notNull(),
    totalPoints: integer('total_points').default(0).notNull(),
    percentage: numeric('percentage', { precision: 5, scale: 2 }).default('0.00').notNull(),
    isPassed: boolean('is_passed').default(false).notNull(),
    startedAt: timestamp('started_at', { withTimezone: true }).defaultNow().notNull(),
    submittedAt: timestamp('submitted_at', { withTimezone: true }),
    lastSavedAt: timestamp('last_saved_at', { withTimezone: true }).defaultNow().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('quiz_attempts_enrollment_quiz_num_uq').on(
      table.enrollmentId,
      table.quizId,
      table.attemptNumber
    ),
    index('quiz_attempts_enrollment_id_idx').on(table.enrollmentId),
    index('quiz_attempts_quiz_id_idx').on(table.quizId),
    index('quiz_attempts_student_id_idx').on(table.studentId),
    index('quiz_attempts_status_idx').on(table.status),
  ]
);

// --- QUIZ ATTEMPT ANSWERS TABLE ---
export const quizAttemptAnswers = pgTable(
  'quiz_attempt_answers',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    attemptId: uuid('attempt_id')
      .references(() => quizAttempts.id, { onDelete: 'cascade' })
      .notNull(),
    questionId: uuid('question_id')
      .references(() => quizQuestions.id, { onDelete: 'restrict' })
      .notNull(),
    selectedOptionIds: text('selected_option_ids').array().notNull(),
    isCorrect: boolean('is_correct').default(false).notNull(),
    pointsAwarded: integer('points_awarded').default(0).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('quiz_attempt_answers_attempt_q_uq').on(table.attemptId, table.questionId),
    index('quiz_attempt_answers_attempt_id_idx').on(table.attemptId),
  ]
);
```

---

## 3. Relational Foreign Key Integrity & Protection Rules

1. **`quizzes.module_id` (`modules.id`) — `ON DELETE CASCADE`:**
   - Removing an unpublished draft module cascades to its quiz structures.
   - If students have submitted attempts on the quiz, `quizAttempts.quizId` (`ON DELETE RESTRICT`) actively prevents module and quiz deletion.
2. **`quizQuestions.quizId` (`quizzes.id`) — `ON DELETE CASCADE`:**
   - Questions and options are owned directly by the parent quiz.
3. **`quizAttempts.quizId` (`quizzes.id`) — `ON DELETE RESTRICT`:**
   - Protects academic integrity: A quiz with recorded student attempts cannot be deleted. Instructors must mark it `ARCHIVED` instead.
4. **`quizAttempts.studentId` (`users.id`) — `ON DELETE RESTRICT`:**
   - User accounts with academic assessment records cannot be hard-deleted.
5. **`quizAttempts.enrollmentId` (`enrollments.id`) — `ON DELETE CASCADE`:**
   - If an enrollment is deleted via institutional administrative purge, child attempt logs cascade cleanly.

---

## 4. Anti-Cheat Engine & Strict Answer Security

To completely prevent client-side answer extraction, the API enforces a strict separation of serialization DTOs:

### 4.1 Authoring DTO (Admin/Instructor Only)
```json
{
  "id": "q-101",
  "questionText": "What is the primary role of NestJS Guards?",
  "questionType": "SINGLE_CHOICE",
  "points": 1,
  "explanation": "Guards determine whether a given request will be handled by the route handler or not, based on permissions/roles.",
  "options": [
    { "id": "opt-1", "optionText": "Transformation of request body", "isCorrect": false },
    { "id": "opt-2", "optionText": "Authentication and authorization checks", "isCorrect": true },
    { "id": "opt-3", "optionText": "Handling unhandled database exceptions", "isCorrect": false }
  ]
}
```

### 4.2 Student Taking DTO (Active In-Progress Attempt)
When a student opens a quiz or creates an in-progress attempt, the API strips all answers and explanations:
```json
{
  "id": "q-101",
  "questionText": "What is the primary role of NestJS Guards?",
  "questionType": "SINGLE_CHOICE",
  "points": 1,
  "options": [
    { "id": "opt-1", "optionText": "Transformation of request body" },
    { "id": "opt-2", "optionText": "Authentication and authorization checks" },
    { "id": "opt-3", "optionText": "Handling unhandled database exceptions" }
  ]
}
```
*Notice:* `isCorrect`, `explanation`, and option validation flags are omitted from the student-facing payload.

### 4.3 Student Review DTO (Post-Submission Only)
Only after `attempt.status === 'SUBMITTED'`, the review endpoint releases grading results:
```json
{
  "questionId": "q-101",
  "questionText": "What is the primary role of NestJS Guards?",
  "selectedOptionIds": ["opt-2"],
  "correctOptionIds": ["opt-2"],
  "isCorrect": true,
  "pointsAwarded": 1,
  "explanation": "Guards determine whether a given request will be handled by the route handler..."
}
```

---

## 5. Grading Engine & Scoring Formulas

### 5.1 Deterministic Evaluation Logic
Upon submission, the server executes:

```typescript
for (const question of quiz.questions) {
  const studentAnswer = submittedAnswers.find(a => a.questionId === question.id);
  const correctOptions = question.options.filter(o => o.isCorrect).map(o => o.id);
  const selectedOptions = studentAnswer?.selectedOptionIds || [];

  let isCorrect = false;
  if (question.questionType === 'SINGLE_CHOICE' || question.questionType === 'TRUE_FALSE') {
    isCorrect = selectedOptions.length === 1 && selectedOptions[0] === correctOptions[0];
  } else if (question.questionType === 'MULTIPLE_CHOICE') {
    // Exact set match: must select all correct options and zero incorrect options
    const selectedSet = new Set(selectedOptions);
    const correctSet = new Set(correctOptions);
    isCorrect = selectedSet.size === correctSet.size && [...selectedSet].every(id => correctSet.has(id));
  }

  const pointsAwarded = isCorrect ? question.points : 0;
  totalScore += pointsAwarded;
  maxScore += question.points;
}
```

### 5.2 Percentage & Passing Threshold
$$\text{Score Percentage} = \text{round}\left( \frac{\text{Total Score}}{\text{Total Points}} \times 100 \right)$$
$$\text{isPassed} = \text{Score Percentage} \ge \text{quiz.passingScorePercentage}$$

---

## 6. Quiz Progress & Course Completion Integration

### 6.1 Unified Progress Formula & Strict Inclusion Filter
Course progress reflects all pedagogical requirements in the active published curriculum:

$$\text{Course Progress \%} = \text{round}\left( \frac{\text{Completed Lessons} + \text{Passed Quizzes}}{\text{Total Lessons} + \text{Published Quizzes}} \times 100 \right)$$

1. **Strict Inclusion Filter:**
   - **Only quizzes with status `PUBLISHED` count toward course progress and completion.**
   - Quizzes in `DRAFT` or `ARCHIVED` status are strictly excluded from both the denominator and numerator.
   - `Passed Quizzes` represents the count of distinct `PUBLISHED` quizzes for which the student has at least one attempt with `status = 'SUBMITTED'` and `is_passed = true`.

### 6.2 Curriculum Lifecycle Transitions & Effect on Course Progress
1. **`DRAFT` Quiz Creation / Mutation:**
   - Drafting questions, editing options, or creating draft quizzes has **zero effect** on learner progress percentages or completion states.
2. **Publishing a Quiz (`DRAFT` → `PUBLISHED`):**
   - The completion denominator increases by 1.
   - Any enrollment previously marked `status = 'COMPLETED'` reverts to `status = 'ACTIVE'` with `completed_at = null`, because the student must complete and pass this new requirement to regain 100% completion.
   - All `ACTIVE` enrollments have their `progress_percentage` re-evaluated.
3. **Archiving a Quiz (`PUBLISHED` → `ARCHIVED`) or Quiz Deletion:**
   - The completion denominator decreases by 1.
   - Course progress is recomputed transactionally for all active enrollments.
   - If an active student had completed all lessons and other quizzes, and was blocked only by the now-archived quiz, their progress now reaches 100%. In this event, their enrollment automatically transitions to `COMPLETED` (`completed_at = NOW()`) and queues certificate issuance.

### 6.3 Certificate Invariant After Curriculum Mutation
- **AN ALREADY-ISSUED CERTIFICATE IS A HISTORICAL COMPLETION RECORD.**
- Adding new required lessons or quizzes later **MUST NOT** automatically revoke or invalidate a previously issued certificate.
- When new content is published, the learner's current enrollment may return to `ACTIVE` (with `completed_at = null`) and require the new content for renewed course completion, while the historical certificate remains valid (`status = 'ACTIVE'`) unless an administrator explicitly revokes it.

### 6.4 Completion Trigger Sequence
```
Student submits attempt
           │
           ▼
Server evaluates answers (isPassed = true?)
           │
     ┌─────┴────────────────┐
     │                      │
   Yes                      No
     │                      │
     ▼                      ▼
Update Attempt         Update Attempt
(is_passed = true)     (is_passed = false)
     │                      │
     ▼                      ▼
Check Total Progress   Student may retry
(Lessons + Quizzes)    (if attempts remain)
     │
 100% Complete?
     │
     ▼
Atomically set:
enrollments.status = 'COMPLETED'
enrollments.completed_at = NOW()
     │
     ▼
Queue Certificate Issuance (Historical Snapshot Frozen)
```
