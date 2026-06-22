import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/withAuth";
import { checkRateLimitDual, RATE_LIMIT_CONFIGS } from "@/lib/security/rateLimit";
import { z } from "zod";
import { validateBody } from "@/lib/validators";

const linkedInShareSchema = z.object({
  jobUrl: z.string().url().max(500),
  caption: z.string().max(1000).optional(),
  visibility: z.enum(["PUBLIC", "CONNECTIONS"]).optional(),
});

/**
 * POST /api/social/linkedin/share
 * Share a job URL to LinkedIn via the share-offsite redirect.
 *
 * NOTE: For full image posting via LinkedIn UGC API, the employer needs
 * w_member_social scope. This endpoint currently returns the share URL
 * for client-side redirect. A future version can do server-side posting
 * when LinkedIn OAuth tokens with w_member_social are stored.
 */
export const POST = withAuth(async (req: NextRequest, ctx) => {
  const rl = await checkRateLimitDual(req, ctx.userId, RATE_LIMIT_CONFIGS.api);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Too many requests." },
      { status: 429, headers: { "Retry-After": String(Math.ceil((rl.resetAt - Date.now()) / 1000)) } },
    );
  }

  const body = await validateBody(req, linkedInShareSchema);

  // Build LinkedIn sharing URL
  const shareUrl = `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(body.jobUrl)}`;

  return NextResponse.json({
    shareUrl,
    caption: body.caption ?? "",
  });
});
