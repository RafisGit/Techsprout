import AnimatedText from '@/components/AnimatedText';
import aboutImg1 from '@/assets/img/about/about_img01.png';
import aboutImg2 from '@/assets/img/about/about_img02.png';
import Title from '@/components/Title';
import { Button } from '@/components/ui/button';
import { TextBadge } from '@/components/ui/text-badge';
import { aboutUsInfo } from '@/lib/mockData/mockData';
import Image from 'next/image';
import { Circle } from 'lucide-react';
import aboutDots from '@/assets/img/shapes/about_dots.svg';
import Link from 'next/link';

export default function Discover() {
  return (
    <section className='bg-white py-20 lg:py-[120px]'>
      <div className='common-container grid grid-cols-1 items-center gap-8 md:grid-cols-2'>
        <div className='group relative flex justify-center'>
          <div className='relative -right-12 mb-[50px] flex items-end'>
            <Image
              src={aboutImg2}
              width={260}
              alt='About Image'
              className='relative z-20 hidden drop-shadow-md lg:block'
            />
            <div className='bg-primary absolute top-[300px] left-[220px] z-20 flex h-[110px] w-[125px] -translate-x-1/2 skew-3 flex-col items-center justify-center rounded-2xl text-center text-white drop-shadow-md duration-1000 group-hover:left-1/2 lg:top-4 lg:left-1/3 lg:z-10'>
              <Title h={3}>
                <span className='text-white'>15 +</span>
              </Title>
              <p className='text-lg leading-4 font-bold'>Years of Experience</p>
            </div>
          </div>
          <Image src={aboutImg1} width={389} alt='About' className='z-10 drop-shadow-md' />
          <Image
            src={aboutDots}
            width={130}
            alt='About'
            className='absolute -top-8 left-30 duration-1000 group-hover:-top-12 group-hover:left-40'
          />
          <Circle
            size={400}
            strokeWidth={2}
            className='text-accent absolute top-0 left-10 hidden duration-1000 group-hover:-top-4 group-hover:left-4 lg:block'
          />
        </div>
        <div className='max-w-[530px] space-y-4'>
          <TextBadge>Get To Know About Us</TextBadge>
          <Title h={2}>
            Discover Top <AnimatedText text='Instructors' /> Around The World
          </Title>
          <p>
            TechSprout School is an innovative online platform where young learners connect with
            world-class instructors. We transform everyday screen time into meaningful learning
            through coding, AI, and future-ready digital skills.
          </p>
          <div>
            <ul className='grid grid-cols-2 gap-6 lg:w-3/4'>
              {aboutUsInfo.map((item, index) => (
                <li key={index} className='flex items-center gap-4'>
                  <item.icon
                    size={50}
                    className={`${index % 2 === 0 ? 'text-primary' : 'text-accent'}`}
                  />
                  <div className='flex flex-col text-[14px] font-semibold lg:text-base'>
                    <span>{item.number}</span>
                    <span className='-mt-1'>{item.title}</span>
                  </div>
                </li>
              ))}
            </ul>
          </div>
          <Link href={'/about-us'}>
            <Button isArrow={true} size={'lg'}>
              Discover More
            </Button>
          </Link>
        </div>
      </div>
    </section>
  );
}
