'use client';
import Hero from '@/components/Hero';
import ContactForm from '@/components/sections/contact/ContactForm';
import Title from '@/components/Title';
import { Mail, MapPin, Phone } from 'lucide-react';

export default function Page() {
  return (
    <>
      <Hero pageName='Contact' />
      <section className='container mx-auto my-8 grid grid-cols-1 gap-8 px-4 md:mb-24 lg:my-16 lg:grid-cols-2 lg:gap-12'>
        {/* Keep In Touch With Us Section */}
        <div className='flex flex-col items-start'>
          <Title h={2}>Keep In Touch With Us</Title>
          <div className='bg-primary mb-8 h-1 w-24' />
          <p className='mb-10 text-lg leading-relaxed text-gray-600'>
            Reach out to us if you have any questions, inquiries, or feedback. We&apos;d love to
            hear from you!
          </p>

          <div className='w-full space-y-8'>
            <div className='flex items-start space-x-4'>
              <div className='bg-primary flex-shrink-0 rounded-full p-3 text-white'>
                <MapPin className='h-6 w-6' />
              </div>
              <div className='flex flex-col'>
                <address className='text-lg font-medium not-italic'>
                  KHL Laboni{"'"}s Dream, Plot-06, Afroza Begum Rd, Dhaka 1229
                </address>
                <address className='text-lg text-gray-600 not-italic'>
                  House No-46, Zia College Moar, Beside Sohid Minar, Jamalpur, Bangladesh
                </address>
              </div>
            </div>

            <div className='flex items-start space-x-4'>
              <div className='bg-primary flex-shrink-0 rounded-full p-3 text-white'>
                <Phone className='h-6 w-6' />
              </div>
              <div className='flex flex-col'>
                <a href={'tel:+8801785696469'} className='text-lg font-medium'>
                  +880 1785696469
                </a>
                <a href={'tel:+880 17 935 44335'} className='text-lg text-gray-600'>
                  +880 17 935 44335
                </a>
              </div>
            </div>

            <div className='flex items-start space-x-4'>
              <div className='bg-primary flex-shrink-0 rounded-full p-3 text-white'>
                <Mail className='h-6 w-6' />
              </div>
              <div className='flex flex-col'>
                <a href={'mailto:info@trechsprout.com'} className='text-lg font-medium'>
                  info@techsprout.com
                </a>
                <a href={'mailto:support@trechsprout.com'} className='text-lg text-gray-600'>
                  support@techsprout.com
                </a>
              </div>
            </div>
          </div>
        </div>

        {/* Get in Touch Form Section */}
        <ContactForm />
      </section>
      <section className='relative h-[300px] md:h-[550px]'>
        <iframe
          className='min-h-[400px]'
          src={
            'https://www.google.com/maps/embed?pb=!1m14!1m8!1m3!1d14474.096950431665!2d89.941474!3d24.914205!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x39fd7f5ce07e179d%3A0x209802aa6366f9da!2sWebtricker%20Web%20Design%20%26%20Development%20Agency!5e0!3m2!1sen!2sus!4v1693518943068!5m2!1sen!2sus'
          }
          width='100%'
          height='100%'
          title='Google Maps location of Webtricker Office'
          loading='lazy'
        ></iframe>
      </section>
    </>
  );
}
