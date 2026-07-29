import { z } from "zod";

const COMMON_PASSWORDS = new Set([
  "password123!",
  "admin@1234",
  "qwerty123!",
  "welcome123!",
  "letmein123!",
]);

export const strongPasswordSchema = z
  .string()
  .min(12, "Password must be at least 12 characters")
  .max(128, "Password must be at most 128 characters")
  .regex(/[a-z]/, "Password must include a lowercase letter")
  .regex(/[A-Z]/, "Password must include an uppercase letter")
  .regex(/[0-9]/, "Password must include a number")
  .regex(/[^A-Za-z0-9]/, "Password must include a special character")
  .refine((password) => !COMMON_PASSWORDS.has(password.toLowerCase()), {
    message: "Choose a less common password",
  });
