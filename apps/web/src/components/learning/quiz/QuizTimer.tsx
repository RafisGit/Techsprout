'use client';

import React, { useState, useEffect } from 'react';
import { Clock, AlertTriangle } from 'lucide-react';

interface QuizTimerProps {
  expiresAt: string | null | undefined;
  onExpire?: () => void;
  isSubmitting?: boolean;
}

export function QuizTimer({ expiresAt, onExpire, isSubmitting }: QuizTimerProps) {
  const [secondsRemaining, setSecondsRemaining] = useState<number | null>(null);

  useEffect(() => {
    if (!expiresAt) {
      setSecondsRemaining(null);
      return;
    }

    const calculateRemaining = () => {
      const expiryTime = new Date(expiresAt).getTime();
      const now = Date.now();
      const diffSeconds = Math.max(0, Math.floor((expiryTime - now) / 1000));
      return diffSeconds;
    };

    const initial = calculateRemaining();
    setSecondsRemaining(initial);

    if (initial <= 0) {
      onExpire?.();
      return;
    }

    const timer = setInterval(() => {
      const remaining = calculateRemaining();
      setSecondsRemaining(remaining);

      if (remaining <= 0) {
        clearInterval(timer);
        onExpire?.();
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [expiresAt, onExpire]);

  if (secondsRemaining === null) {
    return null;
  }

  const minutes = Math.floor(secondsRemaining / 60);
  const seconds = secondsRemaining % 60;
  const formattedTime = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;

  const isWarning = secondsRemaining <= 300 && secondsRemaining > 60; // < 5 mins
  const isCritical = secondsRemaining <= 60; // < 1 min

  return (
    <div
      data-testid='quiz-timer'
      role='timer'
      aria-live='polite'
      aria-label={`Time remaining: ${minutes} minutes and ${seconds} seconds`}
      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-mono text-xs font-bold transition-colors ${
        isCritical
          ? 'bg-rose-50 text-rose-700 border border-rose-200 animate-pulse'
          : isWarning
          ? 'bg-amber-50 text-amber-700 border border-amber-200'
          : 'bg-gray-100 text-gray-700 border border-gray-200'
      }`}
    >
      {isCritical ? (
        <AlertTriangle className='w-3.5 h-3.5 text-rose-600' />
      ) : (
        <Clock className='w-3.5 h-3.5 text-gray-500' />
      )}
      <span>{formattedTime}</span>
      {isSubmitting && <span className='text-[10px] text-gray-400 font-sans'>(Submitting...)</span>}
    </div>
  );
}
