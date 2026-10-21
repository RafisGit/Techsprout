import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  Req,
  HttpStatus,
  HttpCode,
  Inject,
  UseInterceptors,
  UploadedFile,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiConsumes,
  ApiBody,
} from '@nestjs/swagger';
import { AssignmentsService } from './assignments.service';
import { AuthenticatedRequest } from '../../common/http/correlation-id.middleware';
import { ApiException } from '../../common/errors/api-error';
import { z } from 'zod';
import {
  createAssignmentSchema,
  updateAssignmentSchema,
  submitAssignmentSchema,
  gradeSubmissionSchema,
  assignmentListQuerySchema,
  submissionListQuerySchema,
} from '@techsprout/contracts';

const uuidSchema = z.string().uuid();

@ApiTags('Assignments')
@ApiBearerAuth()
@Controller('courses/:courseId/assignments')
export class AssignmentsController {
  constructor(
    @Inject(AssignmentsService) private readonly assignmentsService: AssignmentsService
  ) {}

  private validateUuid(val: string, name: string): string {
    const res = uuidSchema.safeParse(val);
    if (!res.success) {
      throw new ApiException(`Invalid ${name} format`, HttpStatus.BAD_REQUEST, 'VALIDATION_ERROR');
    }
    return res.data;
  }

  @Post()
  @ApiOperation({ summary: 'Create a project assignment (Instructor/Admin)' })
  @ApiResponse({ status: 201, description: 'Assignment created successfully' })
  async createAssignment(
    @Param('courseId') courseIdParam: string,
    @Body() body: unknown,
    @Req() req: AuthenticatedRequest
  ) {
    const courseId = this.validateUuid(courseIdParam, 'courseId');

    const parseResult = createAssignmentSchema.safeParse(body);
    if (!parseResult.success) {
      throw new ApiException(
        'Validation failed',
        HttpStatus.BAD_REQUEST,
        'VALIDATION_ERROR',
        parseResult.error.flatten().fieldErrors
      );
    }

    const data = await this.assignmentsService.createAssignment(
      courseId,
      req.user!.id,
      parseResult.data
    );

    return {
      success: true,
      message: 'Assignment created successfully',
      data,
    };
  }

  @Get()
  @ApiOperation({ summary: 'List assignments for a course' })
  @ApiResponse({ status: 200, description: 'Assignments retrieved successfully' })
  async listAssignments(
    @Param('courseId') courseIdParam: string,
    @Query() query: unknown,
    @Req() req: AuthenticatedRequest
  ) {
    const courseId = this.validateUuid(courseIdParam, 'courseId');

    const parseQuery = assignmentListQuerySchema.safeParse(query);
    if (!parseQuery.success) {
      throw new ApiException(
        'Invalid query parameters',
        HttpStatus.BAD_REQUEST,
        'VALIDATION_ERROR',
        parseQuery.error.flatten().fieldErrors
      );
    }

    const data = await this.assignmentsService.listAssignments(
      courseId,
      req.user!.id,
      parseQuery.data
    );

    return {
      success: true,
      message: 'Assignments retrieved successfully',
      data,
    };
  }

  @Get(':assignmentId')
  @ApiOperation({ summary: 'Get single assignment details' })
  @ApiResponse({ status: 200, description: 'Assignment retrieved successfully' })
  async getAssignment(
    @Param('courseId') courseIdParam: string,
    @Param('assignmentId') assignmentIdParam: string,
    @Req() req: AuthenticatedRequest
  ) {
    const courseId = this.validateUuid(courseIdParam, 'courseId');
    const assignmentId = this.validateUuid(assignmentIdParam, 'assignmentId');

    const data = await this.assignmentsService.getAssignment(
      courseId,
      assignmentId,
      req.user!.id
    );

    return {
      success: true,
      message: 'Assignment retrieved successfully',
      data,
    };
  }

  @Patch(':assignmentId')
  @ApiOperation({ summary: 'Update an assignment (Instructor/Admin)' })
  @ApiResponse({ status: 200, description: 'Assignment updated successfully' })
  async updateAssignment(
    @Param('courseId') courseIdParam: string,
    @Param('assignmentId') assignmentIdParam: string,
    @Body() body: unknown,
    @Req() req: AuthenticatedRequest
  ) {
    const courseId = this.validateUuid(courseIdParam, 'courseId');
    const assignmentId = this.validateUuid(assignmentIdParam, 'assignmentId');

    const parseBody = updateAssignmentSchema.safeParse(body);
    if (!parseBody.success) {
      throw new ApiException(
        'Validation failed',
        HttpStatus.BAD_REQUEST,
        'VALIDATION_ERROR',
        parseBody.error.flatten().fieldErrors
      );
    }

    const data = await this.assignmentsService.updateAssignment(
      courseId,
      assignmentId,
      req.user!.id,
      parseBody.data
    );

    return {
      success: true,
      message: 'Assignment updated successfully',
      data,
    };
  }

  @Delete(':assignmentId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete an assignment (Instructor/Admin)' })
  @ApiResponse({ status: 200, description: 'Assignment deleted successfully' })
  async deleteAssignment(
    @Param('courseId') courseIdParam: string,
    @Param('assignmentId') assignmentIdParam: string,
    @Req() req: AuthenticatedRequest
  ) {
    const courseId = this.validateUuid(courseIdParam, 'courseId');
    const assignmentId = this.validateUuid(assignmentIdParam, 'assignmentId');

    return await this.assignmentsService.deleteAssignment(
      courseId,
      assignmentId,
      req.user!.id
    );
  }

  @Post(':assignmentId/submissions')
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Submit an assignment solution (Student)' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
        studentNotes: { type: 'string' },
      },
    },
  })
  @ApiResponse({ status: 201, description: 'Assignment submitted successfully' })
  async submitAssignment(
    @Param('courseId') courseIdParam: string,
    @Param('assignmentId') assignmentIdParam: string,
    @UploadedFile() file: Express.Multer.File,
    @Body('studentNotes') studentNotes: string | undefined,
    @Req() req: AuthenticatedRequest
  ) {
    const courseId = this.validateUuid(courseIdParam, 'courseId');
    const assignmentId = this.validateUuid(assignmentIdParam, 'assignmentId');

    if (studentNotes) {
      const parseNotes = submitAssignmentSchema.safeParse({ studentNotes });
      if (!parseNotes.success) {
        throw new ApiException(
          'Validation failed',
          HttpStatus.BAD_REQUEST,
          'VALIDATION_ERROR',
          parseNotes.error.flatten().fieldErrors
        );
      }
    }

    const data = await this.assignmentsService.submitAssignment(
      courseId,
      assignmentId,
      req.user!.id,
      file,
      studentNotes
    );

    return {
      success: true,
      message: 'Assignment submitted successfully',
      data,
    };
  }

  @Get(':assignmentId/submissions/my')
  @ApiOperation({ summary: 'Get current student submissions for an assignment' })
  @ApiResponse({ status: 200, description: 'Submissions retrieved successfully' })
  async getMySubmissions(
    @Param('courseId') courseIdParam: string,
    @Param('assignmentId') assignmentIdParam: string,
    @Req() req: AuthenticatedRequest
  ) {
    const courseId = this.validateUuid(courseIdParam, 'courseId');
    const assignmentId = this.validateUuid(assignmentIdParam, 'assignmentId');

    const data = await this.assignmentsService.getMySubmissions(
      courseId,
      assignmentId,
      req.user!.id
    );

    return {
      success: true,
      message: 'My submissions retrieved successfully',
      data,
    };
  }

  @Get(':assignmentId/submissions')
  @ApiOperation({ summary: 'List all student submissions (Instructor/Admin)' })
  @ApiResponse({ status: 200, description: 'Submissions retrieved successfully' })
  async listSubmissions(
    @Param('courseId') courseIdParam: string,
    @Param('assignmentId') assignmentIdParam: string,
    @Query() query: unknown,
    @Req() req: AuthenticatedRequest
  ) {
    const courseId = this.validateUuid(courseIdParam, 'courseId');
    const assignmentId = this.validateUuid(assignmentIdParam, 'assignmentId');

    const parseQuery = submissionListQuerySchema.safeParse(query);
    if (!parseQuery.success) {
      throw new ApiException(
        'Invalid query parameters',
        HttpStatus.BAD_REQUEST,
        'VALIDATION_ERROR',
        parseQuery.error.flatten().fieldErrors
      );
    }

    const data = await this.assignmentsService.listSubmissions(
      courseId,
      assignmentId,
      req.user!.id,
      parseQuery.data
    );

    return {
      success: true,
      message: 'Submissions retrieved successfully',
      data,
    };
  }

  @Get(':assignmentId/submissions/:submissionId')
  @ApiOperation({ summary: 'Get a specific submission details' })
  @ApiResponse({ status: 200, description: 'Submission retrieved successfully' })
  async getSubmission(
    @Param('courseId') courseIdParam: string,
    @Param('assignmentId') assignmentIdParam: string,
    @Param('submissionId') submissionIdParam: string,
    @Req() req: AuthenticatedRequest
  ) {
    const courseId = this.validateUuid(courseIdParam, 'courseId');
    const assignmentId = this.validateUuid(assignmentIdParam, 'assignmentId');
    const submissionId = this.validateUuid(submissionIdParam, 'submissionId');

    const data = await this.assignmentsService.getSubmission(
      courseId,
      assignmentId,
      submissionId,
      req.user!.id
    );

    return {
      success: true,
      message: 'Submission retrieved successfully',
      data,
    };
  }

  @Post(':assignmentId/submissions/:submissionId/grade')
  @ApiOperation({ summary: 'Grade a student submission (Instructor/Admin)' })
  @ApiResponse({ status: 200, description: 'Submission graded successfully' })
  async gradeSubmission(
    @Param('courseId') courseIdParam: string,
    @Param('assignmentId') assignmentIdParam: string,
    @Param('submissionId') submissionIdParam: string,
    @Body() body: unknown,
    @Req() req: AuthenticatedRequest
  ) {
    const courseId = this.validateUuid(courseIdParam, 'courseId');
    const assignmentId = this.validateUuid(assignmentIdParam, 'assignmentId');
    const submissionId = this.validateUuid(submissionIdParam, 'submissionId');

    const parseBody = gradeSubmissionSchema.safeParse(body);
    if (!parseBody.success) {
      throw new ApiException(
        'Validation failed',
        HttpStatus.BAD_REQUEST,
        'VALIDATION_ERROR',
        parseBody.error.flatten().fieldErrors
      );
    }

    const data = await this.assignmentsService.gradeSubmission(
      courseId,
      assignmentId,
      submissionId,
      req.user!.id,
      parseBody.data
    );

    return {
      success: true,
      message: 'Submission graded successfully',
      data,
    };
  }
}
