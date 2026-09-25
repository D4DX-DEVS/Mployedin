import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongoose";
import { withAuth } from "@/lib/auth/withAuth";
import { escapeRegex } from "@/lib/security/sanitize";
import CompanyReview from "@/models/CompanyReview";
import "@/models/Employer";
import "@/models/User";
import type { UserRole } from "@/models/User";

interface AuthCtx { userId: string; role: UserRole; locale: string; }

const REVIEW_STATUS_FILTERS = ["pending", "approved", "rejected", "all"] as const;

/**
 * Company reviews for moderation. Job seekers submit reviews as `pending`
 * and the public company page shows only `approved` ones, so this list is the
 * only way a review ever gets published. Moderation rides the `employers`
 * permission: a review belongs to a company.
 */
async function getHandler(req: NextRequest, _ctx: AuthCtx) {
  await connectDB();

  const { searchParams } = new URL(req.url);
  const rawStatus = searchParams.get("status") ?? "pending";
  const status = (REVIEW_STATUS_FILTERS as readonly string[]).includes(rawStatus) ? rawStatus : "pending";
  const search = (searchParams.get("search") ?? "").trim();
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1") || 1);
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") ?? "10") || 10));

  const query: Record<string, unknown> = {};
  if (status !== "all") query.status = status;
  if (search) {
    const safe = escapeRegex(search);
    query.$or = [
      { title: { $regex: safe, $options: "i" } },
      { pros: { $regex: safe, $options: "i" } },
      { cons: { $regex: safe, $options: "i" } },
    ];
  }

  const [items, total] = await Promise.all([
    CompanyReview.find(query)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate("employerId", "companyName")
      .populate("userId", "name email")
      .lean(),
    CompanyReview.countDocuments(query),
  ]);

  return NextResponse.json({
    items,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
  });
}

export const GET = withAuth(getHandler, { resource: "employers", action: "read" });
