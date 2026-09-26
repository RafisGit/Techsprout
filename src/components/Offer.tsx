import Image from 'next/image';
import Title from './Title';
import { Button } from './ui/button';
import offerBg from '@/assets/img/cta_bg2.jpg';
import offerShape1 from '@/assets/img/shapes/cta_shape001.svg';
import offerShape2 from '@/assets/img/shapes/cta_shape003.svg';
import offerShape3 from '@/assets/img/shapes/about_dots.svg';

export default function Offer() {
  return (
    <section className='after:bg-primary/60 relative after:absolute after:inset-0 after:z-[-1]'>
      <div
        className='absolute inset-0 -z-[10] h-full w-full bg-cover bg-fixed mix-blend-luminosity'
        style={{ backgroundImage: `url('${offerBg.src}')` }}
      ></div>
      <div className='z-10 space-y-6 py-30 text-center'>
        <p className='font-bold text-white'>ARE YOU READY FOR THIS OFFER</p>
        <Title h={1} className='text-white'>
          50% Offer For Very First 50
        </Title>
        <Title h={2} className='font-bold text-white'>
          Student’s & Mentors
        </Title>
        <Button size={'lg'} isArrow={true}>
          Become a student
        </Button>
      </div>
      <Image
        src={offerShape1}
        width={315}
        height={255}
        alt='shape'
        className='absolute top-0 left-0 w-30 md:w-50 xl:w-auto'
      />
      <Image
        src={offerShape2}
        width={240}
        height={160}
        alt='shape'
        className='absolute right-0 bottom-0 w-30 md:w-50 lg:w-auto'
      />
      <Image
        src={offerShape3}
        width={125}
        height={110}
        alt='shape'
        className='absolute bottom-1/2 left-30 hidden translate-y-1/2 xl:block'
      />
    </section>
  );
}
