'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import {
  fetchAdminReviewQueue,
  type ReviewQueueItem,
} from '@/lib/api/instructor';
import { ReviewApprovalModal } from '@/components/admin/ReviewApprovalModal';
import { ReviewRejectionModal } from '@/components/admin/ReviewRejectionModal';
import { Button } from '@/components/ui/button';
import { useCurrentUser } from '@/lib/useCurrentUser';
import {
  Clock,
  CheckCircle2,
  XCircle,
  FileText,
  User,
  Calendar,
  ChevronLeft,
  ChevronRight,
  BookOpen,
  AlertCircle,
  ExternalLink,
  ShieldAlert,
} from 'lucide-react';

export function AdminReviewQueueClient() {
  const { data: currentUser, isLoading: isLoadingUser } = useCurrentUser();
  const isAdmin = currentUser?.role === 'admin';

  const [page, setPage] = useState(1);
  const limit = 10;

  const [approvingItem, setApprovingItem] = useState<ReviewQueueItem | null>(null);
  const [rejectingItem, setRejectingItem] = useState<ReviewQueueItem | null>(null);

  const {
    data: queueData,
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ['adminReviewQueue', page, limit],
    queryFn: () => fetchAdminReviewQueue({ page, limit, status: 'PENDING' }),
    enabled: isAdmin,
  });

  if (!isLoadingUser && !isAdmin) {
    return (
      <div className='max-w-2xl mx-auto p-8 bg-red-50 border border-red-200 text-red-800 rounded-2xl shadow-xs text-center my-8'>
        <ShieldAlert className='w-12 h-12 text-red-600 mx-auto mb-3' />
        <h2 className='text-xl font-bold mb-1'>Administrator Access Required</h2>
        <p className='text-xs text-gray-600 mb-4'>
          The course review queue is restricted to institutional administrators.
        </p>
      </div>
    );
  }

  const items = queueData?.items || [];
  const pagination = queueData?.pagination || { page: 1, limit: 10, total: 0, totalPages: 1 };

  return (
    <div className='space-y-6'>
      {/* Header */}
      <div className='bg-white p-6 rounded-2xl border border-gray-200 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4'>
        <div>
          <div className='flex items-center gap-3'>
            <h1 className='text-2xl font-bold text-gray-900'>Course Review Queue</h1>
            <span className='px-3 py-1 rounded-full text-xs font-bold bg-blue-50 text-blue-700 border border-blue-200'>
              {pagination.total} Pending
            </span>
          </div>
          <p className='text-sm text-gray-600 mt-1'>
            Inspect and evaluate courses submitted by instructors before approving publication to the public catalog.
          </p>
        </div>

        <div className='flex items-center gap-2'>
          <Button variant='outline' size='sm' onClick={() => refetch()} className='text-xs'>
            Refresh Queue
          </Button>
        </div>
      </div>

      {/* Queue Table Container */}
      <div className='bg-white rounded-2xl border border-gray-200 shadow-xs overflow-hidden'>
        {isLoading ? (
          <div className='p-6 space-y-4'>
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className='h-24 bg-gray-100 rounded-xl animate-pulse' />
            ))}
          </div>
        ) : isError ? (
          <div className='p-8 text-center'>
            <div className='w-12 h-12 rounded-2xl bg-red-50 text-red-600 mx-auto flex items-center justify-center mb-3'>
              <AlertCircle className='w-6 h-6' />
            </div>
            <p className='text-red-700 font-semibold'>Failed to load review queue.</p>
            <p className='text-gray-500 text-xs mt-1'>Please check your permissions and connection.</p>
            <Button variant='outline' size='sm' onClick={() => refetch()} className='mt-4'>
              Retry
            </Button>
          </div>
        ) : items.length === 0 ? (
          <div className='py-16 px-4 text-center'>
            <div className='w-16 h-16 rounded-2xl bg-emerald-50 text-emerald-600 mx-auto flex items-center justify-center mb-4'>
              <CheckCircle2 className='w-8 h-8' />
            </div>
            <h3 className='text-lg font-bold text-gray-900'>Review Queue is Clear</h3>
            <p className='text-sm text-gray-500 max-w-md mx-auto mt-1'>
              All course submissions have been reviewed and decided. New submissions will appear here when submitted by instructors.
            </p>
          </div>
        ) : (
          <div className='divide-y divide-gray-100'>
            {items.map((item) => (
              <div
                key={item.id}
                className='p-6 flex flex-col lg:flex-row lg:items-center justify-between gap-6 hover:bg-gray-50/50 transition-colors'
              >
                {/* Course & Instructor Info */}
                <div className='min-w-0 flex-1 space-y-2'>
                  <div className='flex items-center gap-3'>
                    <h3 className='font-bold text-gray-900 text-lg truncate'>
                      {item.course.title}
                    </h3>
                    <span className='px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200 flex items-center gap-1'>
                      <Clock className='w-3 h-3' />
                      <span>Pending Review</span>
                    </span>
                  </div>

                  <div className='flex flex-wrap items-center gap-4 text-xs text-gray-500'>
                    <span className='flex items-center gap-1.5'>
                      <User className='w-3.5 h-3.5 text-gray-400' />
                      Instructor: <strong className='text-gray-700'>{item.instructor.name}</strong> ({item.instructor.email})
                    </span>
                    <span className='flex items-center gap-1.5'>
                      <Calendar className='w-3.5 h-3.5 text-gray-400' />
                      Submitted: {new Date(item.submittedAt).toLocaleDateString()} at{' '}
                      {new Date(item.submittedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                    <span>
                      Price: <strong>{item.course.price} {item.course.currency}</strong>
                    </span>
                  </div>

                  {item.submissionNotes && (
                    <div className='p-2.5 bg-gray-50 rounded-lg border border-gray-200 text-xs text-gray-700 max-w-2xl'>
                      <span className='font-semibold text-gray-900'>Instructor Notes: </span>
                      {item.submissionNotes}
                    </div>
                  )}
                </div>

                {/* Administrative Actions */}
                <div className='flex flex-wrap items-center gap-2.5 flex-shrink-0'>
                  <Link href={`/admin/courses/${item.courseId}`}>
                    <Button variant='outline' size='sm' className='flex items-center gap-1.5'>
                      <FileText className='w-4 h-4' />
                      <span>Inspect Curriculum</span>
                    </Button>
                  </Link>

                  <Button
                    size='sm'
                    onClick={() => setApprovingItem(item)}
                    className='bg-emerald-600 hover:bg-emerald-700 text-white flex items-center gap-1.5'
                  >
                    <CheckCircle2 className='w-4 h-4' />
                    <span>Approve & Publish</span>
                  </Button>

                  <Button
                    size='sm'
                    variant='outline'
                    onClick={() => setRejectingItem(item)}
                    className='border-amber-300 text-amber-800 hover:bg-amber-50 flex items-center gap-1.5'
                  >
                    <XCircle className='w-4 h-4' />
                    <span>Request Revisions</span>
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Pagination Controls */}
        {pagination.totalPages > 1 && (
          <div className='p-4 border-t border-gray-100 flex items-center justify-between text-xs text-gray-600 bg-gray-50/50'>
            <span>
              Showing Page <strong>{pagination.page}</strong> of <strong>{pagination.totalPages}</strong> ({pagination.total} items)
            </span>
            <div className='flex items-center gap-2'>
              <Button
                variant='outline'
                size='sm'
                onClick={() => setPage((p) => Math.max(p - 1, 1))}
                disabled={pagination.page <= 1}
              >
                <ChevronLeft className='w-4 h-4 mr-1' />
                Previous
              </Button>
              <Button
                variant='outline'
                size='sm'
                onClick={() => setPage((p) => Math.min(p + 1, pagination.totalPages))}
                disabled={pagination.page >= pagination.totalPages}
              >
                Next
                <ChevronRight className='w-4 h-4 ml-1' />
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Approval Modal */}
      {approvingItem && (
        <ReviewApprovalModal
          courseId={approvingItem.courseId}
          courseTitle={approvingItem.course.title}
          instructorName={approvingItem.instructor.name}
          open={!!approvingItem}
          onOpenChange={(open) => !open && setApprovingItem(null)}
          onSuccess={() => refetch()}
        />
      )}

      {/* Rejection Modal */}
      {rejectingItem && (
        <ReviewRejectionModal
          courseId={rejectingItem.courseId}
          courseTitle={rejectingItem.course.title}
          instructorName={rejectingItem.instructor.name}
          open={!!rejectingItem}
          onOpenChange={(open) => !open && setRejectingItem(null)}
          onSuccess={() => refetch()}
        />
      )}
    </div>
  );
}
