'use client';

import Title from '@/components/Title';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useTranslation } from '@/i18n';

export default function ContactForm() {
  const { t } = useTranslation();

  return (
    <div className='rounded-lg bg-gray-100 p-8 shadow-lg md:p-12'>
      <Title h={2}>{t('contact.getInTouch')}</Title>
      <div className='bg-primary mb-8 h-1 w-20' />
      <form className='space-y-6' onSubmit={(e) => e.preventDefault()}>
        <div className='grid grid-cols-1 gap-6 md:grid-cols-2'>
          <div>
            <Input
              id='name'
              placeholder={t('contact.namePlaceholder')}
              type='text'
              className='h-12 bg-white text-base'
            />
          </div>
          <div>
            <Input
              id='email'
              placeholder={t('contact.emailPlaceholder')}
              type='email'
              required
              className='h-12 bg-white text-base'
            />
          </div>
        </div>
        <div className='grid grid-cols-1 gap-6 md:grid-cols-2'>
          <div>
            <Input
              id='phone'
              placeholder={t('contact.phonePlaceholder')}
              type='tel'
              className='h-12 bg-white text-base'
            />
          </div>
          <div>
            <Input
              id='subject'
              placeholder={t('contact.subjectPlaceholder')}
              type='text'
              required
              className='h-12 bg-white text-base'
            />
          </div>
        </div>
        <div>
          <Textarea
            id='message'
            placeholder={t('contact.messagePlaceholder')}
            rows={6}
            required
            className='h-40 bg-white text-base'
          />
        </div>
        <Button
          type='submit'
          className='bg-primary hover:bg-primary/90 w-full py-3 text-lg text-white'
        >
          {t('contact.sendMessage')}
        </Button>
      </form>
    </div>
  );
}
