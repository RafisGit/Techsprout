'use client';

import React, { useState, useEffect } from 'react';
import type { VideoRetentionCurveDto } from '@techsprout/contracts';
import { Video, RotateCcw, Users, TrendingDown, Eye, ShieldAlert, BarChart2 } from 'lucide-react';

interface VideoRetentionCurveProps {
  data: VideoRetentionCurveDto;
  title?: string;
}

export function VideoRetentionCurve({
  data,
  title = 'Video Engagement Retention Curve & Rewind Heatmap',
}: VideoRetentionCurveProps) {
  const [activeInterval, setActiveInterval] = useState<number | null>(null);
  const [showTable, setShowTable] = useState<boolean>(false);

  const {
    intervals = [],
    totalUniqueViewers = 0,
    totalCheckpoints = 0,
    averageCompletionPercentage = 0,
    lessonTitle,
    telemetryEnabled = true,
    isPartial = false,
    sampleNotice,
    viewerMetricLabel = 'Viewer-days',
  } = data || {};

  // Deep-link handling: automatically reveal and scroll to accessible table when requested via URL fragment
  useEffect(() => {
    if (typeof window === 'undefined' || !telemetryEnabled) return;

    const targetId = 'retention-accessible-table';
    let animationFrameId: number | null = null;
    let timeoutId: NodeJS.Timeout | null = null;

    const scrollToTarget = () => {
      const el = document.getElementById(targetId);
      if (el && typeof el.scrollIntoView === 'function') {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    };

    const handleHash = () => {
      const currentHash = window.location.hash;
      if (
        currentHash === `#${targetId}` ||
        currentHash === targetId ||
        currentHash === '#retention'
      ) {
        setShowTable(true);

        // Allow React to flush the DOM update for the conditionally rendered table before scrolling
        if (typeof window.requestAnimationFrame === 'function') {
          animationFrameId = window.requestAnimationFrame(() => {
            timeoutId = setTimeout(scrollToTarget, 50);
          });
        } else {
          timeoutId = setTimeout(scrollToTarget, 50);
        }
      }
    };

    // Check fragment on initial mount
    handleHash();

    // Listen for client-side hash changes
    window.addEventListener('hashchange', handleHash);

    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('hashchange', handleHash);
        if (animationFrameId !== null && typeof window.cancelAnimationFrame === 'function') {
          window.cancelAnimationFrame(animationFrameId);
        }
      }
      if (timeoutId !== null) {
        clearTimeout(timeoutId);
      }
    };
  }, [telemetryEnabled]);

  // Dimensions for SVG viewport
  const svgWidth = 600;
  const svgHeight = 220;
  const padding = { top: 25, right: 30, bottom: 40, left: 45 };
  const graphWidth = svgWidth - padding.left - padding.right;
  const graphHeight = svgHeight - padding.top - padding.bottom;

  // Compute coordinate points for 10 intervals (x: 0..9)
  const points = intervals.map((item, idx) => {
    const x = padding.left + (idx / Math.max(1, intervals.length - 1)) * graphWidth;
    const y = padding.top + (1 - item.retentionPercentage / 100) * graphHeight;
    return { x, y, ...item };
  });

  const pathD = points.reduce((acc, pt, idx) => {
    return idx === 0 ? `M ${pt.x} ${pt.y}` : `${acc} L ${pt.x} ${pt.y}`;
  }, '');

  // Fill area under the retention line
  const areaD = points.length > 0
    ? `${pathD} L ${points[points.length - 1].x} ${padding.top + graphHeight} L ${points[0].x} ${padding.top + graphHeight} Z`
    : '';

  // Max rewinds for scaling the rewind bars
  const maxRewinds = Math.max(1, ...intervals.map((i) => i.rewindCount));

  if (!telemetryEnabled) {
    return (
      <div className='p-6 bg-white rounded-2xl border border-gray-200 shadow-xs space-y-3'>
        <div className='flex items-center gap-2.5 text-gray-900 font-bold text-sm'>
          <Video className='w-4 h-4 text-gray-500' />
          <span>{title}</span>
        </div>
        <div className='p-4 bg-amber-50 border border-amber-200 rounded-xl flex items-center gap-3 text-xs text-amber-800'>
          <ShieldAlert className='w-4 h-4 text-amber-600 flex-shrink-0' />
          <span>Telemetry collection is currently disabled (`TELEMETRY_ENABLED=false`). Retention analytics are paused.</span>
        </div>
      </div>
    );
  }

  return (
    <div className='p-6 bg-white rounded-2xl border border-gray-200 shadow-xs space-y-5'>
      {/* Header and Summary Bar */}
      <div className='flex flex-wrap items-center justify-between gap-4'>
        <div>
          <div className='flex items-center gap-2'>
            <Video className='w-4 h-4 text-indigo-600' />
            <h3 className='text-sm font-bold text-gray-900'>{title}</h3>
          </div>
          {lessonTitle && (
            <p className='text-xs text-gray-500 mt-0.5'>Filtered by: {lessonTitle}</p>
          )}
        </div>

        <div className='flex items-center gap-2'>
          <button
            type='button'
            onClick={() => setShowTable((prev) => !prev)}
            className='text-xs text-indigo-600 hover:text-indigo-700 bg-indigo-50 hover:bg-indigo-100 px-3 py-1.5 rounded-lg font-medium transition flex items-center gap-1.5'
            aria-expanded={showTable}
            aria-controls='retention-accessible-table'
          >
            <BarChart2 className='w-3.5 h-3.5' />
            <span>{showTable ? 'Hide Tabular Data' : 'View Accessible Table'}</span>
          </button>
        </div>
      </div>

      {/* Explicit Partial Data Sample Notice (Fix C) */}
      {isPartial && (
        <div className='p-3.5 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-3 text-xs text-amber-900'>
          <ShieldAlert className='w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5' />
          <div>
            <span className='font-bold'>Partial Data Notice:</span>
            <p className='text-amber-800 mt-0.5'>
              {sampleNotice ||
                'Analytics are calculated from a bounded sample of the most recent events because total events reached the query ceiling. Narrow your filter for complete curves.'}
            </p>
          </div>
        </div>
      )}

      {/* Metric summary pills */}
      <div className='grid grid-cols-2 sm:grid-cols-4 gap-3 text-center'>
        <div className='p-3 bg-gray-50 rounded-xl border border-gray-100'>
          <span className='text-[11px] font-medium text-gray-500 flex items-center justify-center gap-1'>
            <Users className='w-3 h-3 text-blue-500' /> {viewerMetricLabel}
          </span>
          <p className='text-base font-extrabold text-gray-900 mt-1'>{totalUniqueViewers}</p>
        </div>

        <div className='p-3 bg-gray-50 rounded-xl border border-gray-100'>
          <span className='text-[11px] font-medium text-gray-500 flex items-center justify-center gap-1'>
            <Eye className='w-3 h-3 text-emerald-500' /> Avg. Completion
          </span>
          <p className='text-base font-extrabold text-gray-900 mt-1'>{averageCompletionPercentage}%</p>
        </div>

        <div className='p-3 bg-gray-50 rounded-xl border border-gray-100'>
          <span className='text-[11px] font-medium text-gray-500 flex items-center justify-center gap-1'>
            <TrendingDown className='w-3 h-3 text-amber-500' /> Terminal Retention
          </span>
          <p className='text-base font-extrabold text-gray-900 mt-1'>
            {intervals[9]?.retentionPercentage ?? 0}%
          </p>
        </div>

        <div className='p-3 bg-gray-50 rounded-xl border border-gray-100'>
          <span className='text-[11px] font-medium text-gray-500 flex items-center justify-center gap-1'>
            <RotateCcw className='w-3 h-3 text-rose-500' /> Backward Rewinds
          </span>
          <p className='text-base font-extrabold text-gray-900 mt-1'>
            {intervals.reduce((sum, item) => sum + item.rewindCount, 0)}
          </p>
        </div>
      </div>

      {/* Accessible SVG Visualization */}
      {totalUniqueViewers === 0 ? (
        <div className='h-48 flex flex-col items-center justify-center text-center p-6 bg-gray-50/50 rounded-xl border border-dashed border-gray-200'>
          <Video className='w-8 h-8 text-gray-300 mb-2' />
          <p className='text-xs font-semibold text-gray-600'>No video engagement events recorded yet</p>
          <p className='text-[11px] text-gray-400 mt-0.5 max-w-sm'>
            Student video playbacks, 60-second heartbeats, and rewind struggle points will populate this retention curve automatically.
          </p>
        </div>
      ) : (
        <div className='relative w-full overflow-x-auto'>
          <svg
            viewBox={`0 0 ${svgWidth} ${svgHeight}`}
            className='w-full max-w-full h-auto select-none'
            role='img'
            aria-label={`Video retention curve showing viewer drop-off across 10% video intervals. Initial retention is 100%, terminal retention is ${intervals[9]?.retentionPercentage ?? 0}%.`}
          >
            {/* Background Grid Lines (Y-Axis: 0%, 25%, 50%, 75%, 100%) */}
            {[0, 25, 50, 75, 100].map((pct) => {
              const y = padding.top + (1 - pct / 100) * graphHeight;
              return (
                <g key={pct}>
                  <line
                    x1={padding.left}
                    y1={y}
                    x2={padding.left + graphWidth}
                    y2={y}
                    stroke='#E5E7EB'
                    strokeDasharray={pct === 0 ? undefined : '3,3'}
                    strokeWidth='1'
                  />
                  <text
                    x={padding.left - 8}
                    y={y + 3}
                    textAnchor='end'
                    fontSize='10'
                    fill='#9CA3AF'
                    className='font-mono'
                  >
                    {pct}%
                  </text>
                </g>
              );
            })}

            {/* Gradient definition for area under curve */}
            <defs>
              <linearGradient id='retentionGradient' x1='0' y1='0' x2='0' y2='1'>
                <stop offset='0%' stopColor='#4F46E5' stopOpacity='0.25' />
                <stop offset='100%' stopColor='#4F46E5' stopOpacity='0.02' />
              </linearGradient>
            </defs>

            {/* Shaded Area Under Retention Curve */}
            {areaD && <path d={areaD} fill='url(#retentionGradient)' />}

            {/* Rewind heatmap bars at bottom of graph */}
            {points.map((pt, idx) => {
              const barHeight = pt.rewindCount > 0 ? (pt.rewindCount / maxRewinds) * 25 : 0;
              const barY = padding.top + graphHeight - barHeight;
              const barWidth = graphWidth / 12;
              return pt.rewindCount > 0 ? (
                <rect
                  key={`rewind-${idx}`}
                  x={pt.x - barWidth / 2}
                  y={barY}
                  width={barWidth}
                  height={barHeight}
                  fill='#F43F5E'
                  opacity='0.45'
                  rx='2'
                >
                  <title>{`${pt.rewindCount} rewind(s) detected in ${pt.intervalRange}`}</title>
                </rect>
              ) : null;
            })}

            {/* Retention Line Curve */}
            {pathD && (
              <path
                d={pathD}
                fill='none'
                stroke='#4F46E5'
                strokeWidth='2.5'
                strokeLinecap='round'
                strokeLinejoin='round'
              />
            )}

            {/* Interactive Data Point Dots */}
            {points.map((pt, idx) => {
              const isSelected = activeInterval === idx;
              return (
                <g
                  key={idx}
                  className='cursor-pointer transition-transform'
                  onMouseEnter={() => setActiveInterval(idx)}
                  onMouseLeave={() => setActiveInterval(null)}
                  onClick={() => setActiveInterval(idx)}
                  tabIndex={0}
                  role='button'
                  aria-label={`${pt.intervalRange}: ${pt.retentionPercentage}% retention (${pt.viewerCount} viewers, ${pt.rewindCount} rewinds)`}
                >
                  <circle
                    cx={pt.x}
                    cy={pt.y}
                    r={isSelected ? 6 : 4}
                    fill={isSelected ? '#312E81' : '#4F46E5'}
                    stroke='#FFFFFF'
                    strokeWidth='2'
                  />
                  {/* X-axis labels */}
                  <text
                    x={pt.x}
                    y={padding.top + graphHeight + 18}
                    textAnchor='middle'
                    fontSize='9'
                    fill={isSelected ? '#111827' : '#6B7280'}
                    fontWeight={isSelected ? 'bold' : 'normal'}
                  >
                    {pt.intervalRange}
                  </text>
                </g>
              );
            })}
          </svg>

          {/* Active tooltip popover */}
          {activeInterval !== null && points[activeInterval] && (
            <div className='mt-2 p-3 bg-gray-900 text-white rounded-xl text-xs flex items-center justify-between shadow-lg animate-fade-in'>
              <div>
                <span className='font-bold text-indigo-300'>
                  Interval {points[activeInterval].intervalRange}:
                </span>{' '}
                <span>
                  {points[activeInterval].retentionPercentage}% of starting learners retained ({points[activeInterval].viewerCount} viewers)
                </span>
              </div>
              {points[activeInterval].rewindCount > 0 && (
                <div className='flex items-center gap-1 text-rose-400 font-semibold'>
                  <RotateCcw className='w-3.5 h-3.5' />
                  <span>{points[activeInterval].rewindCount} struggle rewind(s)</span>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Accessible Screen-Reader & Tabular View */}
      {showTable && (
        <div id='retention-accessible-table' className='overflow-x-auto pt-2 border-t border-gray-100'>
          <table className='w-full text-xs text-left border-collapse'>
            <thead>
              <tr className='border-b border-gray-200 text-gray-500'>
                <th className='py-2 px-3 font-semibold'>Video Segment</th>
                <th className='py-2 px-3 font-semibold'>{viewerMetricLabel}</th>
                <th className='py-2 px-3 font-semibold'>Retention Rate</th>
                <th className='py-2 px-3 font-semibold'>Backward Rewinds</th>
              </tr>
            </thead>
            <tbody>
              {intervals.map((item) => (
                <tr key={item.intervalIndex} className='border-b border-gray-50 hover:bg-gray-50/75'>
                  <td className='py-2 px-3 font-medium text-gray-900'>{item.intervalRange}</td>
                  <td className='py-2 px-3 text-gray-700'>{item.viewerCount}</td>
                  <td className='py-2 px-3 font-semibold text-indigo-700'>{item.retentionPercentage}%</td>
                  <td className='py-2 px-3 text-gray-600'>
                    {item.rewindCount > 0 ? (
                      <span className='text-rose-600 font-medium'>{item.rewindCount}</span>
                    ) : (
                      '0'
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
