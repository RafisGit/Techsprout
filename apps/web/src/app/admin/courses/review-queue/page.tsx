import { Metadata } from 'next';
import { AdminReviewQueueClient } from '@/components/admin/AdminReviewQueueClient';

export const metadata: Metadata = {
  title: 'Course Review Queue | TechSprout Admin',
  description: 'Evaluate instructor course submissions for institutional publication.',
};

export default function AdminReviewQueuePage() {
  return <AdminReviewQueueClient />;
}
