import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { CoursesModule } from '../courses/courses.module';
import { ModulesModule } from '../modules/modules.module';
import { CertificatesModule } from '../certificates/certificates.module';
import { QuizzesController } from './quizzes.controller';
import { QuestionsController } from './questions.controller';
import { OptionsController } from './options.controller';
import { QuizzesService } from './quizzes.service';
import { QuestionsService } from './questions.service';
import { OptionsService } from './options.service';

import { StudentQuizzesController } from './student-quizzes.controller';
import { StudentQuizzesService } from './student-quizzes.service';

@Module({
  imports: [AuditModule, CoursesModule, ModulesModule, CertificatesModule],
  controllers: [
    QuizzesController,
    QuestionsController,
    OptionsController,
    StudentQuizzesController,
  ],
  providers: [QuizzesService, QuestionsService, OptionsService, StudentQuizzesService],
  exports: [QuizzesService, QuestionsService, OptionsService, StudentQuizzesService],
})
export class QuizzesModule {}
