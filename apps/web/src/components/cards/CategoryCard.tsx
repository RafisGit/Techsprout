import React from 'react';
import Link from 'next/link';
import Title from '../Title';
import {
  Code,
  LayoutTemplate,
  Smartphone,
  Bot,
  Sparkles,
  Gamepad2,
  FolderTree,
} from 'lucide-react';
import type { CategoryDto } from '@techsprout/contracts';

interface CategoryCardProps {
  category: CategoryDto | { name: string; slug?: string; courseCount?: number } | string;
}

function getCategoryIcon(name: string) {
  const lower = name.toLowerCase();
  if (lower.includes('game')) return <Gamepad2 className='w-8 h-8' />;
  if (lower.includes('ai') || lower.includes('artificial')) return <Sparkles className='w-8 h-8' />;
  if (lower.includes('robot')) return <Bot className='w-8 h-8' />;
  if (lower.includes('mobile') || lower.includes('app')) return <Smartphone className='w-8 h-8' />;
  if (lower.includes('design')) return <LayoutTemplate className='w-8 h-8' />;
  if (lower.includes('web')) return <Code className='w-8 h-8' />;
  return <FolderTree className='w-8 h-8' />;
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export default function CategoryCard({ category }: CategoryCardProps) {
  const name = typeof category === 'string' ? category : category.name;
  const slug = (typeof category !== 'string' && category.slug) ? category.slug : slugify(name);
  const count = (typeof category !== 'string' && category.courseCount !== undefined)
    ? category.courseCount
    : 0;

  return (
    <Link href={`/categories/${slug}`} className='block group'>
      <div className='bg-primary/10 hover:bg-primary/20 transition-all duration-300 flex w-56 flex-col items-center justify-center space-y-3 rounded-2xl p-7 text-center xl:w-52 shadow-xs group-hover:shadow-md'>
        <div className='group-hover:bg-primary group-hover:text-white w-fit rounded-full bg-white p-5 text-primary duration-300 shadow-xs flex items-center justify-center'>
          {getCategoryIcon(name)}
        </div>
        <Title h={6} className='font-bold text-gray-900 group-hover:text-primary transition-colors line-clamp-1'>
          {name}
        </Title>
        <p className='text-xs font-medium text-gray-500'>
          {count < 10 ? `0${count}` : count} {count === 1 ? 'Course' : 'Courses'}
        </p>
      </div>
    </Link>
  );
}
