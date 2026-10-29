import { TutorCitationDto } from '@techsprout/contracts';

export interface TutorChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  citations?: TutorCitationDto[];
  isGrounded?: boolean;
  isStreaming?: boolean;
  error?: string | null;
}

export interface StreamTutorChatParams {
  courseId: string;
  lessonId?: string | null;
  question: string;
  onCitations: (citations: TutorCitationDto[]) => void;
  onToken: (token: string) => void;
  onDone: (meta: { isGrounded: boolean; totalCitations: number }) => void;
  onError: (error: { message: string; code?: string; retryAfter?: number }) => void;
  signal?: AbortSignal;
}

export async function streamTutorChat({
  courseId,
  lessonId,
  question,
  onCitations,
  onToken,
  onDone,
  onError,
  signal,
}: StreamTutorChatParams): Promise<void> {
  try {
    const response = await fetch(`/api/v1/learn/courses/${courseId}/tutor/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        courseId,
        lessonId: lessonId || undefined,
        question,
      }),
      signal,
    });

    if (response.status === 429) {
      const retryAfter = Number(response.headers.get('Retry-After')) || 86400;
      let message =
        'Daily AI tutor query limit reached (20 queries/day). Please try again tomorrow.';
      try {
        const errJson = await response.json();
        if (errJson.message) message = errJson.message;
      } catch {
        // Fallback
      }
      onError({ message, code: 'TUTOR_RATE_LIMIT_EXCEEDED', retryAfter });
      return;
    }

    if (!response.ok) {
      let message = 'Failed to communicate with AI Tutor. Please try again.';
      let code = 'NETWORK_ERROR';
      try {
        const errJson = await response.json();
        if (errJson.message) message = errJson.message;
        if (errJson.errorCode) code = errJson.errorCode;
      } catch {
        // Fallback
      }
      onError({ message, code });
      return;
    }

    if (!response.body) {
      onError({ message: 'No response stream received from AI Tutor.', code: 'EMPTY_STREAM' });
      return;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      if (signal?.aborted) {
        reader.cancel();
        return;
      }

      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      let currentEvent = 'message';
      for (const line of lines) {
        if (line.startsWith('event: ')) {
          currentEvent = line.slice(7).trim();
        } else if (line.startsWith('data: ')) {
          const dataStr = line.slice(6).trim();
          if (!dataStr) continue;

          try {
            const parsed = JSON.parse(dataStr);
            if (currentEvent === 'citations') {
              onCitations(parsed as TutorCitationDto[]);
            } else if (currentEvent === 'token') {
              onToken(parsed.token || '');
            } else if (currentEvent === 'done') {
              onDone(parsed);
            } else if (currentEvent === 'error') {
              onError({ message: parsed.message || 'Stream error', code: parsed.code });
            }
          } catch {
            // Ignore parse errors on raw tokens
          }
        }
      }
    }
  } catch (err) {
    if ((err as Error).name === 'AbortError' || signal?.aborted) {
      return;
    }
    onError({
      message: (err as Error).message || 'Connection error with AI Tutor',
      code: 'CONNECTION_ERROR',
    });
  }
}
