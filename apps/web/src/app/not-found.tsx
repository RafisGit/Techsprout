'use client';

import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { useTranslation } from '@/i18n';

export default function NotFound() {
  const { t } = useTranslation();

  return (
    <section className='bg-white dark:bg-gray-900'>
      <div className='container mx-auto flex min-h-screen items-center justify-center px-6 py-12'>
        <div className='w-full'>
          <div className='mx-auto flex max-w-lg flex-col items-center text-center'>
            <p className='text-primary text-2xl font-medium'>{t('notFound.errorCode')}</p>
            <h1 className='mt-3 text-2xl font-semibold text-gray-800 md:text-3xl dark:text-white'>
              {t('notFound.title')}
            </h1>
            <p className='mt-4 text-gray-500 dark:text-gray-400'>
              {t('notFound.description')}
            </p>

            <div className='mt-6 flex w-full shrink-0 items-center gap-x-3 sm:w-auto'>
              <Link href={'/'}>
                <Button size={'lg'} className='capitalize'>
                  {t('notFound.takeMeHome')}
                </Button>
              </Link>
            </div>
          </div>

          <div className='mx-auto mt-8 grid w-full max-w-6xl grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-3'>
            <div className='rounded-lg bg-blue-50 p-6 dark:bg-gray-800'>
              <span className='text-gray-500 dark:text-gray-400'>
                <svg
                  xmlns='http://www.w3.org/2000/svg'
                  fill='none'
                  viewBox='0 0 24 24'
                  strokeWidth='1.5'
                  stroke='currentColor'
                  className='h-6 w-6'
                >
                  <path
                    strokeLinecap='round'
                    strokeLinejoin='round'
                    d='M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z'
                  />
                </svg>
              </span>

              <h3 className='mt-6 font-medium text-gray-700 dark:text-gray-200'>
                {t('notFound.coursesCardTitle')}
              </h3>

              <p className='mt-2 text-gray-500 dark:text-gray-400'>
                {t('notFound.coursesCardDesc')}
              </p>

              <Link
                href='/courses'
                className='mt-4 inline-flex items-center gap-x-2 text-sm text-blue-500 hover:underline dark:text-blue-400'
              >
                <span>{t('notFound.startLearning')}</span>

                <svg
                  xmlns='http://www.w3.org/2000/svg'
                  fill='none'
                  viewBox='0 0 24 24'
                  strokeWidth='1.5'
                  stroke='currentColor'
                  className='h-5 w-5 rtl:rotate-180'
                >
                  <path
                    strokeLinecap='round'
                    strokeLinejoin='round'
                    d='M17.25 8.25L21 12m0 0l-3.75 3.75M21 12H3'
                  />
                </svg>
              </Link>
            </div>

            <div className='rounded-lg bg-blue-50 p-6 dark:bg-gray-800'>
              <span className='text-gray-500 dark:text-gray-400'>
                <svg
                  xmlns='http://www.w3.org/2000/svg'
                  fill='none'
                  viewBox='0 0 24 24'
                  strokeWidth='1.5'
                  stroke='currentColor'
                  className='h-6 w-6'
                >
                  <path
                    strokeLinecap='round'
                    strokeLinejoin='round'
                    d='M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25'
                  />
                </svg>
              </span>

              <h3 className='mt-6 font-medium text-gray-700 dark:text-gray-200'>
                {t('notFound.blogCardTitle')}
              </h3>

              <p className='mt-2 text-gray-500 dark:text-gray-400'>
                {t('notFound.blogCardDesc')}
              </p>

              <Link
                href='/blogs'
                className='mt-4 inline-flex items-center gap-x-2 text-sm text-blue-500 hover:underline dark:text-blue-400'
              >
                <span>{t('notFound.viewLatestPosts')}</span>

                <svg
                  xmlns='http://www.w3.org/2000/svg'
                  fill='none'
                  viewBox='0 0 24 24'
                  strokeWidth='1.5'
                  stroke='currentColor'
                  className='h-5 w-5 rtl:rotate-180'
                >
                  <path
                    strokeLinecap='round'
                    strokeLinejoin='round'
                    d='M17.25 8.25L21 12m0 0l-3.75 3.75M21 12H3'
                  />
                </svg>
              </Link>
            </div>

            <div className='rounded-lg bg-blue-50 p-6 dark:bg-gray-800'>
              <span className='text-gray-500 dark:text-gray-400'>
                <svg
                  xmlns='http://www.w3.org/2000/svg'
                  fill='none'
                  viewBox='0 0 24 24'
                  strokeWidth='1.5'
                  stroke='currentColor'
                  className='h-6 w-6'
                >
                  <path
                    strokeLinecap='round'
                    strokeLinejoin='round'
                    d='M12 20.25c4.97 0 9-3.694 9-8.25s-4.03-8.25-9-8.25S3 7.444 3 12c0 2.104.859 4.023 2.273 5.48.432.447.74 1.04.586 1.641a4.483 4.483 0 01-.923 1.785A5.969 5.969 0 006 21c1.282 0 2.47-.402 3.445-1.087.81.22 1.668.337 2.555.337z'
                  />
                </svg>
              </span>

              <h3 className='mt-6 font-medium text-gray-700 dark:text-gray-200'>
                {t('notFound.chatCardTitle')}
              </h3>

              <p className='mt-2 text-gray-500 dark:text-gray-400'>
                {t('notFound.chatCardDesc')}
              </p>

              <Link
                href='/contact'
                className='mt-4 inline-flex items-center gap-x-2 text-sm text-blue-500 hover:underline dark:text-blue-400'
              >
                <span>{t('notFound.contactUs')}</span>

                <svg
                  xmlns='http://www.w3.org/2000/svg'
                  fill='none'
                  viewBox='0 0 24 24'
                  strokeWidth='1.5'
                  stroke='currentColor'
                  className='h-5 w-5 rtl:rotate-180'
                >
                  <path
                    strokeLinecap='round'
                    strokeLinejoin='round'
                    d='M17.25 8.25L21 12m0 0l-3.75 3.75M21 12H3'
                  />
                </svg>
              </Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
