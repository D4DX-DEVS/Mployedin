import Agent from "@/models/Agent";
import CompanyUser from "@/models/CompanyUser";
import Job from "@/models/Job";
import { notify } from "@/lib/notifications/trigger";

/**
 * The people a check can be handed to: colleagues the employer allowed to run
 * screening, and the agents who work with the employer on this job (the job's
 * own agent and the account agent). The same list feeds the picker and
 * validates the assignment, so the picker can never offer someone the server
 * then refuses.
 */

export interface CheckPerson {
  _id: string;
  name: string;
  kind: "colleague" | "agent";
}

async function agentPeople(accountAgentId: unknown, jobId: unknown): Promise<CheckPerson[]> {
  const job = (await Job.findById(jobId).select("agentId").lean()) as { agentId?: unknown } | null;
  const agentIds = [...new Set([job?.agentId, accountAgentId].filter(Boolean).map(String))];
  if (agentIds.length === 0) return [];
  const agents = (await Agent.find({ _id: { $in: agentIds } })
    .select("userId")
    .populate({ path: "userId", select: "name email" })
    .lean()) as Array<{ userId?: { _id: unknown; name?: string; email?: string } | null }>;
  const seen = new Set<string>();
  return agents.flatMap((a) => {
    if (!a.userId) return [];
    const id = String(a.userId._id);
    if (seen.has(id)) return [];
    seen.add(id);
    return [{ _id: id, name: a.userId.name || a.userId.email || "", kind: "agent" as const }];
  });
}

async function colleaguePeople(employerId: unknown): Promise<CheckPerson[]> {
  const members = (await CompanyUser.find({
    companyId: employerId,
    status: "active",
    "permissions.canRunScreening": true,
    userId: { $exists: true, $ne: null },
  })
    .select("userId email")
    .populate({ path: "userId", select: "name" })
    .lean()) as Array<{ email: string; userId?: { _id: unknown; name?: string } | null }>;
  return members.flatMap((m) =>
    m.userId ? [{ _id: String(m.userId._id), name: m.userId.name || m.email, kind: "colleague" as const }] : []
  );
}

export async function assignablePeople(
  employer: { _id: unknown; agentId?: unknown },
  jobId: unknown
): Promise<CheckPerson[]> {
  const [colleagues, agents] = await Promise.all([colleaguePeople(employer._id), agentPeople(employer.agentId, jobId)]);
  return [...colleagues, ...agents];
}

interface NoticeTarget {
  checkId: string;
  actorId: string;
  jobTitle: string;
  companyName: string;
}

/** Tell the person a check was handed to. Agents and colleagues land on their own page. */
export async function notifyAssignee(person: CheckPerson, target: NoticeTarget): Promise<void> {
  const link =
    person.kind === "agent"
      ? `/agent/background-checks?checkId=${target.checkId}`
      : `/employer/background-checks?checkId=${target.checkId}`;
  await notify({
    userId: person._id,
    actorId: target.actorId,
    type: "system",
    title: "Background check assigned to you",
    message: `${target.companyName} asked you to run a background check for "${target.jobTitle}".`,
    link,
    sendEmail: false,
    titleKey: "backgroundCheckAssignedTitle",
    bodyKey: "backgroundCheckAssignedBody",
    params: { companyName: target.companyName, jobTitle: target.jobTitle },
  });
}

/** Tell the employer (owner and whoever requested it) the verdict is in. */
export async function notifyCompleted(
  recipients: unknown[],
  target: NoticeTarget & { performerName: string }
): Promise<void> {
  const ids = [...new Set(recipients.filter(Boolean).map(String))];
  await Promise.all(
    ids.map((userId) =>
      notify({
        userId,
        actorId: target.actorId,
        type: "system",
        title: "Background check completed",
        message: `${target.performerName} completed the background check for "${target.jobTitle}".`,
        link: `/employer/background-checks?checkId=${target.checkId}`,
        sendEmail: false,
        titleKey: "backgroundCheckCompletedTitle",
        bodyKey: "backgroundCheckCompletedBody",
        params: { performerName: target.performerName, jobTitle: target.jobTitle },
      })
    )
  );
}
