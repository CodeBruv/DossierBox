import "server-only";

import { z } from "zod";

export const normalizedEmailSchema = z
  .string({ error: "Enter a valid email address." })
  .trim()
  .min(1, "Enter an email address.")
  .max(254, "Enter a valid email address.")
  .pipe(z.email("Enter a valid email address."))
  .transform((email) => email.toLowerCase());

export const passwordSchema = z
  .string({ error: "Enter a valid password." })
  .min(12, "Password must be at least 12 characters.")
  .max(128, "Password must be no more than 128 characters.");

export type PasswordValidationResult = ReturnType<typeof passwordSchema.safeParse>;

export function normalizeEmail(value: unknown): string | null {
  const result = normalizedEmailSchema.safeParse(value);
  return result.success ? result.data : null;
}

export function validatePassword(value: unknown): PasswordValidationResult {
  return passwordSchema.safeParse(value);
}
