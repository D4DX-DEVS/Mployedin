import Agent from "@/models/Agent";
import SuperAgent from "@/models/SuperAgent";
import User from "@/models/User";
import JobSeeker from "@/models/JobSeeker";

void User; // registered so `populate("userId")` below resolves

/**
 * Staff seeker lists carry a `referralSummary` instead of the raw `referral`
 * sub-document. What each role may see:
 *   admin        role, name, code, date, and an agent's super agent
 *   super_agent  role, name (their team's agents / themselves), date, isMine
 *   agent        role, date, isMine — no colleague names, no code
 */
export interface ReferralSummary {
  role: "agent" | "super_agent";
  referredAt: string | Date;
  code?: string;
  name?: string;
  /** Admin only: the referring agent's super agent today (not at referral time). */
  superAgentName?: string;
  isMine?: boolean;
}

interface RawReferral {
  agentId?: unknown;
  superAgentId?: unknown;
  code?: string;
  referrerRole?: "agent" | "super_agent";
  referredAt?: string | Date;
}

export interface ReferralViewer {
  role: "admin" | "super_agent" | "agent";
  selfAgentId?: string;
  selfSuperAgentId?: string;
}

interface NamedStaff {
  _id: unknown;
  userId?: { name?: string } | null;
}

interface NamedAgent extends NamedStaff {
  superAgentId?: NamedStaff | null;
}

export async function decorateReferralSummaries<T extends { referral?: unknown }>(
  items: T[],
  viewer: ReferralViewer,
): Promise<Array<Omit<T, "referral"> & { referralSummary?: ReferralSummary }>> {
  const referrals = items.map((it) => it.referral as RawReferral | undefined);
  const wantNames = viewer.role !== "agent";

  const agentNames = new Map<string, string>();
  const saNames = new Map<string, string>();
  const agentSuperAgents = new Map<string, string>();
  if (wantNames) {
    const agentIds = [...new Set(referrals.map((r) => r?.agentId).filter(Boolean).map(String))];
    const saIds = [...new Set(referrals.map((r) => r?.superAgentId).filter(Boolean).map(String))];
    if (agentIds.length > 0) {
      let query = Agent.find({ _id: { $in: agentIds } })
        .select(viewer.role === "admin" ? "userId superAgentId" : "userId")
        .populate("userId", "name");
      if (viewer.role === "admin") {
        query = query.populate({ path: "superAgentId", select: "userId", populate: { path: "userId", select: "name" } });
      }
      const agents = (await query.lean()) as unknown as NamedAgent[];
      for (const a of agents) {
        agentNames.set(String(a._id), a.userId?.name ?? "");
        const saName = a.superAgentId?.userId?.name;
        if (saName) agentSuperAgents.set(String(a._id), saName);
      }
    }
    if (saIds.length > 0) {
      const sas = (await SuperAgent.find({ _id: { $in: saIds } })
        .select("userId")
        .populate("userId", "name")
        .lean()) as unknown as NamedStaff[];
      for (const s of sas) saNames.set(String(s._id), s.userId?.name ?? "");
    }
  }

  return items.map((item, i) => {
    const { referral: _referral, ...rest } = item as T & { referral?: unknown };
    void _referral;
    const r = referrals[i];
    if (!r || !r.referrerRole || !r.referredAt) return rest as Omit<T, "referral">;

    const summary: ReferralSummary = { role: r.referrerRole, referredAt: r.referredAt };
    if (wantNames) {
      summary.name =
        r.referrerRole === "super_agent"
          ? saNames.get(String(r.superAgentId)) ?? ""
          : agentNames.get(String(r.agentId)) ?? "";
    }
    if (viewer.role === "admin" && r.code) summary.code = r.code;
    if (viewer.role === "admin" && r.referrerRole === "agent") {
      const saName = agentSuperAgents.get(String(r.agentId));
      if (saName) summary.superAgentName = saName;
    }
    if (viewer.role === "agent") {
      summary.isMine = Boolean(viewer.selfAgentId) && String(r.agentId) === viewer.selfAgentId;
    }
    if (viewer.role === "super_agent") {
      // An agent's link also records their super agent: "by you" only when
      // the super agent's own link brought the seeker in, else "via <agent>".
      summary.isMine = r.referrerRole === "super_agent" && Boolean(viewer.selfSuperAgentId) && String(r.superAgentId) === viewer.selfSuperAgentId;
    }

    return { ...(rest as Omit<T, "referral">), referralSummary: summary };
  });
}

/**
 * Admin lists that show a seeker's referrer next to something else (e.g. an
 * application row): summaries keyed by seeker id, admin shape. Callers must
 * gate on the admin role themselves; the raw referral never leaves here.
 */
export async function loadAdminReferralSummaries(seekerIds: string[]): Promise<Map<string, ReferralSummary>> {
  const out = new Map<string, ReferralSummary>();
  if (seekerIds.length === 0) return out;
  const referred = await JobSeeker.find({ _id: { $in: seekerIds }, referral: { $exists: true } })
    .select("_id referral")
    .lean<Array<{ _id: unknown; referral?: unknown }>>();
  const decorated = await decorateReferralSummaries(referred, { role: "admin" });
  decorated.forEach((d, i) => {
    if (d.referralSummary) out.set(String(referred[i]._id), d.referralSummary);
  });
  return out;
}
