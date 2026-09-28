import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withAuth, type AuthContext } from "@/lib/auth/withAuth";
import { connectDB } from "@/lib/db/mongoose";
import { validateBody } from "@/lib/validators";
import GdprRequest from "@/models/GdprRequest";
import { createDeletionRequest } from "@/lib/gdpr/deletionRequest";

/**
 * GET /api/gdpr/requests — the signed-in user's own data requests, newest
 * first, for their Data & Privacy page.
 */
async function getHandler(_req: NextRequest, ctx: AuthContext) {
  await connectDB();
  const requests = await GdprRequest.find({ userId: ctx.userId })
    .sort({ createdAt: -1 })
    .limit(20)
    .select("requestType status createdAt completedAt")
    .lean<Array<{ _id: unknown; requestType: string; status: string; createdAt: Date; completedAt?: Date }>>();

  return NextResponse.json({
    requests: requests.map((r) => ({
      _id: String(r._id),
      requestType: r.requestType,
      status: r.status,
      createdAt: r.createdAt,
      completedAt: r.completedAt ?? null,
    })),
  });
}

const createRequestSchema = z.object({
  requestType: z.literal("delete"),
  reason: z.string().trim().max(1000).optional(),
});

/** POST /api/gdpr/requests — ask for the account to be deleted (admin completes it). */
async function postHandler(req: NextRequest, ctx: AuthContext) {
  const body = await validateBody(req, createRequestSchema);
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
