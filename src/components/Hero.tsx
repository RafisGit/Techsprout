import Title from './Title';
import { ChevronRight } from 'lucide-react';
import heroBg from '@/assets/img/hero-bg.jpg';

export default function Hero({ pageName }: { pageName: string }) {
  return (
    <section className='pt-16'>
      <div
        className='after:bg-primary/40 relative bg-cover py-16 after:absolute after:inset-0 after:backdrop-blur-[2px] lg:py-[120px]'
        style={{ backgroundImage: `url('${heroBg.src}')` }}
      >
        {/* parallax effect if need*/}
        {/* <div
          className='absolute inset-0 -z-[10] bg-cover bg-fixed mix-blend-luminosity'
          style={{ backgroundImage: `url('${heroBg.src}')` }}
        ></div> */}
        <div className='common-container relative z-10'>
          <Title h={2} className='text-white'>
            {pageName}
          </Title>
          <p className='mt-4 flex items-center gap-2 text-2xl font-medium text-white'>
            TechSprout School <ChevronRight />{' '}
            <span className='text-accent font-bold'>{pageName}</span>
          </p>
        </div>
      </div>
    </section>
  );
}
