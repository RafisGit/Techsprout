import { Metadata } from 'next';
import { CourseAnalyticsClient } from '@/components/instructor/CourseAnalyticsClient';

export const metadata: Metadata = {
  title: 'Course Analytics | TechSprout Instructor',
  description: 'Track enrollment growth, syllabus completion rates, lesson drop-off, and quiz scores.',
};

export default async function CourseAnalyticsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <CourseAnalyticsClient courseId={id} />;
}
