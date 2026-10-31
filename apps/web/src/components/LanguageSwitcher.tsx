'use client';

import * as React from 'react';
import { Globe, Check } from 'lucide-react';
import { useTranslation, Locale, SUPPORTED_LOCALES, LOCALE_METADATA } from '@/i18n';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export interface LanguageSwitcherProps {
  className?: string;
  variant?: 'header' | 'compact' | 'sheet';
}

export function LanguageSwitcher({ className, variant = 'header' }: LanguageSwitcherProps) {
  const { locale, setLocale, t } = useTranslation();

  const currentMeta = LOCALE_METADATA[locale] || LOCALE_METADATA.en;

  if (variant === 'sheet') {
    // Button group layout designed for mobile drawer
    return (
      <div className={cn('flex flex-col space-y-1.5 w-full', className)}>
        <span className='text-xs font-semibold text-gray-500 uppercase tracking-wider px-1 flex items-center gap-1.5'>
          <Globe className='w-3.5 h-3.5 text-gray-400' />
          {t('language.label')}
        </span>
        <div className='grid grid-cols-2 gap-2'>
          {SUPPORTED_LOCALES.map((loc) => {
            const meta = LOCALE_METADATA[loc];
            const isActive = loc === locale;
            return (
              <button
                key={loc}
                type='button'
                onClick={() => setLocale(loc)}
                className={cn(
                  'flex items-center justify-between px-3 py-2 rounded-lg text-sm font-medium border transition-colors cursor-pointer',
                  isActive
                    ? 'bg-primary/10 border-primary text-primary font-semibold'
                    : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'
                )}
                aria-pressed={isActive}
                aria-label={t('language.switchTo', { lang: meta.name })}
              >
                <span className='flex items-center gap-1.5'>
                  <span className='text-base'>{meta.flag}</span>
                  <span>{meta.nativeName}</span>
                </span>
                {isActive && <Check className='w-4 h-4 text-primary' />}
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant='ghost'
          size='sm'
          className={cn(
            'flex items-center gap-1.5 h-9 px-2.5 text-sm font-medium text-gray-700 hover:text-primary hover:bg-gray-100 rounded-lg transition-colors cursor-pointer',
            className
          )}
          aria-label={t('a11y.languageSwitcher')}
        >
          <Globe className='h-4 w-4 text-gray-500' />
          <span className='font-semibold text-xs tracking-wider uppercase'>{currentMeta.code}</span>
          <span className='hidden sm:inline text-xs text-gray-500 font-normal'>
            ({currentMeta.nativeName})
          </span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align='end' className='w-40 p-1'>
        {SUPPORTED_LOCALES.map((loc) => {
          const meta = LOCALE_METADATA[loc];
          const isActive = loc === locale;
          return (
            <DropdownMenuItem
              key={loc}
              onClick={() => setLocale(loc)}
              className={cn(
                'flex items-center justify-between px-3 py-2 text-sm rounded-md cursor-pointer transition-colors',
                isActive ? 'bg-primary/10 text-primary font-semibold' : 'text-gray-700 hover:bg-gray-100'
              )}
              aria-label={t('language.switchTo', { lang: meta.name })}
            >
              <div className='flex items-center gap-2'>
                <span className='text-base'>{meta.flag}</span>
                <div className='flex flex-col text-left'>
                  <span className='font-medium leading-none'>{meta.nativeName}</span>
                  <span className='text-[10px] text-gray-500 leading-tight mt-0.5'>{meta.name}</span>
                </div>
              </div>
              {isActive && <Check className='h-4 w-4 text-primary ml-2' />}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export default LanguageSwitcher;
