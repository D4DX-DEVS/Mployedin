import SuperAgent from "@/models/SuperAgent";
import User from "@/models/User";

/** The super agent an agent reports to, and how to reach them. */
export interface SuperAgentContact {
  /** Their user id — what a direct message is addressed to. */
  userId: string;
  name: string;
  email: string;
  /** Empty when none is on file. */
  phone: string;
}

/**
 * Resolve an agent's `superAgentId` to a person. Null when the agent has none,
 * or the super agent's role was archived by an admin conversion — that person
 * no longer oversees anyone.
 */
export async function loadSuperAgentContact(superAgentId: unknown): Promise<SuperAgentContact | null> {
  if (!superAgentId) return null;
  const sa = await SuperAgent.findById(superAgentId).select("userId roleArchivedAt").lean<{ userId?: unknown; roleArchivedAt?: Date | null } | null>();
  if (!sa || sa.roleArchivedAt || !sa.userId) return null;
  const user = await User.findById(sa.userId).select("name email phone").lean<{ _id: unknown; name?: string; email?: string; phone?: string } | null>();
  if (!user) return null;
  return { userId: String(user._id), name: user.name ?? "", email: user.email ?? "", phone: user.phone ?? "" };
}
