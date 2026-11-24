import "server-only";
import mongoose from "mongoose";
import { connectDB } from "@/lib/db/mongoose";
import { Agent } from "@/models/Agent";
import { SuperAgent } from "@/models/SuperAgent";
import { User } from "@/models/User";
import { Commission } from "@/models/Commission";
import AgentTask from "@/models/AgentTask";
import { lastActivityByAgent } from "./activity.server";
import { cheapGaps, workState } from "./rules";
import type { StaffKind, StaffListSignal } from "./types";

type Id = mongoose.Types.ObjectId;
const str = (v: unknown) => (v == null ? "" : String(v));

interface Profile {
  _id: unknown;
  userId: unknown;
  roleArchivedAt?: Date | null;
  assignedCityIds?: Id[];
  assignedStateIds?: Id[];
}

/**
 * The list's extra columns for one page of super agents or agents: the
 * cheap warnings count (★ checks in the plan), work state, last activity and,
 * for super agents, working agents of team. A handful of grouped reads for
 * the whole page — never the full report per row.
 */
export async function staffListSignals(kind: StaffKind, userIds: string[]): Promise<StaffListSignal[]> {
  await connectDB();
  const ids = userIds.filter((id) => mongoose.isValidObjectId(id)).map((id) => new mongoose.Types.ObjectId(id));
  if (ids.length === 0) return [];
  const now = new Date();

  const Model = (kind === "super_agent" ? SuperAgent : Agent) as unknown as mongoose.Model<Profile>;
  const [users, profiles, overdue] = await Promise.all([
    User.find({ _id: { $in: ids } }).select("isActive lastLogin").lean(),
    Model.find({ userId: { $in: ids } }).select("_id userId roleArchivedAt assignedCityIds assignedStateIds").lean<Profile[]>(),
    AgentTask.aggregate<{ _id: Id; n: number }>([
      { $match: { userId: { $in: ids }, status: { $in: ["pending", "in_progress"] }, dueDate: { $lt: now } } },
      { $group: { _id: "$userId", n: { $sum: 1 } } },
    ]),
  ]);
  const profileIds = profiles.map((p) => p._id as Id);
  const disputed = await Commission.aggregate<{ _id: Id }>([
    {
      $match: kind === "super_agent"
        ? { superAgentId: { $in: profileIds }, type: "override", status: "disputed" }
        : { agentId: { $in: profileIds }, type: { $in: ["placement", "bonus"] }, status: "disputed" },
    },
    { $group: { _id: kind === "super_agent" ? "$superAgentId" : "$agentId" } },
  ]);

  // Agents whose activity decides "working": the agents themselves, or each super agent's team.
  const team = kind === "super_agent"
    ? await Agent.find({ superAgentId: { $in: profileIds } }).select("_id userId superAgentId").lean()
    : profiles.map((p) => ({ _id: p._id, userId: p.userId, superAgentId: undefined }));
  const [activity, teamUsers] = await Promise.all([
    lastActivityByAgent(team, now),
    kind === "super_agent"
      ? User.find({ _id: { $in: team.map((a) => a.userId) } }).select("isActive").lean()
      : Promise.resolve([] as Array<{ _id: unknown; isActive?: boolean }>),
  ]);
  const teamActive = new Map(teamUsers.map((u) => [str(u._id), u.isActive !== false]));

  const userMap = new Map(users.map((u) => [str(u._id), u]));
  const overdueMap = new Map(overdue.map((r) => [str(r._id), r.n]));
  const disputedSet = new Set(disputed.map((r) => str(r._id)));

  return profiles.map((p) => {
    const uid = str(p.userId);
    const u = userMap.get(uid);
    const isActive = u?.isActive !== false;
    const members = kind === "super_agent" ? team.filter((a) => str(a.superAgentId) === str(p._id)) : [];
    const working = members.filter((a) => workState(teamActive.get(str(a.userId)) !== false, activity.get(str(a.userId)), now) === "working").length;
    const last = kind === "agent"
      ? activity.get(uid) ?? null
      : members.reduce<Date | null>((acc, a) => {
        const d = activity.get(str(a.userId));
        return d && (!acc || d > acc) ? d : acc;
      }, null);
    const warnings = cheapGaps({
      kind,
      isActive,
      archived: Boolean(p.roleArchivedAt),
      hasRegion: (p.assignedCityIds?.length ?? 0) + (p.assignedStateIds?.length ?? 0) > 0,
      lastLogin: u?.lastLogin ?? null,
      overdueTasks: overdueMap.get(uid) ?? 0,
      disputedCommission: disputedSet.has(str(p._id)),
      teamSize: kind === "super_agent" ? members.length : undefined,
    }, now).length;
    return {
      userId: uid,
      warnings,
      state: kind === "agent" ? workState(isActive, last, now) : (isActive ? (working > 0 ? "working" : "idle") : "inactive"),
      lastActivity: last ? last.toISOString() : null,
      workingAgents: kind === "super_agent" ? { working, total: members.length } : undefined,
    };
  });
}
