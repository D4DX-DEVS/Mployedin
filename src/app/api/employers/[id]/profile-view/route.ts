import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/withAuth";
import { connectDB } from "@/lib/db/mongoose";
import CompanyProfileView from "@/models/CompanyProfileView";
import Employer from "@/models/Employer";
import { isValidObjectId } from "@/lib/security/sanitize";

/**
 * POST /api/employers/[id]/profile-view
 * Records that the current user viewed this employer's company profile.
 * Deduplicates — one record per viewer per employer per 24h window.
 */
async function handler(_req: NextRequest, ctx: { userId: string }, params?: Record<string, string>) {
  const employerId = params?.id;
  if (!isValidObjectId(employerId)) {
    return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  }

  await connectDB();

  const employer = await Employer.findById(employerId).select("_id").lean();
  if (!employer) {
    return NextResponse.json({ error: "Employer not found" }, { status: 404 });
  }

  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const existing = await CompanyProfileView.findOne({
    viewerId: ctx.userId,
    employerId,
    viewedAt: { $gte: oneDayAgo },
  }).lean();

  if (!existing) {
    await CompanyProfileView.create({
      viewerId: ctx.userId,
      employerId,
    });
  }

  return NextResponse.json({ success: true });
}

export const POST = withAuth(handler);
