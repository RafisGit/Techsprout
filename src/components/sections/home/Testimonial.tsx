'use client';
import { type CarouselApi } from '@/components/ui/carousel';
import AnimatedText from '@/components/AnimatedText';
import TestimonialCard from '@/components/cards/TestimonialCard';
import Title from '@/components/Title';
import { Carousel, CarouselContent, CarouselItem } from '@/components/ui/carousel';
import { testimonials } from '@/lib/mockData/mockData';
import { useEffect, useState } from 'react';
import Image from 'next/image';
import { Button } from '@/components/ui/button';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import shape1 from '@/assets/img/shapes/testi_shape01.svg';
import shape2 from '@/assets/img/shapes/testi_shape02.svg';
import shape3 from '@/assets/img/shapes/testi_shape03.svg';

export default function Testimonial() {
  const [carouselApi, setCarouselApi] = useState<CarouselApi>();
  const [currentSlide, setCurrentSlide] = useState(0);

  useEffect(() => {
    if (!carouselApi) {
      return;
    }

    carouselApi.on('select', () => {
      setCurrentSlide(carouselApi.selectedScrollSnap());
    });
  }, [carouselApi]);

  const scrollPrev = () => carouselApi?.scrollPrev();
  const scrollNext = () => carouselApi?.scrollNext();

  return (
    <section className='bg-accent/20 relative py-20 lg:py-[120px]'>
      {/* Background pattern */}
      <div className='absolute inset-0 -z-10 size-full bg-white bg-[linear-gradient(to_right,#f0f0f0_1px,transparent_1px),linear-gradient(to_bottom,#f0f0f0_1px,transparent_1px)] bg-[size:6rem_4rem]'>
        <div className='absolute inset-0 bg-[radial-gradient(circle_500px_at_50%_200px,#C9EBFF,transparent)]' />
      </div>

      <div className='common-container grid grid-cols-1 items-center gap-4 lg:grid-cols-2'>
        <div className='relative flex justify-center'>
          <Image src={shape1} width={80} className='absolute top-0 left-1/4 -z-10' alt='shape' />
          <Image src={shape2} width={80} className='absolute top-0 right-1/8' alt='shape' />
          <Image
            src={shape3}
            width={80}
            className='animate-spin-slow absolute bottom-0 left-1/6'
            alt='shape'
          />
          {testimonials.map(
            (testimonial, idx) =>
              idx === currentSlide && (
                <Image
                  src={testimonial.image}
                  key={idx}
                  alt={testimonial.message}
                  className='rounded-[45%]'
                  width={400}
                />
              )
          )}
        </div>
        <div className='max-w-[700px]'>
          <div>
            <Title h={2}>
              What Our <AnimatedText text='Students' /> Say About Our Parent Company
            </Title>
          </div>
          <Carousel
            className='mt-6'
            setApi={setCarouselApi}
            opts={{
              align: 'center',
              loop: true,
            }}
          >
            <CarouselContent>
              {testimonials.map((testimonial, idx) => (
                <CarouselItem key={idx}>
                  <TestimonialCard testimonial={testimonial} />
                </CarouselItem>
              ))}
            </CarouselContent>
          </Carousel>
          <div className='mt-4 flex items-center gap-4'>
            <Button size={'icon'} onClick={scrollPrev} className='h-12 w-12 outline-0'>
              <ArrowLeft size={40} />
            </Button>
            <Button size={'icon'} onClick={scrollNext} className='h-12 w-12 outline-0'>
              <ArrowRight size={40} />
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}
