'use client';

import React, { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { fetchInvoiceById } from '@/lib/api/orders';
import { Button } from '@/components/ui/button';
import {
  FileText,
  Printer,
  ArrowLeft,
  CheckCircle2,
  AlertCircle,
  ShieldCheck,
  Building,
} from 'lucide-react';
import type { InvoiceDto } from '@techsprout/contracts';

export default function InvoiceDetailPage() {
  const params = useParams();
  const router = useRouter();
  const invoiceId = params?.id as string;

  const [invoice, setInvoice] = useState<InvoiceDto | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!invoiceId) return;

    setIsLoading(true);
    fetchInvoiceById(invoiceId)
      .then((data) => {
        setInvoice(data);
        setError(null);
      })
      .catch((err) => {
        const status = err?.response?.status;
        const msg = err?.response?.data?.message;

        if (status === 403) {
          setError('Access denied: You are not authorized to view this invoice.');
        } else if (status === 404) {
          setError('Invoice not found.');
        } else {
          setError(msg || 'Failed to load invoice.');
        }
      })
      .finally(() => setIsLoading(false));
  }, [invoiceId]);

  if (isLoading) {
    return (
      <div className='min-h-screen bg-[#F8FAFC] py-16 px-4'>
        <div className='max-w-3xl mx-auto bg-white rounded-3xl p-8 border border-gray-200 shadow-sm animate-pulse space-y-6'>
          <div className='h-8 w-48 bg-gray-200 rounded' />
          <div className='h-24 bg-gray-100 rounded-xl' />
          <div className='h-48 bg-gray-100 rounded-xl' />
        </div>
      </div>
    );
  }

  if (error || !invoice) {
    return (
      <div className='min-h-[75vh] flex items-center justify-center px-4 py-16 bg-[#F8FAFC]'>
        <div className='max-w-md w-full bg-white rounded-3xl p-8 border border-gray-200 shadow-sm text-center space-y-4'>
          <div className='w-16 h-16 rounded-2xl bg-red-50 text-red-500 flex items-center justify-center mx-auto'>
            <AlertCircle className='w-8 h-8' />
          </div>
          <h2 className='text-2xl font-bold text-gray-900'>Unable to View Invoice</h2>
          <p className='text-xs text-gray-500'>{error || 'Invoice could not be loaded.'}</p>
          <div className='pt-2 flex justify-center gap-3'>
            <Link href='/my-courses'>
              <Button variant='outline' className='rounded-xl text-xs'>
                <ArrowLeft className='w-3.5 h-3.5 mr-1.5' />
                Back to Dashboard
              </Button>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className='min-h-screen bg-[#F8FAFC] py-12 px-4 print:bg-white print:py-0 print:px-0'>
      <div className='max-w-3xl mx-auto space-y-6'>
        {/* Navigation / Actions Bar */}
        <div className='flex items-center justify-between print:hidden'>
          <Link
            href='/my-courses'
            className='inline-flex items-center text-xs text-gray-500 hover:text-gray-900 transition-colors'
          >
            <ArrowLeft className='w-4 h-4 mr-1.5' />
            Return to Dashboard
          </Link>
          <Button
            onClick={() => window.print()}
            variant='outline'
            className='rounded-xl text-xs font-semibold text-gray-700 hover:bg-gray-50 border-gray-200 shadow-2xs'
          >
            <Printer className='w-3.5 h-3.5 mr-1.5 text-primary' />
            Print / Save as PDF
          </Button>
        </div>

        {/* Official Printable Invoice Card */}
        <div className='bg-white rounded-3xl border border-gray-200 p-8 lg:p-12 shadow-sm space-y-8 print:border-none print:shadow-none print:p-0'>
          {/* Header */}
          <div className='flex justify-between items-start border-b border-gray-100 pb-8'>
            <div className='space-y-1.5'>
              <div className='flex items-center gap-2'>
                <div className='w-8 h-8 rounded-xl bg-primary text-white flex items-center justify-center font-bold text-xs'>
                  TS
                </div>
                <span className='text-lg font-bold text-gray-900 font-lexend'>TechSprout LMS</span>
              </div>
              <p className='text-xs text-gray-400'>Online Learning & Professional Academy</p>
              <p className='text-[11px] text-gray-400'>Dhaka, Bangladesh • support@techsprout.edu</p>
            </div>

            <div className='text-right space-y-1'>
              <span className='inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200'>
                <ShieldCheck className='w-3 h-3' />
                Official Receipt • {invoice.status}
              </span>
              <p className='text-sm font-bold text-gray-900 font-mono'>{invoice.invoiceNumber}</p>
              <p className='text-xs text-gray-400'>
                Issued: {new Date(invoice.issuedAt).toLocaleDateString()}
              </p>
            </div>
          </div>

          {/* Student & Payment Info */}
          <div className='grid grid-cols-2 gap-8 text-xs'>
            <div className='space-y-1.5'>
              <span className='text-[10px] font-bold text-gray-400 uppercase tracking-wider'>Billed To:</span>
              <p className='font-bold text-gray-900 text-sm'>{invoice.studentName}</p>
              <p className='text-gray-500'>{invoice.studentEmail}</p>
              {invoice.studentPhone && <p className='text-gray-500'>{invoice.studentPhone}</p>}
            </div>

            <div className='space-y-1.5 text-right'>
              <span className='text-[10px] font-bold text-gray-400 uppercase tracking-wider'>Payment Details:</span>
              <p className='text-gray-700 font-medium'>Method: {invoice.paymentMethod}</p>
              <p className='text-gray-700 font-mono text-[11px]'>Bank Txn: {invoice.bankTranId}</p>
              <p className='text-gray-500 text-[11px]'>Currency: {invoice.currency}</p>
            </div>
          </div>

          {/* Line Items Table */}
          <div className='border border-gray-100 rounded-2xl overflow-hidden'>
            <table className='w-full text-xs text-left'>
              <thead className='bg-gray-50 text-gray-500 font-bold uppercase text-[10px] tracking-wider border-b border-gray-100'>
                <tr>
                  <th className='py-3.5 px-4'>Item Description</th>
                  <th className='py-3.5 px-4 text-right'>Subtotal</th>
                  <th className='py-3.5 px-4 text-right'>Discount</th>
                  <th className='py-3.5 px-4 text-right'>Amount Paid</th>
                </tr>
              </thead>
              <tbody className='divide-y divide-gray-100 text-gray-700'>
                <tr>
                  <td className='py-4 px-4 font-semibold text-gray-900'>
                    {invoice.courseTitle}
                    <span className='block text-[11px] font-normal text-gray-400'>
                      Lifetime Curriculum & Certificate Access
                    </span>
                  </td>
                  <td className='py-4 px-4 text-right'>
                    {(invoice.subtotalCents / 100).toLocaleString()} {invoice.currency}
                  </td>
                  <td className='py-4 px-4 text-right text-emerald-600'>
                    {invoice.discountCents > 0
                      ? `- ${(invoice.discountCents / 100).toLocaleString()} ${invoice.currency}`
                      : '0 BDT'}
                  </td>
                  <td className='py-4 px-4 text-right font-bold text-gray-900'>
                    {(invoice.payableCents / 100).toLocaleString()} {invoice.currency}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Total Summary */}
          <div className='flex justify-end pt-2 text-xs'>
            <div className='w-64 space-y-2 border-t border-gray-100 pt-4'>
              <div className='flex justify-between text-gray-500'>
                <span>Subtotal:</span>
                <span>{(invoice.subtotalCents / 100).toLocaleString()} {invoice.currency}</span>
              </div>
              <div className='flex justify-between text-emerald-600'>
                <span>Total Discount:</span>
                <span>-{(invoice.discountCents / 100).toLocaleString()} {invoice.currency}</span>
              </div>
              <div className='flex justify-between text-base font-extrabold text-gray-900 border-t border-gray-200 pt-2'>
                <span>Total Paid:</span>
                <span className='text-primary font-lexend'>
                  {(invoice.payableCents / 100).toLocaleString()} {invoice.currency}
                </span>
              </div>
            </div>
          </div>

          {/* Footer Notes */}
          <div className='border-t border-gray-100 pt-6 text-[11px] text-gray-400 text-center leading-relaxed space-y-1'>
            <p>This is a computer-generated tax invoice and requires no physical signature.</p>
            <p>© {new Date().getFullYear()} TechSprout School LMS. All rights reserved.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
