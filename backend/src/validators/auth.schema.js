const { z } = require('zod');

const email = z.string().trim().toLowerCase().email('Enter a valid email address');

const password = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(72, 'Password is too long')
  .regex(/[a-zA-Z]/, 'Password must contain a letter')
  .regex(/[0-9]/, 'Password must contain a number');

const loginSchema = z.object({
  email,
  password: z.string().min(1, 'Password is required'),
});

const forgotPasswordSchema = z.object({ email });

const resetPasswordSchema = z.object({
  token: z.string().min(10, 'Reset token is missing'),
  password,
});

const acceptInviteSchema = z.object({
  token: z.string().min(10, 'Invitation token is missing'),
  password,
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: password,
});

module.exports = {
  email,
  password,
  loginSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  acceptInviteSchema,
  changePasswordSchema,
};
