'use client';
import { useEffect, useRef, useState } from 'react';

export default function MouseFollower() {
  const followerRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  const target = useRef({ x: 0, y: 0 });
  const current = useRef({ x: 0, y: 0 });

  useEffect(() => {
    const speed = 0.15;

    const animate = () => {
      current.current.x += (target.current.x - current.current.x) * speed;
      current.current.y += (target.current.y - current.current.y) * speed;

      if (followerRef.current) {
        followerRef.current.style.left = `${current.current.x - 6}px`;
        followerRef.current.style.top = `${current.current.y - 4}px`;
      }

      requestAnimationFrame(animate);
    };

    animate();
  }, []);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      target.current = { x: e.clientX, y: e.clientY };
      setVisible(true);
    };

    const handleMouseLeave = (e: MouseEvent) => {
      if (
        e.relatedTarget === null ||
        e.clientX <= 0 ||
        e.clientY <= 0 ||
        e.clientX >= window.innerWidth ||
        e.clientY >= window.innerHeight
      ) {
        setVisible(false);
      }
    };

    const handleMouseEnter = () => {
      setVisible(true);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseleave', handleMouseLeave);
    document.addEventListener('mouseenter', handleMouseEnter);
    document.addEventListener('mouseout', handleMouseLeave);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseleave', handleMouseLeave);
      document.removeEventListener('mouseenter', handleMouseEnter);
      document.removeEventListener('mouseout', handleMouseLeave);
    };
  }, []);

  return (
    <div
      ref={followerRef}
      className={`bg-accent pointer-events-none fixed z-[9999] h-3 w-3 rounded-full transition-opacity duration-300 ${
        visible && window.innerWidth > 768 ? 'opacity-100' : 'opacity-0'
      }`}
      style={{
        top: 0,
        left: 0,
      }}
    />
  );
}
