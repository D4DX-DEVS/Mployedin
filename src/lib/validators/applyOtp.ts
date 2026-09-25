import { z } from "zod";

/**
 * POST /api/auth/apply-otp/start. The name is required: the account created
 * when the code is redeemed — and the application the employer sees — used to
 * be named after the email's local part.
 */
export const applyOtpStartSchema = z.object({
  email: z.string().email().max(254),
  name: z.string().trim().min(1).max(200),
  /** reCAPTCHA v3 token. Required only when RECAPTCHA_SECRET_KEY is configured. */
  captchaToken: z.string().max(4096).optional(),
});
