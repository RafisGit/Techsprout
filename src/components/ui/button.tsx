'use client';
import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md uppercase font-medium transition-all disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive cursor-pointer",
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground shadow-xs hover:bg-accent',
        destructive:
          'bg-destructive text-white shadow-xs hover:bg-destructive/90 focus-visible:ring-destructive/20 dark:focus-visible:ring-destructive/40 dark:bg-destructive/60',
        outline:
          'border bg-background shadow-xs hover:bg-accent hover:text-accent-foreground dark:bg-input/30 dark:border-input dark:hover:bg-input/50 text-primary border-2 border-primary',
        secondary: 'bg-secondary text-secondary-foreground shadow-xs hover:bg-secondary/80',
        ghost: 'hover:bg-accent hover:text-accent-foreground dark:hover:bg-accent/50',
        link: 'text-primary underline-offset-4 hover:underline',
      },
      size: {
        default: 'h-9 px-4 py-2 has-[>svg]:px-3',
        sm: 'h-8 rounded-md gap-1.5 px-3 has-[>svg]:px-2.5',
        lg: 'h-10 rounded-md px-6 has-[>svg]:px-4',
        icon: 'size-9',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
);

function Button({
  className,
  variant,
  size,
  asChild = false,
  isArrow,
  ...props
}: React.ComponentProps<'button'> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
    isArrow?: boolean;
  }) {
  const arrowRef = React.useRef<SVGPathElement>(null);
  const Comp = asChild ? Slot : 'button';

  function handleMouseEnter() {
    if (arrowRef.current) {
      arrowRef.current.style.strokeDashoffset = '28';
      setTimeout(() => {
        if (arrowRef.current) {
          arrowRef.current.style.strokeDashoffset = '0';
        }
      }, 500);
    }
  }

  return (
    <Comp
      data-slot='button'
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
      onMouseEnter={handleMouseEnter}
    >
      <span className='mt-0.5 flex gap-2'>{props.children}</span>
      {isArrow && (
        <svg
          width='100%'
          height='100%'
          viewBox='0 0 14 13'
          fill='none'
          xmlns='http://www.w3.org/2000/svg'
        >
          <path
            ref={arrowRef}
            d='M12.6249 6.81239H1.00011M12.6249 6.81239L7.78123 1.96873M12.6249 6.81239L7.78123 11.656'
            stroke='currentColor'
            strokeWidth='2'
            strokeLinecap='round'
            strokeLinejoin='round'
            style={{
              strokeDasharray: '26, 28',
              strokeDashoffset: `0`,
              transition: 'stroke-dashoffset 0.5s ease-in-out',
            }}
          ></path>
        </svg>
      )}
    </Comp>
  );
}

export { Button, buttonVariants };
