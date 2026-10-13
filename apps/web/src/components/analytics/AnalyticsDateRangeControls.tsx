'use client';

import React, { useState, useEffect } from 'react';
import type { AnalyticsInterval } from '@techsprout/contracts';
import { Button } from '@/components/ui/button';
import { Calendar, Filter, AlertCircle } from 'lucide-react';

export interface DateRangeFilterState {
  startDate?: string;
  endDate?: string;
  interval: AnalyticsInterval;
}

interface AnalyticsDateRangeControlsProps {
  value: DateRangeFilterState;
  onChange: (next: DateRangeFilterState) => void;
}

type PresetOption = '7d' | '30d' | '90d' | 'custom';

function formatIsoDate(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function AnalyticsDateRangeControls({
  value,
  onChange,
}: AnalyticsDateRangeControlsProps) {
  const [activePreset, setActivePreset] = useState<PresetOption>('30d');
  const [customStart, setCustomStart] = useState<string>(value.startDate || '');
  const [customEnd, setCustomEnd] = useState<string>(value.endDate || '');
  const [selectedInterval, setSelectedInterval] = useState<AnalyticsInterval>(value.interval || 'day');
  const [validationError, setValidationError] = useState<string | null>(null);

  // Sync state if external value changes
  useEffect(() => {
    if (value.startDate) setCustomStart(value.startDate);
    if (value.endDate) setCustomEnd(value.endDate);
    if (value.interval) setSelectedInterval(value.interval);
  }, [value.startDate, value.endDate, value.interval]);

  const applyPreset = (preset: '7d' | '30d' | '90d') => {
    setActivePreset(preset);
    setValidationError(null);
    const now = new Date();
    const endStr = formatIsoDate(now);
    let startStr: string;
    let interval: AnalyticsInterval = 'day';

    if (preset === '7d') {
      const start = new Date(now);
      start.setDate(now.getDate() - 7);
      startStr = formatIsoDate(start);
      interval = 'day';
    } else if (preset === '30d') {
      const start = new Date(now);
      start.setDate(now.getDate() - 30);
      startStr = formatIsoDate(start);
      interval = 'day';
    } else {
      // 90d
      const start = new Date(now);
      start.setDate(now.getDate() - 90);
      startStr = formatIsoDate(start);
      interval = 'week';
    }

    setCustomStart(startStr);
    setCustomEnd(endStr);
    setSelectedInterval(interval);

    onChange({
      startDate: startStr,
      endDate: endStr,
      interval,
    });
  };

  const handleCustomApply = () => {
    if (customStart && customEnd && customStart > customEnd) {
      setValidationError('Start date cannot be after end date.');
      return;
    }
    setValidationError(null);
    setActivePreset('custom');
    onChange({
      startDate: customStart || undefined,
      endDate: customEnd || undefined,
      interval: selectedInterval,
    });
  };

  return (
    <div className='bg-white p-4 rounded-2xl border border-gray-200 shadow-xs space-y-3'>
      <div className='flex flex-wrap items-center justify-between gap-3'>
        {/* Preset Buttons */}
        <div className='flex items-center gap-1.5 bg-gray-100 p-1 rounded-xl text-xs font-semibold'>
          <button
            type='button'
            onClick={() => applyPreset('7d')}
            className={`px-3 py-1.5 rounded-lg transition-colors ${
              activePreset === '7d'
                ? 'bg-white text-gray-900 shadow-xs'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            Last 7 Days
          </button>
          <button
            type='button'
            onClick={() => applyPreset('30d')}
            className={`px-3 py-1.5 rounded-lg transition-colors ${
              activePreset === '30d'
                ? 'bg-white text-gray-900 shadow-xs'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            Last 30 Days
          </button>
          <button
            type='button'
            onClick={() => applyPreset('90d')}
            className={`px-3 py-1.5 rounded-lg transition-colors ${
              activePreset === '90d'
                ? 'bg-white text-gray-900 shadow-xs'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            Last 90 Days
          </button>
        </div>

        {/* Interval Selector */}
        <div className='flex items-center gap-2 text-xs'>
          <span className='text-gray-500 font-medium'>Interval:</span>
          <select
            value={selectedInterval}
            onChange={(e) => {
              const nextInterval = e.target.value as AnalyticsInterval;
              setSelectedInterval(nextInterval);
              onChange({
                startDate: customStart || undefined,
                endDate: customEnd || undefined,
                interval: nextInterval,
              });
            }}
            className='bg-gray-50 border border-gray-300 rounded-lg px-2.5 py-1.5 text-xs text-gray-800 font-medium focus:ring-2 focus:ring-primary focus:outline-none'
          >
            <option value='day'>Daily</option>
            <option value='week'>Weekly</option>
          </select>
        </div>
      </div>

      {/* Date Pickers for Custom Fine-Tuning */}
      <div className='flex flex-wrap items-center gap-2 pt-2 border-t border-gray-100 text-xs'>
        <div className='flex items-center gap-1.5'>
          <label htmlFor='analytics-start-date' className='text-gray-500 font-medium'>
            From:
          </label>
          <input
            id='analytics-start-date'
            type='date'
            value={customStart}
            onChange={(e) => {
              setCustomStart(e.target.value);
              setActivePreset('custom');
            }}
            className='bg-white border border-gray-300 rounded-lg px-2.5 py-1 text-xs text-gray-800 focus:ring-2 focus:ring-primary focus:outline-none'
          />
        </div>

        <div className='flex items-center gap-1.5'>
          <label htmlFor='analytics-end-date' className='text-gray-500 font-medium'>
            To:
          </label>
          <input
            id='analytics-end-date'
            type='date'
            value={customEnd}
            onChange={(e) => {
              setCustomEnd(e.target.value);
              setActivePreset('custom');
            }}
            className='bg-white border border-gray-300 rounded-lg px-2.5 py-1 text-xs text-gray-800 focus:ring-2 focus:ring-primary focus:outline-none'
          />
        </div>

        <Button
          type='button'
          size='sm'
          variant='outline'
          onClick={handleCustomApply}
          className='text-xs h-7 px-3'
        >
          <Filter className='w-3 h-3 mr-1' />
          Apply Range
        </Button>

        {validationError && (
          <div className='flex items-center gap-1 text-xs text-rose-600 font-medium ml-2'>
            <AlertCircle className='w-3.5 h-3.5' />
            <span>{validationError}</span>
          </div>
        )}
      </div>
    </div>
  );
}
