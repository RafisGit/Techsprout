import { Metadata } from 'next';
import { InstructorDashboardClient } from '@/components/instructor/InstructorDashboardClient';

export const metadata: Metadata = {
  title: 'Instructor Dashboard | TechSprout School',
  description: 'Manage your courses, track review submissions, and oversee curriculum.',
};

export default function InstructorDashboardPage() {
  return <InstructorDashboardClient />;
}
