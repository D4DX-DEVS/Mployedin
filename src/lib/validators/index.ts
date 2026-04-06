/**
 * Zod-based request body validation middleware for Next.js API routes.
 *
 * Usage:
 *   const body = await validateBody(req, jobCreateSchema);
 *   // throws a 400 NextResponse on validation failure
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

/**
 * Parse and validate the JSON body of a request against a Zod schema.
 * Returns the parsed data on success, or throws a NextResponse (400) on failure.
 */
export async function validateBody<T extends z.ZodType>(
  req: NextRequest,
  schema: T
): Promise<z.infer<T>> {
  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    throw NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 }
    );
  }

  const result = schema.safeParse(rawBody);
  if (!result.success) {
    const errors = result.error.issues.map((i) => ({
      path: i.path.join("."),
      message: i.message,
    }));
    throw NextResponse.json(
      { error: "Validation failed", details: errors },
      { status: 400 }
    );
  }

  return result.data;
}

/**
 * Validate query/search params against a Zod schema.
 */
export function validateQuery<T extends z.ZodType>(
  searchParams: URLSearchParams,
  schema: T
): z.infer<T> {
  const obj: Record<string, string> = {};
  searchParams.forEach((value, key) => {
    obj[key] = value;
  });

  const result = schema.safeParse(obj);
  if (!result.success) {
    throw NextResponse.json(
      {
        error: "Invalid query parameters",
        details: result.error.issues.map((i) => ({
          path: i.path.join("."),
          message: i.message,
        })),
      },
      { status: 400 }
    );
  }

  return result.data;
}

/** Common reusable schema pieces */
export const commonSchemas = {
  objectId: z.string().regex(/^[a-f\d]{24}$/i, "Invalid ObjectId"),
  email: z.string().email().max(254).trim().toLowerCase(),
  phone: z.string().min(7).max(20).trim(),
  url: z.string().url().max(2048),
  paginationPage: z.coerce.number().int().min(1).default(1),
  paginationLimit: z.coerce.number().int().min(1).max(100).default(10),
};
