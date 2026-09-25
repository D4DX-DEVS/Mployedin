import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { connectDB } from "@/lib/db/mongoose";
import { withAuth } from "@/lib/auth/withAuth";
import { logActivity, actorFromCtx } from "@/lib/audit/log";
import { isValidObjectId } from "@/lib/security/sanitize";
import CompanyReview from "@/models/CompanyReview";
import type { UserRole } from "@/models/User";

interface AuthCtx { userId: string; role: UserRole; locale: string; }

const moderateSchema = z.object({ status: z.enum(["approved", "rejected"]) });

/**
 * Publish or reject a company review. Who decided and when goes to the audit
 * log (the review schema has no moderation fields), the same trail every other
 * admin decision leaves.
 */
async function patchHandler(req: NextRequest, ctx: AuthCtx, params?: Record<string, string>) {
  if (!isValidObjectId(params?.id)) return NextResponse.json({ error: "Invalid ID" }, { status: 400 });

  const parsed = moderateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Choose approve or reject." }, { status: 400 });
  }

  await connectDB();
  const review = await CompanyReview.findById(params?.id);
  if (!review) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const before = review.status;
  review.status = parsed.data.status;
  await review.save();

  await logActivity({
    ...actorFromCtx(ctx),
    action: parsed.data.status === "approved" ? "company-review.approve" : "company-review.reject",
    resource: "employers",
    resourceId: params?.id,
    changes: { before: { status: before }, after: { status: review.status } },
    req,
  });

  return NextResponse.json({ item: { _id: String(review._id), status: review.status } });
}

export const PATCH = withAuth(patchHandler, { resource: "employers", action: "approve" });
