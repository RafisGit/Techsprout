'use client';

import * as React from 'react';
import Link from 'next/link';
import { ChevronDown } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface NavItemProps {
  title: string;
  href: string;
  items?: { title: string; href: string }[];
}

export function NavItemWithDropdown({ title, href, items }: NavItemProps) {
  const [isOpen, setIsOpen] = React.useState(false);
  const timeoutRef = React.useRef<NodeJS.Timeout | null>(null);

  const handleOpen = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setIsOpen(true);
  };

  const handleClose = () => {
    timeoutRef.current = setTimeout(() => {
      setIsOpen(false);
    }, 150);
  };

  return (
    <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
      <DropdownMenuTrigger asChild>
        <Link
          href={href}
          className='hover:text-primary data-[state=open]:text-primary flex h-auto items-center px-3 py-2 text-sm text-gray-700'
          onMouseEnter={handleOpen}
          onMouseLeave={handleClose}
        >
          {title}
          <ChevronDown className='ml-1 h-3 w-3' />
        </Link>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align='start'
        className='w-[200px]'
        onMouseEnter={handleOpen}
        onMouseLeave={handleClose}
      >
        {items?.map((subItem) => (
          <DropdownMenuItem key={subItem.title} asChild>
            <Link href={subItem.href} className='w-full'>
              {subItem.title}
            </Link>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
