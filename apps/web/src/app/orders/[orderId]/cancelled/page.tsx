'use client';

import React, { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { fetchOrderById } from '@/lib/api/orders';
import { Button } from '@/components/ui/button';
import { XCircle, ArrowLeft, RefreshCw, ShoppingCart } from 'lucide-react';
import type { OrderDto } from '@techsprout/contracts';

export default function OrderCancelledPage() {
  const params = useParams();
  const router = useRouter();
  const orderId = params?.orderId as string;

  const [order, setOrder] = useState<OrderDto | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (orderId && orderId !== 'unknown') {
      setIsLoading(true);
      fetchOrderById(orderId)
        .then((data) => setOrder(data))
        .catch(() => {
          // Non-critical: failure simply displays standard cancellation notice
        })
        .finally(() => setIsLoading(false));
    }
  }, [orderId]);

  const courseSlug = order?.items?.[0]?.courseId;

  return (
    <div className='min-h-[80vh] flex items-center justify-center px-4 py-16 bg-[#F8FAFC]'>
      <div className='max-w-md w-full bg-white rounded-3xl p-8 border border-gray-200 shadow-sm text-center space-y-6'>
        <div className='w-20 h-20 rounded-3xl bg-gray-100 text-gray-500 flex items-center justify-center mx-auto border border-gray-200'>
          <XCircle className='w-10 h-10' />
        </div>

        <div className='space-y-2'>
          <span className='inline-flex items-center text-[10px] font-bold uppercase tracking-wider text-gray-500 bg-gray-100 px-3 py-1 rounded-full'>
            Transaction Cancelled
          </span>
          <h1 className='text-2xl font-bold text-gray-900'>Payment Cancelled</h1>
          <p className='text-xs text-gray-500 leading-relaxed'>
            You cancelled the checkout session before completing the transaction. No funds were deducted from your bank or card.
          </p>
        </div>

        {order && (
          <div className='bg-gray-50 rounded-2xl p-4 border border-gray-100 text-xs text-left space-y-2'>
            <div className='flex justify-between'>
              <span className='text-gray-400'>Order:</span>
              <span className='font-mono font-semibold text-gray-800'>{order.orderNumber}</span>
            </div>
            <div className='flex justify-between'>
              <span className='text-gray-400'>Course:</span>
              <span className='font-semibold text-gray-800 truncate max-w-[200px]'>
                {order.items?.[0]?.courseTitle || 'TechSprout Course'}
              </span>
            </div>
            <div className='flex justify-between'>
              <span className='text-gray-400'>Amount:</span>
              <span className='font-bold text-gray-900'>
                {(order.payableCents / 100).toLocaleString()} {order.currency}
              </span>
            </div>
          </div>
        )}

        <div className='pt-2 flex flex-col gap-2.5'>
          <Link href='/courses' className='w-full'>
            <Button className='w-full rounded-2xl py-5 text-xs font-bold bg-primary text-white shadow-sm'>
              <ShoppingCart className='w-4 h-4 mr-2' />
              Browse Catalog
            </Button>
          </Link>
          <Link href='/my-courses' className='w-full'>
            <Button variant='outline' className='w-full rounded-2xl py-5 text-xs text-gray-600 border-gray-200'>
              <ArrowLeft className='w-4 h-4 mr-2' />
              Return to My Courses
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
