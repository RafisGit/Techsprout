'use client';
import { useRef } from 'react';

export default function AnimatedText({ text }: { text: string }) {
  const pathRef1 = useRef<SVGPathElement>(null);
  const pathRef2 = useRef<SVGPathElement>(null);

  function pathAnimate() {
    if (pathRef1.current && pathRef2.current) {
      pathRef1.current.style.strokeDashoffset = '148';
      pathRef2.current.style.strokeDashoffset = '108';
      setTimeout(() => {
        if (pathRef1.current && pathRef2.current) {
          pathRef1.current.style.strokeDashoffset = '0';
          pathRef2.current.style.strokeDashoffset = '0';
        }
      }, 500);
    }
  }

  return (
    <span className='text-primary relative' onMouseEnter={pathAnimate}>
      <span>{text}</span>
      <span className='text-accent absolute -bottom-3 left-1/2 -translate-x-1/2'>
        <svg width='140px' viewBox='0 0 145 25' fill='none' xmlns='http://www.w3.org/2000/svg'>
          <path
            ref={pathRef1}
            d='M1.00016 15.2711C18.1407 8.34427 70.832 -1.93441 144.473 12.3652'
            stroke='currentcolor'
            strokeWidth='4'
            style={{
              strokeDasharray: '146, 148',
              strokeDashoffset: `0`,
              transition: 'stroke-dashoffset 0.5s ease-in-out',
            }}
          ></path>
          <path
            ref={pathRef2}
            d='M26.2943 14.0041C38.9177 9.44643 77.3772 3.50055 130.227 16.1786'
            stroke='currentcolor'
            strokeWidth='2'
            style={{
              strokeDasharray: '106, 108',
              strokeDashoffset: '0',
              transition: 'stroke-dashoffset 0.5s ease-in-out',
            }}
          ></path>
        </svg>
      </span>
    </span>
  );
}
