/**
 * GET /api/invoices — List invoices.
 *
 * Admin: list all (with optional filters).
 * Super_agent: own team's recruitment invoices + own subscription invoices.
 * Agent: own recruitment invoices + own subscription invoices.
 * Employer/job_seeker: own invoices only.
 */

import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/withAuth";
import connectDB from "@/lib/db/mongoose";
import Invoice from "@/models/Invoice";
import Agent from "@/models/Agent";
import SuperAgent from "@/models/SuperAgent";
import type { UserRole } from "@/types/user";

interface AuthCtx { userId: string; role: UserRole; locale: string }

async function handler(req: NextRequest, ctx: AuthCtx) {
  await connectDB();

  const url = new URL(req.url);

  // Build filter
  const filter: Record<string, unknown> = {};

  // Category filter
  const categoryParam = url.searchParams.get("category");
  if (categoryParam && ["subscription", "recruitment"].includes(categoryParam)) {
    filter.category = categoryParam;
  }

  // Role-based scoping
  if (ctx.role === "admin") {
    // Admin sees all — apply optional userId filter
    const userIdParam = url.searchParams.get("userId");
    if (userIdParam) filter.userId = userIdParam;
    const employerIdParam = url.searchParams.get("employerId");
    if (employerIdParam) filter.employerId = employerIdParam;
  } else if (ctx.role === "super_agent") {
    // Super-agent sees team recruitment invoices + own subscription invoices
    const sa = await SuperAgent.findOne({ userId: ctx.userId }).select("_id agentIds").lean();
    if (sa) {
      filter.$or = [
        { userId: ctx.userId },
        { agentId: { $in: sa.agentIds ?? [] } },
      ];
    } else {
      filter.userId = ctx.userId;
    }
  } else if (ctx.role === "agent") {
    // Agent sees own invoices (by agentId for recruitment, userId for subscription)
    const agentDoc = await Agent.findOne({ userId: ctx.userId }).select("_id").lean();
    if (agentDoc) {
      filter.$or = [
        { userId: ctx.userId },
        { agentId: agentDoc._id },
      ];
    } else {
      filter.userId = ctx.userId;
    }
  } else {
    // Employer / Job Seeker — own only
    filter.userId = ctx.userId;
  }

  // Status filter
  const statusParam = url.searchParams.get("status");
  if (statusParam && ["draft", "issued", "paid", "void"].includes(statusParam)) {
    filter.status = statusParam;
  }

  // Type filter
  const typeParam = url.searchParams.get("type");
  if (typeParam && ["new", "renewal", "upgrade", "downgrade", "recruitment"].includes(typeParam)) {
    filter.type = typeParam;
  }

  // Date range
  const dateFrom = url.searchParams.get("dateFrom");
  const dateTo = url.searchParams.get("dateTo");
  if (dateFrom || dateTo) {
    const dateFilter: Record<string, Date> = {};
    if (dateFrom) dateFilter.$gte = new Date(dateFrom);
    if (dateTo) {
      const end = new Date(dateTo);
      end.setHours(23, 59, 59, 999);
      dateFilter.$lte = end;
    }
    filter.createdAt = dateFilter;
  }

  // Pagination
  const page = Math.max(1, Number(url.searchParams.get("page")) || 1);
  const limit = Math.min(100, Math.max(1, Number(url.searchParams.get("limit")) || 50));
  const skip = (page - 1) * limit;

  const [invoices, total] = await Promise.all([
    Invoice.find(filter)
      .populate("jobId", "title")
      .populate("employerId", "companyName")
      .populate("agentId", "userId")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Invoice.countDocuments(filter),
  ]);

  // Summary aggregation
  const summaryAgg = await Invoice.aggregate([
    { $match: { ...filter } },
    {
      $group: {
        _id: "$status",
        total: { $sum: "$amount" },
        count: { $sum: 1 },
      },
    },
  ]);

  const summary = { draft: 0, issued: 0, paid: 0, void: 0, totalAmount: 0, totalCount: 0 };
  for (const row of summaryAgg) {
    const s = row._id as string;
    if (s === "draft" || s === "issued" || s === "paid" || s === "void") {
      summary[s] = row.total;
      summary.totalAmount += row.total;
      summary.totalCount += row.count;
    }
  }

  return NextResponse.json({
    invoices,
    summary,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  });
}

export const GET = withAuth(handler, { resource: "subscriptions", action: "read" });
