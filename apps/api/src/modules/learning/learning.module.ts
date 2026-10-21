import { Module } from '@nestjs/common';
import { LearningService } from './learning.service';
import { TutorRetrievalService } from './tutor-retrieval.service';
import { TutorRateLimiterService } from './tutor-rate-limiter.service';
import { TutorLlmService } from './tutor-llm.service';
import { TutorEmbeddingService } from './tutor-embedding.service';
import { TutorIndexingService } from './tutor-indexing.service';
import { TutorIndexingQueueService } from './tutor-indexing-queue.service';
import { LearningController } from './learning.controller';
import { AuditModule } from '../audit/audit.module';
import { CertificatesModule } from '../certificates/certificates.module';

@Module({
  imports: [AuditModule, CertificatesModule],
  controllers: [LearningController],
  providers: [
    LearningService,
    TutorRetrievalService,
    TutorRateLimiterService,
    TutorLlmService,
    TutorEmbeddingService,
    TutorIndexingService,
    TutorIndexingQueueService,
  ],
  exports: [
    LearningService,
    TutorRetrievalService,
    TutorRateLimiterService,
    TutorLlmService,
    TutorEmbeddingService,
    TutorIndexingService,
    TutorIndexingQueueService,
  ],
})
export class LearningModule {}
