import z from 'zod';

export const otpSchema = z.object({
  otp: z.string().min(6, {
    message: 'Your OTP must be 6 characters.',
  }),
});
