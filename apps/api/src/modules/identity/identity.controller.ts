import {
  Controller,
  Post,
  Get,
  Body,
  Query,
  Req,
  Res,
  HttpStatus,
  HttpCode,
  Inject,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiCookieAuth,
} from '@nestjs/swagger';
import { Response } from 'express';
import { AuthenticatedRequest } from '../../common/http/correlation-id.middleware';
import { IdentityService } from './identity.service';
import { registerSchema } from './dto/register.dto';
import { loginSchema } from './dto/login.dto';
import { Public } from '../../common/auth/decorators/public.decorator';
import { CurrentUser } from '../../common/auth/decorators/current-user.decorator';
import { ApiException } from '../../common/errors/api-error';
import { env } from '../../config/env.config';

@ApiTags('Identity & Authentication')
@Controller('auth')
export class IdentityController {
  constructor(@Inject(IdentityService) private readonly identityService: IdentityService) {}

  @Public()
  @Post('register')
  @ApiOperation({ summary: 'Register a new user account' })
  @ApiResponse({ status: 201, description: 'User registered' })
  async register(
    @Body() body: unknown,
    @Req() req: AuthenticatedRequest,
    @Res({ passthrough: true }) res: Response
  ) {
    const parseResult = registerSchema.safeParse(body);
    if (!parseResult.success) {
      throw new ApiException(
        'Validation failed',
        HttpStatus.BAD_REQUEST,
        'VALIDATION_ERROR',
        parseResult.error.flatten().fieldErrors
      );
    }

    const ip = req.ip || (req.headers['x-forwarded-for'] as string);
    const userAgent = req.headers['user-agent'];

    const result = await this.identityService.register(
      parseResult.data,
      ip,
      userAgent,
      req.id
    );

    // Set secure HttpOnly session cookie
    res.cookie('techsprout_session', result.token, {
      httpOnly: true,
      secure: env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      expires: result.expiresAt,
    });

    return {
      success: true,
      message: result.message,
      user: result.user,
      token: result.token,
    };
  }

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'User login with email and password' })
  @ApiResponse({ status: 200, description: 'Login successful' })
  async login(
    @Body() body: unknown,
    @Req() req: AuthenticatedRequest,
    @Res({ passthrough: true }) res: Response
  ) {
    const parseResult = loginSchema.safeParse(body);
    if (!parseResult.success) {
      throw new ApiException(
        'Validation failed',
        HttpStatus.BAD_REQUEST,
        'VALIDATION_ERROR',
        parseResult.error.flatten().fieldErrors
      );
    }

    const ip = req.ip || (req.headers['x-forwarded-for'] as string);
    const userAgent = req.headers['user-agent'];

    const result = await this.identityService.login(
      parseResult.data,
      ip,
      userAgent,
      req.id
    );

    res.cookie('techsprout_session', result.token, {
      httpOnly: true,
      secure: env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      expires: result.expiresAt,
    });

    return {
      success: true,
      message: result.message,
      user: result.user,
      token: result.token,
    };
  }

  @Public()
  @Get('google')
  @ApiOperation({ summary: 'Initiate Google OAuth 2.0 authorization flow' })
  @ApiResponse({ status: 200, description: 'Google authorization URL and state' })
  async googleAuth(
    @Query('redirectUri') redirectUri: string,
    @Res({ passthrough: true }) res: Response
  ) {
    const { url, state } = this.identityService.getGoogleAuthUrl(redirectUri);

    res.cookie('google_oauth_state', state, {
      httpOnly: true,
      secure: env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 10 * 60 * 1000, // 10 minutes
    });

    return {
      success: true,
      url,
      state,
    };
  }

  @Public()
  @Get('google/callback')
  @ApiOperation({ summary: 'Google OAuth 2.0 GET callback handler' })
  @ApiResponse({ status: 200, description: 'Authenticated via Google' })
  async googleCallbackGet(
    @Query('code') code: string,
    @Query('state') state: string,
    @Req() req: AuthenticatedRequest,
    @Res({ passthrough: true }) res: Response
  ) {
    return this.executeGoogleCallback(code, state, req, res);
  }

  @Public()
  @Post('google/callback')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Google OAuth 2.0 POST callback handler' })
  @ApiResponse({ status: 200, description: 'Authenticated via Google' })
  async googleCallbackPost(
    @Body() body: { code: string; state: string },
    @Req() req: AuthenticatedRequest,
    @Res({ passthrough: true }) res: Response
  ) {
    return this.executeGoogleCallback(body?.code, body?.state, req, res);
  }

  private async executeGoogleCallback(
    code: string,
    state: string,
    req: AuthenticatedRequest,
    res: Response
  ) {
    const expectedState =
      req.cookies?.['google_oauth_state'] ||
      (req.headers['x-oauth-state'] as string) ||
      state;

    const ip = req.ip || (req.headers['x-forwarded-for'] as string);
    const userAgent = req.headers['user-agent'];

    const result = await this.identityService.handleGoogleCallback(
      code,
      state,
      expectedState,
      ip,
      userAgent,
      req.id
    );

    res.clearCookie('google_oauth_state', { path: '/' });

    res.cookie('techsprout_session', result.token, {
      httpOnly: true,
      secure: env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      expires: result.expiresAt,
    });

    return {
      success: true,
      message: result.message,
      user: result.user,
      token: result.token,
    };
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiCookieAuth()
  @ApiOperation({ summary: 'Revoke active session and logout' })
  @ApiResponse({ status: 200, description: 'Logout successful' })
  async logout(
    @Req() req: AuthenticatedRequest,
    @Res({ passthrough: true }) res: Response
  ) {
    let token = req.cookies?.['techsprout_session'];
    if (!token && req.headers.authorization) {
      const parts = req.headers.authorization.split(' ');
      if (parts.length === 2 && parts[0].toLowerCase() === 'bearer') {
        token = parts[1];
      }
    }

    if (token) {
      await this.identityService.logout(token, req.user?.id, req.id);
    }

    res.clearCookie('techsprout_session', { path: '/' });

    return {
      success: true,
      message: 'Logged out successfully',
    };
  }

  @Get('me')
  @ApiBearerAuth()
  @ApiCookieAuth()
  @ApiOperation({ summary: 'Retrieve currently authenticated user session' })
  @ApiResponse({ status: 200, description: 'Active user profile' })
  async me(@CurrentUser() user: unknown) {
    return {
      success: true,
      data: user,
    };
  }
}
