import { z } from 'zod';

export const BANGLADESHI_PHONE_REGEX = /^01[3-9]\d{8}$/;

export const registerSchema = z.object({
  name: z
    .string()
    .min(2, 'Name must be at least 2 characters')
    .max(50, 'Name must not exceed 50 characters')
    .trim(),
  username: z
    .string()
    .min(3, 'Username must be at least 3 characters')
    .max(30, 'Username must not exceed 30 characters')
    .regex(/^[a-zA-Z0-9_-]+$/, 'Username can only contain alphanumeric characters, underscores, and dashes')
    .trim()
    .toLowerCase(),
  email: z
    .string()
    .email('Please enter a valid email address')
    .trim()
    .toLowerCase(),
  phone: z
    .string()
    .optional()
    .transform((val) => {
      if (!val || typeof val !== 'string') return undefined;
      const trimmed = val.trim().replace(/^\+?88/, '');
      return trimmed === '' ? undefined : trimmed;
    })
    .pipe(
      z
        .string()
        .regex(BANGLADESHI_PHONE_REGEX, 'Invalid Bangladeshi phone number (e.g., 01712345678)')
        .optional()
    ),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters long')
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
    .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
    .regex(/[0-9]/, 'Password must contain at least one number'),
});

export type RegisterDto = z.infer<typeof registerSchema>;
