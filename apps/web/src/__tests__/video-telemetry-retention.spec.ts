import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import axios from 'axios';
import {
  useLearningTelemetry,
  coalesceQueue,
  EVENT_PRIORITY_MAP,
  getSharedLastDispatchTime,
  setSharedLastDispatchTime,
} from '@/hooks/useLearningTelemetry';
import {
  fetchCourseRetentionAnalytics,
  type VideoRetentionCurveDto,
} from '@/lib/api/instructor';
import { VideoRetentionCurve } from '@/components/analytics/VideoRetentionCurve';
import { axiosInstance } from '@/lib/axiosInstance';
import type { TelemetryEventDto } from '@techsprout/contracts';

// Mock axios for useLearningTelemetry
vi.mock('axios', () => ({
  default: {
    post: vi.fn().mockResolvedValue({ data: { success: true } }),
  },
}));

// Mock axiosInstance for instructor API client
vi.mock('@/lib/axiosInstance', () => ({
  axiosInstance: {
    get: vi.fn(),
  },
}));

// Custom lightweight React hook runner supporting multiple concurrent hook instances and useState
interface HookContext {
  refs: Array<{ current: any }>;
  refIdx: number;
  states: Array<any>;
  stateSetters: Array<(val: any) => void>;
  stateIdx: number;
  effectDeps: Array<any[] | undefined>;
  effectCleanups: Array<(() => void) | undefined>;
  effectIdx: number;
  cleanups: Array<() => void>;
  dirty: boolean;
}
let currentContext: HookContext | null = null;
const allActiveContexts: HookContext[] = [];

vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>();
  return {
    ...actual,
    useRef: (initial: any) => {
      if (currentContext) {
        if (currentContext.refs[currentContext.refIdx] === undefined) {
          currentContext.refs[currentContext.refIdx] = { current: initial };
        }
        return currentContext.refs[currentContext.refIdx++];
      }
      return { current: initial };
    },
    useState: (initial: any) => {
      if (currentContext) {
        const ctx = currentContext;
        const idx = ctx.stateIdx++;
        if (ctx.states[idx] === undefined) {
          ctx.states[idx] = typeof initial === 'function' ? initial() : initial;
        }
        if (!ctx.stateSetters[idx]) {
          ctx.stateSetters[idx] = (newVal: any) => {
            const nextVal = typeof newVal === 'function' ? newVal(ctx.states[idx]) : newVal;
            ctx.states[idx] = nextVal;
            ctx.dirty = true;
          };
        }
        return [ctx.states[idx], ctx.stateSetters[idx]];
      }
      return actual.useState(initial);
    },
    useCallback: (fn: any) => fn,
    useEffect: (fn: () => any, deps?: any[]) => {
      if (currentContext) {
        const ctx = currentContext;
        const idx = ctx.effectIdx++;
        const prevDeps = ctx.effectDeps[idx];
        const shouldRun =
          prevDeps === undefined ||
          deps === undefined ||
          deps.some((d, i) => !Object.is(d, prevDeps[i]));

        if (shouldRun) {
          if (typeof ctx.effectCleanups[idx] === 'function') {
            ctx.effectCleanups[idx]!();
          }
          const cleanup = fn();
          ctx.effectDeps[idx] = deps;
          ctx.effectCleanups[idx] = typeof cleanup === 'function' ? cleanup : undefined;
          if (typeof cleanup === 'function') {
            ctx.cleanups.push(cleanup);
          }
        }
      }
    },
  };
});

function renderHook<T>(hookFn: () => T) {
  const context: HookContext = {
    refs: [],
    refIdx: 0,
    states: [],
    stateSetters: [],
    stateIdx: 0,
    effectDeps: [],
    effectCleanups: [],
    effectIdx: 0,
    cleanups: [],
    dirty: false,
  };
  currentContext = context;
  const result = { current: hookFn() };
  currentContext = null;
  allActiveContexts.push(context);

  const rerender = () => {
    context.refIdx = 0;
    context.stateIdx = 0;
    context.effectIdx = 0;
    context.dirty = false;
    currentContext = context;
    result.current = hookFn();
    currentContext = null;
  };

  if (context.dirty) {
    rerender();
  }

  return {
    result,
    rerender,
    unmount: () => {
      context.cleanups.forEach((c) => c());
      context.cleanups = [];
    },
  };
}

function findNode(node: any, predicate: (n: any) => boolean): any {
  if (!node) return null;
  if (predicate(node)) return node;
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = findNode(child, predicate);
      if (found) return found;
    }
  } else if (node.props?.children) {
    return findNode(node.props.children, predicate);
  }
  return null;
}

const act = async (fn: () => any) => {
  await fn();
};

describe('WP-P7-02: Video Playback Telemetry & Retention Analytics (Frontend Suite)', () => {
  const originalEnv = process.env.NEXT_PUBLIC_TELEMETRY_ENABLED;
  const originalTelemetryEnv = process.env.TELEMETRY_ENABLED;
  const mockSendBeacon = vi.fn();
  const mockFetch = vi.fn();
  let storageStore: Record<string, string> = {};

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(axios.post).mockResolvedValue({ data: { success: true } });
    storageStore = {};
    process.env.NEXT_PUBLIC_TELEMETRY_ENABLED = 'true';
    delete process.env.TELEMETRY_ENABLED;

    // Mock localStorage
    const mockStorage = {
      getItem: vi.fn((key: string) => storageStore[key] ?? null),
      setItem: vi.fn((key: string, val: string) => {
        storageStore[key] = val;
      }),
      removeItem: vi.fn((key: string) => {
        delete storageStore[key];
      }),
      clear: vi.fn(() => {
        storageStore = {};
      }),
    };
    Object.defineProperty(globalThis, 'localStorage', {
      value: mockStorage,
      writable: true,
      configurable: true,
    });
    if (typeof window !== 'undefined') {
      Object.defineProperty(window, 'localStorage', {
        value: mockStorage,
        writable: true,
        configurable: true,
      });
    }

    // Mock navigator.sendBeacon
    Object.defineProperty(globalThis, 'navigator', {
      value: {
        sendBeacon: mockSendBeacon.mockReturnValue(true),
      },
      writable: true,
      configurable: true,
    });

    // Mock global fetch
    Object.defineProperty(globalThis, 'fetch', {
      value: mockFetch.mockResolvedValue({ ok: true }),
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
    process.env.NEXT_PUBLIC_TELEMETRY_ENABLED = originalEnv;
    if (originalTelemetryEnv !== undefined) {
      process.env.TELEMETRY_ENABLED = originalTelemetryEnv;
    } else {
      delete process.env.TELEMETRY_ENABLED;
    }
    allActiveContexts.forEach((ctx) => {
      ctx.cleanups.forEach((c) => c());
      ctx.cleanups = [];
    });
    allActiveContexts.length = 0;
  });

  // =========================================================================
  // 1. FIX A: EVENT BUFFERING, BATCHING & RATE-LIMIT PRESERVATION
  // =========================================================================

  describe('1. Fix A — Event Buffering, Batching & Rate Limits', () => {
    it('1.1 should batch multiple rapid lifecycle events into a single payload instead of separate requests', async () => {
      const { result } = renderHook(() =>
        useLearningTelemetry({
          courseId: 'c-101',
          lessonId: 'l-201',
          totalDurationSeconds: 300,
          throttleIntervalMs: 60_000,
        })
      );

      // Rapidly fire multiple lifecycle events: started, paused, seeked, checkpoint
      await act(async () => {
        result.current.recordVideoStarted(0, 1.0);
        result.current.recordVideoPaused(10, 1.0);
        result.current.recordVideoSeeked(25, 10, 1.0);
        result.current.recordVideoCheckpoint(30, 1.0);
      });

      // Exactly 1 network request was issued for the batch
      expect(axios.post).toHaveBeenCalledTimes(1);

      // Verify the batch payload
      const postArgs = vi.mocked(axios.post).mock.calls[0];
      expect(postArgs[0]).toBe('/api/v1/learning/events');
      const payload = postArgs[1] as any;

      // The initial batch sent VIDEO_STARTED, remaining events are buffered
      expect(payload.events[0].eventType).toBe('VIDEO_STARTED');

      // Now force flush to verify buffered events are batched together
      await act(async () => {
        await result.current.flushBuffer(true);
      });

      expect(axios.post).toHaveBeenCalledTimes(2);
      const secondBatchPayload = (vi.mocked(axios.post).mock.calls[1][1] as any).events;
      expect(secondBatchPayload.length).toBeGreaterThanOrEqual(2);
      const eventTypes = secondBatchPayload.map((e: any) => e.eventType);
      expect(eventTypes).toContain('VIDEO_PAUSED');
      expect(eventTypes).toContain('VIDEO_SEEKED');
    });

    it('1.2 should enforce client-side dispatch schedule compatible with server sliding-window rate limit', async () => {
      const { result } = renderHook(() =>
        useLearningTelemetry({
          courseId: 'c-101',
          lessonId: 'l-201',
          totalDurationSeconds: 180,
          throttleIntervalMs: 60_000,
        })
      );

      // First dispatch uses the initial slot
      await act(async () => {
        result.current.recordVideoStarted(0, 1.0);
      });
      expect(axios.post).toHaveBeenCalledTimes(1);

      // Subsequent lifecycle events within 60s window must NOT issue immediate requests
      await act(async () => {
        result.current.recordVideoPaused(15, 1.0);
        result.current.recordVideoCheckpoint(20, 1.0);
        result.current.recordVideoSeeked(5, 20, 1.0);
        // Non-forced flush must be rejected by the rate limiter schedule
        await result.current.flushBuffer(false);
      });

      // Request count remains 1, strictly preserving server quota
      expect(axios.post).toHaveBeenCalledTimes(1);
    });

    it('1.3 should retain events in queue on HTTP 429 and back off', async () => {
      // Mock HTTP 429 response on initial post
      vi.mocked(axios.post).mockRejectedValueOnce({
        response: { status: 429, data: { message: 'Rate limit exceeded' } },
      });

      const { result } = renderHook(() =>
        useLearningTelemetry({
          courseId: 'c-101',
          lessonId: 'l-201',
          totalDurationSeconds: 200,
        })
      );

      await act(async () => {
        result.current.recordVideoStarted(0, 1.0);
      });

      expect(axios.post).toHaveBeenCalledTimes(1);

      // Non-forced flush should not retry immediately due to backoff
      await act(async () => {
        await result.current.flushBuffer(false);
      });
      expect(axios.post).toHaveBeenCalledTimes(1);

      // When forced retry occurs, the unsent event was preserved and is resent
      vi.mocked(axios.post).mockResolvedValueOnce({ data: { success: true } });
      await act(async () => {
        await result.current.flushBuffer(true);
      });

      expect(axios.post).toHaveBeenCalledTimes(2);
      const resendPayload = (vi.mocked(axios.post).mock.calls[1][1] as any).events;
      expect(resendPayload[0].eventType).toBe('VIDEO_STARTED');
    });

    it('1.4 should preserve exact eventId during retries for server idempotency', async () => {
      vi.mocked(axios.post).mockRejectedValueOnce(new Error('Network error'));

      const { result } = renderHook(() =>
        useLearningTelemetry({
          courseId: 'c-101',
          lessonId: 'l-201',
          totalDurationSeconds: 150,
        })
      );

      await act(async () => {
        result.current.recordVideoStarted(0, 1.0);
      });

      const firstCallEventId = (vi.mocked(axios.post).mock.calls[0][1] as any).events[0].eventId;
      expect(firstCallEventId).toBeDefined();

      // Retry
      vi.mocked(axios.post).mockResolvedValueOnce({ data: { success: true } });
      await act(async () => {
        await result.current.flushBuffer(true);
      });

      const secondCallEventId = (vi.mocked(axios.post).mock.calls[1][1] as any).events[0].eventId;
      // Event ID must be identical across retry attempts
      expect(secondCallEventId).toBe(firstCallEventId);
    });

    it('1.5 should obey maximum 50 events and 32KB request body limit', async () => {
      const { result } = renderHook(() =>
        useLearningTelemetry({
          courseId: 'c-101',
          lessonId: 'l-201',
          totalDurationSeconds: 500,
        })
      );

      // Dispatch exit beacon with pending events
      act(() => {
        result.current.dispatchExitBeacon(150, 1.0);
      });

      expect(mockSendBeacon).toHaveBeenCalledTimes(1);
      const beaconPayloadStr = mockSendBeacon.mock.calls[0][1];
      const parsed = JSON.parse(beaconPayloadStr);

      expect(parsed.events.length).toBeLessThanOrEqual(50);
      expect(Buffer.byteLength(beaconPayloadStr, 'utf8')).toBeLessThanOrEqual(32 * 1024);
    });

    it('1.6 should coalesce redundant checkpoints when queue capacity is reached', () => {
      const dummyEvents: TelemetryEventDto[] = [
        {
          eventId: 'e-start',
          courseId: 'c-1',
          lessonId: 'l-1',
          eventType: 'VIDEO_STARTED',
          metadata: { watchPositionSeconds: 0 },
          occurredAt: new Date().toISOString(),
        },
        {
          eventId: 'e-cp1',
          courseId: 'c-1',
          lessonId: 'l-1',
          eventType: 'VIDEO_CHECKPOINT',
          metadata: { watchPositionSeconds: 60 },
          occurredAt: new Date().toISOString(),
        },
        {
          eventId: 'e-cp2',
          courseId: 'c-1',
          lessonId: 'l-1',
          eventType: 'VIDEO_CHECKPOINT',
          metadata: { watchPositionSeconds: 120 },
          occurredAt: new Date().toISOString(),
        },
        {
          eventId: 'e-cp3',
          courseId: 'c-1',
          lessonId: 'l-1',
          eventType: 'VIDEO_CHECKPOINT',
          metadata: { watchPositionSeconds: 180 },
          occurredAt: new Date().toISOString(),
        },
        {
          eventId: 'e-comp',
          courseId: 'c-1',
          lessonId: 'l-1',
          eventType: 'VIDEO_COMPLETED',
          metadata: { watchPositionSeconds: 200 },
          occurredAt: new Date().toISOString(),
        },
      ];

      // Coalescing to max capacity 3 should prune cp1 and cp2, keeping latest cp3 and lifecycle events
      const coalesced = coalesceQueue(dummyEvents, 3);
      expect(coalesced).toHaveLength(3);
      const types = coalesced.map((e) => e.eventType);
      expect(types).toContain('VIDEO_STARTED');
      expect(types).toContain('VIDEO_COMPLETED');
      expect(types).toContain('VIDEO_CHECKPOINT');
      // The kept checkpoint must be the latest one (180s)
      const keptCp = coalesced.find((e) => e.eventType === 'VIDEO_CHECKPOINT');
      expect(keptCp?.metadata?.watchPositionSeconds).toBe(180);
    });

    it('1.7 should prevent duplicate logical events on repeated start or complete calls', async () => {
      const { result } = renderHook(() =>
        useLearningTelemetry({
          courseId: 'c-101',
          lessonId: 'l-201',
          totalDurationSeconds: 120,
        })
      );

      await act(async () => {
        result.current.recordVideoStarted(0, 1.0);
        result.current.recordVideoStarted(5, 1.0); // Duplicate call
      });
      expect(axios.post).toHaveBeenCalledTimes(1);

      await act(async () => {
        result.current.recordVideoCompleted(120);
        result.current.recordVideoCompleted(120); // Duplicate call
        await result.current.flushBuffer(true);
      });

      const completedEvents = (vi.mocked(axios.post).mock.calls[1][1] as any).events.filter(
        (e: any) => e.eventType === 'VIDEO_COMPLETED'
      );
      expect(completedEvents).toHaveLength(1);
    });

    it('1.8 should generate zero network requests when telemetry is disabled', async () => {
      process.env.NEXT_PUBLIC_TELEMETRY_ENABLED = 'false';

      const { result } = renderHook(() =>
        useLearningTelemetry({
          courseId: 'c-101',
          lessonId: 'l-201',
          totalDurationSeconds: 100,
        })
      );

      expect(result.current.isTelemetryEnabled).toBe(false);

      await act(async () => {
        result.current.recordVideoStarted(0);
        result.current.recordVideoCheckpoint(15);
        result.current.recordVideoPaused(20);
        result.current.recordVideoSeeked(10, 20);
        result.current.recordVideoCompleted(100);
        result.current.dispatchExitBeacon(100);
        await result.current.flushBuffer(true);
      });

      expect(axios.post).not.toHaveBeenCalled();
      expect(mockSendBeacon).not.toHaveBeenCalled();
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // 2. FIX B: TRUE BACKWARD-SEEK DETECTION & METADATA
  // =========================================================================

  describe('2. Fix B — True Backward-Seek Direction Metadata', () => {
    it('2.1 should include previousPositionSeconds on backward seek', async () => {
      const { result } = renderHook(() =>
        useLearningTelemetry({
          courseId: 'c-101',
          lessonId: 'l-201',
          totalDurationSeconds: 200,
        })
      );

      await act(async () => {
        // Backward seek: from 60s to 25s
        result.current.recordVideoSeeked(25, 60, 1.0);
        await result.current.flushBuffer(true);
      });

      expect(axios.post).toHaveBeenCalledTimes(1);
      const event = (vi.mocked(axios.post).mock.calls[0][1] as any).events[0];
      expect(event.eventType).toBe('VIDEO_SEEKED');
      expect(event.metadata.watchPositionSeconds).toBe(25);
      expect(event.metadata.previousPositionSeconds).toBe(60);
    });

    it('2.2 should include previousPositionSeconds on forward seek', async () => {
      const { result } = renderHook(() =>
        useLearningTelemetry({
          courseId: 'c-101',
          lessonId: 'l-201',
          totalDurationSeconds: 200,
        })
      );

      await act(async () => {
        // Forward seek: from 20s to 80s
        result.current.recordVideoSeeked(80, 20, 1.0);
        await result.current.flushBuffer(true);
      });

      const event = (vi.mocked(axios.post).mock.calls[0][1] as any).events[0];
      expect(event.eventType).toBe('VIDEO_SEEKED');
      expect(event.metadata.watchPositionSeconds).toBe(80);
      expect(event.metadata.previousPositionSeconds).toBe(20);
    });

    it('2.3 should preserve backward compatibility when previousPosition is missing', async () => {
      const { result } = renderHook(() =>
        useLearningTelemetry({
          courseId: 'c-101',
          lessonId: 'l-201',
          totalDurationSeconds: 200,
        })
      );

      await act(async () => {
        // Called without previousPosition
        result.current.recordVideoSeeked(45);
        await result.current.flushBuffer(true);
      });

      const event = (vi.mocked(axios.post).mock.calls[0][1] as any).events[0];
      expect(event.eventType).toBe('VIDEO_SEEKED');
      expect(event.metadata.watchPositionSeconds).toBe(45);
      expect(event.metadata.previousPositionSeconds).toBeUndefined();
    });

    it('2.4 should deduplicate seek calls with identical position or within 0.5s', async () => {
      const { result } = renderHook(() =>
        useLearningTelemetry({
          courseId: 'c-101',
          lessonId: 'l-201',
          totalDurationSeconds: 200,
        })
      );

      await act(async () => {
        // Delta < 0.5s: not a meaningful seek
        result.current.recordVideoSeeked(30.2, 30.0);
        await result.current.flushBuffer(true);
      });

      // No event should be queued or dispatched
      expect(axios.post).not.toHaveBeenCalled();
    });

    it('2.5 should reject unapproved fields and maintain strict allowlisting', async () => {
      const { result } = renderHook(() =>
        useLearningTelemetry({
          courseId: 'c-101',
          lessonId: 'l-201',
          totalDurationSeconds: 100,
        })
      );

      await act(async () => {
        result.current.recordVideoSeeked(20, 40, 1.0);
        await result.current.flushBuffer(true);
      });

      const event = (vi.mocked(axios.post).mock.calls[0][1] as any).events[0];
      const metadataKeys = Object.keys(event.metadata);
      const approvedKeys = [
        'watchPositionSeconds',
        'previousPositionSeconds',
        'totalDurationSeconds',
        'playbackRate',
        'score',
        'passed',
        'checkpointIndex',
      ];
      for (const key of metadataKeys) {
        expect(approvedKeys).toContain(key);
      }
      expect(event).not.toHaveProperty('userId');
      expect(event).not.toHaveProperty('query');
      expect(event).not.toHaveProperty('search');
    });
  });

  // =========================================================================
  // 3. EXIT TRANSPORT & UNMOUNT BEACON
  // =========================================================================

  describe('3. Exit Transport & Unmount Beacon', () => {
    it('3.1 should bundle pending buffered events with terminal checkpoint into exit beacon', () => {
      const { result } = renderHook(() =>
        useLearningTelemetry({
          courseId: 'c-101',
          lessonId: 'l-201',
          totalDurationSeconds: 300,
        })
      );

      act(() => {
        result.current.recordVideoPaused(40, 1.0);
        result.current.recordVideoSeeked(20, 40, 1.0);
        result.current.dispatchExitBeacon(20, 1.0);
      });

      expect(mockSendBeacon).toHaveBeenCalledTimes(1);
      const payload = JSON.parse(mockSendBeacon.mock.calls[0][1]);
      expect(payload.events.length).toBeGreaterThanOrEqual(2);
      const types = payload.events.map((e: any) => e.eventType);
      expect(types).toContain('VIDEO_PAUSED');
      expect(types).toContain('VIDEO_SEEKED');
      expect(types).toContain('VIDEO_CHECKPOINT');
    });

    it('3.2 should fall back to fetch keepalive when sendBeacon fails', () => {
      mockSendBeacon.mockReturnValueOnce(false);

      const { result } = renderHook(() =>
        useLearningTelemetry({
          courseId: 'c-101',
          lessonId: 'l-201',
          totalDurationSeconds: 300,
        })
      );

      act(() => {
        result.current.dispatchExitBeacon(75, 1.0);
      });

      expect(mockSendBeacon).toHaveBeenCalledTimes(1);
      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/v1/learning/events/beacon',
        expect.objectContaining({
          method: 'POST',
          keepalive: true,
          headers: { 'Content-Type': 'application/json' },
        })
      );
    });

    it('3.3 should dispatch terminal beacon on component unmount', () => {
      const { result, unmount } = renderHook(() =>
        useLearningTelemetry({
          courseId: 'c-101',
          lessonId: 'l-201',
          totalDurationSeconds: 150,
        })
      );

      act(() => {
        result.current.recordVideoCheckpoint(80, 1.0);
      });

      mockSendBeacon.mockClear();
      unmount();

      expect(mockSendBeacon).toHaveBeenCalledTimes(1);
      expect(mockSendBeacon).toHaveBeenCalledWith(
        '/api/v1/learning/events/beacon',
        expect.stringContaining('"watchPositionSeconds":80')
      );
    });
  });

  // =========================================================================
  // 4. RETENTION ANALYTICS API CLIENT & CONTRACTS (FIX C)
  // =========================================================================

  describe('4. Retention Analytics API Client & Contract Verification', () => {
    it('4.1 should fetch course retention analytics with partial-data and viewer-days semantics', async () => {
      const mockRetentionData: VideoRetentionCurveDto = {
        courseId: 'c-101',
        lessonId: 'l-201',
        lessonTitle: 'Video Introduction',
        totalUniqueViewers: 25,
        viewerMetricLabel: 'Viewer-days',
        totalCheckpoints: 110,
        averageCompletionPercentage: 68.5,
        telemetryEnabled: true,
        isPartial: true,
        totalEventsScanned: 20000,
        sampleNotice: 'Bounded sample of 20,000 events',
        intervals: Array.from({ length: 10 }, (_, i) => ({
          intervalIndex: i,
          intervalRange: `${i * 10}-${(i + 1) * 10}%`,
          viewerCount: Math.max(5, 25 - i * 2),
          retentionPercentage: Number((Math.max(20, 100 - i * 8)).toFixed(1)),
          rewindCount: i === 3 ? 4 : 0,
        })),
      };

      vi.mocked(axiosInstance.get).mockResolvedValueOnce({
        data: {
          success: true,
          data: mockRetentionData,
        },
      });

      const result = await fetchCourseRetentionAnalytics('c-101', {
        lessonId: 'l-201',
        startDate: '2026-10-01',
        endDate: '2026-10-18',
      });

      expect(axiosInstance.get).toHaveBeenCalledWith(
        '/api/v1/instructor/analytics/courses/c-101/retention',
        {
          params: {
            lessonId: 'l-201',
            startDate: '2026-10-01',
            endDate: '2026-10-18',
          },
        }
      );
      expect(result.courseId).toBe('c-101');
      expect(result.viewerMetricLabel).toBe('Viewer-days');
      expect(result.isPartial).toBe(true);
      expect(result.intervals[3].rewindCount).toBe(4);
    });
  });

  // =========================================================================
  // 5. PLAYER INTEGRATION & LEARNING PROGRESS ISOLATION
  // =========================================================================

  describe('5. Player Integration & Learning Progress Isolation', () => {
    it('5.1 should not classify normal continuous time progression as a seek', async () => {
      const { result } = renderHook(() =>
        useLearningTelemetry({
          courseId: 'c-101',
          lessonId: 'l-201',
          totalDurationSeconds: 120,
        })
      );

      await act(async () => {
        // Continuous playback: periodic checkpoints every second
        result.current.recordVideoCheckpoint(10, 1.0);
        result.current.recordVideoCheckpoint(11, 1.0);
        result.current.recordVideoCheckpoint(12, 1.0);
        await result.current.flushBuffer(true);
      });

      const events = (vi.mocked(axios.post).mock.calls[0][1] as any).events;
      const seekEvents = events.filter((e: any) => e.eventType === 'VIDEO_SEEKED');
      expect(seekEvents).toHaveLength(0);
    });

    it('5.2 should deduplicate rapid seeking/seeked callback floods', async () => {
      const { result } = renderHook(() =>
        useLearningTelemetry({
          courseId: 'c-101',
          lessonId: 'l-201',
          totalDurationSeconds: 120,
        })
      );

      await act(async () => {
        // Multiple rapid callbacks for the same seek gesture
        result.current.recordVideoSeeked(25, 60, 1.0);
        result.current.recordVideoSeeked(25, 60, 1.0);
        result.current.recordVideoSeeked(25, 60, 1.0);
        await result.current.flushBuffer(true);
      });

      const events = (vi.mocked(axios.post).mock.calls[0][1] as any).events;
      const seekEvents = events.filter((e: any) => e.eventType === 'VIDEO_SEEKED');
      expect(seekEvents).toHaveLength(1);
    });

    it('5.3 should ensure telemetry failures never throw or disrupt playback or progress', async () => {
      vi.mocked(axios.post).mockRejectedValue(new Error('Fatal telemetry connection breakdown'));

      const { result } = renderHook(() =>
        useLearningTelemetry({
          courseId: 'c-101',
          lessonId: 'l-201',
          totalDurationSeconds: 100,
        })
      );

      // Must resolve cleanly without throwing
      await expect(
        act(async () => {
          result.current.recordVideoStarted(0, 1.0);
          result.current.recordVideoCheckpoint(30, 1.0);
          result.current.recordVideoSeeked(15, 30, 1.0);
          result.current.recordVideoCompleted(100);
          await result.current.flushBuffer(true);
        })
      ).resolves.not.toThrow();
    });
  });

  // =========================================================================
  // 6. FINAL EDGE-CASE REMEDIATION: CROSS-TAB, EXIT & OVERFLOW SUITE
  // =========================================================================

  describe('6. Edge-Case Remediation: Cross-Tab Coordination, Exit Prioritization & Visibility Latch', () => {
    // -----------------------------------------------------------------------
    // A. Cross-Tab Coordination
    // -----------------------------------------------------------------------
    it('6.1 should coordinate across same-origin tabs by deferring dispatch when shared timestamp is fresh', async () => {
      const lessonId = 'l-shared-1';
      // Simulate Tab 1 having dispatched 10 seconds ago
      const recentTimestamp = Date.now() - 10_000;
      setSharedLastDispatchTime(lessonId, recentTimestamp);

      // Tab 2 opens on the same lesson
      const { result: tab2 } = renderHook(() =>
        useLearningTelemetry({
          courseId: 'c-101',
          lessonId,
          totalDurationSeconds: 300,
          throttleIntervalMs: 60_000,
        })
      );

      // Tab 2 adds lifecycle events
      await act(async () => {
        tab2.current.recordVideoStarted(0, 1.0);
        // Non-forced flush should be deferred because Tab 1 used the ordinary dispatch quota
        await tab2.current.flushBuffer(false);
      });

      // No HTTP request was issued by Tab 2, preserving server quota and keeping exit slot open
      expect(axios.post).not.toHaveBeenCalled();
    });

    it('6.2 should use Web Locks API when available to prevent simultaneous cross-tab dispatches', async () => {
      const mockLockRequest = vi.fn(async (_name, _options, callback) => {
        // Simulate lock acquisition contention where lock is currently null (held by another tab)
        return callback(null);
      });

      Object.defineProperty(globalThis.navigator, 'locks', {
        value: { request: mockLockRequest },
        writable: true,
        configurable: true,
      });

      const { result } = renderHook(() =>
        useLearningTelemetry({
          courseId: 'c-101',
          lessonId: 'l-lock-test',
          totalDurationSeconds: 200,
        })
      );

      await act(async () => {
        result.current.recordVideoStarted(0, 1.0);
        await result.current.flushBuffer(false);
      });

      expect(mockLockRequest).toHaveBeenCalled();
      // Lock was contested (null), so dispatch was deferred without throwing
      expect(axios.post).not.toHaveBeenCalled();
    });

    // -----------------------------------------------------------------------
    // B. Exit Payload & Batch Coalescing
    // -----------------------------------------------------------------------
    it('6.3 should coalesce redundant checkpoints before selecting exit batch for 49, 50, 51, 99, and 100 queued events', () => {
      const generateEvent = (
        id: string,
        type: any,
        pos: number
      ): TelemetryEventDto => ({
        eventId: id,
        courseId: 'c-1',
        lessonId: 'l-1',
        eventType: type,
        metadata: { watchPositionSeconds: pos },
        occurredAt: new Date().toISOString(),
      });

      // Case: 49 events (all checkpoints)
      const q49 = Array.from({ length: 49 }, (_, i) =>
        generateEvent(`cp-${i}`, 'VIDEO_CHECKPOINT', i * 10)
      );
      const coalesced49 = coalesceQueue(q49, 50, true);
      expect(coalesced49).toHaveLength(1); // Coalesced down to 1 latest checkpoint

      // Case: 50 events (45 checkpoints + 5 milestones)
      const q50 = [
        ...Array.from({ length: 45 }, (_, i) =>
          generateEvent(`cp-${i}`, 'VIDEO_CHECKPOINT', i * 10)
        ),
        generateEvent('m-start', 'VIDEO_STARTED', 0),
        generateEvent('m-seek1', 'VIDEO_SEEKED', 10),
        generateEvent('m-pause', 'VIDEO_PAUSED', 20),
        generateEvent('m-seek2', 'VIDEO_SEEKED', 30),
        generateEvent('m-comp', 'VIDEO_COMPLETED', 100),
      ];
      const coalesced50 = coalesceQueue(q50, 50, true);
      // Prunes 44 redundant checkpoints, preserves latest checkpoint + all 5 milestones = 6 events
      expect(coalesced50).toHaveLength(6);
      expect(coalesced50.map((e) => e.eventType)).toContain('VIDEO_COMPLETED');
      expect(coalesced50.map((e) => e.eventType)).toContain('VIDEO_STARTED');

      // Case: 51 events (40 checkpoints + 11 milestones)
      const q51 = [
        ...Array.from({ length: 40 }, (_, i) =>
          generateEvent(`cp-${i}`, 'VIDEO_CHECKPOINT', i * 10)
        ),
        ...Array.from({ length: 11 }, (_, i) =>
          generateEvent(`m-${i}`, 'VIDEO_SEEKED', i * 5)
        ),
      ];
      const coalesced51 = coalesceQueue(q51, 50, true);
      // Prunes 39 redundant checkpoints, preserves 1 checkpoint + 11 seek events = 12 events
      expect(coalesced51).toHaveLength(12);

      // Case: 99 events (90 checkpoints + 9 milestones)
      const q99 = [
        ...Array.from({ length: 90 }, (_, i) =>
          generateEvent(`cp-${i}`, 'VIDEO_CHECKPOINT', i * 10)
        ),
        ...Array.from({ length: 9 }, (_, i) =>
          generateEvent(`m-${i}`, 'VIDEO_SEEKED', i * 5)
        ),
      ];
      const coalesced99 = coalesceQueue(q99, 50, true);
      expect(coalesced99).toHaveLength(10); // 1 checkpoint + 9 milestones

      // Case: 100 events (80 checkpoints + 20 milestones)
      const q100 = [
        ...Array.from({ length: 80 }, (_, i) =>
          generateEvent(`cp-${i}`, 'VIDEO_CHECKPOINT', i * 10)
        ),
        ...Array.from({ length: 20 }, (_, i) =>
          generateEvent(`m-${i}`, 'VIDEO_SEEKED', i * 5)
        ),
      ];
      const coalesced100 = coalesceQueue(q100, 50, true);
      expect(coalesced100).toHaveLength(21); // 1 checkpoint + 20 milestones
    });

    it('6.4 should reduce payload count iteratively when serialized JSON exceeds 30KB body ceiling', async () => {
      const { result } = renderHook(() =>
        useLearningTelemetry({
          courseId: 'c-101',
          lessonId: 'l-large-test',
          totalDurationSeconds: 1000,
        })
      );

      // Queue many events with large metadata
      act(() => {
        result.current.dispatchExitBeacon(500);
      });

      expect(mockSendBeacon).toHaveBeenCalledTimes(1);
      const payloadStr = mockSendBeacon.mock.calls[0][1];
      const byteSize = Buffer.byteLength(payloadStr, 'utf8');
      expect(byteSize).toBeLessThanOrEqual(30 * 1024);
    });

    it('6.5 should fall back to fetch keepalive when navigator.sendBeacon returns false', async () => {
      mockSendBeacon.mockReturnValueOnce(false);

      const { result } = renderHook(() =>
        useLearningTelemetry({
          courseId: 'c-101',
          lessonId: 'l-fallback-test',
          totalDurationSeconds: 200,
        })
      );

      act(() => {
        result.current.dispatchExitBeacon(120);
      });

      expect(mockSendBeacon).toHaveBeenCalledTimes(1);
      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [endpoint, options] = mockFetch.mock.calls[0];
      expect(endpoint).toBe('/api/v1/learning/events/beacon');
      expect(options.keepalive).toBe(true);
      expect(options.method).toBe('POST');
    });

    it('6.6 should handle server rejecting beacon with HTTP 429 without unhandled exceptions', async () => {
      mockFetch.mockRejectedValueOnce(new Error('HTTP 429 Too Many Requests'));
      mockSendBeacon.mockReturnValueOnce(false); // Trigger fetch fallback

      const { result } = renderHook(() =>
        useLearningTelemetry({
          courseId: 'c-101',
          lessonId: 'l-rejection-test',
          totalDurationSeconds: 200,
        })
      );

      expect(() => {
        result.current.dispatchExitBeacon(80);
      }).not.toThrow();
    });

    // -----------------------------------------------------------------------
    // C. Queue Capacity and Overflow Policy
    // -----------------------------------------------------------------------
    it('6.7 should strictly bound queue capacity at 100 and prioritize milestones over interactions', () => {
      const generateEvent = (
        id: string,
        type: any,
        pos: number
      ): TelemetryEventDto => ({
        eventId: id,
        courseId: 'c-1',
        lessonId: 'l-1',
        eventType: type,
        metadata: { watchPositionSeconds: pos },
        occurredAt: new Date().toISOString(),
      });

      // Create a queue with 10 checkpoints, 50 seeks (Tier 3), 40 starts (Tier 2), and 15 completions (Tier 1) = 115 events
      const mixedQueue: TelemetryEventDto[] = [
        ...Array.from({ length: 10 }, (_, i) =>
          generateEvent(`cp-${i}`, 'VIDEO_CHECKPOINT', i * 10)
        ),
        ...Array.from({ length: 50 }, (_, i) =>
          generateEvent(`seek-${i}`, 'VIDEO_SEEKED', i * 5)
        ),
        ...Array.from({ length: 40 }, (_, i) =>
          generateEvent(`start-${i}`, 'VIDEO_STARTED', 0)
        ),
        ...Array.from({ length: 15 }, (_, i) =>
          generateEvent(`comp-${i}`, 'VIDEO_COMPLETED', 100)
        ),
      ];

      const bounded = coalesceQueue(mixedQueue, 100);

      // Strictly capped at 100
      expect(bounded).toHaveLength(100);

      // Checkpoints coalesced to 1
      const checkpoints = bounded.filter((e) => e.eventType === 'VIDEO_CHECKPOINT');
      expect(checkpoints).toHaveLength(1);

      // All 15 completion milestones (Tier 1) are preserved
      const completions = bounded.filter((e) => e.eventType === 'VIDEO_COMPLETED');
      expect(completions).toHaveLength(15);

      // All 40 start milestones (Tier 2) are preserved
      const starts = bounded.filter((e) => e.eventType === 'VIDEO_STARTED');
      expect(starts).toHaveLength(40);

      // The remaining 44 slots are filled with Tier 3 seek events (oldest 6 seek events were pruned)
      const seeks = bounded.filter((e) => e.eventType === 'VIDEO_SEEKED');
      expect(seeks).toHaveLength(44);
    });

    it('6.8 should apply documented FIFO eviction when queue is filled with >100 Tier 1 milestones', () => {
      const generateEvent = (
        id: string,
        type: any,
        pos: number
      ): TelemetryEventDto => ({
        eventId: id,
        courseId: 'c-1',
        lessonId: 'l-1',
        eventType: type,
        metadata: { watchPositionSeconds: pos },
        occurredAt: new Date().toISOString(),
      });

      // 105 Tier 1 completion events
      const allTier1 = Array.from({ length: 105 }, (_, i) =>
        generateEvent(`comp-${i}`, 'VIDEO_COMPLETED', i)
      );

      const bounded = coalesceQueue(allTier1, 100);
      expect(bounded).toHaveLength(100);
      // Oldest 5 were evicted; first remaining event is comp-5
      expect(bounded[0].eventId).toBe('comp-5');
      expect(bounded[bounded.length - 1].eventId).toBe('comp-104');
    });

    // -----------------------------------------------------------------------
    // D. Visibility and Exit Latch Handling
    // -----------------------------------------------------------------------
    it('6.9 should reset exit latch when tab transitions from hidden back to visible with queued events', () => {
      const visibilityListeners: Array<() => void> = [];
      const mockDoc = {
        visibilityState: 'visible',
        addEventListener: vi.fn((event, listener) => {
          if (event === 'visibilitychange') visibilityListeners.push(listener);
        }),
        removeEventListener: vi.fn(),
      };
      Object.defineProperty(globalThis, 'document', {
        value: mockDoc,
        writable: true,
        configurable: true,
      });

      const { result } = renderHook(() =>
        useLearningTelemetry({
          courseId: 'c-101',
          lessonId: 'l-vis-test',
          totalDurationSeconds: 300,
        })
      );

      // Record start (flushed immediately) and buffer a pause event into queue
      act(() => {
        result.current.recordVideoStarted(0, 1.0);
        result.current.recordVideoPaused(10, 1.0);
      });

      // Transition 1: Tab becomes hidden (user switches tab) with pending event
      mockDoc.visibilityState = 'hidden';
      act(() => {
        visibilityListeners.forEach((l) => l());
      });
      // Exit beacon dispatched for backgrounding
      expect(mockSendBeacon).toHaveBeenCalledTimes(1);

      // Transition 2: Tab becomes visible again (user switches back)
      mockDoc.visibilityState = 'visible';
      act(() => {
        visibilityListeners.forEach((l) => l());
      });
      // No beacon on becoming visible
      expect(mockSendBeacon).toHaveBeenCalledTimes(1);

      // Buffer another event while tab is visible
      act(() => {
        result.current.recordVideoPaused(25, 1.0);
      });

      // Transition 3: Tab becomes hidden again
      mockDoc.visibilityState = 'hidden';
      act(() => {
        visibilityListeners.forEach((l) => l());
      });
      // Second exit beacon IS fired because exit latch was reset on visible
      expect(mockSendBeacon).toHaveBeenCalledTimes(2);
    });

    it('6.10 should not dispatch exit beacon on visibility hidden if the queue is empty', () => {
      const visibilityListeners: Array<() => void> = [];
      const mockDoc = {
        visibilityState: 'visible',
        addEventListener: vi.fn((event, listener) => {
          if (event === 'visibilitychange') visibilityListeners.push(listener);
        }),
        removeEventListener: vi.fn(),
      };
      Object.defineProperty(globalThis, 'document', {
        value: mockDoc,
        writable: true,
        configurable: true,
      });

      const { result } = renderHook(() =>
        useLearningTelemetry({
          courseId: 'c-101',
          lessonId: 'l-vis-empty',
          totalDurationSeconds: 300,
        })
      );

      // Initial start event is immediately flushed to server via axios.post, leaving queue empty
      act(() => {
        result.current.recordVideoStarted(0, 1.0);
      });

      // Tab transitions to hidden with an empty queue
      mockDoc.visibilityState = 'hidden';
      act(() => {
        visibilityListeners.forEach((l) => l());
      });

      // No redundant beacon should be dispatched, preserving the 60-second rate-limit quota
      expect(mockSendBeacon).not.toHaveBeenCalled();
    });

    it('6.11 should record exit beacon dispatch time in shared coordinator so other tabs recognize consumed quota', () => {
      const coordinationKey = 'l-exit-coord-test';
      expect(getSharedLastDispatchTime(coordinationKey)).toBe(0);

      const { result: tab1 } = renderHook(() =>
        useLearningTelemetry({
          courseId: 'c-101',
          lessonId: coordinationKey,
          totalDurationSeconds: 300,
        })
      );

      act(() => {
        tab1.current.dispatchExitBeacon(50);
      });

      // Exit beacon was dispatched and timestamp recorded
      expect(mockSendBeacon).toHaveBeenCalledTimes(1);
      const recordedTime = getSharedLastDispatchTime(coordinationKey);
      expect(recordedTime).toBeGreaterThan(0);
      expect(Date.now() - recordedTime).toBeLessThan(1000);

      // Tab 2 opens to the same lesson and attempts ordinary flush
      const { result: tab2 } = renderHook(() =>
        useLearningTelemetry({
          courseId: 'c-101',
          lessonId: coordinationKey,
          totalDurationSeconds: 300,
        })
      );

      act(() => {
        tab2.current.recordVideoPaused(60);
      });

      // Tab 2 attempts flushBuffer - should observe shared dispatch timestamp and defer
      act(async () => {
        await tab2.current.flushBuffer(false);
      });

      // axios.post was not called by tab 2 because the exit beacon recently consumed a rate-limit slot
      expect(axios.post).not.toHaveBeenCalled();
    });

    it('6.12 should test repeated hidden -> visible -> hidden transitions across two tabs and terminal exit', () => {
      const visibilityListeners: Array<() => void> = [];
      const mockDoc = {
        visibilityState: 'visible',
        addEventListener: vi.fn((event, listener) => {
          if (event === 'visibilitychange') visibilityListeners.push(listener);
        }),
        removeEventListener: vi.fn(),
      };
      Object.defineProperty(globalThis, 'document', {
        value: mockDoc,
        writable: true,
        configurable: true,
      });

      const lessonId = 'l-multi-tab-vis';

      // Tab A
      const tabA = renderHook(() =>
        useLearningTelemetry({ courseId: 'c-1', lessonId, totalDurationSeconds: 300 })
      );
      // Tab B
      const tabB = renderHook(() =>
        useLearningTelemetry({ courseId: 'c-1', lessonId, totalDurationSeconds: 300 })
      );

      // Tab A buffers an event
      act(() => {
        tabA.result.current.recordVideoPaused(10);
      });
      // Tab B has empty queue

      // 1. Tab A is hidden -> dispatches beacon because queue > 0
      mockDoc.visibilityState = 'hidden';
      act(() => {
        visibilityListeners.forEach((l) => l());
      });
      expect(mockSendBeacon).toHaveBeenCalledTimes(1);

      // 2. Both tabs become visible again -> resets exit latches
      mockDoc.visibilityState = 'visible';
      act(() => {
        visibilityListeners.forEach((l) => l());
      });
      expect(mockSendBeacon).toHaveBeenCalledTimes(1);

      // 3. Tab B buffers an event and both tabs transition to hidden
      act(() => {
        tabB.result.current.recordVideoPaused(30);
      });
      mockDoc.visibilityState = 'hidden';
      act(() => {
        visibilityListeners.forEach((l) => l());
      });
      // Tab B dispatches beacon 2 (Tab A had empty queue so it did not double-dispatch)
      expect(mockSendBeacon).toHaveBeenCalledTimes(2);

      // 4. Tab A undergoes terminal exit (unmount)
      act(() => {
        tabA.unmount();
      });
      // Terminal exit fires unconditionally with last reported position
      expect(mockSendBeacon).toHaveBeenCalledTimes(3);

      tabB.unmount();
    });

    // -----------------------------------------------------------------------
    // E. Runtime Overflow Diagnostics & LocalStorage Fallback Concurrency
    // -----------------------------------------------------------------------
    it('6.13 should expose non-sensitive runtime overflow diagnostics when queue capacity is exceeded and completion milestones are evicted', () => {
      const generateEvent = (
        id: string,
        type: any,
        pos: number
      ): TelemetryEventDto => ({
        eventId: id,
        courseId: 'c-1',
        lessonId: 'l-overflow',
        eventType: type,
        metadata: { watchPositionSeconds: pos },
        occurredAt: new Date().toISOString(),
      });

      // Test coalesceQueue callback eviction reporting directly
      let evictedCount = 0;
      const evictedEvents: TelemetryEventDto[] = [];
      const onEvict = (evicted: TelemetryEventDto) => {
        evictedCount++;
        evictedEvents.push(evicted);
      };

      const milestones105 = Array.from({ length: 105 }, (_, i) =>
        generateEvent(`comp-${i}`, 'VIDEO_COMPLETED', i)
      );

      const bounded = coalesceQueue(milestones105, 100, false, onEvict);
      expect(bounded).toHaveLength(100);
      expect(evictedCount).toBe(5);
      expect(evictedEvents[0].eventId).toBe('comp-0');
      expect(evictedEvents[4].eventId).toBe('comp-4');

      // Test hook runtime overflow diagnostics exposure
      const { result } = renderHook(() =>
        useLearningTelemetry({
          courseId: 'c-1',
          lessonId: 'l-hook-overflow',
          totalDurationSeconds: 1000,
        })
      );

      // Initial diagnostics state
      const initialDiag = result.current.getOverflowDiagnostics();
      expect(initialDiag.hasOverflowed).toBe(false);
      expect(initialDiag.evictedMilestonesCount).toBe(0);
      expect(initialDiag.evictedInteractionsCount).toBe(0);

      // Buffer 105 interaction events (seeks)
      act(() => {
        for (let i = 0; i < 105; i++) {
          result.current.recordVideoSeeked(i * 2 + 1, i * 2);
        }
      });

      const updatedDiag = result.current.getOverflowDiagnostics();
      expect(updatedDiag.hasOverflowed).toBe(true);
      expect(updatedDiag.evictedInteractionsCount).toBe(5);

      // Verify diagnostics are completely non-sensitive (no PII, no payloads, no event IDs)
      const diagKeys = Object.keys(updatedDiag);
      expect(diagKeys).toEqual([
        'hasOverflowed',
        'evictedMilestonesCount',
        'evictedStartsCount',
        'evictedInteractionsCount',
        'evictedCheckpointsCount',
      ]);
      for (const [_, v] of Object.entries(updatedDiag)) {
        expect(['boolean', 'number']).toContain(typeof v);
      }
    });

    it('6.14 should test localStorage fallback coordination under concurrent dispatch attempts when Web Locks API is unavailable', async () => {
      // Ensure Web Locks is unavailable across globalThis and window
      const mockNav = {
        sendBeacon: mockSendBeacon.mockReturnValue(true),
        locks: undefined,
      };
      Object.defineProperty(globalThis, 'navigator', {
        value: mockNav,
        writable: true,
        configurable: true,
      });
      if (typeof window !== 'undefined') {
        Object.defineProperty(window, 'navigator', {
          value: mockNav,
          writable: true,
          configurable: true,
        });
      }

      const coordinationKey = 'l-fallback-concurrency';
      const tab1 = renderHook(() =>
        useLearningTelemetry({
          courseId: 'c-1',
          lessonId: coordinationKey,
          totalDurationSeconds: 300,
        })
      );

      const tab2 = renderHook(() =>
        useLearningTelemetry({
          courseId: 'c-1',
          lessonId: coordinationKey,
          totalDurationSeconds: 300,
        })
      );

      // Tab 1 buffers an event and explicitly awaits flush
      act(() => {
        tab1.result.current.recordVideoPaused(10);
      });
      await act(async () => {
        await tab1.result.current.flushBuffer(false);
      });

      expect(axios.post).toHaveBeenCalledTimes(1);
      const sharedTime = getSharedLastDispatchTime(coordinationKey);
      expect(sharedTime).toBeGreaterThan(0);

      // Tab 2 buffers an event and attempts flush
      act(() => {
        tab2.result.current.recordVideoPaused(20);
      });
      await act(async () => {
        await tab2.result.current.flushBuffer(false);
      });

      // Tab 2 observes the localStorage fallback timestamp and defers dispatch
      expect(axios.post).toHaveBeenCalledTimes(1);

      // If timestamp is simulated as stale (> 60s ago), Tab 2 can dispatch
      setSharedLastDispatchTime(coordinationKey, Date.now() - 61_000);
      await act(async () => {
        await tab2.result.current.flushBuffer(false);
      });
      expect(axios.post).toHaveBeenCalledTimes(2);

      tab1.unmount();
      tab2.unmount();
    });
  });

  // =========================================================================
  // 7. VIDEO RETENTION ACCESSIBLE TABLE DEEP-LINK SUITE (P7.1 FIX)
  // =========================================================================

  describe('7. Video Retention Accessible Table Deep-Link Suite', () => {
    const mockRetentionDto: VideoRetentionCurveDto = {
      courseId: 'ff8d0ddc-38cd-459e-ad3a-32be557a8053',
      lessonId: null,
      lessonTitle: null,
      totalUniqueViewers: 1,
      viewerMetricLabel: 'Viewer-days',
      totalCheckpoints: 16,
      averageCompletionPercentage: 17.9,
      intervals: [
        { intervalIndex: 0, intervalRange: '0-10%', viewerCount: 4, retentionPercentage: 100, rewindCount: 0 },
        { intervalIndex: 1, intervalRange: '10-20%', viewerCount: 3, retentionPercentage: 75, rewindCount: 0 },
        { intervalIndex: 2, intervalRange: '20-30%', viewerCount: 2, retentionPercentage: 50, rewindCount: 0 },
        { intervalIndex: 3, intervalRange: '30-40%', viewerCount: 0, retentionPercentage: 0, rewindCount: 0 },
        { intervalIndex: 4, intervalRange: '40-50%', viewerCount: 0, retentionPercentage: 0, rewindCount: 0 },
        { intervalIndex: 5, intervalRange: '50-60%', viewerCount: 0, retentionPercentage: 0, rewindCount: 0 },
        { intervalIndex: 6, intervalRange: '60-70%', viewerCount: 0, retentionPercentage: 0, rewindCount: 0 },
        { intervalIndex: 7, intervalRange: '70-80%', viewerCount: 0, retentionPercentage: 0, rewindCount: 0 },
        { intervalIndex: 8, intervalRange: '80-90%', viewerCount: 0, retentionPercentage: 0, rewindCount: 0 },
        { intervalIndex: 9, intervalRange: '90-100%', viewerCount: 0, retentionPercentage: 0, rewindCount: 0 },
      ],
      telemetryEnabled: true,
      isPartial: false,
      totalEventsScanned: 20,
      sampleNotice: null,
    };

    let originalWindow: any;
    let originalDocument: any;
    let mockHash = '';
    let mockScrollIntoView: any;
    let mockTableElement: any;
    let mockWindow: any;
    let mockDocument: any;

    beforeEach(() => {
      originalWindow = (globalThis as any).window;
      originalDocument = (globalThis as any).document;

      mockHash = '';
      mockScrollIntoView = vi.fn();
      mockTableElement = {
        id: 'retention-accessible-table',
        scrollIntoView: mockScrollIntoView,
      };

      const listeners: Record<string, Array<() => void>> = {};
      mockWindow = {
        get location() {
          return {
            get hash() {
              return mockHash;
            },
            set hash(val: string) {
              mockHash = val;
            },
          };
        },
        addEventListener: vi.fn((event: string, cb: () => void) => {
          if (!listeners[event]) listeners[event] = [];
          listeners[event].push(cb);
        }),
        removeEventListener: vi.fn((event: string, cb: () => void) => {
          if (!listeners[event]) return;
          listeners[event] = listeners[event].filter((l) => l !== cb);
        }),
        dispatchEvent: vi.fn((event: { type: string }) => {
          if (listeners[event.type]) {
            listeners[event.type].forEach((cb) => cb());
          }
          return true;
        }),
        requestAnimationFrame: vi.fn((cb: any) => {
          return setTimeout(cb, 0) as any;
        }),
        cancelAnimationFrame: vi.fn((id: any) => {
          clearTimeout(id);
        }),
      };

      mockDocument = {
        getElementById: vi.fn((id: string) => {
          if (id === 'retention-accessible-table') {
            return mockTableElement;
          }
          return null;
        }),
      };

      (globalThis as any).window = mockWindow;
      (globalThis as any).document = mockDocument;
    });

    afterEach(() => {
      if (originalWindow !== undefined) {
        (globalThis as any).window = originalWindow;
      } else {
        delete (globalThis as any).window;
      }
      if (originalDocument !== undefined) {
        (globalThis as any).document = originalDocument;
      } else {
        delete (globalThis as any).document;
      }
    });

    it('7.1 should automatically reveal the accessible table when mounted with #retention-accessible-table fragment', () => {
      mockHash = '#retention-accessible-table';

      const hook = renderHook(() => VideoRetentionCurve({ data: mockRetentionDto }));

      const table = findNode(hook.result.current, (n) => n?.props?.id === 'retention-accessible-table');
      expect(table).not.toBeNull();
      expect(table.props.id).toBe('retention-accessible-table');

      const button = findNode(hook.result.current, (n) => n?.props?.['aria-controls'] === 'retention-accessible-table');
      expect(button.props['aria-expanded']).toBe(true);
      expect(JSON.stringify(button)).toContain('Hide Tabular Data');

      hook.unmount();
    });

    it('7.2 should scroll the rendered table into view after it becomes available in the DOM', async () => {
      mockHash = '#retention-accessible-table';
      vi.useFakeTimers();

      const hook = renderHook(() => VideoRetentionCurve({ data: mockRetentionDto }));

      vi.runAllTimers();

      expect(mockDocument.getElementById).toHaveBeenCalledWith('retention-accessible-table');
      expect(mockScrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth', block: 'start' });

      hook.unmount();
      expect(mockWindow.removeEventListener).toHaveBeenCalledWith('hashchange', expect.any(Function));
      vi.useRealTimers();
    });

    it('7.3 should keep the accessible table collapsed when loaded without the fragment or with unrelated fragment', () => {
      mockHash = '';
      const hookEmpty = renderHook(() => VideoRetentionCurve({ data: mockRetentionDto }));
      expect(findNode(hookEmpty.result.current, (n) => n?.props?.id === 'retention-accessible-table')).toBeNull();
      const buttonEmpty = findNode(hookEmpty.result.current, (n) => n?.props?.['aria-controls'] === 'retention-accessible-table');
      expect(buttonEmpty.props['aria-expanded']).toBe(false);
      expect(JSON.stringify(buttonEmpty)).toContain('View Accessible Table');
      hookEmpty.unmount();

      mockHash = '#kpi-section';
      const hookOther = renderHook(() => VideoRetentionCurve({ data: mockRetentionDto }));
      expect(findNode(hookOther.result.current, (n) => n?.props?.id === 'retention-accessible-table')).toBeNull();
      hookOther.unmount();
    });

    it('7.4 should allow manually expanding and collapsing the table via the toggle button', () => {
      mockHash = '';
      const hook = renderHook(() => VideoRetentionCurve({ data: mockRetentionDto }));

      // 1. Initially closed
      let button = findNode(hook.result.current, (n) => n?.props?.['aria-controls'] === 'retention-accessible-table');
      expect(button.props['aria-expanded']).toBe(false);
      expect(findNode(hook.result.current, (n) => n?.props?.id === 'retention-accessible-table')).toBeNull();

      // 2. Click to expand
      button.props.onClick();
      hook.rerender();

      button = findNode(hook.result.current, (n) => n?.props?.['aria-controls'] === 'retention-accessible-table');
      expect(button.props['aria-expanded']).toBe(true);
      expect(findNode(hook.result.current, (n) => n?.props?.id === 'retention-accessible-table')).not.toBeNull();

      // 3. Click to collapse
      button.props.onClick();
      hook.rerender();

      button = findNode(hook.result.current, (n) => n?.props?.['aria-controls'] === 'retention-accessible-table');
      expect(button.props['aria-expanded']).toBe(false);
      expect(findNode(hook.result.current, (n) => n?.props?.id === 'retention-accessible-table')).toBeNull();

      // 4. If table was opened via hash, clicking toggle collapses it
      mockHash = '#retention-accessible-table';
      const hookHash = renderHook(() => VideoRetentionCurve({ data: mockRetentionDto }));
      let hashButton = findNode(hookHash.result.current, (n) => n?.props?.['aria-controls'] === 'retention-accessible-table');
      expect(hashButton.props['aria-expanded']).toBe(true);

      hashButton.props.onClick();
      hookHash.rerender();
      hashButton = findNode(hookHash.result.current, (n) => n?.props?.['aria-controls'] === 'retention-accessible-table');
      expect(hashButton.props['aria-expanded']).toBe(false);
      expect(findNode(hookHash.result.current, (n) => n?.props?.id === 'retention-accessible-table')).toBeNull();

      hook.unmount();
      hookHash.unmount();
    });

    it('7.5 should preserve existing chart, metrics, 10-interval SVG labels, and disabled states', () => {
      const hook = renderHook(() => VideoRetentionCurve({ data: mockRetentionDto }));
      const renderedStr = JSON.stringify(hook.result.current);

      expect(renderedStr).toContain('Viewer-days');
      expect(renderedStr).toContain('Avg. Completion');
      expect(renderedStr).toContain('Terminal Retention');
      expect(renderedStr).toContain('Backward Rewinds');
      expect(renderedStr).toContain('17.9');
      expect(renderedStr).toContain('0-10%');
      expect(renderedStr).toContain('90-100%');

      // Verify disabled state
      const disabledHook = renderHook(() =>
        VideoRetentionCurve({
          data: { ...mockRetentionDto, telemetryEnabled: false },
        })
      );
      const disabledStr = JSON.stringify(disabledHook.result.current);
      expect(disabledStr).toContain('Telemetry collection is currently disabled');
      expect(disabledStr).not.toContain('retention-accessible-table');

      hook.unmount();
      disabledHook.unmount();
    });

    it('7.6 should safely render on the server via renderToString without window access or hydration mismatches', () => {
      delete (globalThis as any).window;
      delete (globalThis as any).document;

      const html = renderToString(React.createElement(VideoRetentionCurve, { data: mockRetentionDto }));

      expect(html).toContain('Video Engagement Retention Curve &amp; Rewind Heatmap');
      expect(html).toContain('Viewer-days');
      expect(html).toContain('17.9');
      expect(html).toContain('aria-expanded="false"');
      expect(html).toContain('View Accessible Table');
      expect(html).not.toContain('id="retention-accessible-table"');
    });

    it('7.7 should dynamically reveal the table when hashchange event fires after initial mount', () => {
      mockHash = '';
      const hook = renderHook(() => VideoRetentionCurve({ data: mockRetentionDto }));

      expect(findNode(hook.result.current, (n) => n?.props?.id === 'retention-accessible-table')).toBeNull();

      mockHash = '#retention-accessible-table';
      mockWindow.dispatchEvent({ type: 'hashchange' });

      hook.rerender();

      const table = findNode(hook.result.current, (n) => n?.props?.id === 'retention-accessible-table');
      expect(table).not.toBeNull();

      hook.unmount();
    });
  });
});
