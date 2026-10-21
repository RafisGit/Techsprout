import { Injectable, Logger, HttpStatus } from '@nestjs/common';
import { env } from '../../config/env.config';
import { TutorCitationDto } from '@techsprout/contracts';
import { ApiException } from '../../common/errors/api-error';

export interface LlmStreamChunk {
  token: string;
}

@Injectable()
export class TutorLlmService {
  private readonly logger = new Logger(TutorLlmService.name);

  /**
   * Generates a progressive stream of answer tokens grounded strictly in the provided curriculum citations.
   */
  async *generateAnswerStream(
    question: string,
    citations: TutorCitationDto[],
    abortSignal?: AbortSignal
  ): AsyncGenerator<string, void, unknown> {
    const startTime = Date.now();
    this.logger.log(
      `Initiating AI tutor stream generation with ${citations.length} grounded citations`
    );

    // If no citations provided, fail-safe refusal
    if (!citations || citations.length === 0) {
      yield 'I cannot answer this question because it is not covered in the curriculum of this course.';
      return;
    }

    const provider = env.TUTOR_LLM_PROVIDER || 'mock';

    if (provider === 'gemini' && env.TUTOR_LLM_API_KEY) {
      yield* this.streamGemini(question, citations, abortSignal);
    } else if (provider === 'openai' && env.TUTOR_LLM_API_KEY) {
      yield* this.streamOpenAI(question, citations, abortSignal);
    } else {
      // Default deterministic mock provider for test and local developer environments
      yield* this.streamMock(question, citations, abortSignal);
    }

    const durationMs = Date.now() - startTime;
    this.logger.log(`AI tutor stream completed in ${durationMs}ms`);
  }

  /**
   * Deterministic mock LLM generator:
   * Generates an educational, citation-grounded response progressively streaming tokens.
   */
  private async *streamMock(
    _question: string,
    citations: TutorCitationDto[],
    abortSignal?: AbortSignal
  ): AsyncGenerator<string, void, unknown> {
    const primaryCitation = citations[0];
    const secondaryCitation = citations[1];

    const sentences: string[] = [
      `Based on the course curriculum in **"${primaryCitation.lessonTitle}"**, `,
      `here is what you need to know:\n\n`,
      `${primaryCitation.chunkSnippet}\n\n`,
    ];

    if (secondaryCitation) {
      sentences.push(
        `Additionally, **"${secondaryCitation.lessonTitle}"** covers related concepts: `,
        `${secondaryCitation.chunkSnippet.slice(0, 180)}...\n\n`
      );
    }

    sentences.push(
      `To explore this topic in depth, review the highlighted lesson citations below.`
    );

    for (const sentence of sentences) {
      if (abortSignal?.aborted) {
        this.logger.debug('Client disconnected during mock stream; aborting.');
        return;
      }

      // Break sentence into small token chunks
      const words = sentence.split(' ');
      for (let i = 0; i < words.length; i++) {
        if (abortSignal?.aborted) return;
        const word = words[i] + (i < words.length - 1 ? ' ' : '');
        yield word;
        // Minor yield pause only if not in testing to simulate natural typing
        if (process.env.NODE_ENV !== 'test') {
          await new Promise((resolve) => setTimeout(resolve, 20));
        }
      }
    }
  }

  /**
   * Streaming implementation for Google Gemini Flash API.
   */
  private async *streamGemini(
    question: string,
    citations: TutorCitationDto[],
    abortSignal?: AbortSignal
  ): AsyncGenerator<string, void, unknown> {
    const contextPrompt = citations
      .map(
        (c, idx) =>
          `[Citation ${idx + 1}: Lesson "${c.lessonTitle}"]\n${c.chunkSnippet}`
      )
      .join('\n\n');

    const systemInstruction = `You are TechSprout's AI Tutor. Answer the student's question accurately and concisely, using ONLY the course curriculum context provided below. If the answer is not present in the context, state: "This concept is not covered in this course curriculum." Do not hallucinate or make assumptions outside the provided context.`;

    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:streamGenerateContent?alt=sse&key=${env.TUTOR_LLM_API_KEY}`;

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: abortSignal,
        body: JSON.stringify({
          system_instruction: { parts: [{ text: systemInstruction }] },
          contents: [
            {
              role: 'user',
              parts: [
                {
                  text: `COURSE CURRICULUM CONTEXT:\n${contextPrompt}\n\nSTUDENT QUESTION:\n${question}`,
                },
              ],
            },
          ],
          generationConfig: {
            temperature: 0.2,
            maxOutputTokens: 600,
          },
        }),
      });

      if (!response.ok || !response.body) {
        throw new ApiException(
          'AI Tutor upstream provider temporarily unavailable',
          HttpStatus.BAD_GATEWAY,
          'UPSTREAM_PROVIDER_ERROR'
        );
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        if (abortSignal?.aborted) {
          reader.cancel();
          return;
        }

        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const jsonStr = line.slice(6).trim();
            if (jsonStr) {
              try {
                const parsed = JSON.parse(jsonStr);
                const candidateText =
                  parsed?.candidates?.[0]?.content?.parts?.[0]?.text;
                if (candidateText) {
                  yield candidateText;
                }
              } catch {
                // Ignore parse errors on SSE keepalive pings
              }
            }
          }
        }
      }
    } catch (err) {
      if ((err as Error).name === 'AbortError' || abortSignal?.aborted) {
        return;
      }
      this.logger.error(`Gemini streaming error: ${(err as Error).message}`);
      throw new ApiException(
        'AI Tutor service temporarily unavailable',
        HttpStatus.BAD_GATEWAY,
        'UPSTREAM_PROVIDER_ERROR'
      );
    }
  }

  /**
   * Streaming implementation for OpenAI compatible API.
   */
  private async *streamOpenAI(
    question: string,
    citations: TutorCitationDto[],
    abortSignal?: AbortSignal
  ): AsyncGenerator<string, void, unknown> {
    const contextPrompt = citations
      .map(
        (c, idx) =>
          `[Citation ${idx + 1}: Lesson "${c.lessonTitle}"]\n${c.chunkSnippet}`
      )
      .join('\n\n');

    const systemInstruction = `You are TechSprout's AI Tutor. Answer student questions strictly using the provided course curriculum context.`;

    const endpoint = 'https://api.openai.com/v1/chat/completions';

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${env.TUTOR_LLM_API_KEY}`,
        },
        signal: abortSignal,
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          stream: true,
          temperature: 0.2,
          max_tokens: 600,
          messages: [
            { role: 'system', content: systemInstruction },
            {
              role: 'user',
              content: `COURSE CONTEXT:\n${contextPrompt}\n\nQUESTION:\n${question}`,
            },
          ],
        }),
      });

      if (!response.ok || !response.body) {
        throw new ApiException(
          'AI Tutor upstream provider temporarily unavailable',
          HttpStatus.BAD_GATEWAY,
          'UPSTREAM_PROVIDER_ERROR'
        );
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        if (abortSignal?.aborted) {
          reader.cancel();
          return;
        }

        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const jsonStr = line.slice(6).trim();
            if (jsonStr === '[DONE]') return;
            if (jsonStr) {
              try {
                const parsed = JSON.parse(jsonStr);
                const delta = parsed?.choices?.[0]?.delta?.content;
                if (delta) {
                  yield delta;
                }
              } catch {
                // Ignore SSE framing artifacts
              }
            }
          }
        }
      }
    } catch (err) {
      if ((err as Error).name === 'AbortError' || abortSignal?.aborted) {
        return;
      }
      this.logger.error(`OpenAI streaming error: ${(err as Error).message}`);
      throw new ApiException(
        'AI Tutor service temporarily unavailable',
        HttpStatus.BAD_GATEWAY,
        'UPSTREAM_PROVIDER_ERROR'
      );
    }
  }
}
