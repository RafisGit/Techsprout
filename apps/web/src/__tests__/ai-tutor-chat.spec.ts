import { describe, it, expect, vi, beforeEach } from 'vitest';
import { streamTutorChat } from '@/lib/api/tutor';
import type { TutorCitationDto } from '@techsprout/contracts';

describe('Phase 7.2 — AI Tutor Streaming Chat Client Test Suite', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('1. streamTutorChat streams citations, tokens, and done event properly', async () => {
    const mockCitations: TutorCitationDto[] = [
      {
        lessonId: 'lesson-1',
        lessonTitle: 'Introduction to React Hooks',
        moduleId: 'mod-1',
        chunkText: 'useState allows functional components to manage local state.',
        similarityScore: 0.92,
      },
    ];

    const ssePayload = [
      'event: citations\n',
      `data: ${JSON.stringify(mockCitations)}\n\n`,
      'event: token\n',
      'data: {"token":"Hooks "}\n\n',
      'event: token\n',
      'data: {"token":"allow state."}\n\n',
      'event: done\n',
      'data: {"isGrounded":true,"totalCitations":1}\n\n',
    ].join('');

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(ssePayload));
        controller.close();
      },
    });

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      body: stream,
    });

    const receivedCitations: TutorCitationDto[][] = [];
    const receivedTokens: string[] = [];
    let doneMeta: { isGrounded: boolean; totalCitations: number } | null = null;
    let errorReceived = false;

    await streamTutorChat({
      courseId: 'course-123',
      lessonId: 'lesson-1',
      question: 'What are hooks?',
      onCitations: (citations) => receivedCitations.push(citations),
      onToken: (token) => receivedTokens.push(token),
      onDone: (meta) => {
        doneMeta = meta;
      },
      onError: () => {
        errorReceived = true;
      },
    });

    expect(global.fetch).toHaveBeenCalledWith(
      '/api/v1/learn/courses/course-123/tutor/chat',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          courseId: 'course-123',
          lessonId: 'lesson-1',
          question: 'What are hooks?',
        }),
      })
    );

    expect(receivedCitations).toHaveLength(1);
    expect(receivedCitations[0][0].lessonTitle).toBe('Introduction to React Hooks');
    expect(receivedTokens).toEqual(['Hooks ', 'allow state.']);
    expect(doneMeta).toEqual({ isGrounded: true, totalCitations: 1 });
    expect(errorReceived).toBe(false);
  });

  it('2. streamTutorChat handles 429 Daily Rate Limit correctly', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      headers: new Headers({ 'Retry-After': '3600' }),
      json: vi.fn().mockResolvedValue({
        message: 'Daily AI tutor query limit reached (20 queries/day).',
      }),
    });

    let errorObj: { message: string; code?: string; retryAfter?: number } | null = null;

    await streamTutorChat({
      courseId: 'course-123',
      question: 'Will this fail?',
      onCitations: vi.fn(),
      onToken: vi.fn(),
      onDone: vi.fn(),
      onError: (err) => {
        errorObj = err;
      },
    });

    expect(errorObj).not.toBeNull();
    expect(errorObj?.code).toBe('TUTOR_RATE_LIMIT_EXCEEDED');
    expect(errorObj?.message).toContain('limit reached');
    expect(errorObj?.retryAfter).toBe(3600);
  });

  it('3. streamTutorChat handles stream cancellation via AbortSignal', async () => {
    const controller = new AbortController();
    const encoder = new TextEncoder();

    const stream = new ReadableStream({
      start(streamCtrl) {
        streamCtrl.enqueue(encoder.encode('event: token\ndata: {"token":"Hello"}\n\n'));
      },
    });

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      body: stream,
    });

    const receivedTokens: string[] = [];
    let onErrorCalled = false;

    const chatPromise = streamTutorChat({
      courseId: 'course-123',
      question: 'Cancel me',
      signal: controller.signal,
      onCitations: vi.fn(),
      onToken: (t) => {
        receivedTokens.push(t);
        controller.abort();
      },
      onDone: vi.fn(),
      onError: () => {
        onErrorCalled = true;
      },
    });

    await chatPromise;

    expect(receivedTokens).toEqual(['Hello']);
    // Abort should not trigger user error callback
    expect(onErrorCalled).toBe(false);
  });

  it('4. streamTutorChat handles non-200 server error gracefully', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
      json: vi.fn().mockResolvedValue({
        message: 'Active enrollment required to access tutor.',
        errorCode: 'FORBIDDEN',
      }),
    });

    let errorObj: { message: string; code?: string } | null = null;

    await streamTutorChat({
      courseId: 'course-not-enrolled',
      question: 'Can I chat?',
      onCitations: vi.fn(),
      onToken: vi.fn(),
      onDone: vi.fn(),
      onError: (err) => {
        errorObj = err;
      },
    });

    expect(errorObj).toEqual({
      message: 'Active enrollment required to access tutor.',
      code: 'FORBIDDEN',
    });
  });

  it('5. streamTutorChat handles server-sent error event', async () => {
    const ssePayload = [
      'event: error\n',
      'data: {"message":"Course tutor retrieval failed","code":"RETRIEVAL_ERROR"}\n\n',
    ].join('');

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(ssePayload));
        controller.close();
      },
    });

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      body: stream,
    });

    let errorObj: { message: string; code?: string } | null = null;

    await streamTutorChat({
      courseId: 'course-123',
      question: 'Retrieve something',
      onCitations: vi.fn(),
      onToken: vi.fn(),
      onDone: vi.fn(),
      onError: (err) => {
        errorObj = err;
      },
    });

    expect(errorObj).toEqual({
      message: 'Course tutor retrieval failed',
      code: 'RETRIEVAL_ERROR',
    });
  });
});
