/**
 * Security utility helpers used throughout the API layer.
 */

/**
 * Escape regex metacharacters in user-supplied strings before
 * passing them to `new RegExp()` or MongoDB `$regex`.
 * Prevents ReDoS and unintended pattern matching.
 */
export function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Validate that a role string is one of the allowed UserRole values.
 */
const VALID_ROLES = ["admin", "super_agent", "agent", "employer", "job_seeker"] as const;
export function isValidRole(role: string): role is (typeof VALID_ROLES)[number] {
  return (VALID_ROLES as readonly string[]).includes(role);
}

/**
 * Validate max file size in bytes. Returns `true` if valid (within limit).
 */
export function isValidFileSize(file: File, maxBytes: number): boolean {
  return file.size > 0 && file.size <= maxBytes;
}

/** 10 MB in bytes */
export const MAX_CV_SIZE = 10 * 1024 * 1024;

/** 5 MB in bytes */
export const MAX_IMAGE_SIZE = 5 * 1024 * 1024;

/**
 * Strip dangerous MongoDB operators from a plain object.
 * Prevents NoSQL operator injection via body fields like { "$gt": "", "$ne": "" }.
 */
export function sanitizeObject<T extends Record<string, unknown>>(obj: T): T {
  const clean = { ...obj } as Record<string, unknown>;
  for (const key of Object.keys(clean)) {
    if (key.startsWith("$")) {
      delete clean[key];
    } else if (
      typeof clean[key] === "object" &&
      clean[key] !== null &&
      !Array.isArray(clean[key])
    ) {
      clean[key] = sanitizeObject(
        clean[key] as Record<string, unknown>
      );
    }
  }
  return clean as T;
}

/**
 * Validate that a string is a valid MongoDB ObjectId (24 hex chars).
 * Use this before passing path params to Mongoose queries to prevent
 * CastError exceptions and potential injection via malformed IDs.
 */
export function isValidObjectId(id: string | undefined | null): boolean {
  if (!id) return false;
  return /^[a-f\d]{24}$/i.test(id);
}

/**
 * Pick only the listed keys from an object — prevents mass-assignment.
 */
export function pick<T extends Record<string, unknown>, K extends keyof T>(
  obj: T,
  keys: K[]
): Pick<T, K> {
  const result = {} as Pick<T, K>;
  for (const key of keys) {
    if (key in obj) result[key] = obj[key];
  }
  return result;
}
