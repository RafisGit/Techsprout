'use client';

import * as React from 'react';
import Link from 'next/link';
import {
  ChevronDown,
  Grid3X3,
  Menu,
  Search,
  ShoppingCart,
  User,
  BookOpen,
  Receipt,
  GraduationCap,
  LayoutDashboard,
  LogOut,
} from 'lucide-react';
import Image from 'next/image';
import logo from '@/assets/img/logo.png';

import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useRouter } from 'next/navigation';
import { NavItemWithDropdown } from './nav-item-with-dropdown';
import { DialogTitle } from '@radix-ui/react-dialog';
import { useQuery } from '@tanstack/react-query';
import { fetchPublicCategories } from '@/lib/api/catalog';
import { useCurrentUser } from '@/lib/useCurrentUser';
import { logoutUser } from '@/lib/session';
import { NotificationBell } from './NotificationBell';
import { useTranslation } from '@/i18n';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';

export function Header() {
  const router = useRouter();
  const { t } = useTranslation();
  const [cartCount] = React.useState(0);
  const [selectedCategory, setSelectedCategory] = React.useState<string | null>(null);
  const [searchInput, setSearchInput] = React.useState('');
  const [isScrolled, setIsScrolled] = React.useState(false);
  const [isMobileNavOpen, setIsMobileNavOpen] = React.useState(false);

  const navigationItems = [
    {
      title: t('nav.home'),
      href: '/',
      dropdown: false,
    },
    {
      title: t('nav.courses'),
      href: '/courses',
      dropdown: false,
    },
    {
      title: t('nav.contact'),
      href: '/contact',
      dropdown: false,
    },
    {
      title: t('nav.blog'),
      href: '/blogs',
      dropdown: false,
    },
    {
      title: t('nav.information'),
      href: '/about-us',
      dropdown: true,
      items: [
        { title: t('nav.aboutUs'), href: '/about-us' },
        { title: t('nav.faq'), href: '/faq' },
        { title: t('nav.privacyPolicy'), href: '/privacy-policy' },
      ],
    },
  ];

  const { data: categories = [] } = useQuery({
    queryKey: ['publicCategories'],
    queryFn: fetchPublicCategories,
    staleTime: 5 * 60 * 1000,
  });

  const { data: currentUser } = useCurrentUser();

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchInput.trim()) {
      setIsMobileNavOpen(false);
      router.push(`/courses?search=${encodeURIComponent(searchInput.trim())}`);
    }
  };

  React.useEffect(() => {
    const handleScroll = () => {
      if (window.scrollY > 500) {
        setIsScrolled(true);
      } else {
        setIsScrolled(false);
      }
    };

    window.addEventListener('scroll', handleScroll);
    return () => {
      window.removeEventListener('scroll', handleScroll);
    };
  }, []);

  const categoryDisplayLabel = selectedCategory || t('nav.categories');

  return (
    <header
      className={`absolute top-0 z-50 w-full ${isScrolled ? 'animate-slide-down fixed bg-white shadow-md' : ''}`}
    >
      <div className='mx-auto flex h-16 max-w-[1670px] items-center justify-between px-4 lg:px-6'>
        {/* Logo */}
        <Link href='/' className='me-2 flex-shrink-0'>
          <Image width={150} height={40} src={logo} alt={t('a11y.logo')} />
        </Link>

        {/* Desktop Navigation (visible on xl and up) */}
        <div className='hidden items-center space-x-1 xl:flex'>
          {navigationItems.map((item) =>
            item.dropdown ? (
              <NavItemWithDropdown
                key={item.title}
                title={item.title}
                href={item.href}
                items={item.items}
              />
            ) : (
              <Link
                key={item.title}
                href={item.href}
                className='hover:text-primary h-auto px-3 py-2 text-sm text-gray-700'
              >
                {item.title}
              </Link>
            )
          )}
        </div>

        {/* Center Section - Categories and Search (visible on lg and up) */}
        <div className='hidden flex-1 items-center justify-center space-x-3 lg:flex'>
          {/* Categories Dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant='default'
                className='flex h-10 items-center space-x-2 text-sm whitespace-nowrap capitalize'
              >
                <Grid3X3 className='h-4 w-4' />
                <span>{categoryDisplayLabel}</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align='start' className='w-[200px]'>
              <DropdownMenuItem
                className='cursor-pointer'
                onClick={() => {
                  setSelectedCategory(t('nav.allCategories'));
                  router.push('/courses');
                }}
              >
                {t('nav.allCategories')}
              </DropdownMenuItem>
              {categories.map((category) => (
                <DropdownMenuItem
                  key={category.id}
                  onClick={() => {
                    setSelectedCategory(category.name);
                    router.push(`/categories/${category.slug}`);
                  }}
                  className='cursor-pointer'
                >
                  {category.name}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Search Input */}
          <form onSubmit={handleSearch} className='relative max-w-xs flex-1'>
            <input
              type='text'
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder={t('actions.searchPlaceholder')}
              className='focus:border-primary focus:ring-primary h-10 w-full rounded-md border border-gray-300 pr-10 pl-4 text-sm focus:ring-2 focus:outline-none'
              aria-label={t('a11y.search')}
            />
            <Button
              type='submit'
              size={'icon'}
              variant={'ghost'}
              className='hover:text-primary absolute top-1/2 right-3 h-4 w-4 -translate-y-1/2 transform text-gray-400 hover:bg-transparent'
              aria-label={t('actions.search')}
            >
              <Search />
            </Button>
          </form>
        </div>

        {/* Right Side Actions */}
        <div className='flex items-center space-x-2 sm:space-x-3'>
          {/* Language Switcher (Desktop & Tablet) */}
          <LanguageSwitcher variant='header' className='hidden sm:flex' />

          {/* Cart */}
          <Button className='relative' variant={'ghost'} size={'icon'} aria-label={t('a11y.cart')}>
            <ShoppingCart className='size-6' />
            {cartCount > 0 && (
              <Badge className='absolute -top-2 -right-2 h-5 w-5 rounded-full p-0 text-xs'>
                {cartCount}
              </Badge>
            )}
          </Button>

          {/* User Links / Log In */}
          {currentUser ? (
            <div className='hidden items-center space-x-3 sm:flex'>
              {currentUser.role === 'instructor' && (
                <Link
                  href='/instructor/dashboard'
                  className='hover:text-primary whitespace-nowrap text-sm font-semibold text-primary flex items-center gap-1.5'
                >
                  <GraduationCap className='w-4 h-4' />
                  {t('nav.instructorPortal')}
                </Link>
              )}
              {currentUser.role === 'admin' && (
                <Link
                  href='/admin/courses'
                  className='hover:text-primary whitespace-nowrap text-sm font-semibold text-primary flex items-center gap-1.5'
                >
                  <LayoutDashboard className='w-4 h-4' />
                  {t('nav.adminPortal')}
                </Link>
              )}
              <Link
                href='/my-courses'
                className='hover:text-primary whitespace-nowrap text-sm font-semibold text-gray-700'
              >
                {t('nav.myCourses')}
              </Link>
              <Link
                href='/orders'
                className='hover:text-primary whitespace-nowrap text-sm font-semibold text-gray-700'
              >
                {t('nav.orders')}
              </Link>
              <NotificationBell />
              <button
                onClick={() => logoutUser()}
                className='hover:text-red-600 whitespace-nowrap text-sm font-semibold text-gray-700 transition-colors cursor-pointer flex items-center gap-1'
                title={t('actions.signOut')}
                aria-label={t('actions.signOut')}
              >
                <LogOut className='w-4 h-4' />
                <span className='hidden lg:inline'>{t('actions.signOut')}</span>
              </button>
            </div>
          ) : (
            <>
              {/* Log In */}
              <Link
                href='/login'
                className='hover:text-accent hidden whitespace-nowrap text-gray-700 uppercase hover:underline sm:block text-sm font-semibold'
              >
                {t('actions.login')}
              </Link>

              {/* Register Button */}
              <Link href={'/register'}>
                <Button className='bg-primary hidden px-3 text-sm whitespace-nowrap sm:flex'>
                  {t('actions.register')}
                </Button>
              </Link>
            </>
          )}

          {/* Mobile notification bell when logged in */}
          {currentUser && (
            <div className='sm:hidden flex items-center mr-1'>
              <NotificationBell />
            </div>
          )}

          {/* Mobile Menu Trigger (visible on screens smaller than xl) */}
          <Sheet open={isMobileNavOpen} onOpenChange={setIsMobileNavOpen}>
            <SheetTrigger asChild>
              <Button
                variant={'ghost'}
                size={'icon'}
                className='xl:hidden'
                aria-label={t('a11y.openMenu')}
              >
                <Menu className='size-6' />
              </Button>
            </SheetTrigger>
            <SheetContent side='right' className='w-[300px] px-4 sm:w-[400px]'>
              <DialogTitle className='sr-only'>{t('a11y.openMenu')}</DialogTitle>
              <div className='mt-8 flex flex-col space-y-4'>
                {/* Mobile Language Switcher (inside sheet) */}
                <div className='pt-2 pb-2 border-b border-gray-100'>
                  <LanguageSwitcher variant='sheet' />
                </div>

                {/* Mobile Search (inside sheet) */}
                <form onSubmit={handleSearch} className='relative'>
                  <input
                    type='text'
                    value={searchInput}
                    onChange={(e) => setSearchInput(e.target.value)}
                    placeholder={t('actions.searchPlaceholder')}
                    className='focus:border-primary focus:ring-primary h-10 w-full rounded-md border border-gray-300 pr-10 pl-4 focus:ring-2 focus:outline-none text-sm'
                    aria-label={t('a11y.search')}
                  />
                  <Button
                    type='submit'
                    size={'icon'}
                    variant={'ghost'}
                    className='hover:text-primary absolute top-1/2 right-3 h-4 w-4 -translate-y-1/2 transform text-gray-400 hover:bg-transparent'
                    aria-label={t('actions.search')}
                  >
                    <Search />
                  </Button>
                </form>

                {/* Mobile Categories Dropdown (inside sheet) */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button className='bg-primary hover:bg-accent w-full justify-between'>
                      <div className='flex items-center'>
                        <Grid3X3 className='mr-2 h-4 w-4' />
                        {categoryDisplayLabel}
                      </div>
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align='start' className='w-full'>
                    <DropdownMenuItem
                      className='cursor-pointer'
                      onClick={() => {
                        setSelectedCategory(t('nav.allCategories'));
                        setIsMobileNavOpen(false);
                        router.push('/courses');
                      }}
                    >
                      {t('nav.allCategories')}
                    </DropdownMenuItem>
                    {categories.map((category) => (
                      <DropdownMenuItem
                        key={category.id}
                        onClick={() => {
                          setSelectedCategory(category.name);
                          setIsMobileNavOpen(false);
                          router.push(`/categories/${category.slug}`);
                        }}
                        className='cursor-pointer'
                      >
                        {category.name}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>

                {/* Mobile Navigation (inside sheet) */}
                <div className='space-y-2'>
                  {navigationItems.map((item) =>
                    item.dropdown ? (
                      <Collapsible key={item.title}>
                        <CollapsibleTrigger className='hover:bg-accent flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm font-medium hover:text-white'>
                          {item.title}
                          <ChevronDown className='h-4 w-4' />
                        </CollapsibleTrigger>
                        <CollapsibleContent className='space-y-1 pl-4'>
                          {item.items?.map((subItem) => (
                            <Link
                              key={subItem.title}
                              href={subItem.href}
                              onClick={() => setIsMobileNavOpen(false)}
                              className='hover:bg-accent block rounded-md px-3 py-2 text-sm text-gray-600 hover:text-white'
                            >
                              {subItem.title}
                            </Link>
                          ))}
                        </CollapsibleContent>
                      </Collapsible>
                    ) : (
                      <Link
                        key={item.title}
                        href={item.href}
                        onClick={() => setIsMobileNavOpen(false)}
                        className='hover:bg-accent hover:text-accent-foreground block rounded-md px-3 py-2 text-sm font-medium'
                      >
                        {item.title}
                      </Link>
                    )
                  )}
                </div>

                {/* Mobile Actions (inside sheet) */}
                <div className='space-y-2 border-t pt-4'>
                  {currentUser ? (
                    <>
                      {currentUser.role === 'instructor' && (
                        <Link
                          href='/instructor/dashboard'
                          className='block'
                          onClick={() => setIsMobileNavOpen(false)}
                        >
                          <Button variant='default' className='w-full justify-start bg-primary text-white'>
                            <GraduationCap className='mr-2 h-4 w-4' />
                            {t('nav.instructorPortal')}
                          </Button>
                        </Link>
                      )}
                      {currentUser.role === 'admin' && (
                        <Link
                          href='/admin/courses'
                          className='block'
                          onClick={() => setIsMobileNavOpen(false)}
                        >
                          <Button variant='default' className='w-full justify-start bg-primary text-white'>
                            <LayoutDashboard className='mr-2 h-4 w-4' />
                            {t('nav.adminPortal')}
                          </Button>
                        </Link>
                      )}
                      <Link
                        href='/my-courses'
                        className='block'
                        onClick={() => setIsMobileNavOpen(false)}
                      >
                        <Button variant='outline' className='w-full justify-start'>
                          <BookOpen className='mr-2 h-4 w-4' />
                          {t('nav.myCourses')}
                        </Button>
                      </Link>
                      <Link
                        href='/orders'
                        className='block'
                        onClick={() => setIsMobileNavOpen(false)}
                      >
                        <Button variant='outline' className='w-full justify-start'>
                          <Receipt className='mr-2 h-4 w-4' />
                          {t('nav.orders')}
                        </Button>
                      </Link>
                      <button
                        className='flex items-center w-full px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 rounded-lg transition-colors text-left cursor-pointer'
                        onClick={() => {
                          setIsMobileNavOpen(false);
                          logoutUser();
                        }}
                      >
                        <LogOut className='mr-2 h-4 w-4' />
                        {t('actions.signOut')}
                      </button>
                    </>
                  ) : (
                    <>
                      <Link
                        href='/login'
                        className='block'
                        onClick={() => setIsMobileNavOpen(false)}
                      >
                        <Button variant='ghost' className='w-full justify-start'>
                          <User className='mr-2 h-4 w-4' />
                          {t('actions.login')}
                        </Button>
                      </Link>
                      <Link
                        href='/register'
                        className='block'
                        onClick={() => setIsMobileNavOpen(false)}
                      >
                        <Button className='bg-primary hover:bg-accent w-full'>
                          {t('actions.register')}
                        </Button>
                      </Link>
                    </>
                  )}
                </div>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
}
