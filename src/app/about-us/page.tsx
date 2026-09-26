import AnimatedText from '@/components/AnimatedText';
import Hero from '@/components/Hero';
import Title from '@/components/Title';
import { Button } from '@/components/ui/button';
import { TextBadge } from '@/components/ui/text-badge';
import Image from 'next/image';
import Link from 'next/link';
import aboutImg1 from '@/assets/img/about/about_img03.jpg';
import aboutImg2 from '@/assets/img/about/about_img04.jpg';
import aboutImg3 from '@/assets/img/about/about_img05.jpg';
import aboutShape1 from '@/assets/img/shapes/about_shape02.png';
import aboutShape2 from '@/assets/img/shapes/about_shape03.png';
import aboutShape3 from '@/assets/img/shapes/about_dots.svg';
import TopInstructors from '@/components/sections/home/TopInstructors';
import Offer from '@/components/Offer';
import Skills from '@/components/sections/aboutUs/Skills';

export default function page() {
  return (
    <>
      <Hero pageName='About Us' />
      {/* Who we are */}
      <section className='container mx-auto grid grid-cols-1 items-center gap-4 px-4 py-16 md:grid-cols-2 lg:py-28 xl:grid-cols-3'>
        <div className='col-span-1 space-y-4'>
          <TextBadge>Who we are</TextBadge>
          <Title h={2}>
            The Leading <AnimatedText text='Place' /> For Learning
            <span className='text-primary'>&</span>
            Instruction
          </Title>
          <p>
            Our mission is to inspire curiosity, creativity, and innovation — shaping tomorrow’s
            tech leaders today.Discover top instructors from across the globe, bringing world-class
            knowledge straight to your screen. At TechSprout School, learning goes beyond boundaries
            with expert guidance in coding, AI, and digital skills.
          </p>
          <div>
            <Link href={'/courses'}>
              <Button size={'lg'} isArrow={true}>
                Explore Courses
              </Button>
            </Link>
          </div>
        </div>
        <div className='relative flex items-center gap-4 xl:col-span-2 xl:justify-center'>
          <Image src={aboutImg1} width={315} height={410} alt='about us' className='rounded-2xl' />
          <div className='flex flex-col gap-4'>
            <Image
              src={aboutImg2}
              width={265}
              height={275}
              alt='about us'
              className='rounded-2xl'
            />
            <Image
              src={aboutImg3}
              width={265}
              height={200}
              alt='about us'
              className='rounded-2xl'
            />
          </div>
          <Image
            src={aboutShape1}
            width={110}
            height={105}
            alt='shape'
            className='absolute -top-6 right-0 z-[-1] xl:right-18'
          />
          <Image
            src={aboutShape2}
            width={120}
            height={120}
            alt='shape'
            className='animate-spin-slow absolute right-0 -bottom-12 z-[-1] xl:right-16'
          />
          <Image
            src={aboutShape3}
            width={125}
            height={110}
            alt='shape'
            className='absolute bottom-0 left-0 z-[-1] xl:left-12'
          />
        </div>
      </section>
      {/* Instructors */}
      <TopInstructors />

      {/* Current Offer */}
      <Offer />

      {/* Skills */}
      <Skills />
    </>
  );
}
