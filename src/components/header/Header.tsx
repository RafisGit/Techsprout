'use client';

import * as React from 'react';
import Link from 'next/link';
import { ChevronDown, Grid3X3, Menu, Search, ShoppingCart, User } from 'lucide-react';
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
import { NavItemWithDropdown } from './nav-item-with-dropdown';
import { DialogTitle } from '@radix-ui/react-dialog';
import { getCategories } from '@/lib/mockData/mockApi';

const navigationItems = [
  {
    title: 'Home',
    href: '/',
    dropdown: false,
  },
  {
    title: 'Courses',
    href: '/courses',
    dropdown: false,
  },
  {
    title: 'Contact',
    href: '/contact',
    dropdown: false,
  },
  {
    title: 'Blog',
    href: '/blogs',
    dropdown: false,
  },
  {
    title: 'Information',
    href: '/about-us',
    dropdown: true,
    items: [
      { title: 'About Us', href: '/about-us' },
      { title: 'FAQ', href: '/faq' },
      { title: 'Privacy Policy', href: '/privacy-policy' },
    ],
  },
];

const categories = getCategories();

export function Header() {
  const [cartCount] = React.useState(0);
  const [selectedCategory, setSelectedCategory] = React.useState('Categories');
  const [isScrolled, setIsScrolled] = React.useState(false);

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

  return (
    <header
      className={`absolute top-0 z-50 w-full ${isScrolled ? 'animate-slide-down fixed bg-white shadow-md' : ''}`}
    >
      <div className='mx-auto flex h-16 max-w-[1670px] items-center justify-between px-4 lg:px-6'>
        {/* Logo */}
        <Link href='/' className='me-2 flex-shrink-0'>
          <Image width={150} height={40} src={logo} alt='Tech Sprout' />
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
                <span>{selectedCategory}</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align='start' className='w-[200px]'>
              <DropdownMenuItem
                className='cursor-pointer'
                onClick={() => setSelectedCategory('all categories')}
              >
                All Categories
              </DropdownMenuItem>
              {categories.map((category) => (
                <DropdownMenuItem
                  key={category}
                  onClick={() => setSelectedCategory(category)}
                  className='cursor-pointer'
                >
                  {category}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Search Input */}
          <div className='relative max-w-xs flex-1'>
            <input
              type='text'
              placeholder='Search courses...'
              className='focus:border-primary focus:ring-primary h-10 w-full rounded-md border border-gray-300 pr-10 pl-4 text-sm focus:ring-2 focus:outline-none'
            />
            <Button
              size={'icon'}
              variant={'ghost'}
              className='hover:text-primary absolute top-1/2 right-3 h-4 w-4 -translate-y-1/2 transform text-gray-400 hover:bg-transparent'
            >
              <Search />
            </Button>
          </div>
        </div>

        {/* Right Side Actions */}
        <div className='flex items-center space-x-2 sm:space-x-3'>
          {/* Cart */}
          <Button className='relative' variant={'ghost'} size={'icon'}>
            <ShoppingCart className='size-6' />
            {cartCount > 0 && (
              <Badge className='absolute -top-2 -right-2 h-5 w-5 rounded-full p-0 text-xs'>
                {cartCount}
              </Badge>
            )}
          </Button>

          {/* Log In */}
          <Link
            href='/login'
            className='hover:text-accent hidden whitespace-nowrap text-gray-700 uppercase hover:underline sm:block'
          >
            LogIn
          </Link>

          {/* Register Button */}
          <Link href={'/register'}>
            <Button className='bg-primary hidden px-3 text-sm whitespace-nowrap sm:flex'>
              Register
            </Button>
          </Link>

          {/* Mobile Menu Trigger (visible on screens smaller than lg) */}
          <Sheet>
            <SheetTrigger asChild>
              <Button variant={'ghost'} size={'icon'} className='xl:hidden'>
                <Menu className='size-6' />
              </Button>
            </SheetTrigger>
            <SheetContent side='right' className='w-[300px] px-4 sm:w-[400px]'>
              <DialogTitle className='sr-only'>Mobile Navigation Menu</DialogTitle>
              <div className='mt-12 flex flex-col space-y-4'>
                {/* Mobile Search (inside sheet) */}
                <div className='relative'>
                  <input
                    type='text'
                    placeholder='Search courses...'
                    className='focus:border-primary focus:ring-primary h-10 w-full rounded-md border border-gray-300 pr-10 pl-4 focus:ring-2 focus:outline-none'
                  />
                  <Button
                    size={'icon'}
                    variant={'ghost'}
                    className='hover:text-primary absolute top-1/2 right-3 h-4 w-4 -translate-y-1/2 transform text-gray-400 hover:bg-transparent'
                  >
                    <Search />
                  </Button>
                </div>

                {/* Mobile Categories Dropdown (inside sheet) */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button className='bg-primary hover:bg-accent w-full justify-between'>
                      <div className='flex items-center'>
                        <Grid3X3 className='mr-2 h-4 w-4' />
                        {selectedCategory}
                      </div>
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align='start' className='w-full'>
                    <DropdownMenuItem
                      className='cursor-pointer'
                      onClick={() => setSelectedCategory('all categories')}
                    >
                      All Categories
                    </DropdownMenuItem>
                    {categories.map((category) => (
                      <DropdownMenuItem
                        key={category}
                        onClick={() => setSelectedCategory(category)}
                        className='cursor-pointer'
                      >
                        {category}
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
                        className='hover:bg-accent hover:text-accent-foreground block rounded-md px-3 py-2 text-sm font-medium'
                      >
                        {item.title}
                      </Link>
                    )
                  )}
                </div>

                {/* Mobile Actions (inside sheet) */}
                <div className='space-y-2 border-t pt-4'>
                  <Link href='/login' className='block'>
                    <Button variant='ghost' className='w-full justify-start'>
                      <User className='mr-2 h-4 w-4' />
                      Log In
                    </Button>
                  </Link>
                  <Button className='bg-primary hover:bg-accent w-full'>Register</Button>
                </div>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
}
