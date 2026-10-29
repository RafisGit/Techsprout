import { axiosInstance } from '@/lib/axiosInstance';
import type {
  AssignmentDto,
  AssignmentSubmissionDto,
  AssignmentGradeDto,
  PaginatedAssignmentsDto,
  PaginatedSubmissionsDto,
  CreateAssignmentDto,
  UpdateAssignmentDto,
  GradeSubmissionDto,
  AssignmentListQuery,
  SubmissionListQuery,
} from '@techsprout/contracts';

export async function fetchAssignments(
  courseId: string,
  query?: Partial<AssignmentListQuery>
): Promise<PaginatedAssignmentsDto> {
  const response = await axiosInstance.get(`/api/v1/courses/${courseId}/assignments`, {
    params: query,
  });
  return response.data.data;
}

export async function fetchAssignment(
  courseId: string,
  assignmentId: string
): Promise<AssignmentDto> {
  const response = await axiosInstance.get(
    `/api/v1/courses/${courseId}/assignments/${assignmentId}`
  );
  return response.data.data;
}

export async function createAssignment(
  courseId: string,
  dto: CreateAssignmentDto
): Promise<AssignmentDto> {
  const response = await axiosInstance.post(`/api/v1/courses/${courseId}/assignments`, dto);
  return response.data.data;
}

export async function updateAssignment(
  courseId: string,
  assignmentId: string,
  dto: UpdateAssignmentDto
): Promise<AssignmentDto> {
  const response = await axiosInstance.patch(
    `/api/v1/courses/${courseId}/assignments/${assignmentId}`,
    dto
  );
  return response.data.data;
}

export async function deleteAssignment(courseId: string, assignmentId: string): Promise<void> {
  await axiosInstance.delete(`/api/v1/courses/${courseId}/assignments/${assignmentId}`);
}

export async function submitAssignment(
  courseId: string,
  assignmentId: string,
  file: File,
  studentNotes?: string
): Promise<AssignmentSubmissionDto> {
  const formData = new FormData();
  formData.append('file', file);
  if (studentNotes) {
    formData.append('studentNotes', studentNotes);
  }

  const response = await axiosInstance.post(
    `/api/v1/courses/${courseId}/assignments/${assignmentId}/submissions`,
    formData,
    {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    }
  );
  return response.data.data;
}

export async function fetchMySubmissions(
  courseId: string,
  assignmentId: string
): Promise<AssignmentSubmissionDto[]> {
  const response = await axiosInstance.get(
    `/api/v1/courses/${courseId}/assignments/${assignmentId}/submissions/my`
  );
  return response.data.data;
}

export async function fetchSubmissions(
  courseId: string,
  assignmentId: string,
  query?: Partial<SubmissionListQuery>
): Promise<PaginatedSubmissionsDto> {
  const response = await axiosInstance.get(
    `/api/v1/courses/${courseId}/assignments/${assignmentId}/submissions`,
    { params: query }
  );
  return response.data.data;
}

export async function fetchSubmission(
  courseId: string,
  assignmentId: string,
  submissionId: string
): Promise<AssignmentSubmissionDto> {
  const response = await axiosInstance.get(
    `/api/v1/courses/${courseId}/assignments/${assignmentId}/submissions/${submissionId}`
  );
  return response.data.data;
}

export async function gradeSubmission(
  courseId: string,
  assignmentId: string,
  submissionId: string,
  dto: GradeSubmissionDto
): Promise<AssignmentGradeDto> {
  const response = await axiosInstance.post(
    `/api/v1/courses/${courseId}/assignments/${assignmentId}/submissions/${submissionId}/grade`,
    dto
  );
  return response.data.data;
}
