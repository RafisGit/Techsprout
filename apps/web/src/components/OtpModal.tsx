'use client';
import { Button } from '@/components/ui/button';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { InputOTP, InputOTPGroup, InputOTPSlot } from './ui/input-otp';
import { otpSchema } from '@/schemas/otpSchema';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useForm } from 'react-hook-form';
import { REGEXP_ONLY_DIGITS } from 'input-otp';
import { useOtpStore } from '@/store/Otpstore';
import { axiosInstance } from '@/lib/axiosInstance';
import { useState } from 'react';

export default function OtpModal() {
  const { modalStatus, setModalStatus, phoneNumber } = useOtpStore();
  const [error, setError] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);

  const form = useForm<z.infer<typeof otpSchema>>({
    resolver: zodResolver(otpSchema),
    defaultValues: {
      otp: '',
    },
  });

  async function onSubmit(data: z.infer<typeof otpSchema>) {
    try {
      setIsVerifying(true);
      setError('');

      if (!phoneNumber) {
        setError('Phone number is missing. Please restart verification.');
        return;
      }

      const response = await axiosInstance.post('/api/v1/auth/otp/verify', {
        otp: data.otp,
        phone: phoneNumber,
      });

      if (response.data.success) {
        setModalStatus('close');
        window.location.href = '/dashboard';
      }
    } catch (err: unknown) {
      const errorObj = err as { response?: { data?: { message?: string } } };
      setError(errorObj.response?.data?.message || 'Verification failed. Please check the code.');
    } finally {
      setIsVerifying(false);
    }
  }

  return (
    <Dialog open={modalStatus} onOpenChange={(open) => !open && setModalStatus('close')}>
      <DialogContent showCloseButton={true}>
        <DialogHeader>
          <DialogTitle>Enter the 6-digit verification code</DialogTitle>
        </DialogHeader>
        {error && (
          <div className='p-2 text-sm text-red-600 bg-red-50 rounded border border-red-200'>
            {error}
          </div>
        )}
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className='w-full space-y-6'>
            <FormField
              control={form.control}
              name='otp'
              render={({ field }) => (
                <FormItem className='flex flex-col items-center'>
                  <FormLabel>Verification Code</FormLabel>
                  <FormControl>
                    <InputOTP maxLength={6} {...field} pattern={REGEXP_ONLY_DIGITS}>
                      <InputOTPGroup>
                        <InputOTPSlot index={0} />
                        <InputOTPSlot index={1} />
                        <InputOTPSlot index={2} />
                        <InputOTPSlot index={3} />
                        <InputOTPSlot index={4} />
                        <InputOTPSlot index={5} />
                      </InputOTPGroup>
                    </InputOTP>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <Button
              type='submit'
              disabled={isVerifying}
              className='w-full bg-primary hover:bg-accent'
            >
              {isVerifying ? 'Verifying...' : 'Submit Verification Code'}
            </Button>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
