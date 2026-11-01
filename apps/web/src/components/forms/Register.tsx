'use client';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import Link from 'next/link';
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
import { useTranslation } from '@/i18n';

export default function RegisterForm() {
  const { t } = useTranslation();
  const { setModalStatus, setPhoneNumber } = useOtpStore();
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

      const rawPhone = values.phoneNumber?.trim() || '';
      const normalizedPhone = rawPhone.replace(/^\+?88/, '').trim() || undefined;

      const userData = {
        name: values.name.trim(),
        username: values.userName.trim(),
        email: values.email.trim(),
        phone: normalizedPhone,
        password: values.password,
      };

      const response = await axiosInstance.post('/api/v1/auth/register', userData);

      if (response.data.success) {
        if (normalizedPhone) {
          try {
            await axiosInstance.post('/api/v1/auth/otp/send', { phone: normalizedPhone });
            setPhoneNumber(normalizedPhone);
            setModalStatus('open');
          } catch {
            window.location.href = '/dashboard';
          }
        } else {
          window.location.href = '/dashboard';
        }
      }
    } catch (err: unknown) {
      const errorObj = err as {
        response?: {
          data?: {
            message?: string;
            details?: Record<string, string[]>;
          };
        };
      };
      const errData = errorObj.response?.data;
      let message = errData?.message || t('auth.registerFailed');

      if (errData?.details && typeof errData.details === 'object') {
        const fieldMessages: string[] = [];
        for (const [field, errors] of Object.entries(errData.details)) {
          const formField =
            field === 'username' ? 'userName' : field === 'phone' ? 'phoneNumber' : field;
          if (Array.isArray(errors) && errors.length > 0) {
            fieldMessages.push(errors[0]);
            form.setError(formField as 'name' | 'userName' | 'email' | 'phoneNumber' | 'password' | 'passwordConfirmation', {
              type: 'server',
              message: errors[0],
            });
          }
        }
        if (fieldMessages.length > 0) {
          message = fieldMessages.join('. ');
        }
      }

      setServerError(message);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section className='common-container flex min-h-screen items-center justify-center py-20'>
      <div className='bg-accent/5 w-full max-w-lg rounded-lg p-6 shadow-md'>
        <h2 className='text-2xl font-bold text-center mb-6'>{t('auth.createAccountTitle')}</h2>
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
                  <FormLabel className='text-md'>{t('auth.fullName')}</FormLabel>
                  <FormControl>
                    <Input
                      type='text'
                      placeholder={t('auth.fullNamePlaceholder')}
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
                  <FormLabel className='text-md'>{t('auth.username')}</FormLabel>
                  <FormControl>
                    <Input
                      type='text'
                      placeholder={t('auth.usernamePlaceholder')}
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
                  <FormLabel className='text-md'>{t('auth.email')}</FormLabel>
                  <FormControl>
                    <Input
                      type='email'
                      placeholder={t('auth.emailPlaceholder')}
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
                  <FormLabel className='text-md'>{t('auth.phone')}</FormLabel>
                  <FormControl>
                    <Input
                      type='text'
                      placeholder={t('auth.phonePlaceholder')}
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
                  <FormLabel className='text-md'>{t('auth.password')}</FormLabel>
                  <FormControl>
                    <Input
                      type='password'
                      placeholder={t('auth.passwordPlaceholder')}
                      {...field}
                      className='h-12 rounded-xl bg-white'
                    />
                  </FormControl>
                  <p className='text-xs text-muted-foreground mt-1'>
                    {t('auth.passwordRequirements')}
                  </p>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name='passwordConfirmation'
              render={({ field }) => (
                <FormItem>
                  <FormLabel className='text-md'>{t('auth.confirmPassword')}</FormLabel>
                  <FormControl>
                    <Input
                      type='password'
                      placeholder={t('auth.confirmPasswordPlaceholder')}
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
              {isSubmitting ? t('auth.registering') : t('auth.registerButton')}
            </Button>
            <div className='text-center text-sm text-gray-600 pt-2'>
              {t('auth.alreadyHaveAccount')}{' '}
              <Link href='/login' className='text-primary font-semibold hover:underline'>
                {t('auth.loginHere')}
              </Link>
            </div>
          </form>
        </Form>
      </div>
      <OtpModal />
    </section>
  );
}
