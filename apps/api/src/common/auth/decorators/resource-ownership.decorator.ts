import { SetMetadata } from '@nestjs/common';

export type TargetResourceType =
  | 'course'
  | 'module'
  | 'lesson'
  | 'quiz'
  | 'quizQuestion'
  | 'quizOption'
  | 'media';

export interface ResourceOwnershipMetadata {
  resourceType: TargetResourceType;
  idParamKey: string;
}

export const RESOURCE_OWNERSHIP_KEY = 'resource_ownership';

/**
 * Decorator enforcing contextual resource-level ownership for instructors.
 * Admins bypass this check.
 *
 * @param resourceType The type of resource to verify
 * @param idParamKey The route param key holding the resource UUID (defaults to 'id')
 */
export const RequireOwnership = (
  resourceType: TargetResourceType,
  idParamKey = 'id'
) => SetMetadata(RESOURCE_OWNERSHIP_KEY, { resourceType, idParamKey });
