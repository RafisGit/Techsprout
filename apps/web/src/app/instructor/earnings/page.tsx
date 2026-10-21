import { Metadata } from 'next';
import { InstructorEarningsClient } from '@/components/instructor/InstructorEarningsClient';

export const metadata: Metadata = {
  title: 'Instructor Earnings & Payouts | TechSprout School',
  description: 'View double-entry ledger balance, escrow releases, and request payouts.',
};

export default function InstructorEarningsPage() {
  return <InstructorEarningsClient />;
}
