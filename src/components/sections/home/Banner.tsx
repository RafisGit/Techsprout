import AnimatedText from '@/components/AnimatedText';
import bannerImg from '@/assets/img/banner_img.png';
import Title from '@/components/Title';
import { Button } from '@/components/ui/button';
import { TextBadge } from '@/components/ui/text-badge';
import { GraduationCap, PhoneCall, Users } from 'lucide-react';
import Image from 'next/image';
import shape1 from '@/assets/img/shapes/bshape_01.png';
import shape2 from '@/assets/img/shapes/bshape_02.png';
import shape3 from '@/assets/img/shapes/bshape_03.png';
import shape4 from '@/assets/img/shapes/bshape_04.png';
import shape5 from '@/assets/img/shapes/bshape_05.png';
import Link from 'next/link';

export default function Banner() {
  return (
    <section className="bg-[url('../assets/img/banner_bg.jpg')] bg-cover pt-30">
      <div className='common-container grid grid-cols-1 items-center gap-8 md:grid-cols-2'>
        <div className='relative max-w-[570px] space-y-4'>
          <Image
            src={shape1}
            width={60}
            alt='shape 1'
            className='animate-bounce-slow absolute -top-12 hidden w-8 md:block lg:top-0 lg:-left-[150px] lg:w-auto'
          />
          <Image
            src={shape2}
            alt='shape 2'
            width={60}
            className='absolute -top-12 left-60 w-8 lg:-top-4 lg:right-60 lg:w-auto'
          />
          <TextBadge>Learn. Build. Lead</TextBadge>
          <Title h={1}>
            Turn Curiosity into <AnimatedText text='Expertise' />
          </Title>
          <p>
            TechSprout School is an online learning hub for young minds, guiding students from Grade
            6 to pre-graduation. We transform screen time into creativity, skills, and future-ready
            opportunities. From coding to AI, we shape tomorrow’s innovators today.
          </p>
          <div className='flex flex-col items-center gap-4 md:flex-row'>
            <Link href={'/courses'}>
              <Button isArrow={true} size={'lg'}>
                Explore Courses
              </Button>
            </Link>
            <div>
              <div className='flex items-center gap-2'>
                <PhoneCall size={36} />
                <div>
                  <span className='block text-base md:text-xs lg:text-base'>
                    Have any Question?
                  </span>
                  <a
                    href='tel:+8801785696469'
                    className='lg:text-md block text-base font-bold md:text-xs lg:text-base'
                  >
                    +880 1785696469
                  </a>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div className='relative flex justify-center'>
          <Image src={bannerImg} alt='Banner Image' width={632} height={617} className='mt-8' />
          <Image
            src={shape3}
            alt='shape 3'
            className='absolute top-0 left-1/4 hidden lg:block'
            width={90}
          />
          <Image src={shape4} alt='shape 4' className='absolute top-1/2 left-0' width={90} />
          <Image src={shape5} alt='shape 5' className='absolute top-1/4 right-0' width={90} />
          <div className='absolute top-4 left-1 flex flex-col items-center rounded-2xl bg-white px-6 py-4 text-center shadow-2xs lg:top-1/5 lg:left-1/10'>
            <div className='bg-primary shadow-primary grid h-16 w-16 place-items-center rounded-full shadow-lg'>
              <Users className='text-white' size={30} />
            </div>
            <p>Total Students</p>
            <p className='text-foreground text-3xl font-bold'>150</p>
          </div>
          <div className='absolute -right-24 bottom-24 hidden flex-col items-center text-center xl:flex'>
            <div className='bg-accent shadow-accent relative -bottom-5 grid h-16 w-16 place-items-center rounded-full shadow-lg'>
              <GraduationCap className='text-white' size={30} />
            </div>
            <div className='rounded-2xl bg-white px-4 py-4'>
              <p>Complete Graduation</p>
              <p className='text-foreground text-3xl font-bold'>6</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
