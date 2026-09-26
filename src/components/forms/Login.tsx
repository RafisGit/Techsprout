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
import { debounce } from '@/utils/debounce';
import { useQuery } from '@tanstack/react-query';
import { loginSchema } from '@/schemas/loginSchema';

export default function Login() {
  //   const { setModalStatus } = useOtpStore();
  const [error, setError] = useState('');
  //   const [userIdentifier, setUserIdentifier] = useState('');

  //   const { data } = useQuery({
  //     queryKey: ['check-user', userIdentifier],
  //     queryFn: () => {
  //       const res = axiosInstance.get(
  //         `/api/check-user-exists?username=${userIdentifier}&email=${userIdentifier}`
  //       );
  //       return res;
  //     },
  //     enabled: !!userIdentifier,
  //   });

  const form = useForm<z.infer<typeof loginSchema>>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: '',
      password: '',
    },
  });

  async function onSubmit(values: z.infer<typeof loginSchema>) {
    const userData = {
      email: values.email,
      password: values.password,
    };

    // const response = await axiosInstance.post('/test', userData);

    console.log(userData);

    // setModalStatus('open');
  }

  //   const debounceSetValue = debounce((value: string) => setUserIdentifier(value), 1000);

  return (
    <section className='common-container flex items-center justify-center py-20'>
      <div className='bg-accent/5 w-full max-w-lg rounded-lg p-6 shadow-md'>
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
                      type={'text'}
                      placeholder={'Enter you email'}
                      {...field}
                      className='h-12 rounded-xl bg-white'
                    />
                  </FormControl>
                  <FormMessage>{error}</FormMessage>
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
                      type={'password'}
                      placeholder={'Enter you name'}
                      {...field}
                      className='h-12 rounded-xl bg-white'
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <Button type='submit' className='bg-primary hover:bg-accent w-full'>
              Login
            </Button>
          </form>
        </Form>
      </div>
      <OtpModal />
    </section>
  );
}
