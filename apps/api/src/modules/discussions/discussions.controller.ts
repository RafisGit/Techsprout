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
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { DiscussionsService } from './discussions.service';
import { AuthenticatedRequest } from '../../common/http/correlation-id.middleware';
import { ApiException } from '../../common/errors/api-error';
import { z } from 'zod';
import {
  createDiscussionSchema,
  updateDiscussionSchema,
  createDiscussionReplySchema,
  updateDiscussionReplySchema,
  discussionListQuerySchema,
} from '@techsprout/contracts';

const uuidSchema = z.string().uuid();

@ApiTags('Discussions')
@ApiBearerAuth()
@Controller('courses/:courseId/lessons/:lessonId/discussions')
export class DiscussionsController {
  constructor(
    @Inject(DiscussionsService) private readonly discussionsService: DiscussionsService
  ) {}

  private validateUuid(val: string, name: string): string {
    const res = uuidSchema.safeParse(val);
    if (!res.success) {
      throw new ApiException(`Invalid ${name} format`, HttpStatus.BAD_REQUEST, 'VALIDATION_ERROR');
    }
    return res.data;
  }

  @Post()
  @ApiOperation({ summary: 'Create a new discussion thread on a lesson' })
  @ApiResponse({ status: 201, description: 'Discussion created successfully' })
  async createDiscussion(
    @Param('courseId') courseIdParam: string,
    @Param('lessonId') lessonIdParam: string,
    @Body() body: unknown,
    @Req() req: AuthenticatedRequest
  ) {
    const courseId = this.validateUuid(courseIdParam, 'courseId');
    const lessonId = this.validateUuid(lessonIdParam, 'lessonId');

    const parseResult = createDiscussionSchema.safeParse(body);
    if (!parseResult.success) {
      throw new ApiException(
        'Validation failed',
        HttpStatus.BAD_REQUEST,
        'VALIDATION_ERROR',
        parseResult.error.flatten().fieldErrors
      );
    }

    const data = await this.discussionsService.createDiscussion(
      courseId,
      lessonId,
      req.user!.id,
      parseResult.data
    );

    return {
      success: true,
      message: 'Discussion thread created successfully',
      data,
    };
  }

  @Get()
  @ApiOperation({ summary: 'List discussion threads on a lesson' })
  @ApiResponse({ status: 200, description: 'Discussions retrieved successfully' })
  async listDiscussions(
    @Param('courseId') courseIdParam: string,
    @Param('lessonId') lessonIdParam: string,
    @Query() query: unknown,
    @Req() req: AuthenticatedRequest
  ) {
    const courseId = this.validateUuid(courseIdParam, 'courseId');
    const lessonId = this.validateUuid(lessonIdParam, 'lessonId');

    const parseQuery = discussionListQuerySchema.safeParse(query);
    if (!parseQuery.success) {
      throw new ApiException(
        'Invalid query parameters',
        HttpStatus.BAD_REQUEST,
        'VALIDATION_ERROR',
        parseQuery.error.flatten().fieldErrors
      );
    }

    const data = await this.discussionsService.listDiscussions(
      courseId,
      lessonId,
      req.user!.id,
      parseQuery.data
    );

    return {
      success: true,
      message: 'Discussions retrieved successfully',
      data,
    };
  }

  @Get(':discussionId')
  @ApiOperation({ summary: 'Get a single discussion thread with replies' })
  @ApiResponse({ status: 200, description: 'Discussion retrieved successfully' })
  async getDiscussion(
    @Param('courseId') courseIdParam: string,
    @Param('lessonId') lessonIdParam: string,
    @Param('discussionId') discussionIdParam: string,
    @Req() req: AuthenticatedRequest
  ) {
    const courseId = this.validateUuid(courseIdParam, 'courseId');
    const lessonId = this.validateUuid(lessonIdParam, 'lessonId');
    const discussionId = this.validateUuid(discussionIdParam, 'discussionId');

    const data = await this.discussionsService.getDiscussion(
      courseId,
      lessonId,
      discussionId,
      req.user!.id
    );

    return {
      success: true,
      message: 'Discussion retrieved successfully',
      data,
    };
  }

  @Patch(':discussionId')
  @ApiOperation({ summary: 'Update or moderate a discussion thread' })
  @ApiResponse({ status: 200, description: 'Discussion updated successfully' })
  async updateDiscussion(
    @Param('courseId') courseIdParam: string,
    @Param('lessonId') lessonIdParam: string,
    @Param('discussionId') discussionIdParam: string,
    @Body() body: unknown,
    @Req() req: AuthenticatedRequest
  ) {
    const courseId = this.validateUuid(courseIdParam, 'courseId');
    const lessonId = this.validateUuid(lessonIdParam, 'lessonId');
    const discussionId = this.validateUuid(discussionIdParam, 'discussionId');

    const parseBody = updateDiscussionSchema.safeParse(body);
    if (!parseBody.success) {
      throw new ApiException(
        'Validation failed',
        HttpStatus.BAD_REQUEST,
        'VALIDATION_ERROR',
        parseBody.error.flatten().fieldErrors
      );
    }

    const data = await this.discussionsService.updateDiscussion(
      courseId,
      lessonId,
      discussionId,
      req.user!.id,
      parseBody.data
    );

    return {
      success: true,
      message: 'Discussion updated successfully',
      data,
    };
  }

  @Delete(':discussionId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete a discussion thread' })
  @ApiResponse({ status: 200, description: 'Discussion deleted successfully' })
  async deleteDiscussion(
    @Param('courseId') courseIdParam: string,
    @Param('lessonId') lessonIdParam: string,
    @Param('discussionId') discussionIdParam: string,
    @Req() req: AuthenticatedRequest
  ) {
    const courseId = this.validateUuid(courseIdParam, 'courseId');
    const lessonId = this.validateUuid(lessonIdParam, 'lessonId');
    const discussionId = this.validateUuid(discussionIdParam, 'discussionId');

    const data = await this.discussionsService.deleteDiscussion(
      courseId,
      lessonId,
      discussionId,
      req.user!.id
    );

    return data;
  }

  @Post(':discussionId/vote')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Toggle upvote on a discussion thread' })
  @ApiResponse({ status: 200, description: 'Vote toggled successfully' })
  async toggleDiscussionVote(
    @Param('courseId') courseIdParam: string,
    @Param('lessonId') lessonIdParam: string,
    @Param('discussionId') discussionIdParam: string,
    @Req() req: AuthenticatedRequest
  ) {
    const courseId = this.validateUuid(courseIdParam, 'courseId');
    const lessonId = this.validateUuid(lessonIdParam, 'lessonId');
    const discussionId = this.validateUuid(discussionIdParam, 'discussionId');

    const data = await this.discussionsService.toggleDiscussionVote(
      courseId,
      lessonId,
      discussionId,
      req.user!.id
    );

    return {
      success: true,
      message: data.upvoted ? 'Upvoted discussion' : 'Removed upvote',
      data,
    };
  }

  @Post(':discussionId/replies')
  @ApiOperation({ summary: 'Create a reply to a discussion thread' })
  @ApiResponse({ status: 201, description: 'Reply created successfully' })
  async createReply(
    @Param('courseId') courseIdParam: string,
    @Param('lessonId') lessonIdParam: string,
    @Param('discussionId') discussionIdParam: string,
    @Body() body: unknown,
    @Req() req: AuthenticatedRequest
  ) {
    const courseId = this.validateUuid(courseIdParam, 'courseId');
    const lessonId = this.validateUuid(lessonIdParam, 'lessonId');
    const discussionId = this.validateUuid(discussionIdParam, 'discussionId');

    const parseResult = createDiscussionReplySchema.safeParse(body);
    if (!parseResult.success) {
      throw new ApiException(
        'Validation failed',
        HttpStatus.BAD_REQUEST,
        'VALIDATION_ERROR',
        parseResult.error.flatten().fieldErrors
      );
    }

    const data = await this.discussionsService.createReply(
      courseId,
      lessonId,
      discussionId,
      req.user!.id,
      parseResult.data
    );

    return {
      success: true,
      message: 'Reply posted successfully',
      data,
    };
  }

  @Patch(':discussionId/replies/:replyId')
  @ApiOperation({ summary: 'Update or moderate a reply' })
  @ApiResponse({ status: 200, description: 'Reply updated successfully' })
  async updateReply(
    @Param('courseId') courseIdParam: string,
    @Param('lessonId') lessonIdParam: string,
    @Param('discussionId') discussionIdParam: string,
    @Param('replyId') replyIdParam: string,
    @Body() body: unknown,
    @Req() req: AuthenticatedRequest
  ) {
    const courseId = this.validateUuid(courseIdParam, 'courseId');
    const lessonId = this.validateUuid(lessonIdParam, 'lessonId');
    const discussionId = this.validateUuid(discussionIdParam, 'discussionId');
    const replyId = this.validateUuid(replyIdParam, 'replyId');

    const parseBody = updateDiscussionReplySchema.safeParse(body);
    if (!parseBody.success) {
      throw new ApiException(
        'Validation failed',
        HttpStatus.BAD_REQUEST,
        'VALIDATION_ERROR',
        parseBody.error.flatten().fieldErrors
      );
    }

    const data = await this.discussionsService.updateReply(
      courseId,
      lessonId,
      discussionId,
      replyId,
      req.user!.id,
      parseBody.data
    );

    return {
      success: true,
      message: 'Reply updated successfully',
      data,
    };
  }

  @Delete(':discussionId/replies/:replyId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete a reply' })
  @ApiResponse({ status: 200, description: 'Reply deleted successfully' })
  async deleteReply(
    @Param('courseId') courseIdParam: string,
    @Param('lessonId') lessonIdParam: string,
    @Param('discussionId') discussionIdParam: string,
    @Param('replyId') replyIdParam: string,
    @Req() req: AuthenticatedRequest
  ) {
    const courseId = this.validateUuid(courseIdParam, 'courseId');
    const lessonId = this.validateUuid(lessonIdParam, 'lessonId');
    const discussionId = this.validateUuid(discussionIdParam, 'discussionId');
    const replyId = this.validateUuid(replyIdParam, 'replyId');

    const data = await this.discussionsService.deleteReply(
      courseId,
      lessonId,
      discussionId,
      replyId,
      req.user!.id
    );

    return data;
  }

  @Post(':discussionId/replies/:replyId/vote')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Toggle upvote on a reply' })
  @ApiResponse({ status: 200, description: 'Reply vote toggled successfully' })
  async toggleReplyVote(
    @Param('courseId') courseIdParam: string,
    @Param('lessonId') lessonIdParam: string,
    @Param('discussionId') discussionIdParam: string,
    @Param('replyId') replyIdParam: string,
    @Req() req: AuthenticatedRequest
  ) {
    const courseId = this.validateUuid(courseIdParam, 'courseId');
    const lessonId = this.validateUuid(lessonIdParam, 'lessonId');
    const discussionId = this.validateUuid(discussionIdParam, 'discussionId');
    const replyId = this.validateUuid(replyIdParam, 'replyId');

    const data = await this.discussionsService.toggleReplyVote(
      courseId,
      lessonId,
      discussionId,
      replyId,
      req.user!.id
    );

    return {
      success: true,
      message: data.upvoted ? 'Upvoted reply' : 'Removed upvote from reply',
      data,
    };
  }
}
