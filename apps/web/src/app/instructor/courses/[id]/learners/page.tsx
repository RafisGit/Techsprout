import { Metadata } from 'next';
import { LearnerRosterClient } from '@/components/instructor/LearnerRosterClient';

export const metadata: Metadata = {
  title: 'Course Learner Roster | TechSprout Instructor',
  description: 'View student enrollments, completion rates, and learning progress.',
};

export default async function CourseLearnerRosterPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <LearnerRosterClient courseId={id} />;
}
