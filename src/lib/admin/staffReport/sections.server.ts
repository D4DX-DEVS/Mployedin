import "server-only";
import mongoose from "mongoose";
import { Employer } from "@/models/Employer";
import { Job } from "@/models/Job";
import { Application } from "@/models/Application";
import { Placement } from "@/models/Placement";
import { Invoice } from "@/models/Invoice";
import { Subscription } from "@/models/Subscription";
import ExhibitionRequest from "@/models/ExhibitionRequest";
import { Commission } from "@/models/Commission";
import { User } from "@/models/User";
import AgentTask, { type AgentTaskStatus } from "@/models/AgentTask";
import { NON_REVENUE_INVOICE_STATUSES } from "@/lib/invoices/status";
import { foldMoney, mergeMoney, sumByCurrency } from "./rules";
import type {
  Capped, CommissionRow, EmployerRow, ExhibitionRow, InvoiceRow, JobRow, MoneyByStatus, Money, TaskRow,
} from "./types";

type Id = mongoose.Types.ObjectId;
const DAY = 86_400_000;
const str = (v: unknown) => (v == null ? "" : String(v));
const iso = (d: unknown) => (d ? new Date(d as string).toISOString() : undefined);

/** Who and what a report counts (plan v2 → counting rules). */
export interface Scope {
  kind: "agent" | "super_agent";
  /** Super agent profile id (super agents only). */
  saId?: Id;
  /** Agent profile ids: the agent, or the super agent's team. */
  agentIds: Id[];
  agentUserIds: Id[];
  /** Employers held: assigned to, or created by, those agents. Region-only employers are left out. */
  employerIds: Id[];
  /** Agent profile id → name, for "agent" columns. */
  agentNames: Map<string, string>;
  /** Employer id → holding agent's profile id. */
  employerAgent: Map<string, string>;
  /** Mongo date condition for the range. */
  inRange: Record<string, Date>;
  now: Date;
}

const ROW_CAP = 100;
const cap = <T>(rows: T[], n = ROW_CAP): Capped<T> => ({ rows: rows.slice(0, n), total: rows.length });

// ─── Jobs, applications, hires ──────────────────────────────────────────────

export async function jobsSection(s: Scope) {
  const owner = { $or: [{ agentId: { $in: s.agentIds } }, { employerId: { $in: s.employerIds } }] };
  const jobs = await Job.find({ deletedAt: null, ...owner })
    .select("_id title status employerId agentId createdAt").sort({ createdAt: -1 }).lean();
  const jobIds = jobs.map((j) => j._id as Id);
  const inRangeIds = new Set(
    jobs.filter((j) => matchesRange(j.createdAt as Date | undefined, s.inRange)).map((j) => str(j._id)),
  );
  const d30 = new Date(s.now.getTime() - 30 * DAY);

  const [appsByJobStatus, hiresByJob, appsLast30, placements] = await Promise.all([
    Application.aggregate<{ _id: { j: Id; s: string }; n: number }>([
      { $match: { jobId: { $in: jobIds }, createdAt: s.inRange } },
      { $group: { _id: { j: "$jobId", s: "$status" }, n: { $sum: 1 } } },
    ]),
    Application.aggregate<{ _id: Id; n: number }>([
      { $match: { jobId: { $in: jobIds }, status: "hired", statusHistory: { $elemMatch: { status: "hired", changedAt: s.inRange } } } },
      { $group: { _id: "$jobId", n: { $sum: 1 } } },
    ]),
    Application.countDocuments({ jobId: { $in: jobIds }, createdAt: { $gte: d30 } }),
    Placement.countDocuments({
      $or: [{ agentId: { $in: s.agentIds } }, { employerId: { $in: s.employerIds } }],
      placedAt: s.inRange,
    }),
  ]);

  const funnel: Record<string, number> = {};
  const appsByJob = new Map<string, number>();
  let applications = 0;
  for (const r of appsByJobStatus) {
    funnel[r._id.s] = (funnel[r._id.s] ?? 0) + r.n;
    appsByJob.set(str(r._id.j), (appsByJob.get(str(r._id.j)) ?? 0) + r.n);
    applications += r.n;
  }
  const hiresMap = new Map(hiresByJob.map((r) => [str(r._id), r.n]));
  const hired = hiresByJob.reduce((a, r) => a + r.n, 0);

  // Per-employer roll-up for the Employers tab.
  const perEmployer = new Map<string, { jobs: number; active: number; apps: number; hires: number }>();
  for (const j of jobs) {
    const k = str(j.employerId);
    const e = perEmployer.get(k) ?? { jobs: 0, active: 0, apps: 0, hires: 0 };
    if (inRangeIds.has(str(j._id))) e.jobs += 1;
    if (j.status === "active") e.active += 1;
    e.apps += appsByJob.get(str(j._id)) ?? 0;
    e.hires += hiresMap.get(str(j._id)) ?? 0;
    perEmployer.set(k, e);
  }

  const rangeJobs = jobs.filter((j) => inRangeIds.has(str(j._id)));
  const employerNames = await nameEmployers(rangeJobs.slice(0, ROW_CAP).map((j) => j.employerId as Id));
  const jobRows: JobRow[] = rangeJobs.map((j) => ({
    id: str(j._id),
    title: j.title,
    employerName: employerNames.get(str(j.employerId)) ?? "—",
    agentName: s.agentNames.get(str(j.agentId)) ?? s.agentNames.get(s.employerAgent.get(str(j.employerId)) ?? "") ?? "—",
    status: String(j.status),
    applications: appsByJob.get(str(j._id)) ?? 0,
    hires: hiresMap.get(str(j._id)) ?? 0,
    createdAt: iso(j.createdAt),
  }));

  return {
    tiles: {
      jobs: {
        posted: rangeJobs.length,
        active: jobs.filter((j) => j.status === "active").length,
        closed: rangeJobs.filter((j) => ["closed", "filled", "expired"].includes(String(j.status))).length,
      },
      applications,
      hires: { hired, placements },
    },
    funnel,
    jobRows: cap(jobRows),
    perEmployer,
    activeJobs: jobs.filter((j) => j.status === "active").length,
    appsLast30,
    applicationsTotal: applications,
  };
}

function matchesRange(d: Date | undefined, inRange: Record<string, Date>): boolean {
  if (!d) return false;
  const t = new Date(d).getTime();
  if (inRange.$gte && t < inRange.$gte.getTime()) return false;
  if (inRange.$lte && t > inRange.$lte.getTime()) return false;
  return true;
}

async function nameEmployers(ids: Id[]): Promise<Map<string, string>> {
  const uniq = [...new Set(ids.map(String))].filter(Boolean);
  if (!uniq.length) return new Map();
  const rows = await Employer.find({ _id: { $in: uniq } }).select("companyName").lean();
  return new Map(rows.map((e) => [str(e._id), e.companyName]));
}

// ─── Employers + subscriptions ──────────────────────────────────────────────

export async function employersSection(
  s: Scope,
  perEmployer: Map<string, { jobs: number; active: number; apps: number; hires: number }>,
) {
  const employers = await Employer.find({ _id: { $in: s.employerIds } })
    .select("companyName isActive userId agentId").lean();
  const subs = await Subscription.find({ userId: { $in: employers.map((e) => e.userId) }, status: "active" })
    .select("userId status endDate planSnapshot.name").sort({ endDate: -1 }).lean();
  const subByUser = new Map<string, (typeof subs)[number]>();
  for (const sub of subs) if (!subByUser.has(str(sub.userId))) subByUser.set(str(sub.userId), sub);

  // Agent holding each employer: Employer.agentId first, else whichever agent has it assigned.
  const rows: EmployerRow[] = employers.map((e) => {
    const st = perEmployer.get(str(e._id));
    const sub = subByUser.get(str(e.userId));
    return {
      id: str(e._id),
      companyName: e.companyName,
      agentName: s.agentNames.get(str(e.agentId)) ?? s.agentNames.get(s.employerAgent.get(str(e._id)) ?? "") ?? "—",
      isActive: e.isActive !== false,
      jobs: st?.jobs ?? 0,
      activeJobs: st?.active ?? 0,
      applications: st?.apps ?? 0,
      hires: st?.hires ?? 0,
      plan: sub?.planSnapshot?.name ?? null,
      planStatus: sub?.status ?? null,
      renewsAt: iso(sub?.endDate) ?? null,
    };
  }).sort((a, b) => b.activeJobs - a.activeJobs || b.applications - a.applications);

  const soon = s.now.getTime() + 14 * DAY;
  return {
    rows: cap(rows),
    activeSubscriptions: rows.filter((r) => r.plan).length,
    endingSoon: rows.filter((r) => r.renewsAt && new Date(r.renewsAt).getTime() <= soon).length,
    withoutSubscription: rows.filter((r) => r.isActive && !r.plan).length,
    withoutActiveJob: rows.filter((r) => r.isActive && r.activeJobs === 0).length,
    total: rows.length,
  };
}

// ─── Invoices + receivables ─────────────────────────────────────────────────

const NOT_RAISED = ["draft", "pending_approval", ...NON_REVENUE_INVOICE_STATUSES];
const COLLECTIBLE = ["issued", "sent", "partially_paid", "overdue"];

export async function invoicesSection(s: Scope) {
  const owner = { $or: [{ employerId: { $in: s.employerIds } }, { agentId: { $in: s.agentIds } }] };
  const issuedInRange = {
    $or: [{ issuedAt: s.inRange }, { issuedAt: { $exists: false }, createdAt: s.inRange }, { issuedAt: null, createdAt: s.inRange }],
  };
  const fields = "invoiceNumber employerId agentId issuedAt createdAt dueDate totalAmount amount paidAmount balanceDue currency status billingDetails.companyName";
  const [raised, outstanding] = await Promise.all([
    Invoice.find({ $and: [owner, issuedInRange, { status: { $nin: NOT_RAISED } }] }).select(fields).sort({ issuedAt: -1, createdAt: -1 }).lean(),
    Invoice.find({ $and: [owner, { status: { $in: COLLECTIBLE }, balanceDue: { $gt: 0 } }] }).select("balanceDue currency dueDate status").lean(),
  ]);
  const isOverdue = (i: { status?: string; dueDate?: Date | null }) =>
    i.status === "overdue" || (i.dueDate ? new Date(i.dueDate).getTime() < s.now.getTime() : false);

  const names = await nameEmployers(raised.slice(0, ROW_CAP).map((i) => i.employerId as Id));
  const rows: InvoiceRow[] = raised.map((i) => {
    const amount = Number(i.totalAmount ?? i.amount ?? 0);
    const balance = COLLECTIBLE.includes(String(i.status)) ? Number(i.balanceDue ?? 0) : 0;
    const billing = (i as { billingDetails?: { companyName?: string } }).billingDetails;
    return {
      id: str(i._id),
      number: i.invoiceNumber,
      employerName: names.get(str(i.employerId)) ?? billing?.companyName ?? "—",
      agentName: s.agentNames.get(str(i.agentId)) ?? s.agentNames.get(s.employerAgent.get(str(i.employerId)) ?? "") ?? "—",
      issuedAt: iso(i.issuedAt ?? i.createdAt),
      dueDate: iso(i.dueDate),
      amount,
      paid: Number(i.paidAmount ?? 0),
      balance,
      currency: i.currency || "AED",
      status: String(i.status),
      overdue: balance > 0 && isOverdue(i),
    };
  }).sort((a, b) => Number(b.overdue) - Number(a.overdue));

  const overdueItems = outstanding.filter(isOverdue);
  return {
    tile: { count: rows.length, totals: sumByCurrency(rows.map((r) => ({ currency: r.currency, amount: r.amount }))) },
    receivables: {
      due: sumByCurrency(outstanding.map((i) => ({ currency: i.currency, amount: Number(i.balanceDue ?? 0) }))),
      overdue: sumByCurrency(overdueItems.map((i) => ({ currency: i.currency, amount: Number(i.balanceDue ?? 0) }))),
      overdueCount: overdueItems.length,
    },
    rows: cap(rows),
  };
}

// ─── Exhibitions ────────────────────────────────────────────────────────────

export async function exhibitionsSection(s: Scope) {
  const who: Record<string, unknown>[] = [{ agentId: { $in: s.agentIds } }];
  if (s.saId) who.push({ superAgentId: s.saId });
  const docs = await ExhibitionRequest.find({ $or: who, status: { $ne: "draft" }, createdAt: s.inRange })
    .select("eventName eventLocation eventStartDate eventEndDate status agentId approvedBudget estimatedBudget budgetCurrency")
    .sort({ eventStartDate: -1, createdAt: -1 }).lean();
  const byStatus: Record<string, number> = {};
  for (const d of docs) byStatus[d.status] = (byStatus[d.status] ?? 0) + 1;
  const rows: ExhibitionRow[] = docs.map((d) => ({
    id: str(d._id),
    name: d.eventName,
    agentName: s.agentNames.get(str(d.agentId)) ?? "—",
    location: d.eventLocation ?? "",
    startDate: iso(d.eventStartDate),
    endDate: iso(d.eventEndDate),
    status: d.status,
    budget: Number(d.approvedBudget ?? d.estimatedBudget ?? 0),
    currency: d.budgetCurrency || "AED",
  }));
  return { tile: { total: docs.length, byStatus }, rows: cap(rows, 50) };
}

// ─── Commission ─────────────────────────────────────────────────────────────

async function grouped(match: Record<string, unknown>): Promise<MoneyByStatus[]> {
  const rows = await Commission.aggregate<{ _id: { c: string; s: string }; amount: number; n: number }>([
    { $match: match },
    { $group: { _id: { c: { $ifNull: ["$currency", "AED"] }, s: "$status" }, amount: { $sum: "$amount" }, n: { $sum: 1 } } },
  ]);
  return foldMoney(rows.map((r) => ({ currency: r._id.c, status: r._id.s, amount: r.amount, n: r.n })));
}

/**
 * Commission (owner 2026-11-24): a super agent's override lines and their
 * agents' lines together, each labelled with who earns it. Beneficiary rule:
 * override lines belong to the super agent; placement/bonus lines to the agent
 * (their `superAgentId` is for oversight only).
 */
export async function commissionSection(s: Scope, ownName: string) {
  const agentLines = { agentId: { $in: s.agentIds }, type: { $in: ["placement", "bonus"] } };
  const ownMatch = s.kind === "super_agent" ? { superAgentId: s.saId, type: "override" } : agentLines;
  const teamMatch = s.kind === "super_agent" ? agentLines : null;
  const either = teamMatch ? { $or: [ownMatch, teamMatch] } : ownMatch;
  const stale = new Date(s.now.getTime() - 30 * DAY);

  const [own, team, lines, ownState] = await Promise.all([
    grouped({ ...ownMatch, createdAt: s.inRange }),
    teamMatch ? grouped({ ...teamMatch, createdAt: s.inRange }) : Promise.resolve([] as MoneyByStatus[]),
    Commission.find({ ...either, createdAt: s.inRange }).sort({ createdAt: -1 }).limit(ROW_CAP)
      .select("type amount currency status createdAt agentId").lean(),
    Commission.aggregate<{ _id: string; n: number; stale: number }>([
      { $match: { ...ownMatch, status: { $in: ["pending", "approved", "disputed"] } } },
      { $group: { _id: "$status", n: { $sum: 1 }, stale: { $sum: { $cond: [{ $lt: ["$createdAt", stale] }, 1, 0] } } } },
    ]),
  ]);
  const total = own.concat(team).reduce((a, m) => a + m.count, 0);
  const rows: CommissionRow[] = lines.map((c) => {
    const isOwn = s.kind === "super_agent" ? c.type === "override" : true;
    return {
      id: str(c._id),
      earnedBy: isOwn ? ownName : s.agentNames.get(str(c.agentId)) ?? "—",
      earner: isOwn ? s.kind : "agent",
      type: c.type,
      amount: c.amount,
      currency: c.currency || "AED",
      status: c.status,
      createdAt: iso(c.createdAt),
    };
  });
  const st = new Map(ownState.map((r) => [r._id, r]));
  return {
    own, team, combined: mergeMoney(own, team),
    lines: { rows, total } as Capped<CommissionRow>,
    disputed: (st.get("disputed")?.n ?? 0) > 0,
    approvedUnpaid: (st.get("approved")?.n ?? 0) > 0,
    stalePending: st.get("pending")?.stale ?? 0,
  };
}

// ─── Tasks ──────────────────────────────────────────────────────────────────

export async function tasksSection(userId: Id, now: Date) {
  const notWithdrawn = { status: { $ne: "cancelled" as AgentTaskStatus } };
  const OPEN: AgentTaskStatus[] = ["pending", "in_progress"];
  const open = { status: { $in: OPEN } };
  const [openCount, overdue, toRows, byRows] = await Promise.all([
    AgentTask.countDocuments({ userId, ...open }),
    AgentTask.countDocuments({ userId, ...open, dueDate: { $lt: now } }),
    AgentTask.find({ userId, ...notWithdrawn }).sort({ status: 1, dueDate: 1 }).limit(40)
      .select("title status priority dueDate assignedBy.userId").lean(),
    AgentTask.find({ "assignedBy.userId": userId, ...notWithdrawn }).sort({ createdAt: -1 }).limit(40)
      .select("title status priority dueDate userId").lean(),
  ]);
  const people = [...toRows.map((t) => t.assignedBy?.userId), ...byRows.map((t) => t.userId)].filter(Boolean) as Id[];
  const users = people.length ? await User.find({ _id: { $in: people } }).select("name").lean() : [];
  const nameOf = new Map(users.map((u) => [str(u._id), u.name ?? ""]));
  const isOpen = (st: string) => st === "pending" || st === "in_progress";
  const toTask = (t: { _id: unknown; title: string; status: string; priority: string; dueDate?: Date | null }, direction: "to" | "by", other: unknown): TaskRow => ({
    id: str(t._id), title: t.title, status: t.status, priority: t.priority, dueDate: iso(t.dueDate) ?? null,
    direction, otherPerson: other ? nameOf.get(str(other)) || "—" : "—",
    overdue: isOpen(t.status) && !!t.dueDate && new Date(t.dueDate).getTime() < now.getTime(),
  });
  const rows = [
    ...toRows.map((t) => toTask(t, "to", t.assignedBy?.userId)),
    ...byRows.map((t) => toTask(t, "by", t.userId)),
  ].sort((a, b) => Number(b.overdue) - Number(a.overdue) || Number(isOpen(b.status)) - Number(isOpen(a.status)));
  return { open: openCount, overdue, rows: { rows: rows.slice(0, 50), total: rows.length } };
}

export function moneyTotal(rows: Money[]): number {
  return rows.reduce((a, m) => a + m.amount, 0);
}
