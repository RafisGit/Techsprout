'use client';
import { cn } from '@/lib/utils';
import clsx, { ClassValue } from 'clsx';
import { JSX } from 'react';

export default function Title({
  h,
  children,
  className,
}: {
  h: number;
  children?: React.ReactNode;
  className?: ClassValue;
}) {
  if (1 <= h && h <= 6) {
    const Tag = `h${h}` as keyof JSX.IntrinsicElements;

    const style = clsx('font-semibold text-foreground font-lexend leading-tight', {
      'lg:text-[55px] text-[32px]': h == 1,
      'lg:text-[36px] text-[30px]': h === 2,
      'lg:text-[24px]': h === 3,
      'lg:text-[22px]': h === 4,
      'lg:text-[20px]': h === 5,
      'text-base': h === 6,
    });
    return <Tag className={cn(style, className)}>{children}</Tag>;
  }
}
