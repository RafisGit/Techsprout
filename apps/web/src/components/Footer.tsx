import Image from 'next/image';
import footerLogo from '@/assets/img/logo.png';
import Link from 'next/link';
import { FacebookIcon, InstagramIcon, LinkedinIcon, TwitterIcon } from 'lucide-react';
import Title from './Title';

export default function Footer() {
  const year = new Date().getFullYear();

  const socialLinks: string[] = [
    'web.facebook.com/61581527937763/',
    'www.x.com',
    'www.instagram.com',
    'www.linkedin.com/company/techsprout-school',
  ];

  type FooterLink = {
    name: string;
    link: string;
  };
  const resourcesLinks: FooterLink[] = [
    {
      name: 'About',
      link: '/about',
    },
    {
      name: 'Courses',
      link: '/courses',
    },
    {
      name: 'Blog',
      link: '/blog',
    },
    {
      name: 'Contact',
      link: '/contact',
    },
    {
      name: 'Privacy Policy',
      link: '/privacy-policy',
    },
    {
      name: 'Terms & Conditions',
      link: '/terms-conditions',
    },
  ];

  const coursesLinks: FooterLink[] = [
    {
      name: 'Web Development',
      link: '/courses/web-development',
    },
    {
      name: 'Graphic Design',
      link: '/courses/graphic-design',
    },
    {
      name: 'Digital Marketing',
      link: '/courses/digital-marketing',
    },
    {
      name: 'Data Science',
      link: '/courses/data-science',
    },
    {
      name: 'UI/UX Design',
      link: '/courses/ui-ux-design',
    },
    {
      name: 'Mobile App Development',
      link: '/courses/mobile-app-development',
    },
  ];

  const workingHours: { day: string; time: string }[] = [
    {
      day: 'Monday - Friday',
      time: '9:00 AM - 6:00 PM',
    },
    {
      day: 'Saturday',
      time: '10:00 AM - 4:00 PM',
    },
    {
      day: 'Sunday',
      time: 'Closed',
    },
  ];

  return (
    <footer className='bg-primary/20 pt-20 lg:pt-[120px]'>
      <div className='mx-auto grid max-w-[1300px] grid-cols-1 gap-8 px-4 md:grid-cols-7'>
        <div className='col-span-3 space-y-2'>
          <Link href={'/'} className='block'>
            <Image src={footerLogo} alt='Tech Sprout' width={150} />
          </Link>
          <p>
            TechSprout School is an innovative online platform where young learners connect with
            world-class instructors.
          </p>
          <address className='font-semibold not-italic'>
            KHL Laboni{"'"}s Dream, Plot-06, Afroza Begum Rd, Dhaka 1229
          </address>
          <address className='font-semibold not-italic'>
            House No-46, Zia College Moar, Beside Sohid Minar, Jamalpur, Bangladesh
          </address>
          <a href={'tel:+8801785696469'} className='block font-semibold'>
            +880 1785696469
          </a>
          <a href={'mailto:info@trechsprout.com'} className='block font-semibold'>
            info@techsprout.com
          </a>
          <div className='flex items-center gap-4'>
            {socialLinks.map((link, idx) => (
              <a key={idx} href={`https://${link}`} className='text-base'>
                {idx === 0 ? (
                  <FacebookIcon />
                ) : idx === 1 ? (
                  <TwitterIcon />
                ) : idx === 2 ? (
                  <InstagramIcon />
                ) : (
                  <LinkedinIcon />
                )}
              </a>
            ))}
          </div>
        </div>
        <div className='md:ms-8'>
          <Title h={3}>Resources</Title>
          <ul className='mt-2 space-y-2'>
            {resourcesLinks.map((link, idx) => (
              <li key={idx} className='group flex items-baseline'>
                <span className='bg-accent h-1 w-0 rounded-2xl duration-300 group-hover:w-4'></span>
                <Link href={link.link} className='text-base'>
                  {link.name}
                </Link>
              </li>
            ))}
          </ul>
        </div>
        <div className='md:ms-8'>
          <Title h={3}>Courses</Title>
          <ul className='mt-2 space-y-2'>
            {coursesLinks.map((link, idx) => (
              <li key={idx} className='group flex items-baseline'>
                <span className='bg-accent h-1 w-0 rounded-2xl duration-300 group-hover:w-4'></span>
                <Link href={link.link} className='text-base'>
                  {link.name}
                </Link>
              </li>
            ))}
          </ul>
        </div>
        <div className='col-span-2 md:col-span-2'>
          <Title h={3}>Working Hours</Title>
          <ul className='mt-2'>
            {workingHours.map((item, idx) => (
              <li key={idx} className='border-accent border-b-2 py-2 text-base last:border-0'>
                <span className='font-semibold'>{item.day}:</span> {item.time}
              </li>
            ))}
          </ul>
        </div>
      </div>
      <div className='border-accent/20 mt-12 border-t-2'>
        <div className='mx-auto flex max-w-[1300px] flex-col items-center justify-between gap-4 px-4 py-6 text-center md:flex-row md:text-left'>
          <p>Copyright © {year} TechSprout School. All rights reserved.</p>
          <div className='flex items-center gap-4'>
            <Link href='/privacy-policy' className='animate-underline'>
              Privacy Policy
            </Link>
            <span className='block h-[25px] w-[2px] bg-[var(--accent)]'></span>
            <Link href='/terms-and-condition' className='animate-underline'>
              Terms & Conditions
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
