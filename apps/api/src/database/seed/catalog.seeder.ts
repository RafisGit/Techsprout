import { eq, and } from 'drizzle-orm';
import { categories, courses, modules, lessons, users, roles, userRoles } from '../schema';
import { SEED_CATEGORIES, SEED_COURSES } from './catalog-fixtures';
import { DrizzleDB } from '../drizzle.provider';

export interface CatalogSeedResult {
  categoriesSeeded: number;
  coursesSeeded: number;
  modulesSeeded: number;
  lessonsSeeded: number;
}

export async function seedCatalog(db: DrizzleDB, defaultInstructorId?: string): Promise<CatalogSeedResult> {
  console.log('--- Running Catalog Seeder ---');

  // 1. Resolve Instructor ID
  let instructorId = defaultInstructorId;

  if (!instructorId) {
    // Attempt lookup by seed email
    const [foundInstructor] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, 'instructor@techsprout.edu'))
      .limit(1);

    if (foundInstructor) {
      instructorId = foundInstructor.id;
    } else {
      // Fallback to any user with instructor or admin role
      const [anyAdminOrInstructor] = await db
        .select({ id: users.id })
        .from(users)
        .limit(1);

      if (!anyAdminOrInstructor) {
        throw new Error('No user exists in the database to assign as course instructor. Run user seed first.');
      }
      instructorId = anyAdminOrInstructor.id;
    }
  }

  // 2. Seed Categories idempotently
  console.log('Seeding catalog categories...');
  const categoryMap = new Map<string, string>(); // slug -> id

  for (const catData of SEED_CATEGORIES) {
    const existing = await db
      .select()
      .from(categories)
      .where(eq(categories.slug, catData.slug))
      .limit(1);

    if (existing.length === 0) {
      const [created] = await db
        .insert(categories)
        .values({
          name: catData.name,
          slug: catData.slug,
          description: catData.description,
          isActive: true,
        })
        .returning();

      categoryMap.set(catData.slug, created.id);
      console.log(`- Created category: ${catData.name} (${catData.slug})`);
    } else {
      categoryMap.set(catData.slug, existing[0].id);
      console.log(`- Category exists: ${catData.name} (${catData.slug})`);
    }
  }

  // 3. Seed Courses, Modules, and Lessons idempotently
  console.log('Seeding catalog courses, modules, and lessons...');
  let totalCourses = 0;
  let totalModules = 0;
  let totalLessons = 0;

  for (const courseData of SEED_COURSES) {
    const categoryId = categoryMap.get(courseData.categorySlug);
    if (!categoryId) {
      throw new Error(`Category "${courseData.categorySlug}" not found in categoryMap.`);
    }

    let courseId: string;
    const existingCourse = await db
      .select()
      .from(courses)
      .where(eq(courses.slug, courseData.slug))
      .limit(1);

    if (existingCourse.length === 0) {
      const [createdCourse] = await db
        .insert(courses)
        .values({
          categoryId,
          instructorId,
          title: courseData.title,
          slug: courseData.slug,
          shortDescription: courseData.shortDescription,
          description: courseData.description,
          status: courseData.status,
          visibility: courseData.visibility,
          price: courseData.price,
          currency: courseData.currency,
          level: courseData.level,
          language: courseData.language,
          durationMinutes: courseData.durationMinutes,
          publishedAt: new Date(courseData.publishedAt),
        })
        .returning();

      courseId = createdCourse.id;
      console.log(`- Created course: ${courseData.title} (${courseData.slug})`);
    } else {
      courseId = existingCourse[0].id;
      console.log(`- Course exists: ${courseData.title} (${courseData.slug})`);
    }
    totalCourses++;

    // Seed Modules for Course
    for (const moduleData of courseData.modules) {
      let moduleId: string;
      const existingModule = await db
        .select()
        .from(modules)
        .where(
          and(
            eq(modules.courseId, courseId),
            eq(modules.position, moduleData.position)
          )
        )
        .limit(1);

      if (existingModule.length === 0) {
        const [createdModule] = await db
          .insert(modules)
          .values({
            courseId,
            title: moduleData.title,
            description: moduleData.description,
            position: moduleData.position,
          })
          .returning();

        moduleId = createdModule.id;
      } else {
        moduleId = existingModule[0].id;
      }
      totalModules++;

      // Seed Lessons for Module
      for (const lessonData of moduleData.lessons) {
        const existingLesson = await db
          .select()
          .from(lessons)
          .where(
            and(
              eq(lessons.moduleId, moduleId),
              eq(lessons.position, lessonData.position)
            )
          )
          .limit(1);

        if (existingLesson.length === 0) {
          await db
            .insert(lessons)
            .values({
              moduleId,
              title: lessonData.title,
              description: lessonData.description,
              lessonType: lessonData.lessonType,
              position: lessonData.position,
              durationSeconds: lessonData.durationSeconds,
              isPreview: lessonData.isPreview,
              content: lessonData.content,
            });
        }
        totalLessons++;
      }
    }
  }

  console.log(`Catalog seed finished: ${SEED_CATEGORIES.length} categories, ${totalCourses} courses, ${totalModules} modules, ${totalLessons} lessons.`);

  return {
    categoriesSeeded: SEED_CATEGORIES.length,
    coursesSeeded: totalCourses,
    modulesSeeded: totalModules,
    lessonsSeeded: totalLessons,
  };
}
