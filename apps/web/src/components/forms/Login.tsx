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
import { axiosInstance } from '@/lib/axiosInstance';
import { useState } from 'react';
import { Input } from '../ui/input';
import { loginSchema } from '@/schemas/loginSchema';
import { setSessionCookie, getPostLoginRedirect } from '@/lib/session';

export default function Login() {
  const [serverError, setServerError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<z.infer<typeof loginSchema>>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: '',
      password: '',
    },
  });

  async function onSubmit(values: z.infer<typeof loginSchema>) {
    if (isSubmitting) return;

    try {
      setIsSubmitting(true);
      setServerError('');

      const response = await axiosInstance.post('/api/v1/auth/login', {
        email: values.email,
        password: values.password,
      });

      if (response.data.success) {
        if (!response.data.token) {
          setServerError('Authentication failed: Missing session token in server response.');
          return;
        }

        // Set session cookie on the web application domain so Next.js SSR layout guards can read it
        setSessionCookie(response.data.token);

        const targetUrl = getPostLoginRedirect(response.data.user?.role);
        window.location.href = targetUrl;
      } else {
        setServerError(response.data.message || 'Login failed. Please verify your credentials.');
      }
    } catch (err: unknown) {
      const errorObj = err as {
        response?: { data?: { message?: string } };
        message?: string;
      };

      if (errorObj.response?.data?.message) {
        setServerError(errorObj.response.data.message);
      } else if (!errorObj.response) {
        setServerError('Unable to connect to the server. Please check your connection and try again.');
      } else {
        setServerError('Invalid email or password');
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section className='common-container flex items-center justify-center py-20'>
      <div className='bg-accent/5 w-full max-w-lg rounded-lg p-6 shadow-md'>
        <h2 className='text-2xl font-bold text-center mb-6'>Sign In to Your Account</h2>
        {serverError && (
          <div className='mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-600 text-sm'>
            {serverError}
          </div>
        )}
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className='space-y-6'>
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
              name='password'
              render={({ field }) => (
                <FormItem>
                  <FormLabel className='text-md'>Password</FormLabel>
                  <FormControl>
                    <Input
                      type='password'
                      placeholder='Enter your password'
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
              {isSubmitting ? 'Signing in...' : 'Login'}
            </Button>
          </form>
        </Form>
      </div>
    </section>
  );
}
