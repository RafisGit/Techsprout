import { z } from 'zod';
import * as dotenv from 'dotenv';
dotenv.config();

export const envSchema = z.object({
  PORT: z.coerce.number().default(3001),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  DATABASE_URL: z.string().default('postgresql://postgres:postgres@localhost:5432/techsprout'),
  AUTH_SECRET: z
    .string()
    .min(16)
    .default('development_super_secret_minimum_32_characters_random_string'),
  REDIS_URL: z.string().optional().default('redis://localhost:6379'),
  WEB_ORIGIN: z.string().default('http://localhost:3000'),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  SMS_GATEWAY_API_KEY: z.string().optional(),
  CLOUDINARY_CLOUD_NAME: z.string().optional(),
  CLOUDINARY_API_KEY: z.string().optional(),
  CLOUDINARY_API_SECRET: z.string().optional(),
  SSLCOMMERZ_STORE_ID: z.string().optional(),
  SSLCOMMERZ_STORE_PASSWORD: z.string().optional(),
  SSLCOMMERZ_BASE_URL: z.string().default('https://sandbox.sslcommerz.com'),
  API_PUBLIC_BASE_URL: z.string().default('http://localhost:3001'),
  SSLCOMMERZ_IS_SANDBOX: z.coerce.boolean().default(true),
}).superRefine((data, ctx) => {
  if (data.NODE_ENV === 'production') {
    if (!data.SSLCOMMERZ_STORE_ID || data.SSLCOMMERZ_STORE_ID.trim() === '') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['SSLCOMMERZ_STORE_ID'],
        message: 'SSLCOMMERZ_STORE_ID is required in production environment',
      });
    }
    if (!data.SSLCOMMERZ_STORE_PASSWORD || data.SSLCOMMERZ_STORE_PASSWORD.trim() === '') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['SSLCOMMERZ_STORE_PASSWORD'],
        message: 'SSLCOMMERZ_STORE_PASSWORD is required in production environment',
      });
    }
  }
});

export type EnvConfig = z.infer<typeof envSchema>;

export function validateEnv(): EnvConfig {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    console.error('Invalid environment variables:', parsed.error.format());
    throw new Error('Environment validation failed');
  }
  return parsed.data;
}

export const env = validateEnv();
