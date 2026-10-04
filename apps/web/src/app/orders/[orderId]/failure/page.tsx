'use client';

import React, { useState, useEffect } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { fetchOrderById } from '@/lib/api/orders';
import { Button } from '@/components/ui/button';
import { AlertCircle, RotateCcw, ArrowLeft, HelpCircle } from 'lucide-react';
import type { OrderDto } from '@techsprout/contracts';

export default function OrderFailurePage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();

  const orderId = params?.orderId as string;
  const reasonParam = searchParams.get('reason');

  const [order, setOrder] = useState<OrderDto | null>(null);

  useEffect(() => {
    if (orderId && orderId !== 'unknown') {
      fetchOrderById(orderId)
        .then((data) => setOrder(data))
        .catch(() => {
          // Failure page still functions even if order cannot be loaded
        });
    }
  }, [orderId]);

  return (
    <div className='min-h-[80vh] flex items-center justify-center px-4 py-16 bg-[#F8FAFC]'>
      <div className='max-w-md w-full bg-white rounded-3xl p-8 border border-gray-200 shadow-sm text-center space-y-6'>
        <div className='w-20 h-20 rounded-3xl bg-red-50 text-red-500 flex items-center justify-center mx-auto border border-red-100'>
          <AlertCircle className='w-10 h-10' />
        </div>

        <div className='space-y-2'>
          <span className='inline-flex items-center text-[10px] font-bold uppercase tracking-wider text-red-600 bg-red-50 px-3 py-1 rounded-full border border-red-200'>
            Payment Declined
          </span>
          <h1 className='text-2xl font-bold text-gray-900'>Transaction Failed</h1>
          <p className='text-xs text-gray-500 leading-relaxed'>
            The payment gateway could not process your transaction. Please verify your payment details with your card issuer or bank and try again.
          </p>
        </div>

        {/* Reason banner if provided */}
        {reasonParam && (
          <div className='bg-red-50/70 border border-red-200/80 rounded-2xl p-4 text-xs text-red-700 text-left space-y-1'>
            <span className='font-bold'>Gateway Note:</span>
            <p className='break-words text-[11px]'>{decodeURIComponent(reasonParam)}</p>
          </div>
        )}

        {order && (
          <div className='bg-gray-50 rounded-2xl p-4 border border-gray-100 text-xs text-left space-y-2'>
            <div className='flex justify-between'>
              <span className='text-gray-400'>Order Reference:</span>
              <span className='font-mono font-semibold text-gray-800'>{order.orderNumber}</span>
            </div>
            <div className='flex justify-between'>
              <span className='text-gray-400'>Course:</span>
              <span className='font-semibold text-gray-800 truncate max-w-[200px]'>
                {order.items?.[0]?.courseTitle || 'TechSprout Course'}
              </span>
            </div>
            <div className='flex justify-between'>
              <span className='text-gray-400'>Payable Amount:</span>
              <span className='font-bold text-gray-900'>
                {(order.payableCents / 100).toLocaleString()} {order.currency}
              </span>
            </div>
          </div>
        )}

        <div className='pt-2 flex flex-col gap-2.5'>
          <Link href='/courses' className='w-full'>
            <Button className='w-full rounded-2xl py-5 text-xs font-bold bg-primary text-white shadow-sm'>
              <RotateCcw className='w-4 h-4 mr-2' />
              Retry Purchase
            </Button>
          </Link>
          <Link href='/contact' className='w-full'>
            <Button variant='outline' className='w-full rounded-2xl py-5 text-xs text-gray-600 border-gray-200'>
              <HelpCircle className='w-4 h-4 mr-2' />
              Need Assistance? Contact Support
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
