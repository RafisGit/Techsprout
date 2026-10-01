import type {
  LearningCurriculumDto,
  CurriculumItemDto,
  CurriculumModuleDto,
  CurriculumLessonDto,
} from '@techsprout/contracts';

/**
 * Flattens all curriculum items across modules in authoritative order.
 * Strictly consumes module.items as the authoritative order, falling back
 * to module.lessons as LESSON items only if items is undefined.
 */
export function flattenCurriculumItems(
  curriculum?: LearningCurriculumDto | null
): CurriculumItemDto[] {
  if (!curriculum?.modules) return [];

  const sortedModules = curriculum.modules.slice().sort((a, b) => a.position - b.position);

  const flatItems: CurriculumItemDto[] = [];
  for (const mod of sortedModules) {
    if (mod.items && mod.items.length > 0) {
      // module.items is the sole authoritative ordering source
      flatItems.push(...mod.items);
    } else if (mod.lessons && mod.lessons.length > 0) {
      // Fallback for legacy / mock payloads
      const fallbackLessons = mod.lessons.slice().sort((a, b) => a.position - b.position);
      for (const lesson of fallbackLessons) {
        flatItems.push({
          ...lesson,
          type: 'LESSON',
        });
      }
    }
  }

  return flatItems;
}

export interface AdjacentCurriculumItems {
  previousItem: CurriculumItemDto | null;
  nextItem: CurriculumItemDto | null;
  currentIndex: number;
  totalItems: number;
}

/**
 * Finds adjacent items (previous / next) given a current lesson or quiz ID.
 */
export function getAdjacentCurriculumItems(
  curriculum: LearningCurriculumDto | null | undefined,
  currentId: string
): AdjacentCurriculumItems {
  const items = flattenCurriculumItems(curriculum);
  const currentIndex = items.findIndex((it) => it.id === currentId);

  if (currentIndex === -1) {
    return {
      previousItem: null,
      nextItem: null,
      currentIndex: -1,
      totalItems: items.length,
    };
  }

  return {
    previousItem: currentIndex > 0 ? items[currentIndex - 1] : null,
    nextItem: currentIndex < items.length - 1 ? items[currentIndex + 1] : null,
    currentIndex,
    totalItems: items.length,
  };
}

/**
 * Returns the appropriate URL path for a curriculum item.
 */
export function getCurriculumItemHref(
  courseSlug: string,
  item: CurriculumItemDto
): string {
  if (item.type === 'QUIZ') {
    return `/learn/${courseSlug}/quiz/${item.id}`;
  }
  return `/learn/${courseSlug}/${item.id}`;
}
