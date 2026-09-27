'use client';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { registerSchema } from '@/schemas/registerSchema';
import OtpModal from '../OtpModal';
import { useOtpStore } from '@/store/Otpstore';
import { axiosInstance } from '@/lib/axiosInstance';
import { useState } from 'react';
import { Input } from '../ui/input';

export default function RegisterForm() {
  const { setModalStatus } = useOtpStore();
  const [serverError, setServerError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<z.infer<typeof registerSchema>>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      name: '',
      userName: '',
      email: '',
      password: '',
      phoneNumber: '',
      passwordConfirmation: '',
    },
  });

  async function onSubmit(values: z.infer<typeof registerSchema>) {
    try {
      setIsSubmitting(true);
      setServerError('');
      const userData = {
        name: values.name,
        username: values.userName,
        email: values.email,
        phone: values.phoneNumber,
        password: values.password,
      };

      const response = await axiosInstance.post('/api/v1/auth/register', userData);

      if (response.data.success) {
        if (values.phoneNumber) {
          try {
            await axiosInstance.post('/api/v1/auth/otp/send', { phone: values.phoneNumber });
            setModalStatus('open');
          } catch {
            window.location.href = '/dashboard';
          }
        } else {
          window.location.href = '/dashboard';
        }
      }
    } catch (err: unknown) {
      const errorObj = err as { response?: { data?: { message?: string } } };
      const message = errorObj.response?.data?.message || 'Registration failed. Please check your information.';
      setServerError(message);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section className='common-container flex min-h-screen items-center justify-center py-20'>
      <div className='bg-accent/5 w-full max-w-lg rounded-lg p-6 shadow-md'>
        <h2 className='text-2xl font-bold text-center mb-6'>Create an Account</h2>
        {serverError && (
          <div className='mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-600 text-sm'>
            {serverError}
          </div>
        )}
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className='space-y-4'>
            <FormField
              control={form.control}
              name='name'
              render={({ field }) => (
                <FormItem>
                  <FormLabel className='text-md'>Full Name</FormLabel>
                  <FormControl>
                    <Input
                      type='text'
                      placeholder='Enter your full name'
                      {...field}
                      className='h-12 rounded-xl bg-white'
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name='userName'
              render={({ field }) => (
                <FormItem>
                  <FormLabel className='text-md'>Username</FormLabel>
                  <FormControl>
                    <Input
                      type='text'
                      placeholder='Enter your username'
                      {...field}
                      className='h-12 rounded-xl bg-white'
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name='email'
              render={({ field }) => (
                <FormItem>
                  <FormLabel className='text-md'>Email</FormLabel>
                  <FormControl>
                    <Input
                      type='email'
                      placeholder='Enter your email address'
                      {...field}
                      className='h-12 rounded-xl bg-white'
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name='phoneNumber'
              render={({ field }) => (
                <FormItem>
                  <FormLabel className='text-md'>Phone Number</FormLabel>
                  <FormControl>
                    <Input
                      type='text'
                      placeholder='017XXXXXXXX'
                      {...field}
                      className='h-12 rounded-xl bg-white'
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name='password'
              render={({ field }) => (
                <FormItem>
                  <FormLabel className='text-md'>Password</FormLabel>
                  <FormControl>
                    <Input
                      type='password'
                      placeholder='Enter your password (min. 8 characters)'
                      {...field}
                      className='h-12 rounded-xl bg-white'
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name='passwordConfirmation'
              render={({ field }) => (
                <FormItem>
                  <FormLabel className='text-md'>Confirm Password</FormLabel>
                  <FormControl>
                    <Input
                      type='password'
                      placeholder='Confirm your password'
                      {...field}
                      className='h-12 rounded-xl bg-white'
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <Button
              type='submit'
              disabled={isSubmitting}
              className='bg-primary hover:bg-accent w-full h-12 text-base font-semibold'
            >
              {isSubmitting ? 'Registering...' : 'REGISTER'}
            </Button>
          </form>
        </Form>
      </div>
      <OtpModal />
    </section>
  );
}
