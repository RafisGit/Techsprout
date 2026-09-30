'use client';

import React, { useRef, useEffect, useCallback, useState } from 'react';
import { saveProgressCheckpoint } from '@/lib/api/learning';
import { AlertCircle, CheckCircle2, Play, Volume2 } from 'lucide-react';

interface VideoPlayerProps {
  courseId: string;
  lessonId: string;
  mediaUrl: string;
  initialWatchPosition?: number;
  durationSeconds?: number;
  isCompleted?: boolean;
  onCompleted?: () => void;
  onProgressUpdate?: (progressPct: number) => void;
}

export function VideoPlayer({
  courseId,
  lessonId,
  mediaUrl,
  initialWatchPosition = 0,
  durationSeconds = 0,
  isCompleted = false,
  onCompleted,
  onProgressUpdate,
}: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const lastCheckpointTimeRef = useRef<number>(initialWatchPosition);
  const isSavingRef = useRef<boolean>(false);
  const completedRef = useRef<boolean>(isCompleted);
  const [loadError, setLoadError] = useState<boolean>(false);
  const [showCompletionBanner, setShowCompletionBanner] = useState<boolean>(isCompleted);

  // Sync completion state
  useEffect(() => {
    completedRef.current = isCompleted;
    setShowCompletionBanner(isCompleted);
  }, [isCompleted]);

  // Set initial position once video metadata is loaded
  const handleLoadedMetadata = () => {
    if (videoRef.current && initialWatchPosition > 0) {
      // If position is near the end, start from 0
      const duration = videoRef.current.duration || durationSeconds;
      if (duration > 0 && initialWatchPosition >= 0.95 * duration) {
        videoRef.current.currentTime = 0;
        lastCheckpointTimeRef.current = 0;
      } else {
        videoRef.current.currentTime = initialWatchPosition;
        lastCheckpointTimeRef.current = initialWatchPosition;
      }
    }
  };

  // Checkpoint persistence function
  const sendCheckpoint = useCallback(
    async (currentTime: number, force = false) => {
      if (isSavingRef.current && !force) return;

      const roundedSeconds = Math.max(0, Math.floor(currentTime));
      isSavingRef.current = true;

      try {
        const response = await saveProgressCheckpoint(
          courseId,
          lessonId,
          roundedSeconds
        );

        lastCheckpointTimeRef.current = roundedSeconds;

        if (response.courseProgressPercentage !== undefined) {
          onProgressUpdate?.(response.courseProgressPercentage);
        }

        if (response.isCompleted && !completedRef.current) {
          completedRef.current = true;
          setShowCompletionBanner(true);
          onCompleted?.();
        }
      } catch (err) {
        // Silently tolerate checkpoint failure to not interrupt playback
        console.warn('Progress checkpoint failed:', err);
      } finally {
        isSavingRef.current = false;
      }
    },
    [courseId, lessonId, onCompleted, onProgressUpdate]
  );

  // Throttled timeupdate listener (~15 seconds interval)
  const handleTimeUpdate = () => {
    if (!videoRef.current) return;
    const currentTime = videoRef.current.currentTime;
    const duration = videoRef.current.duration || durationSeconds;

    // Check if 90% threshold reached
    if (duration > 0 && currentTime >= 0.9 * duration && !completedRef.current) {
      sendCheckpoint(currentTime, true);
    } else if (Math.abs(currentTime - lastCheckpointTimeRef.current) >= 15) {
      sendCheckpoint(currentTime);
    }
  };

  // Event handlers for pause, seeked, and ended
  const handlePause = () => {
    if (videoRef.current) {
      sendCheckpoint(videoRef.current.currentTime, true);
    }
  };

  const handleSeeked = () => {
    if (videoRef.current) {
      sendCheckpoint(videoRef.current.currentTime, true);
    }
  };

  const handleEnded = () => {
    if (videoRef.current) {
      sendCheckpoint(videoRef.current.currentTime, true);
      if (!completedRef.current) {
        completedRef.current = true;
        setShowCompletionBanner(true);
        onCompleted?.();
      }
    }
  };

  // Persist on unmount / navigation
  useEffect(() => {
    return () => {
      if (videoRef.current) {
        const time = videoRef.current.currentTime;
        if (Math.abs(time - lastCheckpointTimeRef.current) >= 1) {
          // Best-effort send on unmount
          saveProgressCheckpoint(courseId, lessonId, Math.floor(time)).catch(() => {});
        }
      }
    };
  }, [courseId, lessonId]);

  if (loadError) {
    return (
      <div className='aspect-video w-full rounded-2xl bg-gray-900 flex flex-col items-center justify-center p-6 text-center text-white space-y-3'>
        <AlertCircle className='w-10 h-10 text-red-400' />
        <h4 className='text-sm font-bold'>Video media could not be loaded</h4>
        <p className='text-xs text-gray-400 max-w-sm'>
          The media stream may be temporarily unavailable or in unsupported format.
        </p>
        <button
          onClick={() => {
            setLoadError(false);
            if (videoRef.current) videoRef.current.load();
          }}
          className='text-xs bg-white/10 hover:bg-white/20 px-3 py-1.5 rounded-lg font-semibold transition'
        >
          Retry Playback
        </button>
      </div>
    );
  }

  return (
    <div className='relative w-full rounded-2xl overflow-hidden bg-black shadow-lg'>
      {/* 90% / Completion Feedback Banner */}
      {showCompletionBanner && (
        <div className='absolute top-3 right-3 z-10 bg-emerald-600/90 backdrop-blur-xs text-white px-3 py-1 rounded-full text-xs font-bold flex items-center gap-1.5 shadow-md animate-fade-in'>
          <CheckCircle2 className='w-3.5 h-3.5' />
          <span>Lesson Completed</span>
        </div>
      )}

      <video
        ref={videoRef}
        src={mediaUrl}
        controls
        controlsList='nodownload'
        playsInline
        className='w-full aspect-video object-contain bg-black'
        onLoadedMetadata={handleLoadedMetadata}
        onTimeUpdate={handleTimeUpdate}
        onPause={handlePause}
        onSeeked={handleSeeked}
        onEnded={handleEnded}
        onError={() => setLoadError(true)}
      >
        Your browser does not support HTML5 video playback.
      </video>
    </div>
  );
}
