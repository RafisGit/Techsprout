import { axiosInstance } from '@/lib/axiosInstance';
import type {
  DiscussionDto,
  DiscussionReplyDto,
  PaginatedDiscussionsDto,
  CreateDiscussionDto,
  UpdateDiscussionDto,
  CreateDiscussionReplyDto,
  UpdateDiscussionReplyDto,
  DiscussionListQuery,
} from '@techsprout/contracts';

export async function fetchDiscussions(
  courseId: string,
  lessonId: string,
  query?: Partial<DiscussionListQuery>
): Promise<PaginatedDiscussionsDto> {
  const response = await axiosInstance.get(
    `/api/v1/courses/${courseId}/lessons/${lessonId}/discussions`,
    { params: query }
  );
  return response.data.data;
}

export async function fetchDiscussion(
  courseId: string,
  lessonId: string,
  discussionId: string
): Promise<DiscussionDto & { replies: DiscussionReplyDto[] }> {
  const response = await axiosInstance.get(
    `/api/v1/courses/${courseId}/lessons/${lessonId}/discussions/${discussionId}`
  );
  return response.data.data;
}

export async function createDiscussion(
  courseId: string,
  lessonId: string,
  dto: CreateDiscussionDto
): Promise<DiscussionDto> {
  const response = await axiosInstance.post(
    `/api/v1/courses/${courseId}/lessons/${lessonId}/discussions`,
    dto
  );
  return response.data.data;
}

export async function updateDiscussion(
  courseId: string,
  lessonId: string,
  discussionId: string,
  dto: UpdateDiscussionDto
): Promise<DiscussionDto> {
  const response = await axiosInstance.patch(
    `/api/v1/courses/${courseId}/lessons/${lessonId}/discussions/${discussionId}`,
    dto
  );
  return response.data.data;
}

export async function deleteDiscussion(
  courseId: string,
  lessonId: string,
  discussionId: string
): Promise<void> {
  await axiosInstance.delete(
    `/api/v1/courses/${courseId}/lessons/${lessonId}/discussions/${discussionId}`
  );
}

export async function toggleDiscussionVote(
  courseId: string,
  lessonId: string,
  discussionId: string
): Promise<{ upvoted: boolean; upvoteCount: number }> {
  const response = await axiosInstance.post(
    `/api/v1/courses/${courseId}/lessons/${lessonId}/discussions/${discussionId}/vote`
  );
  return response.data.data;
}

export async function createDiscussionReply(
  courseId: string,
  lessonId: string,
  discussionId: string,
  dto: CreateDiscussionReplyDto
): Promise<DiscussionReplyDto> {
  const response = await axiosInstance.post(
    `/api/v1/courses/${courseId}/lessons/${lessonId}/discussions/${discussionId}/replies`,
    dto
  );
  return response.data.data;
}

export async function updateDiscussionReply(
  courseId: string,
  lessonId: string,
  discussionId: string,
  replyId: string,
  dto: UpdateDiscussionReplyDto
): Promise<DiscussionReplyDto> {
  const response = await axiosInstance.patch(
    `/api/v1/courses/${courseId}/lessons/${lessonId}/discussions/${discussionId}/replies/${replyId}`,
    dto
  );
  return response.data.data;
}

export async function deleteDiscussionReply(
  courseId: string,
  lessonId: string,
  discussionId: string,
  replyId: string
): Promise<void> {
  await axiosInstance.delete(
    `/api/v1/courses/${courseId}/lessons/${lessonId}/discussions/${discussionId}/replies/${replyId}`
  );
}

export async function toggleReplyVote(
  courseId: string,
  lessonId: string,
  discussionId: string,
  replyId: string
): Promise<{ upvoted: boolean; upvoteCount: number }> {
  const response = await axiosInstance.post(
    `/api/v1/courses/${courseId}/lessons/${lessonId}/discussions/${discussionId}/replies/${replyId}/vote`
  );
  return response.data.data;
}
