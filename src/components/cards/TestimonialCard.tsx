import { Testimonial } from '@/lib/mockData/mockDataTypes';
import { Quote } from 'lucide-react';

export default function TestimonialCard({ testimonial }: { testimonial: Testimonial }) {
  const { message, name, occupation } = testimonial;
  return (
    <div className='space-y-4'>
      <Quote size={80} className='rotate-180' />
      <p className='text-lg font-medium'>&quot;{message}&quot;</p>
      <div>
        <hr />
        <span className='bg-primary relative bottom-[4px] block h-2 w-11 rounded-2xl'></span>
      </div>
      <div>
        <h4 className='font-lexend text-xl font-semibold'>{name}</h4>
        <p className='font-lexend text-base font-medium opacity-70'>{occupation}</p>
      </div>
    </div>
  );
}
