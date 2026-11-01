'use client';

import Title from './Title';
import { ChevronRight } from 'lucide-react';
import heroBg from '@/assets/img/hero-bg.jpg';
import { useTranslation } from '@/i18n';

export default function Hero({ pageName }: { pageName: string }) {
  const { t } = useTranslation();

  return (
    <section className='pt-16'>
      <div
        className='after:bg-primary/40 relative bg-cover py-16 after:absolute after:inset-0 after:backdrop-blur-[2px] lg:py-[120px]'
        style={{ backgroundImage: `url('${heroBg.src}')` }}
      >
        <div className='common-container relative z-10'>
          <Title h={2} className='text-white'>
            {pageName}
          </Title>
          <p className='mt-4 flex items-center gap-2 text-2xl font-medium text-white'>
            {t('brand.name')} <ChevronRight />{' '}
            <span className='text-accent font-bold'>{pageName}</span>
          </p>
        </div>
      </div>
    </section>
  );
}
