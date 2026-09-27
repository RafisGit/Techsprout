'use client';
import { getBrands } from '@/lib/mockData/mockApi';
import Image from 'next/image';
import Marquee from 'react-fast-marquee';

const brands = getBrands();

export default function Brands() {
  return (
    <section className='border-b-2 bg-white py-12'>
      <div className='common-container'>
        <Marquee>
          {brands.map((brand, idx) => (
            <div
              key={idx}
              className='mx-12 flex basis-1/6 items-center justify-center opacity-50 grayscale-100 transition-none duration-300 select-none hover:opacity-100 hover:grayscale-0'
            >
              <Image src={brand?.src} width={120} height={50} alt='brand' />
            </div>
          ))}
        </Marquee>
      </div>
    </section>
  );
}
