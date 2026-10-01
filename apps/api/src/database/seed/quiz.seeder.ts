import { eq, and } from 'drizzle-orm';
import { modules, quizzes, quizQuestions, quizQuestionOptions } from '../schema';
import { SEED_KNOWLEDGE_CHECK_QUIZ, SEED_FINAL_EXAM_QUIZ, SeedQuiz } from './quiz-fixtures';
import { DrizzleDB } from '../drizzle.provider';

export interface QuizSeedResult {
  quizzesSeeded: number;
  questionsSeeded: number;
  optionsSeeded: number;
}

export async function seedQuizzes(db: DrizzleDB): Promise<QuizSeedResult> {
  console.log('--- Running Quiz Seeder ---');

  // Fetch available modules to attach quizzes to
  const allModules = await db
    .select({ id: modules.id, courseId: modules.courseId, position: modules.position })
    .from(modules)
    .orderBy(modules.courseId, modules.position);

  if (allModules.length === 0) {
    console.log('No modules found in database. Seed catalog before seeding quizzes.');
    return { quizzesSeeded: 0, questionsSeeded: 0, optionsSeeded: 0 };
  }

  // Group modules by course
  const courseModulesMap = new Map<string, typeof allModules>();
  for (const mod of allModules) {
    const list = courseModulesMap.get(mod.courseId) || [];
    list.push(mod);
    courseModulesMap.set(mod.courseId, list);
  }

  let totalQuizzes = 0;
  let totalQuestions = 0;
  let totalOptions = 0;

  // For the first course that has at least 2 modules:
  // - Attach KNOWLEDGE_CHECK to module 1 (position 10)
  // - Attach FINAL_EXAM to the last module (position 10)
  const firstCourseId = Array.from(courseModulesMap.keys())[0];
  const firstCourseModules = courseModulesMap.get(firstCourseId) || [];

  if (firstCourseModules.length > 0) {
    const module1 = firstCourseModules[0];
    const lastModule = firstCourseModules[firstCourseModules.length - 1];

    // Seed Knowledge Check Quiz into module 1
    const res1 = await seedSingleQuiz(db, module1.id, 10, SEED_KNOWLEDGE_CHECK_QUIZ);
    totalQuizzes += res1.quizzes;
    totalQuestions += res1.questions;
    totalOptions += res1.options;

    // Seed Final Exam Quiz into last module
    const targetModuleForFinal = lastModule.id !== module1.id ? lastModule.id : module1.id;
    const finalPosition = lastModule.id !== module1.id ? 10 : 20;
    const res2 = await seedSingleQuiz(db, targetModuleForFinal, finalPosition, SEED_FINAL_EXAM_QUIZ);
    totalQuizzes += res2.quizzes;
    totalQuestions += res2.questions;
    totalOptions += res2.options;
  }

  console.log(
    `Quiz seed finished: ${totalQuizzes} quizzes, ${totalQuestions} questions, ${totalOptions} options.`
  );

  return {
    quizzesSeeded: totalQuizzes,
    questionsSeeded: totalQuestions,
    optionsSeeded: totalOptions,
  };
}

async function seedSingleQuiz(
  db: DrizzleDB,
  moduleId: string,
  position: number,
  fixture: SeedQuiz
): Promise<{ quizzes: number; questions: number; options: number }> {
  // Idempotency check: see if a quiz with matching moduleId and title already exists
  const [existingQuiz] = await db
    .select({ id: quizzes.id })
    .from(quizzes)
    .where(and(eq(quizzes.moduleId, moduleId), eq(quizzes.title, fixture.title)))
    .limit(1);

  if (existingQuiz) {
    console.log(`- Quiz already exists: "${fixture.title}" in module ${moduleId}`);
    return { quizzes: 0, questions: 0, options: 0 };
  }

  // Insert quiz
  const [createdQuiz] = await db
    .insert(quizzes)
    .values({
      moduleId,
      title: fixture.title,
      description: fixture.description,
      quizType: fixture.quizType,
      position,
      passingScorePercentage: fixture.passingScorePercentage,
      maxAttempts: fixture.maxAttempts,
      timeLimitMinutes: fixture.timeLimitMinutes,
      status: fixture.status,
    })
    .returning();

  console.log(`- Created quiz: "${createdQuiz.title}" (${createdQuiz.quizType})`);

  let questionsCount = 0;
  let optionsCount = 0;

  for (const q of fixture.questions) {
    const [createdQ] = await db
      .insert(quizQuestions)
      .values({
        quizId: createdQuiz.id,
        questionText: q.questionText,
        questionType: q.questionType,
        position: q.position,
        points: q.points,
        explanation: q.explanation,
      })
      .returning();

    questionsCount++;

    for (const opt of q.options) {
      await db.insert(quizQuestionOptions).values({
        questionId: createdQ.id,
        optionText: opt.text,
        position: opt.position,
        isCorrect: opt.isCorrect,
      });
      optionsCount++;
    }
  }

  return {
    quizzes: 1,
    questions: questionsCount,
    options: optionsCount,
  };
}
