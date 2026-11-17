import mongoose from "mongoose";
import AgentTask, { CLOSED_TASK_STATUSES, type AgentTaskAssigneeRole, type IAgentTask } from "@/models/AgentTask";
import User from "@/models/User";
import { escapeRegex } from "@/lib/security/sanitize";
import { assigneeRoleOf, canActOnTask, visibleGivenFilter, type AssignerCtx } from "./assigned";
import { resolveTaskLinks, type ResolvedTaskLinks } from "./links";

type Id = mongoose.Types.ObjectId;
type TaskDoc = IAgentTask & { _id: Id };

export interface AssignedListParams {
  status?: string;
  reviewStatus?: string;
  /** Narrow to one assignee (inside the caller's scope; never widens it). */
  agentUserId?: string;
  search?: string;
  /** "me": tasks this caller gave (or that were routed through them); "all": everything they can see. */
  giver?: string;
  page: number;
  limit: number;
}

/** One person's copy, as the giver's list shows it. */
export interface GivenTaskRow {
  _id: string;
  title: string;
  description?: string;
  priority: string;
  status: string;
  reviewStatus: string;
  dueDate?: Date;
  completionNote?: string;
  reviewComment?: string;
  reviewedAt?: Date;
  createdAt?: Date;
  agentUserId: string;
  agentName: string;
  assigneeRole: AgentTaskAssigneeRole;
  /** False when the person was deactivated: the giver should give it to someone else. */
  assigneeActive: boolean;
  assignedByName: string;
  assignedByRole?: string;
  managedByName?: string;
  links?: { candidate?: string; job?: string; employer?: string };
  reviewRequired: boolean;
  groupId?: string;
  /** May review / withdraw / reassign / edit (rule: giver, routed-through on team, or admin). */
  canAct: boolean;
  canReview: boolean;
}

export interface GivenGroupSummary {
  id: string;
  size: number;
  /** Closed as done (approved, or done with review off). */
  done: number;
  withdrawn: number;
  /** Waiting for the giver (reported done or failed). */
  needsYou: number;
  members: GivenTaskRow[];
}

export type GivenListRow = GivenTaskRow & { group?: GivenGroupSummary };

const isDone = (t: { status: string; reviewStatus?: string }) =>
  t.status === "completed" && t.reviewStatus !== "awaiting_review";

function linkNames(resolved: ResolvedTaskLinks | undefined) {
  if (!resolved) return undefined;
  const out = { candidate: resolved.candidate?.name || undefined, job: resolved.job?.title || undefined, employer: resolved.employer?.name || undefined };
  return out.candidate || out.job || out.employer ? out : undefined;
}

const EMPTY_STATS = { open: 0, awaitingReview: 0, returned: 0, approved: 0, overdue: 0, needsYou: 0 };

/**
 * "Tasks I gave": one row per task, where a task given to several people is
 * ONE row carrying every copy (progress "2 of 4 done"). Filters pick which
 * rows show; a group row always counts all its visible copies. Paginated by row.
 */
export async function listAssignedTasks(ctx: AssignerCtx, p: AssignedListParams) {
  const empty = { total: 0, page: p.page, totalPages: 1, items: [] as GivenListRow[], stats: { ...EMPTY_STATS } };
  const visible = await visibleGivenFilter(ctx);
  if (!visible) return empty;
  const me = new mongoose.Types.ObjectId(ctx.userId);

  // "me": what this caller is answerable for. Admin defaults to it (several
  // admins share the pool); a super agent defaults to everything they see.
  const giver = p.giver === "me" || p.giver === "all" ? p.giver : ctx.role === "admin" ? "me" : "all";
  const mine = { $or: [{ "assignedBy.userId": me }, { managedBy: me }] };
  const base: Record<string, unknown> = giver === "me"
    ? { $and: [visible.filter, mine] }
    : visible.filter;

  const filter: Record<string, unknown> = { ...base };
  if (p.agentUserId) {
    if (!mongoose.isValidObjectId(p.agentUserId)) return empty;
    filter.userId = new mongoose.Types.ObjectId(p.agentUserId);
  }
  if (p.status === "open") filter.status = { $nin: CLOSED_TASK_STATUSES };
  else if (["pending", "in_progress", "completed", "failed", "cancelled"].includes(p.status ?? "")) filter.status = p.status;
  else if (p.status === "overdue") {
    filter.status = { $nin: CLOSED_TASK_STATUSES };
    filter.dueDate = { $ne: null, $lt: new Date() };
  }
  if (p.reviewStatus === "awaiting_review" || p.reviewStatus === "approved" || p.reviewStatus === "returned") {
    filter.reviewStatus = p.reviewStatus;
  }
  if (p.search) filter.title = { $regex: escapeRegex(p.search), $options: "i" };

  const rowKey = { $ifNull: ["$groupId", "$_id"] };
  const [keyRows, countRows, stats] = await Promise.all([
    AgentTask.aggregate<{ _id: Id }>([
      { $match: filter },
      { $group: { _id: rowKey, lastAt: { $max: "$createdAt" } } },
      { $sort: { lastAt: -1, _id: -1 } },
      { $skip: (p.page - 1) * p.limit },
      { $limit: p.limit },
    ]),
    AgentTask.aggregate<{ n: number }>([{ $match: filter }, { $group: { _id: rowKey } }, { $count: "n" }]),
    givenStats(ctx, base, visible.team),
  ]);
  const total = countRows[0]?.n ?? 0;
  const keys = keyRows.map((r) => r._id);
  if (keys.length === 0) return { ...empty, total, totalPages: Math.max(Math.ceil(total / p.limit), 1), stats };

  // Every visible copy of each row (not only the filtered ones): progress counts all.
  const docs = await AgentTask.find({ $and: [visible.filter, { $or: [{ _id: { $in: keys } }, { groupId: { $in: keys } }] }] })
    .sort({ createdAt: 1 })
    .limit(keys.length * 100)
    .lean<TaskDoc[]>();

  const userIds = [...new Set(docs.flatMap((t) => [String(t.userId), String(t.assignedBy?.userId ?? ""), String(t.managedBy ?? "")]).filter(Boolean))];
  const users = userIds.length
    ? await User.find({ _id: { $in: userIds } }).select("_id name isActive").lean<Array<{ _id: unknown; name?: string; isActive?: boolean }>>()
    : [];
  const names = new Map(users.map((u) => [String(u._id), u.name ?? ""]));
  const active = new Map(users.map((u) => [String(u._id), u.isActive !== false]));
  const links = await resolveTaskLinks(ctx, docs);

  const toRow = (t: TaskDoc): GivenTaskRow => {
    const canAct = canActOnTask(ctx, t, visible.team);
    return {
      _id: String(t._id),
      title: t.title,
      description: t.description,
      priority: t.priority,
      status: t.status,
      reviewStatus: t.reviewStatus ?? "none",
      dueDate: t.dueDate,
      completionNote: t.completionNote,
      reviewComment: t.reviewComment,
      reviewedAt: t.reviewedAt,
      createdAt: t.createdAt,
      agentUserId: String(t.userId),
      agentName: names.get(String(t.userId)) ?? "",
      assigneeRole: assigneeRoleOf(t),
      assigneeActive: active.get(String(t.userId)) ?? false,
      assignedByName: names.get(String(t.assignedBy?.userId)) ?? "",
      assignedByRole: t.assignedBy?.role,
      managedByName: t.managedBy ? names.get(String(t.managedBy)) ?? "" : undefined,
      links: linkNames(links.get(String(t._id))),
      reviewRequired: t.reviewRequired !== false,
      groupId: t.groupId ? String(t.groupId) : undefined,
      canAct,
      // Only the giver, a routed-through super agent still managing the agent, or an admin.
      canReview: t.reviewStatus === "awaiting_review" && canAct,
    };
  };

  const items: GivenListRow[] = keys.map((key) => {
    const members = docs.filter((t) => String(t.groupId ?? t._id) === String(key)).map(toRow);
    if (members.length === 0) return null;
    const lead = members[0];
    if (!lead.groupId) return lead;
    return {
      ...lead,
      group: {
        id: lead.groupId,
        size: members.length,
        done: members.filter(isDone).length,
        withdrawn: members.filter((m) => m.status === "cancelled").length,
        needsYou: members.filter((m) => m.canReview).length,
        members,
      },
    };
  }).filter((r): r is GivenListRow => r !== null);

  return { total, page: p.page, totalPages: Math.max(Math.ceil(total / p.limit), 1), items, stats };
}

/** Per-copy counts for the header cards (the giver filter applies; the others don't). */
async function givenStats(ctx: AssignerCtx, base: Record<string, unknown>, team: Id[]) {
  const now = new Date();
  const me = new mongoose.Types.ObjectId(ctx.userId);
  // "Waiting for you": awaiting review AND this caller may act on it.
  const actable = ctx.role === "admin"
    ? {}
    : { $or: [{ "assignedBy.userId": me }, { managedBy: me, userId: { $in: team } }] };
  const [open, overdue, needsYou, reviewRows] = await Promise.all([
    AgentTask.countDocuments({ $and: [base, { status: { $nin: CLOSED_TASK_STATUSES } }] }),
    AgentTask.countDocuments({ $and: [base, { status: { $nin: CLOSED_TASK_STATUSES }, dueDate: { $ne: null, $lt: now } }] }),
    AgentTask.countDocuments({ $and: [base, { reviewStatus: "awaiting_review" }, actable] }),
    AgentTask.aggregate<{ _id: string; count: number }>([
      { $match: base },
      { $group: { _id: "$reviewStatus", count: { $sum: 1 } } },
    ]),
  ]);
  const byReview = Object.fromEntries(reviewRows.map((r) => [r._id, r.count]));
  return {
    open,
    overdue,
    needsYou,
    awaitingReview: byReview.awaiting_review ?? 0,
    returned: byReview.returned ?? 0,
    approved: byReview.approved ?? 0,
  };
}
