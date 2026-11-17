import type { AgentTaskAssigneeRole } from "@/models/AgentTask";
import { listAssignableAgents, listAssignableSuperAgents, type AssignableAgent, type AssignerCtx } from "@/lib/agentTasks/assigned";

/**
 * Turns the names or emails someone typed in the Copilot chat into the people
 * they may give a task to. The pool is the same list the Give a task dialog
 * offers, so the chat can never reach anyone the page could not; assignTasks
 * checks every id again when the task is written.
 */

export type PeopleMatch =
  | { ok: true; people: AssignableAgent[] }
  | { ok: false; blocker: string };

/** The people the caller can give a task of this kind to (optionally through a super agent). */
export async function assignablePool(ctx: AssignerCtx, kind: AgentTaskAssigneeRole, viaSuperAgent?: string): Promise<AssignableAgent[]> {
  return kind === "super_agent" ? listAssignableSuperAgents(ctx) : listAssignableAgents(ctx, viaSuperAgent);
}

const label = (p: AssignableAgent): string => (p.name ? `${p.name} (${p.email})` : p.email);

/** One person by email, exact name, or a name part that fits only one person. */
export function matchPerson(pool: AssignableAgent[], wanted: string): PeopleMatch {
  const q = wanted.trim().toLowerCase();
  if (!q) return { ok: false, blocker: "Say who the task is for." };
  const byEmail = pool.filter((p) => p.email.toLowerCase() === q);
  if (byEmail.length === 1) return { ok: true, people: byEmail };
  const exact = pool.filter((p) => p.name.trim().toLowerCase() === q);
  if (exact.length === 1) return { ok: true, people: exact };
  const partial = exact.length > 1 ? exact : pool.filter((p) => p.name.toLowerCase().includes(q));
  if (partial.length === 1) return { ok: true, people: partial };
  if (partial.length > 1) {
    const shown = partial.slice(0, 6).map(label).join(", ");
    return { ok: false, blocker: `"${wanted}" fits more than one person: ${shown}${partial.length > 6 ? ", …" : ""}. Ask which one (their email settles it).` };
  }
  return { ok: false, blocker: `Nobody called "${wanted}" is among the people this user can give tasks to.` };
}

/** Every name in the list, deduplicated; the first name that does not resolve blocks the whole list. */
export function matchPeople(pool: AssignableAgent[], wanted: string[]): PeopleMatch {
  const found = new Map<string, AssignableAgent>();
  for (const w of wanted) {
    const m = matchPerson(pool, w);
    if (!m.ok) return m;
    for (const p of m.people) found.set(p.userId, p);
  }
  if (found.size === 0) return { ok: false, blocker: "Say who the task is for." };
  return { ok: true, people: [...found.values()] };
}

/** "Sara, Omar and 3 more" for a confirm card. */
export function peopleSummary(people: AssignableAgent[]): string {
  const names = people.map((p) => p.name || p.email);
  if (names.length <= 4) return names.length > 1 ? `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}` : names[0] ?? "";
  return `${names.slice(0, 3).join(", ")} and ${names.length - 3} more`;
}

/** End of the day `days` from now, the same rule create_task uses. */
export function dueInDays(days: number | undefined): Date | undefined {
  if (typeof days !== "number") return undefined;
  const d = new Date();
  d.setDate(d.getDate() + days);
  d.setHours(23, 59, 59, 999);
  return d;
}
