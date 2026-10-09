import { Metadata } from 'next';
import { InstructorProfileClient } from '@/components/instructor/InstructorProfileClient';

export const metadata: Metadata = {
  title: 'Instructor Profile | TechSprout School',
  description: 'View educator profile and credentials.',
};

export default function InstructorProfilePage() {
  return <InstructorProfileClient />;
}
