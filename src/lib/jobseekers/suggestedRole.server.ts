import Job from "@/models/Job";
import JobSeeker from "@/models/JobSeeker";
import { addRoleEvidence, suggestRoleFromSkills, type SkillRoleIndex } from "@/lib/jobseekers/suggestedRole";

const CACHE_TTL_MS = 10 * 60 * 1000;
/** Upper bound on documents read to build the index. */
const MAX_DOCS = 5000;

let cached: { at: number; promise: Promise<SkillRoleIndex> } | null = null;

type Lean = Record<string, unknown>;

async function buildIndex(): Promise<SkillRoleIndex> {
  const index: SkillRoleIndex = new Map();
  const [seekers, jobs] = await Promise.all([
    JobSeeker.find({ skills: { $exists: true, $ne: [] } })
      .select("skills preferredRoles experience.jobTitle experience.isCurrent")
      .limit(MAX_DOCS)
      .lean() as unknown as Promise<Lean[]>,
    Job.find({ "requirements.skills.0": { $exists: true } })
      .select("title requirements.skills")
      .limit(MAX_DOCS)
      .lean() as unknown as Promise<Lean[]>,
  ]);

  for (const s of seekers) {
    const skills = (s.skills as string[] | undefined) ?? [];
    const experience = (s.experience as Array<{ jobTitle?: string; isCurrent?: boolean }> | undefined) ?? [];
    const held = (experience.find((e) => e.isCurrent) ?? experience[0])?.jobTitle;
    addRoleEvidence(index, skills, held);
    for (const wanted of (s.preferredRoles as string[] | undefined) ?? []) addRoleEvidence(index, skills, wanted);
  }
  for (const j of jobs) {
    const skills = ((j.requirements as { skills?: string[] } | undefined)?.skills) ?? [];
    addRoleEvidence(index, skills, j.title as string | undefined);
  }
  return index;
}

/** The skill→role index, rebuilt at most every ten minutes and shared by concurrent requests. */
async function getIndex(): Promise<SkillRoleIndex> {
  if (!cached || Date.now() - cached.at >= CACHE_TTL_MS) {
    const promise = buildIndex();
    cached = { at: Date.now(), promise };
    // A failed build is not reused.
    promise.catch(() => { if (cached?.promise === promise) cached = null; });
  }
  return cached.promise;
}

/**
 * Guessed roles for seekers who stated none, keyed by seeker id. Only the
 * seekers passed in are looked at; those whose skills do not agree on a role
 * are left out.
 */
export async function suggestedRolesFor(seekers: Array<{ id: string; skills: readonly string[] }>): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (seekers.length === 0) return out;
  const index = await getIndex();
  for (const s of seekers) {
    const role = suggestRoleFromSkills(s.skills, index);
    if (role) out.set(s.id, role);
  }
  return out;
}
