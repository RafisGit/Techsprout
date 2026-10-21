import { Injectable, Logger } from '@nestjs/common';
import * as crypto from 'crypto';
import { env } from '../../config/env.config';

export const EMBEDDING_DIMENSION = 768;

@Injectable()
export class TutorEmbeddingService {
  private readonly logger = new Logger(TutorEmbeddingService.name);
  private readonly provider = env.TUTOR_EMBEDDING_PROVIDER || 'mock';
  private readonly apiKey = env.TUTOR_LLM_API_KEY;

  /**
   * Generates a 768-dimensional normalized embedding vector.
   * Uses deterministic projection in 'mock' mode for reproducible CI and offline testing.
   */
  public async generateEmbedding(text: string): Promise<number[]> {
    if (!text || text.trim().length === 0) {
      return new Array(EMBEDDING_DIMENSION).fill(0);
    }

    if (this.provider === 'mock' || !this.apiKey) {
      return this.generateMockEmbedding(text);
    }

    try {
      if (this.provider === 'gemini') {
        return await this.generateGeminiEmbedding(text);
      } else if (this.provider === 'openai') {
        return await this.generateOpenAiEmbedding(text);
      }
    } catch (err: any) {
      this.logger.warn(`External embedding provider error (${err.message}); falling back to deterministic mock.`);
    }

    return this.generateMockEmbedding(text);
  }

  /**
   * Generates multiple embeddings in batch.
   */
  public async generateBatchEmbeddings(texts: string[]): Promise<number[][]> {
    return Promise.all(texts.map((text) => this.generateEmbedding(text)));
  }

  /**
   * Calculates cosine similarity between two unit-normalized vectors:
   * Returns a score between 0.0 and 1.0 (clamped).
   */
  public cosineSimilarity(vecA: number[], vecB: number[]): number {
    if (!vecA || !vecB || vecA.length !== vecB.length || vecA.length === 0) {
      return 0;
    }

    let dot = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < vecA.length; i++) {
      dot += vecA[i] * vecB[i];
      normA += vecA[i] * vecA[i];
      normB += vecB[i] * vecB[i];
    }

    const denominator = Math.sqrt(normA) * Math.sqrt(normB);
    if (denominator === 0) return 0;

    const rawCosine = dot / denominator;
    // Map from [-1, 1] to [0, 1]
    return Math.max(0, Math.min(1, (rawCosine + 1) / 2));
  }

  /**
   * Deterministic mock embedding generator:
   * Hashes text tokens into semantic frequency bins across 768 dimensions and L2-normalizes.
   */
  public generateMockEmbedding(text: string): number[] {
    const vector = new Array(EMBEDDING_DIMENSION).fill(0);
    const tokens = text
      .toLowerCase()
      .replace(/[^a-z0-9\s/._-]/g, ' ')
      .split(/\s+/)
      .filter((t) => t.length > 0);

    if (tokens.length === 0) {
      return vector;
    }

    for (let tIdx = 0; tIdx < tokens.length; tIdx++) {
      const token = tokens[tIdx];
      // Generate multiple deterministic hash projections per token
      const hash = crypto.createHash('sha256').update(token).digest();
      for (let i = 0; i < 8; i++) {
        const bin = hash.readUInt16BE(i * 2) % EMBEDDING_DIMENSION;
        const sign = (hash.readUInt8(16 + i) % 2 === 0 ? 1 : -1);
        const weight = 1.0 / Math.sqrt(tIdx + 1);
        vector[bin] += sign * weight;
      }
    }

    // L2 Normalize
    let sumSq = 0;
    for (let i = 0; i < EMBEDDING_DIMENSION; i++) {
      sumSq += vector[i] * vector[i];
    }

    const norm = Math.sqrt(sumSq);
    if (norm > 0) {
      for (let i = 0; i < EMBEDDING_DIMENSION; i++) {
        vector[i] = vector[i] / norm;
      }
    }

    return vector;
  }

  private async generateGeminiEmbedding(text: string): Promise<number[]> {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedContent?key=${this.apiKey}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'models/text-embedding-004',
        content: { parts: [{ text: text.slice(0, 2048) }] },
      }),
    });

    if (!response.ok) {
      throw new Error(`Gemini embedding API error: ${response.status}`);
    }

    const data = await response.json();
    return data.embedding?.values || this.generateMockEmbedding(text);
  }

  private async generateOpenAiEmbedding(text: string): Promise<number[]> {
    const response = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: 'text-embedding-3-small',
        input: text.slice(0, 2048),
        dimensions: EMBEDDING_DIMENSION,
      }),
    });

    if (!response.ok) {
      throw new Error(`OpenAI embedding API error: ${response.status}`);
    }

    const data = await response.json();
    return data.data?.[0]?.embedding || this.generateMockEmbedding(text);
  }

  /**
   * Safety verification: indicates whether external vector search is currently gated.
   */
  public isVectorSearchGated(): boolean {
    return this.provider === 'mock';
  }
}
