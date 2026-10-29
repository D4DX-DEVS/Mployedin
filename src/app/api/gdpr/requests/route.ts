import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withAuth, type AuthContext } from "@/lib/auth/withAuth";
import { connectDB } from "@/lib/db/mongoose";
import { validateBody } from "@/lib/validators";
import GdprRequest from "@/models/GdprRequest";
import { createDeletionRequest } from "@/lib/gdpr/deletionRequest";
import { createPrivacyComplaint } from "@/lib/gdpr/privacyComplaint";
import { COMPLAINT_MAX, COMPLAINT_MIN } from "@/lib/gdpr/complaintRules";
import { checkRateLimit } from "@/lib/security/rateLimit";

/**
 * GET /api/gdpr/requests — the signed-in user's own data requests, newest
 * first, for their Data & Privacy page.
 *
 * A person whose request was refused, or only partly done, is told why (UK
 * GDPR Art 12(4)), so a finished request carries `outcome` and
 * `outcomeReason`. The team's internal notes (`adminNotes`) are not selected
 * at all, and a request that is still open shows neither: what the team has
 * written so far is not yet an answer.
 */
async function getHandler(_req: NextRequest, ctx: AuthContext) {
  await connectDB();
  const requests = await GdprRequest.find({ userId: ctx.userId })
    .sort({ createdAt: -1 })
    .limit(20)
    .select("requestType status createdAt completedAt outcome outcomeReason")
    .lean<Array<{
      _id: unknown;
      requestType: string;
      status: string;
      createdAt: Date;
      completedAt?: Date;
      outcome?: string;
      outcomeReason?: string;
    }>>();

  return NextResponse.json({
    requests: requests.map((r) => {
      const answered = r.status === "completed" || r.status === "rejected";
      return {
        _id: String(r._id),
        requestType: r.requestType,
        status: r.status,
        createdAt: r.createdAt,
        completedAt: r.completedAt ?? null,
        outcome: (answered && r.outcome) || null,
        outcomeReason: (answered && r.outcomeReason) || null,
      };
    }),
  });
}

const createRequestSchema = z.discriminatedUnion("requestType", [
  z.object({
    requestType: z.literal("delete"),
    reason: z.string().trim().max(1000).optional(),
  }),
  z.object({
    requestType: z.literal("complaint"),
    message: z.string().trim().min(COMPLAINT_MIN).max(COMPLAINT_MAX),
  }),
]);

/**
 * POST /api/gdpr/requests — ask for the account to be deleted (admin completes
 * it), or make a privacy complaint (admin acknowledges and answers it).
 */
async function postHandler(req: NextRequest, ctx: AuthContext) {
  const body = await validateBody(req, createRequestSchema);

  if (body.requestType === "complaint") {
    const { allowed } = await checkRateLimit(`gdpr-complaint:${ctx.userId}`, { limit: 3, windowSec: 86400, prefix: "gdpr" });
    if (!allowed) {
      return NextResponse.json({ error: "You can send 3 complaints a day. Please try again tomorrow.", code: "RATE_LIMITED" }, { status: 429 });
    }
    await connectDB();
    const requestId = await createPrivacyComplaint(req, ctx, body.message);
    return NextResponse.json({ success: true, requestId }, { status: 201 });
  }

  await connectDB();
  const result = await createDeletionRequest(req, ctx, body.reason || undefined);
  if (!result.ok) {
    return result.code === "ADMIN_ACCOUNT"
      ? NextResponse.json({ error: "Administrator accounts can't be deleted this way.", code: result.code }, { status: 403 })
      : NextResponse.json({ error: "You already have a deletion request open.", code: result.code }, { status: 409 });
  }
  return NextResponse.json({ success: true, requestId: result.requestId }, { status: 202 });
}

export const GET = withAuth(getHandler);
export const POST = withAuth(postHandler);
