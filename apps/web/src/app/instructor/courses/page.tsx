import { Metadata } from 'next';
import { InstructorCoursesClient } from '@/components/instructor/InstructorCoursesClient';

export const metadata: Metadata = {
  title: 'My Teaching Courses | TechSprout School',
  description: 'View and manage your authored courses and curriculum.',
};

export default function InstructorCoursesPage() {
  return <InstructorCoursesClient />;
}
