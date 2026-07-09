import Lead from "@/models/Lead";
import { escapeRegex } from "@/lib/security/sanitize";

export interface DuplicateMatch {
  _id: string;
  companyName: string;
  contactPerson: string;
  contactEmail?: string;
  contactPhone?: string;
  status: string;
  matchType: "email" | "company" | "phone";
  confidence: "high" | "medium";
  createdAt: string;
}

interface DuplicateCheckInput {
  companyName?: string;
  contactEmail?: string;
  contactPhone?: string;
  /** Exclude this lead ID (for edit scenarios) */
  excludeId?: string;
  /** Scope to this agent's leads only */
  agentId?: string;
  /** Super-agent scope: leads routed to this SA or owned by these agents */
  superAgentScope?: { saProfileId: string; agentIds: string[] };
}

/**
 * Check for potential duplicate leads.
 * - Email exact match → high confidence
 * - Phone exact match → high confidence
 * - Company name case-insensitive match → medium confidence
 */
export async function checkLeadDuplicates(
  input: DuplicateCheckInput,
): Promise<DuplicateMatch[]> {
  const orClauses: Record<string, unknown>[] = [];

  if (input.contactEmail) {
    orClauses.push({ contactEmail: { $regex: `^${escapeRegex(input.contactEmail.trim())}$`, $options: "i" } });
  }

  if (input.contactPhone) {
    const digits = input.contactPhone.replace(/\D/g, "");
    if (digits.length >= 7) {
      orClauses.push({ contactPhone: { $regex: escapeRegex(digits.slice(-7)) } });
    }
  }

  if (input.companyName && input.companyName.trim().length >= 2) {
    orClauses.push({ companyName: { $regex: `^${escapeRegex(input.companyName.trim())}$`, $options: "i" } });
  }

  if (orClauses.length === 0) return [];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const filter: Record<string, any> = { $or: orClauses };
  if (input.excludeId) filter._id = { $ne: input.excludeId };
  if (input.agentId) filter.agentId = input.agentId;
  if (input.superAgentScope) {
    // Wrap the match clauses in $and so the scope $or doesn't collide with them.
    filter.$and = [
      { $or: filter.$or },
      {
        $or: [
          { superAgentId: input.superAgentScope.saProfileId },
          { agentId: { $in: input.superAgentScope.agentIds } },
        ],
      },
    ];
    delete filter.$or;
  }

  const candidates = await Lead.find(filter)
    .select("companyName contactPerson contactEmail contactPhone status createdAt")
    .sort({ createdAt: -1 })
    .limit(10)
    .lean();

  const matches: DuplicateMatch[] = [];

  for (const c of candidates) {
    let matchType: DuplicateMatch["matchType"] = "company";
    let confidence: DuplicateMatch["confidence"] = "medium";

    if (
      input.contactEmail &&
      c.contactEmail &&
      c.contactEmail.toLowerCase() === input.contactEmail.toLowerCase().trim()
    ) {
      matchType = "email";
      confidence = "high";
    } else if (
      input.contactPhone &&
      c.contactPhone &&
      c.contactPhone.replace(/\D/g, "").endsWith(input.contactPhone.replace(/\D/g, "").slice(-7))
    ) {
      matchType = "phone";
      confidence = "high";
    }

    matches.push({
      _id: String(c._id),
      companyName: c.companyName,
      contactPerson: c.contactPerson,
      contactEmail: c.contactEmail,
      contactPhone: c.contactPhone,
      status: c.status,
      matchType,
      confidence,
      createdAt: String(c.createdAt),
    });
  }

  // Sort: high confidence first
  matches.sort((a, b) => (a.confidence === "high" ? -1 : 1) - (b.confidence === "high" ? -1 : 1));

  return matches;
}
