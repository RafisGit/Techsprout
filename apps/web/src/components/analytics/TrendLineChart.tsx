'use client';

import React, { useState } from 'react';
import type { EnrollmentTrendDataPoint, AnalyticsInterval } from '@techsprout/contracts';
import { Button } from '@/components/ui/button';
import { Table, Eye, EyeOff } from 'lucide-react';

interface TrendLineChartProps {
  data: EnrollmentTrendDataPoint[];
  title?: string;
  interval?: AnalyticsInterval;
}

export function TrendLineChart({
  data,
  title = 'Enrollment Growth Trend',
  interval = 'day',
}: TrendLineChartProps) {
  const [showTable, setShowTable] = useState(false);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  if (!data || data.length === 0) {
    return (
      <div
        role='region'
        aria-label={title}
        className='bg-white rounded-2xl border border-gray-200 p-8 text-center text-gray-500'
      >
        <p className='text-sm font-medium'>No enrollment activity recorded for this period.</p>
        <p className='text-xs text-gray-400 mt-1'>
          New student enrollments will appear here once registered.
        </p>
      </div>
    );
  }

  // Dimensions & Padding
  const width = 640;
  const height = 240;
  const padLeft = 45;
  const padRight = 25;
  const padTop = 25;
  const padBottom = 40;

  const plotWidth = width - padLeft - padRight;
  const plotHeight = height - padTop - padBottom;

  const counts = data.map((d) => d.count);
  const rawMax = Math.max(...counts, 0);
  // Round max count up to a pleasant tick interval (at least 4)
  const maxCount = rawMax <= 0 ? 4 : Math.ceil(rawMax * 1.15) || 4;

  const points = data.map((d, i) => {
    const x =
      data.length === 1
        ? padLeft + plotWidth / 2
        : padLeft + (i / (data.length - 1)) * plotWidth;
    const y = padTop + plotHeight - (d.count / maxCount) * plotHeight;
    return { x, y, date: d.date, count: d.count };
  });

  // Construct SVG path for line
  const linePath =
    points.length === 1
      ? `M ${points[0].x - 20} ${points[0].y} L ${points[0].x + 20} ${points[0].y}`
      : points.reduce(
          (acc, pt, i) => `${acc} ${i === 0 ? 'M' : 'L'} ${pt.x.toFixed(1)} ${pt.y.toFixed(1)}`,
          ''
        );

  // Construct closed path for gradient fill
  const areaPath =
    points.length === 1
      ? `M ${points[0].x - 20} ${points[0].y} L ${points[0].x + 20} ${points[0].y} L ${
          points[0].x + 20
        } ${padTop + plotHeight} L ${points[0].x - 20} ${padTop + plotHeight} Z`
      : `${linePath} L ${points[points.length - 1].x.toFixed(1)} ${(padTop + plotHeight).toFixed(
          1
        )} L ${points[0].x.toFixed(1)} ${(padTop + plotHeight).toFixed(1)} Z`;

  // Y-axis grid ticks (0, 50%, 100%)
  const yTicks = [
    { value: 0, y: padTop + plotHeight },
    { value: Math.round(maxCount / 2), y: padTop + plotHeight / 2 },
    { value: maxCount, y: padTop },
  ];

  // X-axis label selection (show at most ~6 labels to prevent clutter)
  const xLabelIndices = (() => {
    if (data.length <= 6) return data.map((_, i) => i);
    const step = Math.ceil((data.length - 1) / 5);
    const indices: number[] = [];
    for (let i = 0; i < data.length; i += step) {
      indices.push(i);
    }
    if (!indices.includes(data.length - 1)) {
      indices.push(data.length - 1);
    }
    return indices;
  })();

  const formatDateLabel = (isoDate: string) => {
    try {
      const parts = isoDate.split('-');
      if (parts.length === 3) {
        const d = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
        return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
      }
      return isoDate;
    } catch {
      return isoDate;
    }
  };

  const totalEnrollmentsInPeriod = counts.reduce((a, b) => a + b, 0);

  return (
    <div
      role='region'
      aria-label={title}
      className='bg-white rounded-2xl border border-gray-200 p-6 shadow-xs space-y-4'
    >
      {/* Header */}
      <div className='flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-gray-100 pb-4'>
        <div>
          <div className='flex items-center gap-2'>
            <h3 className='text-base font-bold text-gray-900'>{title}</h3>
            <span className='px-2 py-0.5 rounded-full text-xs font-semibold bg-primary/10 text-primary capitalize'>
              {interval === 'week' ? 'Weekly' : 'Daily'}
            </span>
          </div>
          <p className='text-xs text-gray-500 mt-0.5'>
            Total {totalEnrollmentsInPeriod} new {totalEnrollmentsInPeriod === 1 ? 'enrollment' : 'enrollments'} recorded across {data.length} {interval === 'week' ? 'weeks' : 'days'}.
          </p>
        </div>

        <Button
          type='button'
          variant='ghost'
          size='sm'
          onClick={() => setShowTable((prev) => !prev)}
          className='text-xs text-gray-600 hover:text-gray-900 self-start sm:self-auto flex items-center gap-1.5'
          aria-expanded={showTable}
        >
          {showTable ? <EyeOff className='w-3.5 h-3.5' /> : <Eye className='w-3.5 h-3.5' />}
          <span>{showTable ? 'Hide Data Table' : 'View Accessible Table'}</span>
        </Button>
      </div>

      {/* SVG Chart Container */}
      <div className='relative w-full overflow-hidden' style={{ minHeight: '240px' }}>
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className='w-full h-auto overflow-visible select-none'
          role='img'
          aria-labelledby='trend-chart-title trend-chart-desc'
        >
          <title id='trend-chart-title'>{title}</title>
          <desc id='trend-chart-desc'>
            Line chart displaying {data.length} data points of student enrollments from{' '}
            {data[0]?.date} to {data[data.length - 1]?.date}. Total enrollments in range: {totalEnrollmentsInPeriod}.
          </desc>

          <defs>
            <linearGradient id='enrollmentGradient' x1='0' y1='0' x2='0' y2='1'>
              <stop offset='0%' stopColor='#4f46e5' stopOpacity='0.25' />
              <stop offset='100%' stopColor='#4f46e5' stopOpacity='0.0' />
            </linearGradient>
          </defs>

          {/* Horizontal Grid lines & Y-axis labels */}
          {yTicks.map((tick, i) => (
            <g key={`y-tick-${i}`}>
              <line
                x1={padLeft}
                y1={tick.y}
                x2={padLeft + plotWidth}
                y2={tick.y}
                stroke='#e5e7eb'
                strokeDasharray={tick.value === 0 ? undefined : '3 3'}
                strokeWidth='1'
              />
              <text
                x={padLeft - 8}
                y={tick.y + 4}
                textAnchor='end'
                className='text-[10px] fill-gray-400 font-mono'
              >
                {tick.value}
              </text>
            </g>
          ))}

          {/* Area Fill */}
          <path d={areaPath} fill='url(#enrollmentGradient)' />

          {/* Trend Polyline */}
          <path
            d={linePath}
            fill='none'
            stroke='#4f46e5'
            strokeWidth='2.5'
            strokeLinecap='round'
            strokeLinejoin='round'
          />

          {/* Data Points and Interactivity */}
          {points.map((pt, i) => {
            const isHovered = hoveredIndex === i;
            return (
              <g
                key={`point-${i}`}
                onMouseEnter={() => setHoveredIndex(i)}
                onMouseLeave={() => setHoveredIndex(null)}
                className='cursor-pointer'
                tabIndex={0}
                role='button'
                aria-label={`${formatDateLabel(pt.date)}: ${pt.count} enrollments`}
                onFocus={() => setHoveredIndex(i)}
                onBlur={() => setHoveredIndex(null)}
              >
                {/* Invisible larger hit target */}
                <circle cx={pt.x} cy={pt.y} r='10' fill='transparent' />

                {/* Visible dot */}
                <circle
                  cx={pt.x}
                  cy={pt.y}
                  r={isHovered ? '5' : '3'}
                  fill={isHovered ? '#4338ca' : '#4f46e5'}
                  stroke='#ffffff'
                  strokeWidth='2'
                  className='transition-all duration-150'
                />

                {/* Hover Tooltip Callout */}
                {isHovered && (
                  <g className='pointer-events-none'>
                    <rect
                      x={Math.min(Math.max(pt.x - 42, 10), width - 94)}
                      y={Math.max(pt.y - 36, 6)}
                      width='84'
                      height='26'
                      rx='6'
                      fill='#111827'
                      className='shadow-md'
                    />
                    <text
                      x={Math.min(Math.max(pt.x, 52), width - 52)}
                      y={Math.max(pt.y - 19, 23)}
                      textAnchor='middle'
                      fill='#ffffff'
                      className='text-[10px] font-medium'
                    >
                      {pt.count} {pt.count === 1 ? 'student' : 'students'}
                    </text>
                  </g>
                )}
              </g>
            );
          })}

          {/* X-axis date labels */}
          {xLabelIndices.map((idx) => {
            const pt = points[idx];
            if (!pt) return null;
            return (
              <text
                key={`xlabel-${idx}`}
                x={pt.x}
                y={height - 12}
                textAnchor='middle'
                className='text-[10px] fill-gray-500 font-sans'
              >
                {formatDateLabel(pt.date)}
              </text>
            );
          })}
        </svg>
      </div>

      {/* Accessible Tabular Representation */}
      {showTable && (
        <div className='border-t border-gray-100 pt-4 overflow-x-auto'>
          <table
            className='min-w-full divide-y divide-gray-200 text-xs text-left'
            aria-label={`${title} tabular representation`}
          >
            <thead className='bg-gray-50 text-gray-700 font-semibold'>
              <tr>
                <th scope='col' className='px-3 py-2'>
                  Date
                </th>
                <th scope='col' className='px-3 py-2'>
                  New Enrollments
                </th>
              </tr>
            </thead>
            <tbody className='divide-y divide-gray-100 bg-white'>
              {data.map((d, i) => (
                <tr key={`row-${i}`} className='hover:bg-gray-50'>
                  <td className='px-3 py-1.5 font-mono text-gray-600'>{d.date}</td>
                  <td className='px-3 py-1.5 font-semibold text-gray-900'>{d.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
