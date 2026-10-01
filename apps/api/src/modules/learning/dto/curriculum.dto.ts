export interface CurriculumLessonDto {
  id: string;
  title: string;
  position: number;
  lessonType: string;
  durationSeconds: number;
  isPreview: boolean;
  progress: {
    status: string;
    watchPositionSeconds: number;
    completedAt: string | null;
  };
}

export interface CurriculumLessonItemDto extends CurriculumLessonDto {
  type: 'LESSON';
}

export interface CurriculumQuizItemDto {
  type: 'QUIZ';
  id: string;
  title: string;
  position: number;
  quizType: string;
  passingScorePercentage: number;
  timeLimitMinutes?: number | null;
  totalPoints: number;
  questionsCount: number;
  maxAttempts?: number | null;
  isPassed: boolean;
  userAttemptsCount: number;
  bestScorePercentage: number | null;
}

export type CurriculumItemDto = CurriculumLessonItemDto | CurriculumQuizItemDto;

export interface CurriculumModuleDto {
  id: string;
  title: string;
  position: number;
  lessons: CurriculumLessonDto[];
  items?: CurriculumItemDto[];
}

export interface LearningCurriculumDto {
  courseId: string;
  courseStatus: string;
  progressPercentage: number;
  completedLessonsCount: number;
  totalLessonsCount: number;
  publishedQuizzesCount?: number;
  passedQuizzesCount?: number;
  modules: CurriculumModuleDto[];
}
