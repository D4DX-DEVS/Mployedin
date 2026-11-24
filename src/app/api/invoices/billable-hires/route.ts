/**
 * Hires an agent can bill (docs/plans/2026-11-24-agent-invoice-hires-target.md, T1).
 *
 * GET /api/invoices/billable-hires?jobId=<id>
 *   → { job, wanted, hired, billed, ready, hires[], missingHireRecords[] }
 *   hires = the job's hired candidates that have a hire record (Placement);
 *   billedOn names the open invoice already billing one (lib/invoices/hireBilling).
 *   missingHireRecords = hired candidates whose hire record never got saved.
 * GET /api/invoices/billable-hires?page=&pageSize=
 *   → { data, page, pageSize, total, totalPages }: jobs with at least one hire
 *   ready to bill, newest hire first.
 *
 * Scope = who may invoice the job (as POST /api/invoices/recruitment):
 * agent = jobs whose agent is them; super agent = jobs of their agents
 * (team ∪ region, getSuperAgentScope); admin = all. Out-of-scope → 404.
 */

import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { withAuth } from "@/lib/auth/withAuth";
import connectDB from "@/lib/db/mongoose";
import Job from "@/models/Job";
import Placement from "@/models/Placement";
import Application from "@/models/Application";
import Invoice from "@/models/Invoice";
import Agent from "@/models/Agent";
import { getSuperAgentScope } from "@/lib/auth/agentRestrictions";
import { findBilledPlacements } from "@/lib/invoices/hireBilling";
import { INVOICE_TERMINAL_STATUSES } from "@/lib/invoices/status";
import type { UserRole } from "@/types/user";

interface AuthCtx { userId: string; role: UserRole; locale: string }

type Id = mongoose.Types.ObjectId;
interface LeanJob { _id: Id; title: string; status: string; vacancies?: number; agentId?: Id; employerId?: { _id: Id; companyName?: string } | null }
interface LeanPlacement { _id: Id; jobId: Id; applicationId?: Id; placedAt: Date; startDate?: Date | null }
interface Seeker { userId?: { name?: string } | null }

const PAGE_SIZES = [10, 20, 50, 100];
const SEEKER_NAME = { path: "jobSeekerId", select: "userId", populate: { path: "userId", select: "name" } };
const nameOf = (seeker: unknown) => (seeker as Seeker | null)?.userId?.name ?? "Unknown candidate";

/** null = every job; otherwise the Agent ids whose jobs the caller may invoice. */
async function agentScope(ctx: AuthCtx): Promise<Id[] | null> {
  if (ctx.role === "admin") return null;
  if (ctx.role === "agent") {
    const agent = await Agent.findOne({ userId: ctx.userId }).select("_id").lean();
    return agent ? [agent._id as Id] : [];
  }
  const scope = await getSuperAgentScope(ctx.userId);
  return (scope?.effectiveAgentIds ?? []).map((id) => new mongoose.Types.ObjectId(String(id)));
}

const inScope = (scope: Id[] | null, agentId?: Id) =>
  scope === null || (!!agentId && scope.some((id) => String(id) === String(agentId)));

/** Last fee per hire billed to this employer for a job with the same title, or null. */
async function lastFeeHint(employerId: Id | undefined, title: string): Promise<number | null> {
  if (!employerId) return null;
  const invoices = (await Invoice.find({
    category: "recruitment",
    employerId,
    status: { $nin: [...INVOICE_TERMINAL_STATUSES] },
    "lineItems.placementId": { $ne: null },
  })
    .sort({ createdAt: -1 })
    .limit(20)
    .select("jobId lineItems")
    .lean()) as Array<{ jobId?: Id; lineItems?: Array<{ placementId?: Id; unitPrice?: number; amount?: number; chargeType?: string }> }>;
  if (!invoices.length) return null;
  const jobs = await Job.find({ _id: { $in: invoices.flatMap((i) => (i.jobId ? [i.jobId] : [])) } }).select("title").lean();
  const titleOf = new Map(jobs.map((j) => [String(j._id), String(j.title ?? "").trim().toLowerCase()]));
  const wanted = title.trim().toLowerCase();
  for (const inv of invoices) {
    if (titleOf.get(String(inv.jobId)) !== wanted) continue;
    const line = (inv.lineItems ?? []).find((l) => l.placementId && l.chargeType !== "other");
    if (line) return line.unitPrice ?? line.amount ?? null;
  }
  return null;
}

async function singleJob(ctx: AuthCtx, jobId: string) {
  if (!mongoose.isValidObjectId(jobId)) return NextResponse.json({ error: "Invalid job" }, { status: 400 });
  const job = (await Job.findOne({ _id: jobId, deletedAt: null })
    .select("title status vacancies agentId employerId")
    .populate("employerId", "companyName")
    .lean()) as LeanJob | null;
  if (!job || !inScope(await agentScope(ctx), job.agentId)) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  const [apps, placements, feeHint] = await Promise.all([
    Application.find({ jobId: job._id, status: "hired" }).select("_id jobSeekerId").populate(SEEKER_NAME).lean() as Promise<Array<{ _id: Id; jobSeekerId?: unknown }>>,
    Placement.find({ jobId: job._id }).select("_id jobId applicationId placedAt startDate").lean() as Promise<LeanPlacement[]>,
    lastFeeHint(job.employerId?._id, job.title),
  ]);
  const billed = await findBilledPlacements(placements.map((p) => String(p._id)));
  const placementByApp = new Map(placements.map((p) => [String(p.applicationId), p]));

  const hires = [];
  const missingHireRecords = [];
  for (const app of apps) {
    const placement = placementByApp.get(String(app._id));
    const name = nameOf(app.jobSeekerId);
    if (!placement) {
      missingHireRecords.push({ applicationId: String(app._id), name });
      continue;
    }
    const invoiceNumber = billed.get(String(placement._id));
    hires.push({
      placementId: String(placement._id),
      name,
      placedAt: placement.placedAt,
      startDate: placement.startDate ?? null,
      billedOn: invoiceNumber ? { invoiceNumber } : null,
      lastFeeHint: feeHint,
    });
  }
  const billedCount = hires.filter((h) => h.billedOn).length;

  return NextResponse.json({
    job: {
      id: String(job._id),
      title: job.title,
      employerId: job.employerId ? String(job.employerId._id) : null,
      employerName: job.employerId?.companyName ?? null,
      status: job.status,
    },
    wanted: job.vacancies ?? null,
    hired: apps.length,
    billed: billedCount,
    ready: hires.length - billedCount,
    hires,
    missingHireRecords,
  });
}

async function readyList(req: NextRequest, ctx: AuthCtx) {
  const { searchParams } = new URL(req.url);
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10) || 1);
  const requested = parseInt(searchParams.get("pageSize") ?? "20", 10);
  const pageSize = PAGE_SIZES.includes(requested) ? requested : 20;

  const scope = await agentScope(ctx);
  const empty = { data: [], page, pageSize, total: 0, totalPages: 0 };
  if (scope !== null && !scope.length) return NextResponse.json(empty);

  // Every hire on an in-scope job; then keep the hired, unbilled ones.
  const jobFilter: Record<string, unknown> = { deletedAt: null };
  if (scope !== null) jobFilter.agentId = { $in: scope };
  const jobIds = (await Job.find(jobFilter).select("_id").lean()).map((j) => j._id as Id);
  if (!jobIds.length) return NextResponse.json(empty);
  const placements = (await Placement.find({ jobId: { $in: jobIds } })
    .select("_id jobId applicationId placedAt")
    .lean()) as LeanPlacement[];
  if (!placements.length) return NextResponse.json(empty);

  const [hiredApps, billed] = await Promise.all([
    Application.find({ _id: { $in: placements.flatMap((p) => (p.applicationId ? [p.applicationId] : [])) }, status: "hired" }).select("_id").lean(),
    findBilledPlacements(placements.map((p) => String(p._id))),
  ]);
  const hiredAppIds = new Set(hiredApps.map((a) => String(a._id)));

  const byJob = new Map<string, { hires: LeanPlacement[]; billed: number; latest: number }>();
  for (const p of placements) {
    if (!hiredAppIds.has(String(p.applicationId))) continue;
    const entry = byJob.get(String(p.jobId)) ?? { hires: [], billed: 0, latest: 0 };
    if (billed.has(String(p._id))) entry.billed += 1;
    else {
      entry.hires.push(p);
      entry.latest = Math.max(entry.latest, new Date(p.placedAt).getTime());
    }
    byJob.set(String(p.jobId), entry);
  }
  const ready = [...byJob.entries()].filter(([, e]) => e.hires.length > 0).sort((a, b) => b[1].latest - a[1].latest);
  const total = ready.length;
  const pageRows = ready.slice((page - 1) * pageSize, page * pageSize);
  if (!pageRows.length) return NextResponse.json({ ...empty, total, totalPages: Math.ceil(total / pageSize) });

  const pageJobIds = pageRows.map(([id]) => new mongoose.Types.ObjectId(id));
  const [jobs, hiredCounts, named] = await Promise.all([
    Job.find({ _id: { $in: pageJobIds } }).select("title status vacancies employerId").populate("employerId", "companyName").lean() as Promise<LeanJob[]>,
    Application.aggregate<{ _id: Id; n: number }>([
      { $match: { jobId: { $in: pageJobIds }, status: "hired" } },
      { $group: { _id: "$jobId", n: { $sum: 1 } } },
    ]),
    Placement.find({ _id: { $in: pageRows.flatMap(([, e]) => e.hires.map((h) => h._id)) } }).select("_id jobSeekerId").populate(SEEKER_NAME).lean() as Promise<Array<{ _id: Id; jobSeekerId?: unknown }>>,
  ]);
  const jobById = new Map(jobs.map((j) => [String(j._id), j]));
  const hiredByJob = new Map(hiredCounts.map((c) => [String(c._id), c.n]));
  const nameByPlacement = new Map(named.map((p) => [String(p._id), nameOf(p.jobSeekerId)]));

  const data = pageRows.map(([jobId, entry]) => {
    const job = jobById.get(jobId);
    return {
      jobId,
      title: job?.title ?? "",
      employerName: job?.employerId?.companyName ?? null,
      jobStatus: job?.status ?? null,
      wanted: job?.vacancies ?? null,
      hired: hiredByJob.get(jobId) ?? entry.hires.length + entry.billed,
      billed: entry.billed,
      ready: entry.hires.length,
      readyHires: entry.hires
        .sort((a, b) => new Date(b.placedAt).getTime() - new Date(a.placedAt).getTime())
        .map((h) => ({ placementId: String(h._id), name: nameByPlacement.get(String(h._id)) ?? "Unknown candidate", placedAt: h.placedAt })),
    };
  });

  return NextResponse.json({ data, page, pageSize, total, totalPages: Math.ceil(total / pageSize) });
}

async function handler(req: NextRequest, ctx: AuthCtx) {
  if (!["admin", "super_agent", "agent"].includes(ctx.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  await connectDB();
  const jobId = new URL(req.url).searchParams.get("jobId");
  return jobId ? singleJob(ctx, jobId) : readyList(req, ctx);
}

export const GET = withAuth(handler, { resource: "invoices", action: "read" });
