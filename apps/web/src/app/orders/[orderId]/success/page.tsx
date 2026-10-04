'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { fetchOrderById, fetchInvoiceByOrderId } from '@/lib/api/orders';
import { Button } from '@/components/ui/button';
import {
  CheckCircle2,
  Clock,
  AlertCircle,
  XCircle,
  RotateCcw,
  FileText,
  ArrowRight,
  BookOpen,
  ShieldCheck,
  RefreshCw,
} from 'lucide-react';
import type { OrderDto, InvoiceDto } from '@techsprout/contracts';

const MAX_POLL_ATTEMPTS = 12; // 30 seconds max (12 * 2500ms)
const POLL_INTERVAL_MS = 2500;

export default function OrderSuccessPage() {
  const params = useParams();
  const router = useRouter();
  const orderId = params?.orderId as string;

  const [order, setOrder] = useState<OrderDto | null>(null);
  const [invoice, setInvoice] = useState<InvoiceDto | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Polling state
  const [pollCount, setPollCount] = useState(0);
  const [isPollingTimeout, setIsPollingTimeout] = useState(false);
  const pollTimerRef = useRef<NodeJS.Timeout | null>(null);

  const loadOrder = useCallback(
    async (isManualRefresh = false) => {
      if (!orderId || orderId === 'unknown') {
        setError('Invalid or missing order reference.');
        setIsLoading(false);
        return;
      }

      if (isManualRefresh) {
        setIsLoading(true);
        setIsPollingTimeout(false);
        setPollCount(0);
      }

      try {
        const orderData = await fetchOrderById(orderId);
        setOrder(orderData);
        setError(null);

        // If order is PAID, attempt to fetch associated invoice if available
        if (orderData.status === 'PAID') {
          if (orderData.invoiceId) {
            setInvoice({ id: orderData.invoiceId } as InvoiceDto);
          } else {
            // Fallback: query invoice by orderId
            try {
              const inv = await fetchInvoiceByOrderId(orderId);
              if (inv) setInvoice(inv);
            } catch {
              // Non-critical: invoice link will remain fallback
            }
          }
        }
      } catch (err: any) {
        const status = err?.response?.status;
        const msg = err?.response?.data?.message;

        if (status === 403) {
          setError('Access denied: You do not have permission to inspect this order.');
        } else if (status === 404) {
          setError('Order not found.');
        } else {
          setError(msg || 'Failed to fetch authoritative order status from the server.');
        }
      } finally {
        setIsLoading(false);
      }
    },
    [orderId]
  );

  // Initial load
  useEffect(() => {
    loadOrder();
    return () => {
      if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
    };
  }, [loadOrder]);

  // Bounded polling loop when status is PAYMENT_PROCESSING
  useEffect(() => {
    if (order && (order.status === 'PAYMENT_PROCESSING' || order.status === 'PENDING')) {
      if (pollCount >= MAX_POLL_ATTEMPTS) {
        setIsPollingTimeout(true);
        return;
      }

      pollTimerRef.current = setTimeout(() => {
        setPollCount((prev) => prev + 1);
        loadOrder();
      }, POLL_INTERVAL_MS);

      return () => {
        if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
      };
    }
  }, [order, pollCount, loadOrder]);

  // Loading state
  if (isLoading && !order) {
    return (
      <div className='min-h-[75vh] flex items-center justify-center px-4 bg-[#F8FAFC]'>
        <div className='max-w-md w-full bg-white rounded-3xl p-8 border border-gray-200 shadow-sm text-center space-y-4 animate-pulse'>
          <div className='w-16 h-16 rounded-2xl bg-gray-200 mx-auto' />
          <div className='h-6 w-3/4 bg-gray-200 rounded mx-auto' />
          <div className='h-4 w-1/2 bg-gray-200 rounded mx-auto' />
        </div>
      </div>
    );
  }

  // Error state (Access denied or Not found)
  if (error || !order) {
    return (
      <div className='min-h-[75vh] flex items-center justify-center px-4 py-16 bg-[#F8FAFC]'>
        <div className='max-w-md w-full bg-white rounded-3xl p-8 border border-gray-200 shadow-sm text-center space-y-4'>
          <div className='w-16 h-16 rounded-2xl bg-red-50 text-red-500 flex items-center justify-center mx-auto'>
            <AlertCircle className='w-8 h-8' />
          </div>
          <h2 className='text-2xl font-bold text-gray-900'>Unable to View Order</h2>
          <p className='text-xs text-gray-500 leading-relaxed'>{error || 'Order could not be loaded.'}</p>
          <div className='pt-2 flex justify-center gap-3'>
            <Link href='/courses'>
              <Button variant='outline' className='rounded-xl text-xs'>
                Browse Catalog
              </Button>
            </Link>
            <Button onClick={() => loadOrder(true)} className='rounded-xl text-xs bg-primary text-white'>
              Try Again
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const primaryItem = order.items?.[0];
  const courseTitle = primaryItem?.courseTitle || 'Purchased Course';
  const invoiceId = order.invoiceId || invoice?.id;

  // ==========================================
  // CASE 1: PAID (Success Confirmed)
  // ==========================================
  if (order.status === 'PAID') {
    return (
      <div className='min-h-screen bg-[#F8FAFC] py-16 px-4'>
        <div className='max-w-2xl mx-auto space-y-6'>
          {/* Main Success Card */}
          <div className='bg-white rounded-3xl border border-gray-200 p-8 shadow-sm text-center space-y-6'>
            <div className='w-20 h-20 rounded-3xl bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto shadow-xs border border-emerald-100'>
              <CheckCircle2 className='w-10 h-10' />
            </div>

            <div className='space-y-1.5'>
              <span className='inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-emerald-700 bg-emerald-50 px-3 py-1 rounded-full border border-emerald-200'>
                <ShieldCheck className='w-3.5 h-3.5' />
                Payment Confirmed
              </span>
              <h1 className='text-2xl lg:text-3xl font-extrabold text-gray-900 font-lexend'>
                Enrollment Complete!
              </h1>
              <p className='text-xs text-gray-500 max-w-md mx-auto'>
                Your payment has been verified by the bank. You now have full lifetime access to the course curriculum and certificates.
              </p>
            </div>

            {/* Authoritative Order Summary Box */}
            <div className='bg-gray-50 rounded-2xl p-5 border border-gray-100 text-left space-y-3 text-xs'>
              <div className='flex justify-between items-center text-gray-500'>
                <span>Order Reference:</span>
                <span className='font-mono font-bold text-gray-900'>{order.orderNumber}</span>
              </div>
              <div className='flex justify-between items-center text-gray-500'>
                <span>Course:</span>
                <span className='font-semibold text-gray-900 truncate max-w-[280px]'>
                  {courseTitle}
                </span>
              </div>
              <div className='flex justify-between items-center text-gray-500'>
                <span>Amount Paid:</span>
                <span className='font-bold text-primary text-sm'>
                  {(order.payableCents / 100).toLocaleString()} {order.currency}
                </span>
              </div>
              {order.discountCents > 0 && (
                <div className='flex justify-between items-center text-emerald-600'>
                  <span>Discount Applied:</span>
                  <span className='font-medium'>
                    -{(order.discountCents / 100).toLocaleString()} {order.currency}{' '}
                    {order.couponCode ? `(${order.couponCode})` : ''}
                  </span>
                </div>
              )}
              {order.paidAt && (
                <div className='flex justify-between items-center text-gray-500'>
                  <span>Paid At:</span>
                  <span>{new Date(order.paidAt).toLocaleString()}</span>
                </div>
              )}
            </div>

            {/* CTAs */}
            <div className='space-y-3 pt-2'>
              <Link href='/my-courses' className='w-full block'>
                <Button className='w-full rounded-2xl py-6 text-sm font-bold bg-primary hover:bg-primary/90 text-white shadow-md'>
                  <span>Start Learning</span>
                  <ArrowRight className='w-4 h-4 ml-2' />
                </Button>
              </Link>

              {invoiceId ? (
                <Link href={`/invoices/${invoiceId}`} className='w-full block'>
                  <Button
                    variant='outline'
                    className='w-full rounded-2xl py-5 text-xs font-semibold text-gray-700 hover:bg-gray-50 border-gray-200'
                  >
                    <FileText className='w-4 h-4 mr-2 text-primary' />
                    <span>View Official Tax Invoice</span>
                  </Button>
                </Link>
              ) : (
                <div className='text-[11px] text-gray-400'>
                  Invoice snapshot is archived and linked to your student account.
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ==========================================
  // CASE 2: PAYMENT_PROCESSING (Pending / Polling)
  // ==========================================
  if (order.status === 'PAYMENT_PROCESSING' || order.status === 'PENDING') {
    return (
      <div className='min-h-screen bg-[#F8FAFC] py-16 px-4'>
        <div className='max-w-md mx-auto space-y-6'>
          <div className='bg-white rounded-3xl border border-gray-200 p-8 shadow-sm text-center space-y-6'>
            <div className='w-20 h-20 rounded-3xl bg-amber-50 text-amber-500 flex items-center justify-center mx-auto border border-amber-100'>
              <Clock className='w-10 h-10 animate-pulse' />
            </div>

            <div className='space-y-2'>
              <h1 className='text-xl lg:text-2xl font-bold text-gray-900'>
                {isPollingTimeout
                  ? 'Payment Verification in Progress'
                  : 'Verifying your payment with the bank...'}
              </h1>
              <p className='text-xs text-gray-500 leading-relaxed'>
                {isPollingTimeout
                  ? 'Your transaction was received and is currently being cleared by SSLCommerz. This may take a few moments.'
                  : 'Please do not refresh or close this tab while we confirm your transaction with SSLCommerz.'}
              </p>
            </div>

            <div className='bg-gray-50 rounded-2xl p-4 border border-gray-100 text-xs space-y-2 text-left'>
              <div className='flex justify-between'>
                <span className='text-gray-500'>Order:</span>
                <span className='font-mono font-bold'>{order.orderNumber}</span>
              </div>
              <div className='flex justify-between'>
                <span className='text-gray-500'>Status:</span>
                <span className='font-bold text-amber-600 uppercase tracking-wider'>
                  {order.status}
                </span>
              </div>
            </div>

            <div className='pt-2 flex flex-col gap-2'>
              <Button
                onClick={() => loadOrder(true)}
                className='w-full rounded-2xl py-5 text-xs font-bold bg-primary text-white'
              >
                <RefreshCw className='w-3.5 h-3.5 mr-2' />
                <span>Check Status Again</span>
              </Button>
              <Link href='/my-courses'>
                <Button variant='ghost' className='w-full text-xs text-gray-500 hover:text-gray-800'>
                  Go to My Courses
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ==========================================
  // CASE 3: CANCELLED
  // ==========================================
  if (order.status === 'CANCELLED') {
    return (
      <div className='min-h-[75vh] flex items-center justify-center px-4 py-16 bg-[#F8FAFC]'>
        <div className='max-w-md w-full bg-white rounded-3xl p-8 border border-gray-200 shadow-sm text-center space-y-4'>
          <div className='w-16 h-16 rounded-2xl bg-gray-100 text-gray-500 flex items-center justify-center mx-auto'>
            <XCircle className='w-8 h-8' />
          </div>
          <h2 className='text-2xl font-bold text-gray-900'>Order Cancelled</h2>
          <p className='text-xs text-gray-500 leading-relaxed'>
            Order <strong>{order.orderNumber}</strong> was cancelled. Any reserved discounts or coupons have been released.
          </p>
          <div className='pt-2 flex justify-center gap-3'>
            <Link href='/courses'>
              <Button variant='outline' className='rounded-xl text-xs'>
                Browse Catalog
              </Button>
            </Link>
            <Link href='/my-courses'>
              <Button className='rounded-xl text-xs bg-primary text-white'>
                My Dashboard
              </Button>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // ==========================================
  // CASE 4: FAILED / REFUNDED
  // ==========================================
  return (
    <div className='min-h-[75vh] flex items-center justify-center px-4 py-16 bg-[#F8FAFC]'>
      <div className='max-w-md w-full bg-white rounded-3xl p-8 border border-gray-200 shadow-sm text-center space-y-4'>
        <div className='w-16 h-16 rounded-2xl bg-red-50 text-red-500 flex items-center justify-center mx-auto'>
          <AlertCircle className='w-8 h-8' />
        </div>
        <h2 className='text-2xl font-bold text-gray-900'>
          {order.status === 'REFUNDED' ? 'Order Refunded' : 'Payment Not Completed'}
        </h2>
        <p className='text-xs text-gray-500 leading-relaxed'>
          {order.status === 'REFUNDED'
            ? 'This order has been refunded and enrollment access has been revoked.'
            : `We could not verify payment for order ${order.orderNumber}.`}
        </p>
        <div className='pt-2 flex justify-center gap-3'>
          <Link href='/courses'>
            <Button variant='outline' className='rounded-xl text-xs'>
              Browse Catalog
            </Button>
          </Link>
          {order.status !== 'REFUNDED' && (
            <Button
              onClick={() => router.push('/courses')}
              className='rounded-xl text-xs bg-primary text-white font-bold'
            >
              <RotateCcw className='w-3.5 h-3.5 mr-1.5' />
              Retry Purchase
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
