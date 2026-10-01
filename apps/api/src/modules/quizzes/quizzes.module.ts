import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { CoursesModule } from '../courses/courses.module';
import { ModulesModule } from '../modules/modules.module';
import { QuizzesController } from './quizzes.controller';
import { QuestionsController } from './questions.controller';
import { OptionsController } from './options.controller';
import { QuizzesService } from './quizzes.service';
import { QuestionsService } from './questions.service';
import { OptionsService } from './options.service';

@Module({
  imports: [AuditModule, CoursesModule, ModulesModule],
  controllers: [QuizzesController, QuestionsController, OptionsController],
  providers: [QuizzesService, QuestionsService, OptionsService],
  exports: [QuizzesService, QuestionsService, OptionsService],
})
export class QuizzesModule {}
