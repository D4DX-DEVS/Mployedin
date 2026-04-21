/**
 * GET /api/invoices — List invoices.
 *
 * Admin/super_agent/agent: list all (with optional userId filter).
 * Employer/job_seeker: list own invoices only (userId param ignored).
 */

import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/withAuth";
import { logActivity, actorFromCtx } from "@/lib/audit/log";
import connectDB from "@/lib/db/mongoose";
import Invoice from "@/models/Invoice";
import type { UserRole } from "@/types/user";

interface AuthCtx { userId: string; role: UserRole; locale: string }

async function handler(req: NextRequest, ctx: AuthCtx) {
  await connectDB();

  const url = new URL(req.url);
  const isStaff = ["admin", "super_agent", "agent"].includes(ctx.role);

  // Build filter
  const filter: Record<string, unknown> = {};

  // userId — staff can query any user; non-staff forced to own
  const userIdParam = url.searchParams.get("userId");
  if (isStaff && userIdParam) {
    filter.userId = userIdParam;
  } else if (!isStaff) {
    filter.userId = ctx.userId;
  }

  // Status filter
  const statusParam = url.searchParams.get("status");
  if (statusParam && ["draft", "issued", "paid", "void"].includes(statusParam)) {
    filter.status = statusParam;
  }

  // Type filter
  const typeParam = url.searchParams.get("type");
  if (typeParam && ["new", "renewal", "upgrade", "downgrade"].includes(typeParam)) {
    filter.type = typeParam;
  }

  // Pagination
  const page = Math.max(1, Number(url.searchParams.get("page")) || 1);
  const limit = Math.min(100, Math.max(1, Number(url.searchParams.get("limit")) || 50));
  const skip = (page - 1) * limit;

  const [invoices, total] = await Promise.all([
    Invoice.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Invoice.countDocuments(filter),
  ]);

  return NextResponse.json({
    invoices,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  });
}

export const GET = withAuth(handler, { resource: "subscriptions", action: "read" });
