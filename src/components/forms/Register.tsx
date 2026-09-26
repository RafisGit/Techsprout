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

export default function RegisterForm() {
  const { setModalStatus } = useOtpStore();
  const [error, setError] = useState('');
  const [userIdentifier, setUserIdentifier] = useState('');

  const { data } = useQuery({
    queryKey: ['check-user', userIdentifier],
    queryFn: () => {
      const res = axiosInstance.get(
        `/api/check-user-exists?username=${userIdentifier}&email=${userIdentifier}`
      );
      return res;
    },
    enabled: !!userIdentifier,
  });

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
    const userData = {
      name: values.name,
      username: values.userName,
      email: values.email,
      phone: values.phoneNumber,
      password: values.password,
    };

    const response = await axiosInstance.post('/test', userData);

    console.log(response);

    // setModalStatus('open');
  }

  const debounceSetValue = debounce((value: string) => setUserIdentifier(value), 1000);

  return (
    <section className='common-container flex min-h-screen items-center justify-center py-20'>
      <div className='bg-accent/5 w-full max-w-lg rounded-lg p-6 shadow-md'>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className='space-y-6'>
            <FormField
              control={form.control}
              name='name'
              render={({ field }) => (
                <FormItem>
                  <FormLabel className='text-md'>Name</FormLabel>
                  <FormControl>
                    <Input
                      type={'text'}
                      placeholder={'Enter you name'}
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
                      type={'text'}
                      placeholder={'Enter you username'}
                      {...field}
                      className='h-12 rounded-xl bg-white'
                      onChange={(e) => {
                        field.onChange(e);
                        debounceSetValue(e.target.value);
                      }}
                    />
                  </FormControl>
                  <FormMessage>{data?.data.message}</FormMessage>
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
              name='phoneNumber'
              render={({ field }) => (
                <FormItem>
                  <FormLabel className='text-md'>Phone Number</FormLabel>
                  <FormControl>
                    <Input
                      type={'number'}
                      placeholder={'Enter you name'}
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
            <FormField
              control={form.control}
              name='name'
              render={({ field }) => (
                <FormItem>
                  <FormLabel className='text-md'>Confirm Password</FormLabel>
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
              REGISTER
            </Button>
          </form>
        </Form>
      </div>
      <OtpModal />
    </section>
  );
}
