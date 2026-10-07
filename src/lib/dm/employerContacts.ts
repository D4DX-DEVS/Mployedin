import mongoose from "mongoose";
import { Employer } from "@/models/Employer";
import Application from "@/models/Application";
import JobSeeker from "@/models/JobSeeker";
import Agent from "@/models/Agent";
import Job from "@/models/Job";

/**
 * Who an employer may START a conversation with (owner decision 2026-10-06,
 * QA EMP-001): people who applied to one of its jobs, the agent looking after
 * it — on the account or on any of its jobs — and the support team (admins).
 * Nobody else is searchable or reachable through POST /api/dm.
 *
 * A conversation the other side started is not affected: the employer can
 * still reply there. `ctx.userId` is the company owner even when a colleague
 * is borrowing the workspace, so callers pass it straight in.
 */

type ObjectId = mongoose.Types.ObjectId;

interface EmployerRef {
  _id: unknown;
  agentId?: unknown;
}

async function findEmployer(employerUserId: string): Promise<EmployerRef | null> {
  if (!mongoose.Types.ObjectId.isValid(employerUserId)) return null;
  return (await Employer.findOne({ userId: employerUserId }).select("_id agentId").lean()) as EmployerRef | null;
}

/** Agent profile ids looking after the employer, from every place the link is stored. */
async function employerAgentIds(emp: EmployerRef): Promise<string[]> {
  const [linked, jobAgentIds] = await Promise.all([
    Agent.find({ assignedEmployerIds: emp._id, roleArchivedAt: null }).select("_id").lean(),
    Job.distinct("agentId", { employerId: emp._id, agentId: { $ne: null } }),
  ]);
  const ids = new Set<string>();
  if (emp.agentId) ids.add(String(emp.agentId));
  for (const a of linked) ids.add(String(a._id));
  for (const id of jobAgentIds as unknown[]) if (id) ids.add(String(id));
  return [...ids];
}

/**
 * User ids of the applicants and agents the employer may contact. Admins are
 * not listed — every admin is reachable, so callers match `role: "admin"`.
 */
export async function getEmployerContactUserIds(employerUserId: string): Promise<ObjectId[]> {
  const emp = await findEmployer(employerUserId);
  if (!emp) return [];

  const [seekerIds, agentIds] = await Promise.all([
    Application.distinct("jobSeekerId", { employerId: emp._id }),
    employerAgentIds(emp),
  ]);
  const [seekers, agents] = await Promise.all([
    seekerIds.length > 0 ? JobSeeker.find({ _id: { $in: seekerIds } }).select("userId").lean() : [],
    agentIds.length > 0 ? Agent.find({ _id: { $in: agentIds }, roleArchivedAt: null }).select("userId").lean() : [],
  ]);

  const seen = new Set<string>();
  const out: ObjectId[] = [];
  for (const doc of [...seekers, ...agents] as Array<{ userId?: unknown }>) {
    if (!doc.userId) continue;
    const id = String(doc.userId);
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(new mongoose.Types.ObjectId(id));
  }
  return out;
}

/** Can this employer open a new conversation with `recipient`? */
export async function canEmployerStartConversation(
  employerUserId: string,
  recipient: { _id: unknown; role: string },
): Promise<boolean> {
  if (recipient.role === "admin") return true;
  if (recipient.role !== "job_seeker" && recipient.role !== "agent") return false;

  const emp = await findEmployer(employerUserId);
  if (!emp) return false;

  if (recipient.role === "job_seeker") {
    const seeker = await JobSeeker.findOne({ userId: recipient._id }).select("_id").lean();
    if (!seeker) return false;
    return Boolean(await Application.exists({ employerId: emp._id, jobSeekerId: seeker._id }));
  }

  const agent = await Agent.findOne({ userId: recipient._id, roleArchivedAt: null }).select("_id").lean();
  if (!agent) return false;
  return (await employerAgentIds(emp)).includes(String(agent._id));
}
