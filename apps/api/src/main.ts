import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { Logger } from '@nestjs/common';
import { env } from './config/env.config';
import { initSentry } from './common/observability/sentry';
import { StructuredLoggerService } from './common/observability/structured-logger.service';

async function bootstrap() {
  // Initialize Sentry SDK
  initSentry();

  const structuredLogger = new StructuredLoggerService();
  const app = await NestFactory.create(AppModule, {
    logger: structuredLogger,
  });

  const logger = new Logger('Bootstrap');

  // 1. Versioned Global Prefix: /api/v1
  app.setGlobalPrefix('api/v1');

  // 2. Security Headers (Helmet)
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'", "'unsafe-inline'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", 'data:', 'https:'],
          connectSrc: ["'self'", env.WEB_ORIGIN],
          frameAncestors: ["'none'"],
        },
      },
      crossOriginEmbedderPolicy: false,
    })
  );

  // 3. Cookie Parser for secure HttpOnly session cookies
  app.use(cookieParser());

  // 4. Strict CORS whitelist (Never allow '*')
  const customOrigins = env.WEB_ORIGIN ? env.WEB_ORIGIN.split(',').map((s) => s.trim()) : [];
  app.enableCors({
    origin: [
      ...customOrigins,
      'http://localhost:3000',
      'https://techsprout-frthqjqb8-tech-sprout.vercel.app',
      /^https:\/\/techsprout-.*-tech-sprout\.vercel\.app$/,
      /^https:\/\/techsprout-git-.*-tech-sprout\.vercel\.app$/,
    ],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-Id'],
  });

  // 5. OpenAPI / Swagger Documentation
  const swaggerConfig = new DocumentBuilder()
    .setTitle('TechSprout School LMS API')
    .setDescription('Production REST API for TechSprout School LMS Foundation & Security Phase')
    .setVersion('1.0.0')
    .addTag('Identity & Authentication')
    .addTag('OTP & Phone Verification')
    .addTag('Admin')
    .addTag('Health')
    .addCookieAuth('techsprout_session')
    .addBearerAuth()
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, document);

  // 6. Graceful Shutdown Hooks
  app.enableShutdownHooks();

  const port = env.PORT || 3001;
  await app.listen(port, '0.0.0.0');
  logger.log(`TechSprout API server successfully started on http://0.0.0.0:${port}/api/v1`);
  logger.log(`OpenAPI Swagger documentation available on http://localhost:${port}/api/docs`);
}

bootstrap();
