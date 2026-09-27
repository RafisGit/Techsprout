import z from 'zod';

const BANGLADESHI_PHONE_REGEX = /^(?:\+?88)?(01[3-9]\d{8})$/;

export const registerSchema = z
  .object({
    name: z
      .string()
      .min(2, {
        message: 'Name must be at least 2 characters.',
      })
      .max(50, {
        message: 'Name must not exceed 50 characters.',
      }),
    userName: z
      .string()
      .min(3, {
        message: 'Username must be at least 3 characters.',
      })
      .max(30, {
        message: 'Username must not exceed 30 characters.',
      })
      .regex(/^[a-zA-Z0-9_-]+$/, {
        message: 'Username can only contain letters, numbers, underscores, and dashes.',
      }),
    email: z.email({
      message: 'Please enter a valid email address.',
    }),
    phoneNumber: z.string().regex(BANGLADESHI_PHONE_REGEX, {
      message:
        'Invalid Bangladeshi phone number. Must start with 01 and be 11 digits long (e.g., 017XXXXXXXX).',
    }),
    password: z
      .string()
      .min(8, {
        message: 'Password must be at least 8 characters long.',
      })
      .regex(/[A-Z]/, {
        message: 'Password must contain at least one uppercase letter.',
      })
      .regex(/[a-z]/, {
        message: 'Password must contain at least one lowercase letter.',
      })
      .regex(/[0-9]/, {
        message: 'Password must contain at least one number.',
      }),
    passwordConfirmation: z.string(),
  })
  .refine((data) => data.password === data.passwordConfirmation, {
    message: 'Passwords do not match.',
    path: ['passwordConfirmation'],
  });
