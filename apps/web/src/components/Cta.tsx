import Image from 'next/image';
import AnimatedText from './AnimatedText';
import { Button } from './ui/button';
import ctaBg from '@/assets/img/cta_bg.png';

export default function Cta() {
  return (
    <section className='common-container'>
      <div className='bg-accent/20 relative grid grid-cols-1 items-center gap-4 rounded-xl bg-cover px-8 py-12 lg:grid-cols-4'>
        <Image
          src={ctaBg}
          alt='pattern'
          className='absolute inset-0 -z-10 hidden grayscale-25 xl:block'
        />
        <h2 className='font-lexend col-span-1 text-[30px] leading-tight font-semibold text-white'>
          Join Us & <AnimatedText text='Spread' /> Experience
        </h2>
        <p className='col-span-2 ms-2'>
          Grow smarter, faster, and future-ready with mentors who inspire innovation.
        </p>
        <Button isArrow={true} size={'lg'} variant={'ghost'} className='col-span-1 bg-white'>
          Become an Instructor
        </Button>
      </div>
    </section>
  );
}
