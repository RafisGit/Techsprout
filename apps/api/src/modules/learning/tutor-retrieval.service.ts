import { Injectable, Inject, HttpStatus } from '@nestjs/common';
import { eq, and } from 'drizzle-orm';
import { DRIZZLE_DB, DrizzleDB } from '../../database/drizzle.provider';
import { lessons, modules, courses, enrollments } from '../../database/schema';
import { ApiException } from '../../common/errors/api-error';
import { UserContext } from '../courses/courses.service';
import {
  TutorCitationDto,
  TutorRetrievalResultDto,
  ContextChunkDto,
} from '@techsprout/contracts';

interface ScoredChunk {
  chunk: ContextChunkDto;
  score: number;
}

@Injectable()
export class TutorRetrievalService {
  constructor(@Inject(DRIZZLE_DB) private readonly db: DrizzleDB) {}

  /**
   * Technical token normalizer:
   * Splits compound punctuated technical identifiers (e.g., "ci/cd", "node.js", "http-only")
   * into both exact compound tokens and constituent word stems (Config C baseline).
   */
  public tokenize(text: string): string[] {
    if (!text) return [];
    const normalized = text.toLowerCase();

    // 1. Extract compound technical tokens (e.g. "ci/cd", "node.js", "next.js", "nest.js")
    const technicalTokens = normalized.match(/[a-z0-9]+[./\-_][a-z0-9./\-_]*/g) || [];

    // 2. Extract standard alphanumeric words
    const standardWords = normalized.match(/[a-z0-9]+/g) || [];

    // 3. Decompose technical tokens into sub-tokens (e.g., "node.js" -> ["node", "js"])
    const subTokens = technicalTokens.flatMap((token) =>
      token.split(/[./\-_]/).filter((part) => part.length > 1)
    );

    const tokenSet = new Set<string>([...technicalTokens, ...standardWords, ...subTokens]);
    return Array.from(tokenSet);
  }

  /**
   * Chunks lesson content into semantic segments with title and module context.
   */
  public chunkLesson(
    courseId: string,
    lesson: {
      id: string;
      title: string;
      description?: string | null;
      content?: string | null;
      moduleId?: string | null;
      moduleTitle?: string | null;
    }
  ): ContextChunkDto[] {
    const chunks: ContextChunkDto[] = [];
    const fullText = [lesson.description, lesson.content].filter(Boolean).join('\n\n');

    if (!fullText.trim()) {
      // Chunk from title only if body is empty
      chunks.push({
        id: `${lesson.id}-0`,
        courseId,
        moduleId: lesson.moduleId,
        moduleTitle: lesson.moduleTitle,
        lessonId: lesson.id,
        lessonTitle: lesson.title,
        content: `Lesson: ${lesson.title}. Module: ${lesson.moduleTitle || 'General'}.`,
        tokens: this.tokenize(`${lesson.title} ${lesson.moduleTitle || ''}`),
      });
      return chunks;
    }

    // Split text into paragraphs / sections
    const paragraphs = fullText.split(/\n\s*\n/).filter((p) => p.trim().length > 0);
    let chunkIndex = 0;
    let currentChunkText = `Lesson: ${lesson.title}\n`;

    for (const p of paragraphs) {
      if ((currentChunkText + '\n' + p).split(/\s+/).length > 200 && currentChunkText.length > 100) {
        chunks.push({
          id: `${lesson.id}-${chunkIndex++}`,
          courseId,
          moduleId: lesson.moduleId,
          moduleTitle: lesson.moduleTitle,
          lessonId: lesson.id,
          lessonTitle: lesson.title,
          content: currentChunkText.trim(),
          tokens: this.tokenize(
            `${lesson.title} ${lesson.moduleTitle || ''} ${currentChunkText}`
          ),
        });
        currentChunkText = `Lesson: ${lesson.title}\n${p}`;
      } else {
        currentChunkText += `\n${p}`;
      }
    }

    if (currentChunkText.trim().length > 0) {
      chunks.push({
        id: `${lesson.id}-${chunkIndex}`,
        courseId,
        moduleId: lesson.moduleId,
        moduleTitle: lesson.moduleTitle,
        lessonId: lesson.id,
        lessonTitle: lesson.title,
        content: currentChunkText.trim(),
        tokens: this.tokenize(
          `${lesson.title} ${lesson.moduleTitle || ''} ${currentChunkText}`
        ),
      });
    }

    return chunks;
  }

  /**
   * Verify learner authorization for the course before retrieval.
   */
  public async verifyAccess(courseId: string, user: UserContext): Promise<void> {
    const [course] = await this.db.select().from(courses).where(eq(courses.id, courseId)).limit(1);

    if (!course) {
      throw new ApiException('Course not found', HttpStatus.NOT_FOUND, 'COURSE_NOT_FOUND');
    }

    if (user.role === 'admin' || (user.role === 'instructor' && course.instructorId === user.id)) {
      return;
    }

    const [enrollment] = await this.db
      .select()
      .from(enrollments)
      .where(
        and(
          eq(enrollments.studentId, user.id),
          eq(enrollments.courseId, courseId),
          eq(enrollments.status, 'ACTIVE')
        )
      )
      .limit(1);

    if (!enrollment) {
      throw new ApiException(
        'Learner does not possess an active enrollment in this course',
        HttpStatus.FORBIDDEN,
        'COURSE_NOT_ENROLLED'
      );
    }
  }

  /**
   * Grounded course context retrieval:
   * Retrieves relevant lesson citations strictly scoped to courseId with technical token matching.
   */
  public async retrieveContext(
    courseId: string,
    question: string,
    maxCitations: number = 5,
    user?: UserContext
  ): Promise<TutorRetrievalResultDto> {
    if (user) {
      await this.verifyAccess(courseId, user);
    }

    // Strict course boundary: fetch ONLY lessons from modules belonging to courseId
    const courseLessons = await this.db
      .select({
        id: lessons.id,
        title: lessons.title,
        description: lessons.description,
        content: lessons.content,
        moduleId: lessons.moduleId,
        moduleTitle: modules.title,
      })
      .from(lessons)
      .innerJoin(modules, eq(lessons.moduleId, modules.id))
      .where(eq(modules.courseId, courseId));

    if (courseLessons.length === 0) {
      return {
        courseId,
        query: question,
        citations: [],
        totalCandidateCount: 0,
        isGrounded: false,
        groundingNotice: 'This concept is not covered in this course curriculum',
      };
    }

    // Chunk all lessons in the course
    const allChunks: ContextChunkDto[] = courseLessons.flatMap((l) =>
      this.chunkLesson(courseId, l)
    );

    const queryTokens = this.tokenize(question);
    if (queryTokens.length === 0) {
      return {
        courseId,
        query: question,
        citations: [],
        totalCandidateCount: allChunks.length,
        isGrounded: false,
        groundingNotice: 'Query contained no searchable terms',
      };
    }

    // Score chunks against query tokens
    const scoredChunks: ScoredChunk[] = allChunks
      .map((chunk) => {
        let score = 0;
        const chunkTokenSet = new Set(chunk.tokens);

        for (const token of queryTokens) {
          if (chunkTokenSet.has(token)) {
            // Title exact match weight boost
            const titleMatch = chunk.lessonTitle.toLowerCase().includes(token);
            score += titleMatch ? 2.0 : 1.0;
          }
        }

        // Normalize score between 0.0 and 1.0
        const maxPossible = queryTokens.length * 2.0;
        const normalizedScore = maxPossible > 0 ? Math.min(1.0, score / maxPossible) : 0;

        return { chunk, score: normalizedScore };
      })
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score);

    // Grounding threshold: if top score < 0.20 or 0 matching chunks, reject as ungrounded
    const topScore = scoredChunks.length > 0 ? scoredChunks[0].score : 0;
    const isGrounded = topScore >= 0.20;

    if (!isGrounded) {
      return {
        courseId,
        query: question,
        citations: [],
        totalCandidateCount: scoredChunks.length,
        isGrounded: false,
        groundingNotice: 'This concept is not covered in this course curriculum',
      };
    }

    // Extract top citations (deduplicated by lessonId when possible)
    const selectedLessons = new Set<string>();
    const citations: TutorCitationDto[] = [];

    for (const item of scoredChunks) {
      if (citations.length >= maxCitations) break;
      if (!selectedLessons.has(item.chunk.lessonId) || citations.length < 2) {
        selectedLessons.add(item.chunk.lessonId);
        citations.push({
          lessonId: item.chunk.lessonId,
          lessonTitle: item.chunk.lessonTitle,
          moduleId: item.chunk.moduleId,
          moduleTitle: item.chunk.moduleTitle,
          chunkSnippet: item.chunk.content.slice(0, 300).trim() + (item.chunk.content.length > 300 ? '...' : ''),
          relevanceScore: Math.round(item.score * 100) / 100,
        });
      }
    }

    return {
      courseId,
      query: question,
      citations,
      totalCandidateCount: scoredChunks.length,
      isGrounded: true,
      groundingNotice: null,
    };
  }
}
