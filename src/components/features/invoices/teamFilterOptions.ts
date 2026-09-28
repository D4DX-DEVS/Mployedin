// Shapes the admin agent / super-agent lists into the invoice builder's
// "Filter by team" picker options.

export interface AgentOption { _id: string; name: string; superAgentId?: string; regions: string[] }
export interface SuperAgentOption { _id: string; name: string; regions: string[]; agentCount: number }

type NamedRef = { name?: string } | null | undefined;
type IdRef = { _id?: string } | string | null | undefined;

interface AgentRow {
  _id: string;
  name?: string;
  email?: string;
  agentProfile?: {
    _id?: string;
    superAgentId?: IdRef;
    assignedStateIds?: NamedRef[];
    assignedCityIds?: NamedRef[];
  } | null;
}

interface SuperAgentRow {
  _id: string;
  name?: string;
  email?: string;
  superAgentProfile?: {
    _id?: string;
    assignedStateIds?: NamedRef[];
    assignedCityIds?: NamedRef[];
    agentCount?: number;
    agents?: unknown[];
  } | null;
}

function regionNames(states?: NamedRef[], cities?: NamedRef[]): string[] {
  const names = new Set<string>();
  [...(states ?? []), ...(cities ?? [])].forEach((place) => { if (place?.name) names.add(place.name); });
  return Array.from(names);
}

// An unassigned agent arrives as superAgentId: null — and typeof null is
// "object", so check for a value before reaching for ._id.
function refId(ref: IdRef): string | undefined {
  if (!ref) return undefined;
  return typeof ref === "object" ? ref._id : ref;
}

function rowsOf<T>(data: unknown, key: string): T[] {
  const rows = (data as Record<string, unknown> | null)?.[key];
  return Array.isArray(rows) ? (rows as T[]) : [];
}

/** GET /api/admin/agents → agent options (id = Agent profile id, which jobs reference). */
export function toAgentOptions(data: unknown): AgentOption[] {
  return rowsOf<AgentRow>(data, "agents").map((agent) => ({
    _id: agent.agentProfile?._id ?? agent._id,
    name: agent.name ?? agent.email ?? agent._id,
    superAgentId: refId(agent.agentProfile?.superAgentId),
    regions: regionNames(agent.agentProfile?.assignedStateIds, agent.agentProfile?.assignedCityIds),
  }));
}

/** GET /api/admin/super-agents → super-agent options (id = SuperAgent profile id). */
export function toSuperAgentOptions(data: unknown): SuperAgentOption[] {
  return rowsOf<SuperAgentRow>(data, "superAgents").map((superAgent) => {
    const profile = superAgent.superAgentProfile;
    return {
      _id: profile?._id ?? superAgent._id,
      name: superAgent.name ?? superAgent.email ?? superAgent._id,
      regions: regionNames(profile?.assignedStateIds, profile?.assignedCityIds),
      agentCount: profile?.agentCount ?? profile?.agents?.length ?? 0,
    };
  });
}
