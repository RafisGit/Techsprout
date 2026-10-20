'use client';

import { useRef, useEffect, useCallback } from 'react';
import axios from 'axios';
import type {
  ApprovedEventType,
  TelemetryMetadataDto,
  TelemetryEventDto,
} from '@techsprout/contracts';

export interface UseLearningTelemetryOptions {
  courseId: string;
  moduleId?: string | null;
  lessonId?: string | null;
  totalDurationSeconds?: number;
  throttleIntervalMs?: number; // Defaults to 60,000ms (60 seconds)
}

export interface TelemetryOverflowDiagnostics {
  hasOverflowed: boolean;
  evictedMilestonesCount: number;
  evictedStartsCount: number;
  evictedInteractionsCount: number;
  evictedCheckpointsCount: number;
}

export interface UseLearningTelemetryReturn {
  recordVideoStarted: (currentTime: number, playbackRate?: number) => void;
  recordVideoCheckpoint: (
    currentTime: number,
    playbackRate?: number,
    forceImmediate?: boolean
  ) => void;
  recordVideoPaused: (currentTime: number, playbackRate?: number) => void;
  recordVideoSeeked: (
    currentTime: number,
    previousPosition?: number,
    playbackRate?: number
  ) => void;
  recordVideoCompleted: (totalDuration?: number) => void;
  flushBuffer: (force?: boolean) => Promise<void>;
  dispatchExitBeacon: (currentTime: number, playbackRate?: number) => void;
  getOverflowDiagnostics: () => TelemetryOverflowDiagnostics;
  isTelemetryEnabled: boolean;
}

const DEFAULT_THROTTLE_MS = 60_000; // 60 seconds fixed throttling (WP-P7-02)
const BATCH_ENDPOINT = '/api/v1/learning/events';
const BEACON_ENDPOINT = '/api/v1/learning/events/beacon';
const MAX_BATCH_SIZE = 50; // Server limit: max 50 events per batch
const MAX_QUEUE_CAPACITY = 100; // Bounded client-side buffer limit
const MAX_PAYLOAD_BYTES = 30 * 1024; // 30KB body ceiling (under server 32KB ceiling)

const DISPATCH_TIMESTAMP_PREFIX = 'ts_disp_';
const LOCK_NAME_PREFIX = 'ts_telemetry_lock_';

/**
 * Deterministic priority tiers for telemetry event preservation in bounded queues and exit batches.
 *
 * Tier 1 (Highest): Irreplaceable progress milestones (VIDEO_COMPLETED, LESSON_COMPLETED, CERTIFICATE_EARNED).
 * Tier 2 (High): Media and session initiation milestones (VIDEO_STARTED, LESSON_STARTED, COURSE_OPENED).
 * Tier 3 (Medium): User interaction events (VIDEO_SEEKED, VIDEO_PAUSED, QUIZ_ATTEMPTED).
 * Tier 4 (Lowest): Replaceable periodic heartbeats (VIDEO_CHECKPOINT).
 */
export const EVENT_PRIORITY_MAP: Record<ApprovedEventType, number> = {
  VIDEO_COMPLETED: 1,
  LESSON_COMPLETED: 1,
  CERTIFICATE_EARNED: 1,
  VIDEO_STARTED: 2,
  LESSON_STARTED: 2,
  COURSE_OPENED: 2,
  VIDEO_SEEKED: 3,
  VIDEO_PAUSED: 3,
  QUIZ_ATTEMPTED: 3,
  VIDEO_CHECKPOINT: 4,
};

const getStorage = () => {
  if (typeof window !== 'undefined' && window.localStorage) return window.localStorage;
  if (typeof globalThis !== 'undefined' && (globalThis as any).localStorage) {
    return (globalThis as any).localStorage;
  }
  return null;
};

/**
 * Cross-tab coordination helpers using localStorage fallback.
 * Strictly stores only numerical epoch timestamps keyed by target resource ID.
 * Never stores user IDs, tokens, event payloads, HMAC values, or PII.
 *
 * NOTE ON FALLBACK CONCURRENCY:
 * localStorage read/write is NOT an atomic synchronization primitive or mutual exclusion lock.
 * When the Web Locks API is unavailable, localStorage timestamp checking is a best-effort heuristic.
 * Simultaneous dispatches occurring at the exact same millisecond across multiple tabs can race.
 * Client-side coordination cannot guarantee server acceptance across competing devices, separate
 * browser profiles, or private sessions. The server rate limit remains authoritative.
 */
export function getSharedLastDispatchTime(key: string): number {
  const storage = getStorage();
  if (!storage) return 0;
  try {
    const val = storage.getItem(`${DISPATCH_TIMESTAMP_PREFIX}${key}`);
    return val ? Number(val) : 0;
  } catch {
    return 0;
  }
}

export function setSharedLastDispatchTime(key: string, timestamp: number): void {
  const storage = getStorage();
  if (!storage) return;
  try {
    storage.setItem(`${DISPATCH_TIMESTAMP_PREFIX}${key}`, timestamp.toString());
  } catch {
    // Ignore storage quota or disabled storage exceptions
  }
}

/**
 * Coalesces redundant checkpoints and manages bounded queue overflow according to strict priority tiers.
 *
 * Hierarchy:
 * 1. First Pass: Coalesces redundant high-frequency VIDEO_CHECKPOINT events, keeping only the latest.
 * 2. Second Pass: If still over capacity, prunes Tier 3 user interaction events (oldest paused/seeked first).
 * 3. Third Pass: If still over capacity, prunes Tier 2 start milestones (oldest started first).
 * 4. Documented FIFO Milestone Eviction: If the queue is filled with > maxCapacity Tier 1 completion milestones,
 *    evicts oldest Tier 1 milestones via FIFO to guarantee bounded memory allocation, invoking onEvict callback.
 */
export function coalesceQueue(
  queue: TelemetryEventDto[],
  maxCapacity: number = MAX_QUEUE_CAPACITY,
  forceCoalesceCheckpoints: boolean = false,
  onEvict?: (evicted: TelemetryEventDto) => void
): TelemetryEventDto[] {
  if (!forceCoalesceCheckpoints && queue.length <= maxCapacity) return queue;

  // 1. First pass: coalesce redundant VIDEO_CHECKPOINT events, keeping only the latest checkpoint
  const checkpointIndices = queue
    .map((e, idx) => (e.eventType === 'VIDEO_CHECKPOINT' ? idx : -1))
    .filter((idx) => idx !== -1);

  if (checkpointIndices.length > 1) {
    const indicesToRemove = new Set(checkpointIndices.slice(0, -1));
    if (onEvict) {
      queue.forEach((e, idx) => {
        if (indicesToRemove.has(idx)) onEvict(e);
      });
    }
    queue = queue.filter((_, idx) => !indicesToRemove.has(idx));
  }

  if (queue.length <= maxCapacity) return queue;

  // 2. Second pass: prune Tier 3 events (VIDEO_PAUSED, VIDEO_SEEKED, QUIZ_ATTEMPTED) from oldest to newest
  while (queue.length > maxCapacity) {
    const tier3Idx = queue.findIndex(
      (e) => (EVENT_PRIORITY_MAP[e.eventType] ?? 4) === 3
    );
    if (tier3Idx === -1) break;
    const [evicted] = queue.splice(tier3Idx, 1);
    if (onEvict && evicted) onEvict(evicted);
  }

  if (queue.length <= maxCapacity) return queue;

  // 3. Third pass: prune Tier 2 events (VIDEO_STARTED, LESSON_STARTED, COURSE_OPENED) from oldest to newest
  while (queue.length > maxCapacity) {
    const tier2Idx = queue.findIndex(
      (e) => (EVENT_PRIORITY_MAP[e.eventType] ?? 4) === 2
    );
    if (tier2Idx === -1) break;
    const [evicted] = queue.splice(tier2Idx, 1);
    if (onEvict && evicted) onEvict(evicted);
  }

  if (queue.length <= maxCapacity) return queue;

  // 4. Documented FIFO Milestone Eviction:
  // When non-coalescible completion milestones exceed bounded capacity, evict oldest milestone FIFO
  while (queue.length > maxCapacity) {
    const evicted = queue.shift();
    if (onEvict && evicted) onEvict(evicted);
  }

  return queue;
}

/**
 * Truncates candidate batch to ensure serialized JSON stays strictly below maxBytes.
 */
function sliceBatchUnderByteLimit(
  events: TelemetryEventDto[],
  maxCount: number,
  maxBytes: number
): TelemetryEventDto[] {
  const candidate = events.slice(0, maxCount);
  let payloadStr = JSON.stringify({ events: candidate });
  const getBytes = (str: string) =>
    typeof Blob !== 'undefined' ? new Blob([str]).size : Buffer.byteLength(str, 'utf8');

  if (getBytes(payloadStr) <= maxBytes) {
    return candidate;
  }

  // Iteratively reduce count until below maxBytes
  for (let count = candidate.length - 1; count >= 1; count--) {
    const subset = candidate.slice(0, count);
    payloadStr = JSON.stringify({ events: subset });
    if (getBytes(payloadStr) <= maxBytes) {
      return subset;
    }
  }

  return candidate.slice(0, 1);
}

export function useLearningTelemetry({
  courseId,
  moduleId = null,
  lessonId = null,
  totalDurationSeconds = 0,
  throttleIntervalMs = DEFAULT_THROTTLE_MS,
}: UseLearningTelemetryOptions): UseLearningTelemetryReturn {
  // Check client-side kill switch (respects TELEMETRY_ENABLED / NEXT_PUBLIC_TELEMETRY_ENABLED)
  const isTelemetryEnabled =
    typeof process !== 'undefined' &&
    process.env.NEXT_PUBLIC_TELEMETRY_ENABLED !== 'false' &&
    process.env.TELEMETRY_ENABLED !== 'false';

  // State refs to isolate from React re-renders and avoid duplicate events
  const lastCheckpointTimeRef = useRef<number>(-1);
  const lastRealTimeRef = useRef<number>(0);
  const hasStartedRef = useRef<boolean>(false);
  const hasCompletedRef = useRef<boolean>(false);
  const lastReportedPositionRef = useRef<number>(0);
  const lastSeekRef = useRef<{
    currentTime: number;
    previousPosition?: number;
    timestamp: number;
  } | null>(null);

  // Bounded in-memory event buffer
  const queueRef = useRef<TelemetryEventDto[]>([]);
  const isFlushingRef = useRef<boolean>(false);

  // Rate-limiting & scheduling refs:
  // Server allows 2 requests per 60s per user/lesson.
  // Client schedule limits ordinary dispatches to 1 request per 60s, reserving 1 slot for exit beacon transport.
  const lastOrdinaryDispatchTimeRef = useRef<number>(0);
  const backoffUntilRef = useRef<number>(0);

  // Runtime overflow diagnostics ref (bounded counts, zero PII, zero identifiers)
  const overflowDiagnosticsRef = useRef<TelemetryOverflowDiagnostics>({
    hasOverflowed: false,
    evictedMilestonesCount: 0,
    evictedStartsCount: 0,
    evictedInteractionsCount: 0,
    evictedCheckpointsCount: 0,
  });

  const handleEviction = useCallback((evicted: TelemetryEventDto) => {
    overflowDiagnosticsRef.current.hasOverflowed = true;
    const tier = EVENT_PRIORITY_MAP[evicted.eventType] ?? 4;
    if (tier === 1) {
      overflowDiagnosticsRef.current.evictedMilestonesCount++;
    } else if (tier === 2) {
      overflowDiagnosticsRef.current.evictedStartsCount++;
    } else if (tier === 3) {
      overflowDiagnosticsRef.current.evictedInteractionsCount++;
    } else {
      overflowDiagnosticsRef.current.evictedCheckpointsCount++;
    }
  }, []);

  const getOverflowDiagnostics = useCallback((): TelemetryOverflowDiagnostics => {
    return { ...overflowDiagnosticsRef.current };
  }, []);

  // Helper to generate a compliant, allowlisted telemetry event
  const createEvent = useCallback(
    (
      eventType: ApprovedEventType,
      watchPositionSeconds: number,
      playbackRate = 1.0,
      customMetadata: Partial<TelemetryMetadataDto> = {}
    ): TelemetryEventDto => {
      const sanitizedPosition = Math.max(0, Math.floor(watchPositionSeconds));
      const sanitizedDuration = Math.max(
        0,
        Math.floor(totalDurationSeconds || customMetadata.totalDurationSeconds || 0)
      );

      const metadata: TelemetryMetadataDto = {
        watchPositionSeconds: sanitizedPosition,
        totalDurationSeconds: sanitizedDuration,
        playbackRate: Number(playbackRate.toFixed(2)),
        ...customMetadata,
      };

      return {
        eventId:
          typeof crypto !== 'undefined' && crypto.randomUUID
            ? crypto.randomUUID()
            : Math.random().toString(36).substring(2) + Date.now(),
        courseId,
        moduleId: moduleId || null,
        lessonId: lessonId || null,
        eventType,
        metadata,
        occurredAt: new Date().toISOString(),
      };
    },
    [courseId, moduleId, lessonId, totalDurationSeconds]
  );

  const targetCoordinationKey = lessonId || courseId;

  // Flush in-memory event buffer to server batch endpoint respecting sliding window rate limit
  const flushBuffer = useCallback(
    async (force = false) => {
      if (!isTelemetryEnabled || queueRef.current.length === 0 || isFlushingRef.current) {
        return;
      }

      const now = Date.now();

      // Check exponential backoff or retry delay
      if (!force && now < backoffUntilRef.current) {
        return;
      }

      // Check cross-tab ordinary dispatch schedule:
      // Respects 60s sliding window across all same-origin tabs so exit slot is preserved
      const sharedLastDispatch = getSharedLastDispatchTime(targetCoordinationKey);
      const effectiveLastDispatch = Math.max(
        lastOrdinaryDispatchTimeRef.current,
        sharedLastDispatch
      );

      if (
        !force &&
        effectiveLastDispatch > 0 &&
        now - effectiveLastDispatch < throttleIntervalMs
      ) {
        return;
      }

      // Worker function to execute the batch dispatch
      const executeDispatch = async () => {
        isFlushingRef.current = true;
        const eventsToSend = sliceBatchUnderByteLimit(
          queueRef.current,
          MAX_BATCH_SIZE,
          MAX_PAYLOAD_BYTES
        );

        // Remove selected batch from queue
        const sentIds = new Set(eventsToSend.map((e) => e.eventId));
        queueRef.current = queueRef.current.filter((e) => !sentIds.has(e.eventId));

        try {
          await axios.post(
            BATCH_ENDPOINT,
            { events: eventsToSend },
            {
              headers: { 'Content-Type': 'application/json' },
              withCredentials: true,
              timeout: 10_000,
            }
          );
          const dispatchTime = Date.now();
          lastOrdinaryDispatchTimeRef.current = dispatchTime;
          setSharedLastDispatchTime(targetCoordinationKey, dispatchTime);
          backoffUntilRef.current = 0;
        } catch (err: any) {
          // Restore unsent events to front of queue, deduplicating by eventId and preserving order
          const currentIds = new Set(queueRef.current.map((e) => e.eventId));
          const toRestore = eventsToSend.filter((e) => !currentIds.has(e.eventId));
          queueRef.current = coalesceQueue(
            [...toRestore, ...queueRef.current],
            MAX_QUEUE_CAPACITY,
            false,
            handleEviction
          );

          const status = err?.response?.status;
          if (status === 429) {
            // HTTP 429 Rate Limit: back off for 60 seconds before next ordinary retry
            backoffUntilRef.current = Date.now() + 60_000;
          } else if (!status || status >= 500) {
            // Transient network or server error: back off 15 seconds
            backoffUntilRef.current = Date.now() + 15_000;
          }
        } finally {
          isFlushingRef.current = false;
        }
      };

      // Coordinate via Web Locks API when available to prevent simultaneous cross-tab requests
      if (
        typeof navigator !== 'undefined' &&
        navigator.locks &&
        typeof navigator.locks.request === 'function'
      ) {
        try {
          await navigator.locks.request(
            `${LOCK_NAME_PREFIX}${targetCoordinationKey}`,
            { ifAvailable: true },
            async (lock) => {
              if (!lock) {
                // Another tab is actively holding the dispatch lock; defer to keep queue safe
                return;
              }
              // Re-check shared dispatch timestamp inside lock
              const latestShared = getSharedLastDispatchTime(targetCoordinationKey);
              if (
                !force &&
                latestShared > 0 &&
                Date.now() - latestShared < throttleIntervalMs
              ) {
                return;
              }
              await executeDispatch();
            }
          );
        } catch {
          // Fallback if lock acquisition throws
          await executeDispatch();
        }
      } else {
        // Fallback for environments without Web Locks API
        await executeDispatch();
      }
    },
    [isTelemetryEnabled, throttleIntervalMs, targetCoordinationKey, handleEviction]
  );

  // Terminal exit beacon transport using navigator.sendBeacon with fetch keepalive fallback
  const dispatchExitBeacon = useCallback(
    (currentTime: number, playbackRate = 1.0) => {
      if (!isTelemetryEnabled) return;

      lastReportedPositionRef.current = currentTime;
      const exitEvent = createEvent('VIDEO_CHECKPOINT', currentTime, playbackRate);

      // Combine buffered events with terminal exit event, deduplicating by eventId
      const combined = [...queueRef.current, exitEvent];
      const uniqueEventsMap = new Map<string, TelemetryEventDto>();
      for (const ev of combined) {
        uniqueEventsMap.set(ev.eventId, ev);
      }
      const uniqueEvents = Array.from(uniqueEventsMap.values());

      // Coalesce redundant checkpoints and prioritize lifecycle milestones targeting MAX_BATCH_SIZE (50)
      const coalescedForExit = coalesceQueue(uniqueEvents, MAX_BATCH_SIZE, true);

      // Ensure serialized payload strictly obeys 30KB body ceiling
      const eventsToSend = sliceBatchUnderByteLimit(
        coalescedForExit,
        MAX_BATCH_SIZE,
        MAX_PAYLOAD_BYTES
      );

      const payloadString = JSON.stringify({ events: eventsToSend });

      // 1. Primary Transport: navigator.sendBeacon
      // Note: sendBeacon returning true indicates queuing by browser, not persisted server delivery.
      let beaconDispatched = false;
      if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
        try {
          beaconDispatched = navigator.sendBeacon(BEACON_ENDPOINT, payloadString);
        } catch {
          beaconDispatched = false;
        }
      }

      // 2. Secondary Fallback: fetch with keepalive: true
      if (!beaconDispatched && typeof fetch !== 'undefined') {
        try {
          fetch(BEACON_ENDPOINT, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: payloadString,
            keepalive: true,
            credentials: 'include',
          }).catch(() => {});
        } catch {
          // Best-effort send; never throw on unload
        }
      }

      // Record dispatch timestamp in shared coordinator so other tabs/instances
      // recognize that an exit beacon recently consumed a rate-limit slot
      const dispatchTime = Date.now();
      lastOrdinaryDispatchTimeRef.current = dispatchTime;
      setSharedLastDispatchTime(targetCoordinationKey, dispatchTime);

      // Clear successfully handed-off events from buffer
      const dispatchedIds = new Set(eventsToSend.map((e) => e.eventId));
      queueRef.current = queueRef.current.filter((e) => !dispatchedIds.has(e.eventId));
    },
    [isTelemetryEnabled, createEvent, targetCoordinationKey]
  );

  // 1. VIDEO_STARTED: Dispatched on initial playback
  const recordVideoStarted = useCallback(
    (currentTime: number, playbackRate = 1.0) => {
      if (!isTelemetryEnabled || hasStartedRef.current) return;

      hasStartedRef.current = true;
      lastReportedPositionRef.current = currentTime;
      const event = createEvent('VIDEO_STARTED', currentTime, playbackRate);
      queueRef.current = coalesceQueue([...queueRef.current, event], MAX_QUEUE_CAPACITY, false, handleEviction);

      // Initial dispatch can proceed if no ordinary dispatch has consumed the slot yet
      if (lastOrdinaryDispatchTimeRef.current === 0) {
        flushBuffer(false).catch(() => {});
      }
    },
    [isTelemetryEnabled, createEvent, flushBuffer, handleEviction]
  );

  // 2. VIDEO_CHECKPOINT: Periodic fixed throttled heartbeat
  const recordVideoCheckpoint = useCallback(
    (currentTime: number, playbackRate = 1.0, forceImmediate = false) => {
      if (!isTelemetryEnabled) return;

      lastReportedPositionRef.current = currentTime;
      const now = Date.now();
      const timeSinceLastCheckpoint = now - lastRealTimeRef.current;
      const positionDelta = Math.abs(currentTime - lastCheckpointTimeRef.current);

      // Enforce 60-second checkpoint throttling unless forceImmediate is requested
      if (!forceImmediate && timeSinceLastCheckpoint < throttleIntervalMs && positionDelta < 60) {
        return;
      }

      lastCheckpointTimeRef.current = currentTime;
      lastRealTimeRef.current = now;

      const event = createEvent('VIDEO_CHECKPOINT', currentTime, playbackRate);
      queueRef.current = coalesceQueue([...queueRef.current, event], MAX_QUEUE_CAPACITY, false, handleEviction);

      // Dispatch if the ordinary schedule interval has elapsed
      if (
        lastOrdinaryDispatchTimeRef.current > 0 &&
        now - lastOrdinaryDispatchTimeRef.current >= throttleIntervalMs
      ) {
        flushBuffer(false).catch(() => {});
      }
    },
    [isTelemetryEnabled, throttleIntervalMs, createEvent, flushBuffer, handleEviction]
  );

  // 3. VIDEO_PAUSED: Buffered on user pause
  const recordVideoPaused = useCallback(
    (currentTime: number, playbackRate = 1.0) => {
      if (!isTelemetryEnabled) return;

      lastReportedPositionRef.current = currentTime;
      const event = createEvent('VIDEO_PAUSED', currentTime, playbackRate);
      queueRef.current = coalesceQueue([...queueRef.current, event], MAX_QUEUE_CAPACITY, false, handleEviction);

      // Buffered: do not immediately dispatch to preserve sliding-window quota
      const now = Date.now();
      if (
        lastOrdinaryDispatchTimeRef.current > 0 &&
        now - lastOrdinaryDispatchTimeRef.current >= throttleIntervalMs
      ) {
        flushBuffer(false).catch(() => {});
      }
    },
    [isTelemetryEnabled, throttleIntervalMs, createEvent, flushBuffer, handleEviction]
  );

  // 4. VIDEO_SEEKED: Buffered with previousPositionSeconds metadata (Fix B)
  const recordVideoSeeked = useCallback(
    (currentTime: number, previousPosition?: number, playbackRate = 1.0) => {
      if (!isTelemetryEnabled) return;

      // Deduplicate: ignore seek if positions are identical
      if (
        typeof previousPosition === 'number' &&
        Math.abs(currentTime - previousPosition) < 0.5
      ) {
        return;
      }

      // Deduplicate rapid seeking/seeked callback floods
      if (
        lastSeekRef.current &&
        Math.abs(lastSeekRef.current.currentTime - currentTime) < 0.5 &&
        lastSeekRef.current.previousPosition === previousPosition &&
        Date.now() - lastSeekRef.current.timestamp < 1000
      ) {
        return;
      }

      lastSeekRef.current = { currentTime, previousPosition, timestamp: Date.now() };
      lastReportedPositionRef.current = currentTime;

      const customMetadata: Partial<TelemetryMetadataDto> = {};
      if (typeof previousPosition === 'number' && !isNaN(previousPosition)) {
        customMetadata.previousPositionSeconds = Math.max(0, Math.floor(previousPosition));
      }

      const event = createEvent('VIDEO_SEEKED', currentTime, playbackRate, customMetadata);
      queueRef.current = coalesceQueue([...queueRef.current, event], MAX_QUEUE_CAPACITY, false, handleEviction);

      // Buffered: do not immediately dispatch
      const now = Date.now();
      if (
        lastOrdinaryDispatchTimeRef.current > 0 &&
        now - lastOrdinaryDispatchTimeRef.current >= throttleIntervalMs
      ) {
        flushBuffer(false).catch(() => {});
      }
    },
    [isTelemetryEnabled, throttleIntervalMs, createEvent, flushBuffer, handleEviction]
  );

  // 5. VIDEO_COMPLETED: Dispatched on video playback completion
  const recordVideoCompleted = useCallback(
    (totalDuration?: number) => {
      if (!isTelemetryEnabled || hasCompletedRef.current) return;

      hasCompletedRef.current = true;
      const duration = totalDuration || totalDurationSeconds || lastReportedPositionRef.current;
      lastReportedPositionRef.current = duration;

      const event = createEvent('VIDEO_COMPLETED', duration, 1.0, {
        passed: true,
      });
      queueRef.current = coalesceQueue([...queueRef.current, event], MAX_QUEUE_CAPACITY, false, handleEviction);

      const now = Date.now();
      if (
        lastOrdinaryDispatchTimeRef.current > 0 &&
        now - lastOrdinaryDispatchTimeRef.current >= throttleIntervalMs
      ) {
        flushBuffer(false).catch(() => {});
      }
    },
    [isTelemetryEnabled, totalDurationSeconds, throttleIntervalMs, createEvent, flushBuffer, handleEviction]
  );

  // 6. Scheduled periodic dispatch timer (flushes queue every throttleIntervalMs)
  useEffect(() => {
    if (!isTelemetryEnabled) return;

    const timer = setInterval(() => {
      if (queueRef.current.length > 0) {
        flushBuffer(false).catch(() => {});
      }
    }, throttleIntervalMs);

    return () => {
      clearInterval(timer);
    };
  }, [isTelemetryEnabled, throttleIntervalMs, flushBuffer]);

  // 7. Lifecycle cleanup: pagehide, visibilitychange, and unmount terminal exit
  useEffect(() => {
    if (!isTelemetryEnabled) return;

    let hasExited = false;
    const handleExit = (isTerminal = false) => {
      if (hasExited) return;

      // On temporary backgrounding (visibilityState === 'hidden'), only dispatch if
      // there are pending unpersisted events in the queue. Do not synthesize redundant
      // empty exit beacons that consume the 60s sliding window rate-limit quota.
      if (!isTerminal && queueRef.current.length === 0) {
        return;
      }

      hasExited = true;
      dispatchExitBeacon(lastReportedPositionRef.current);
    };

    const handleVisibilityChange = () => {
      if (typeof document !== 'undefined') {
        if (document.visibilityState === 'hidden') {
          handleExit(false);
        } else if (document.visibilityState === 'visible') {
          // Tab restored from background: reset exit latch so subsequent termination or hiding can fire
          hasExited = false;
        }
      }
    };

    const handleTerminalExit = () => handleExit(true);

    if (typeof window !== 'undefined') {
      window.addEventListener('pagehide', handleTerminalExit);
      window.addEventListener('beforeunload', handleTerminalExit);
    }
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', handleVisibilityChange);
    }

    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('pagehide', handleTerminalExit);
        window.removeEventListener('beforeunload', handleTerminalExit);
      }
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', handleVisibilityChange);
      }
      // Send terminal exit position on React component unmount
      handleTerminalExit();
    };
  }, [isTelemetryEnabled, dispatchExitBeacon]);

  return {
    recordVideoStarted,
    recordVideoCheckpoint,
    recordVideoPaused,
    recordVideoSeeked,
    recordVideoCompleted,
    flushBuffer,
    dispatchExitBeacon,
    getOverflowDiagnostics,
    isTelemetryEnabled,
  };
}
