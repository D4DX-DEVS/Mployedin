/**
 * Every new CV file is read by the AI once (processCv.ts), so an upload is a
 * paid call. CV uploads get the same guards as the auto-fill upload
 * (/api/ai/cv-extract): a few a minute, counted toward the account's daily AI
 * quota. Bytes this seeker already uploaded reuse the earlier reading and
 * cost nothing, so they pass — the documents page sends each resume to both
 * upload routes, and the second must not count twice.
 */

import { NextResponse } from "next/server";
import type { Types } from "mongoose";
import CvDocument from "@/models/CvDocument";
import { checkRateLimit, RATE_LIMIT_CONFIGS } from "@/lib/security/rateLimit";
import { enforceDailyAiQuota } from "@/lib/ai/dailyQuota";

/** The refusal to send back, or null when the upload may go ahead. */
export async function limitCvUpload(input: {
  userId: string;
  role: string;
  jobSeekerId: string | Types.ObjectId;
  fingerprint: string;
}): Promise<NextResponse | null> {
  const known = await CvDocument.exists({ jobSeekerId: input.jobSeekerId, fingerprint: input.fingerprint });
  if (known) return null;

  const { allowed } = await checkRateLimit(`cv-upload:${input.userId}`, RATE_LIMIT_CONFIGS.upload);
  if (!allowed) {
    return NextResponse.json(
      { error: "You're uploading CVs too quickly. Please wait a minute and try again." },
      { status: 429 },
    );
  }

  const overQuota = await enforceDailyAiQuota(input.userId, input.role);
  if (overQuota) {
    const retryAfter = overQuota.headers.get("Retry-After");
    return NextResponse.json(
      { error: "You've reached today's limit for reading CVs. Please try again tomorrow." },
      { status: 429, headers: retryAfter ? { "Retry-After": retryAfter } : undefined },
    );
  }
  return null;
}
