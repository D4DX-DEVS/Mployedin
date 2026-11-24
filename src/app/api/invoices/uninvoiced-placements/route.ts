/**
 * GET /api/invoices/uninvoiced-placements
 *
 * Returns placements that do NOT have an active recruitment invoice yet.
 * Used by admin/super-agent to see the queue of billable placements.
 */

import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/withAuth";
import connectDB from "@/lib/db/mongoose";
import Placement from "@/models/Placement";
import Invoice from "@/models/Invoice";
import { INVOICE_TERMINAL_STATUSES } from "@/lib/invoices/status";
import { resolveCommissionRate, resolveOverrideRate } from "@/lib/commissions/resolveRate";
import type { DatedRate } from "@/lib/commissions/effectiveRate";
import type { UserRole } from "@/types/user";

interface AuthCtx { userId: string; role: UserRole; locale: string }

async function handler(req: NextRequest, ctx: AuthCtx) {
  if (!["admin", "super_agent"].includes(ctx.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await connectDB();

  const { searchParams } = new URL(req.url);
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1"));
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") ?? "25")));
  const skip = (page - 1) * limit;
  const search = searchParams.get("search")?.trim() ?? "";

  // Find all placement IDs that already have an active invoice line
  const invoices = await Invoice.find({
    category: "recruitment",
    status: { $nin: INVOICE_TERMINAL_STATUSES },
  })
    .select("jobId lineItems")
    .lean();

  // A hire is billed when an open invoice line names it. A job whose open
  // invoice bills a fee that names no hire counts as billed as a whole — its
  // people can't be told apart, and the API refuses a second invoice for it
  // (lib/invoices/hireBilling).
  const billedPlacementIds = new Set<string>();
  const jobsBilledUnnamed = new Set<string>();
  for (const invoice of invoices) {
    for (const line of invoice.lineItems ?? []) {
      if (line.placementId) billedPlacementIds.add(String(line.placementId));
      else if (line.chargeType !== "other" && invoice.jobId) jobsBilledUnnamed.add(String(invoice.jobId));
    }
  }

  // Build placement query
  const placementQuery: Record<string, unknown> = {};

  // Super-agent scoping: only placements from their agents
  if (ctx.role === "super_agent") {
    // Canonical scope (team ∪ region). Agent.find({ superAgentId }) missed
    // region-inherited agents, so placements the super-agent can see on
    // /super-agent/placements were absent from the invoice builder.
    const { getSuperAgentScope } = await import("@/lib/auth/agentRestrictions");
    const scope = await getSuperAgentScope(ctx.userId);
    if (!scope) return NextResponse.json({ error: "Super agent profile not found" }, { status: 404 });
    placementQuery.agentId = { $in: scope.effectiveAgentIds };
  }

  // Get all placements with populated data
  const allPlacements = await Placement.find(placementQuery)
    .populate("jobId", "title location salary currency")
    .populate("employerId", "companyName companyEmail phone address country taxId agentCommissionRates")
    .populate("jobSeekerId", "userId")
    .populate({ path: "jobSeekerId", populate: { path: "userId", select: "name email" } })
    .populate("agentId", "userId commissionRate")
    .populate({ path: "agentId", populate: { path: "userId", select: "name email" } })
    .populate("superAgentId", "userId overrideRate overrideRateHistory")
    .populate({ path: "superAgentId", populate: { path: "userId", select: "name" } })
    .sort({ placedAt: -1 })
    .lean();

  // Filter out already-invoiced placements (per placement, not per job)
  let uninvoiced = allPlacements.filter((p) => {
    const jobId = p.jobId && typeof p.jobId === "object" ? String((p.jobId as { _id: unknown })._id) : String(p.jobId);
    return !billedPlacementIds.has(String(p._id)) && !jobsBilledUnnamed.has(jobId);
  });

  // Text search on populated fields
  if (search) {
    const q = search.toLowerCase();
    uninvoiced = uninvoiced.filter((p) => {
      const job = p.jobId as { title?: string } | null;
      const emp = p.employerId as { companyName?: string } | null;
      const seeker = p.jobSeekerId as { userId?: { name?: string; email?: string } } | null;
      const agent = p.agentId as { userId?: { name?: string } } | null;
      return (
        job?.title?.toLowerCase().includes(q) ||
        emp?.companyName?.toLowerCase().includes(q) ||
        seeker?.userId?.name?.toLowerCase().includes(q) ||
        seeker?.userId?.email?.toLowerCase().includes(q) ||
        agent?.userId?.name?.toLowerCase().includes(q)
      );
    });
  }

  const total = uninvoiced.length;
  const paginated = uninvoiced.slice(skip, skip + limit);

  // Format for frontend — resolve effective commission rates including country overrides
  const items = await Promise.all(paginated.map(async (p) => {
    const job = p.jobId as { _id?: unknown; title?: string; salary?: number; currency?: string } | null;
    const emp = p.employerId as { _id?: unknown; companyName?: string; companyEmail?: string; phone?: string; address?: string; country?: string; taxId?: string; agentCommissionRates?: DatedRate[] } | null;
    const seeker = p.jobSeekerId as { userId?: { name?: string; email?: string } } | null;
    const agent = p.agentId as { _id?: unknown; userId?: { name?: string; email?: string }; commissionRate?: number } | null;
    const superAgent = p.superAgentId as { _id?: unknown; userId?: { name?: string }; overrideRate?: number; overrideRateHistory?: DatedRate[] } | null;

    const employerCountry = emp?.country ?? null;
    const rawAgentRate = agent?.commissionRate ?? 0;
    const rawSARate = superAgent?.overrideRate ?? 0;

    // Resolve rates with country overrides (same logic as invoice creation)
    const resolvedAgentRate = agent
      ? (await resolveCommissionRate(rawAgentRate, employerCountry, { history: emp?.agentCommissionRates })).rate
      : 0;
    const resolvedSARate = superAgent
      ? (await resolveOverrideRate(rawSARate, employerCountry, { history: superAgent.overrideRateHistory })).rate
      : 0;

    return {
      _id: String(p._id),
      placedAt: p.placedAt,
      startDate: p.startDate,
      salary: p.salary,
      currency: p.currency ?? "AED",
      jobId: job?._id ? String(job._id) : null,
      jobTitle: job?.title ?? "—",
      jobSalary: job?.salary,
      jobCurrency: job?.currency,
      employerId: emp?._id ? String(emp._id) : null,
      employerName: emp?.companyName ?? "—",
      employerEmail: emp?.companyEmail,
      employerCountry: emp?.country,
      employerTaxId: emp?.taxId,
      candidateName: seeker?.userId?.name ?? "—",
      candidateEmail: seeker?.userId?.email,
      agentId: agent?._id ? String(agent._id) : null,
      agentName: agent?.userId?.name ?? "—",
      agentRate: resolvedAgentRate,
      superAgentId: superAgent?._id ? String(superAgent._id) : null,
      superAgentName: superAgent?.userId?.name ?? null,
      superAgentRate: resolvedSARate,
      visaStatus: p.visaStatus ?? "pending",
    };
  }));

  return NextResponse.json({
    placements: items,
    total,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
  }, {
    headers: { "Cache-Control": "private, max-age=30, stale-while-revalidate=60" },
  });
}

export const GET = withAuth(handler, { resource: "invoices", action: "read" });
