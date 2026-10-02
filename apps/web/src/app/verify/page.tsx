'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  ShieldCheck,
  Search,
  Award,
  CheckCircle2,
  FileCheck2,
  Lock,
} from 'lucide-react';

export default function PublicCertificateVerificationSearchPage() {
  const router = useRouter();
  const [certInput, setCertInput] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = certInput.trim().toUpperCase();
    if (!trimmed) {
      setErrorMessage('Please enter a certificate number to verify.');
      return;
    }
    setErrorMessage('');
    router.push(`/verify/${encodeURIComponent(trimmed)}`);
  };

  return (
    <div className='min-h-screen bg-[#F8FAFC] pb-24'>
      {/* Top Banner */}
      <section className='bg-white border-b border-gray-200/80 pt-16 pb-20'>
        <div className='container mx-auto px-4 max-w-4xl text-center space-y-5'>
          <div className='inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200 text-xs font-bold'>
            <ShieldCheck className='w-4 h-4 text-emerald-600' />
            <span>Official Credential Registry</span>
          </div>

          <h1 className='text-3xl sm:text-5xl font-black text-gray-900 tracking-tight font-lexend'>
            Verify TechSprout Certificate
          </h1>

          <p className='text-sm sm:text-base text-gray-600 max-w-2xl mx-auto leading-relaxed'>
            Every TechSprout Academy certificate of completion is backed by an immutable verification record. Enter the unique certificate code below to authenticate its validity.
          </p>

          {/* Verification Form */}
          <div className='pt-4 max-w-xl mx-auto'>
            <form
              onSubmit={handleSubmit}
              className='bg-white p-2.5 rounded-2xl border-2 border-gray-200 shadow-md focus-within:border-primary transition-all flex flex-col sm:flex-row gap-2'
              data-testid='verify-certificate-form'
            >
              <div className='relative flex-1 flex items-center'>
                <Search className='absolute left-3.5 w-4 h-4 text-gray-400' />
                <label htmlFor='certNumberInput' className='sr-only'>
                  Certificate Number
                </label>
                <Input
                  id='certNumberInput'
                  type='text'
                  value={certInput}
                  onChange={(e) => {
                    setCertInput(e.target.value);
                    if (errorMessage) setErrorMessage('');
                  }}
                  placeholder='e.g. TSP-2026-C8F4A12B'
                  autoFocus
                  className='pl-10 pr-3 py-3 border-0 shadow-none focus-visible:ring-0 text-sm font-mono tracking-wide placeholder:font-sans uppercase'
                  data-testid='input-certificate-number'
                />
              </div>

              <Button
                type='submit'
                className='rounded-xl text-xs font-bold px-6 py-3 bg-primary text-white hover:bg-primary/90 shadow-sm shrink-0'
                data-testid='btn-submit-verification'
              >
                <span>Verify Credential</span>
              </Button>
            </form>

            {errorMessage && (
              <p
                role='alert'
                className='text-xs font-medium text-rose-600 text-left pt-2 px-2'
                data-testid='form-error-message'
              >
                {errorMessage}
              </p>
            )}
          </div>
        </div>
      </section>

      {/* Trust & Verification Features */}
      <section className='container mx-auto px-4 max-w-4xl pt-16'>
        <div className='grid grid-cols-1 sm:grid-cols-3 gap-6'>
          <div className='bg-white rounded-3xl p-6 border border-gray-200/80 shadow-xs space-y-3'>
            <div className='w-12 h-12 rounded-2xl bg-primary/10 text-primary flex items-center justify-center'>
              <Award className='w-6 h-6' />
            </div>
            <h3 className='text-base font-bold text-gray-900'>Direct Registry Verification</h3>
            <p className='text-xs text-gray-500 leading-relaxed'>
              Credentials are verified live against our academic database to confirm curriculum mastery.
            </p>
          </div>

          <div className='bg-white rounded-3xl p-6 border border-gray-200/80 shadow-xs space-y-3'>
            <div className='w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center'>
              <Lock className='w-6 h-6' />
            </div>
            <h3 className='text-base font-bold text-gray-900'>Public Privacy Protection</h3>
            <p className='text-xs text-gray-500 leading-relaxed'>
              Only educational achievement metadata is presented. Private personal and student IDs remain secured.
            </p>
          </div>

          <div className='bg-white rounded-3xl p-6 border border-gray-200/80 shadow-xs space-y-3'>
            <div className='w-12 h-12 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center'>
              <FileCheck2 className='w-6 h-6' />
            </div>
            <h3 className='text-base font-bold text-gray-900'>Tamper Evident Records</h3>
            <p className='text-xs text-gray-500 leading-relaxed'>
              Historical issuance timestamps and status modifications are preserved to prevent fraudulent modifications.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
