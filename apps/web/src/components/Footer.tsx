'use client';

import Image from 'next/image';
import footerLogo from '@/assets/img/logo.png';
import Link from 'next/link';
import { FacebookIcon, InstagramIcon, LinkedinIcon, TwitterIcon } from 'lucide-react';
import Title from './Title';
import { useTranslation } from '@/i18n';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';

export default function Footer() {
  const { t, formatNumber } = useTranslation();
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
      name: t('nav.aboutUs'),
      link: '/about-us',
    },
    {
      name: t('nav.courses'),
      link: '/courses',
    },
    {
      name: t('nav.blog'),
      link: '/blogs',
    },
    {
      name: t('nav.contact'),
      link: '/contact',
    },
    {
      name: t('footer.privacyPolicy'),
      link: '/privacy-policy',
    },
    {
      name: t('footer.termsConditions'),
      link: '/terms-and-condition',
    },
  ];

  const coursesLinks: FooterLink[] = [
    {
      name: 'Web Development',
      link: '/courses',
    },
    {
      name: 'Graphic Design',
      link: '/courses',
    },
    {
      name: 'Digital Marketing',
      link: '/courses',
    },
    {
      name: 'Data Science',
      link: '/courses',
    },
    {
      name: 'UI/UX Design',
      link: '/courses',
    },
    {
      name: 'Mobile App Development',
      link: '/courses',
    },
  ];

  const workingHours: { day: string; time: string }[] = [
    {
      day: t('footer.monFri'),
      time: t('footer.monFriHours'),
    },
    {
      day: t('footer.saturday'),
      time: t('footer.satHours'),
    },
    {
      day: t('footer.sunday'),
      time: t('footer.closed'),
    },
  ];

  return (
    <footer className='bg-primary/20 pt-20 lg:pt-[120px]'>
      <div className='mx-auto grid max-w-[1300px] grid-cols-1 gap-8 px-4 md:grid-cols-7'>
        <div className='col-span-3 space-y-2'>
          <Link href={'/'} className='block'>
            <Image src={footerLogo} alt={t('a11y.logo')} width={150} />
          </Link>
          <p>
            {t('footer.aboutText')}
          </p>
          <address className='font-semibold not-italic'>
            {t('footer.addressDhaka')}
          </address>
          <address className='font-semibold not-italic'>
            {t('footer.addressJamalpur')}
          </address>
          <a href={'tel:+8801785696469'} className='block font-semibold'>
            +880 1785696469
          </a>
          <a href={'mailto:info@techsprout.com'} className='block font-semibold'>
            info@techsprout.com
          </a>
          <div className='flex items-center gap-4 pt-2'>
            {socialLinks.map((link, idx) => (
              <a key={idx} href={`https://${link}`} className='text-base' aria-label={`Social link ${idx + 1}`}>
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
          <div className='pt-3 sm:hidden'>
            <LanguageSwitcher variant='header' />
          </div>
        </div>
        <div className='md:ms-8'>
          <Title h={3}>{t('footer.resources')}</Title>
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
          <Title h={3}>{t('footer.courses')}</Title>
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
          <Title h={3}>{t('footer.workingHours')}</Title>
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
          <p>{t('footer.copyright', { year: formatNumber(year) })}</p>
          <div className='flex items-center gap-4'>
            <Link href='/privacy-policy' className='animate-underline'>
              {t('footer.privacyPolicy')}
            </Link>
            <span className='block h-[25px] w-[2px] bg-[var(--accent)]'></span>
            <Link href='/terms-and-condition' className='animate-underline'>
              {t('footer.termsConditions')}
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
