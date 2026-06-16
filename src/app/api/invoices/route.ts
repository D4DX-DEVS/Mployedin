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
import Employer from "@/models/Employer";
import Job from "@/models/Job";
import Agent from "@/models/Agent";
import SuperAgent from "@/models/SuperAgent";
import { escapeRegex } from "@/lib/security/sanitize";
import { isInvoiceStatus } from "@/lib/invoices/status";
import type { UserRole } from "@/types/user";

interface AuthCtx { userId: string; role: UserRole; locale: string }

type InvoiceFilter = Record<string, unknown>;
const RELATED_ENTITY_SEARCH_LIMIT = 150;

function appendSearchConditions(filter: InvoiceFilter, conditions: InvoiceFilter[]) {
  const scopedOr = Array.isArray(filter.$or) ? (filter.$or as InvoiceFilter[]) : null;

  if (scopedOr) {
    const existingAnd = Array.isArray(filter.$and) ? (filter.$and as InvoiceFilter[]) : [];
    filter.$and = [...existingAnd, { $or: scopedOr }, { $or: conditions }];
    delete filter.$or;
    return;
  }

  filter.$or = conditions;
}

async function handler(req: NextRequest, ctx: AuthCtx) {
  await connectDB();

  const url = new URL(req.url);

  // Build filter
  const filter: Record<string, unknown> = {};

  // Category filter
  const categoryParam = url.searchParams.get("category");
  if (categoryParam && ["subscription", "recruitment", "premium_posting", "featured_promotion", "exhibition", "bulk_hiring", "consulting", "custom_enterprise"].includes(categoryParam)) {
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
  if (isInvoiceStatus(statusParam)) {
    filter.status = statusParam;
  }

  // Type filter
  const typeParam = url.searchParams.get("type");
  if (typeParam && ["new", "renewal", "upgrade", "downgrade", "recruitment", "premium_posting", "featured_promotion", "exhibition", "bulk_hiring", "consulting", "custom"].includes(typeParam)) {
    filter.type = typeParam;
  }

  // Search (invoice number or employer name)
  const searchParam = url.searchParams.get("search");
  if (searchParam?.trim()) {
    const searchTerm = searchParam.trim();
    const searchRegex = new RegExp(escapeRegex(searchTerm), "i");
    const shouldExpandRelatedEntities = searchTerm.length >= 3;
    const [matchingEmployers, matchingJobs] = shouldExpandRelatedEntities
      ? await Promise.all([
          Employer.find({ companyName: searchRegex }).select("_id").limit(RELATED_ENTITY_SEARCH_LIMIT).lean(),
          Job.find({ title: searchRegex }).select("_id").limit(RELATED_ENTITY_SEARCH_LIMIT).lean(),
        ])
      : [[], []];

    const employerIds = matchingEmployers.map((employer) => employer._id);
    const jobIds = matchingJobs.map((job) => job._id);
    const searchConditions: InvoiceFilter[] = [
      { invoiceNumber: searchRegex },
      { "billingDetails.companyName": searchRegex },
      { description: searchRegex },
    ];

    if (employerIds.length > 0) {
      searchConditions.push({ employerId: { $in: employerIds } });
    }

    if (jobIds.length > 0) {
      searchConditions.push({ jobId: { $in: jobIds } });
    }

    appendSearchConditions(filter, searchConditions);
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
  // NOTE: Model.aggregate() does NOT auto-cast $match values the way find() does.
  // For employers the filter carries `userId` as a plain string, which would compare
  // against an ObjectId field and silently match nothing (summary returns all zeros
  // even though the invoice list is populated). Cast the filter through the schema
  // so string ids become ObjectIds before using it as the aggregation $match stage.
  const aggregationMatch = Invoice.find(filter).cast(Invoice) as Record<string, unknown>;
  const summaryAgg = await Invoice.aggregate([
    { $match: aggregationMatch },
    {
      $group: {
        _id: "$status",
        total: { $sum: "$totalAmount" },
        count: { $sum: 1 },
        taxTotal: { $sum: "$taxAmount" },
        paidTotal: { $sum: "$paidAmount" },
        balanceTotal: { $sum: "$balanceDue" },
      },
    },
  ]);

  const summary = {
    draft: 0, issued: 0, paid: 0, partially_paid: 0, overdue: 0, void: 0,
    totalAmount: 0, totalCount: 0, totalTax: 0, totalPaid: 0, totalBalance: 0,
  };
  for (const row of summaryAgg) {
    const s = row._id as string;
    if (s in summary) {
      (summary as Record<string, number>)[s] = row.total;
    }
    summary.totalAmount += row.total;
    summary.totalCount += row.count;
    summary.totalTax += row.taxTotal || 0;
    summary.totalPaid += row.paidTotal || 0;
    summary.totalBalance += row.balanceTotal || 0;
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
