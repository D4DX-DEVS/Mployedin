/**
 * READ-ONLY probe: score one seeker against every active job the way the feed
 * does (gate + relevance, cached skill vectors only, no Jev, no embedding) and
 * print why each job ranks where it does.
 *
 *   npx tsx --env-file=.env --tsconfig tsconfig.json scripts/_diag-seeker-matches.ts <email> [--all|--compact] [--warm]
 *   --warm embeds and caches skills missing from the vector cache (paid, tiny) — what a page view would do.
 */
import mongoose from "mongoose";
import { connectDB } from "@/lib/db/mongoose";
import { seekerProfileFromDoc, SEEKER_MATCH_FIELDS } from "@/lib/matchScore";
import { checkEligibility } from "@/lib/matching/eligibility";
import { calculateRelevance } from "@/lib/matching/relevance";
import { toCandidateJob } from "@/lib/matching/recommend";
import { collectSkillVocabulary, loadSkillVectors } from "@/lib/matching/skillVectors";
import { IRRELEVANT_SORT_PENALTY, RECOMMENDED_JOB_SELECT } from "@/lib/jobRecommendations";

const email = process.argv[2];
if (!email) throw new Error("usage: _diag-seeker-matches.ts <email>");

async function main(): Promise<void> {
  await connectDB();
  const db = mongoose.connection.db!;
  const user = await db.collection("users").findOne({ email });
  if (!user) throw new Error(`no user ${email}`);
  const fields = Object.fromEntries(SEEKER_MATCH_FIELDS.split(/\s+/).filter(Boolean).map((f) => [f, 1]));
  const seekerDoc = await db.collection("jobseekers").findOne({ userId: user._id }, { projection: fields });
  if (!seekerDoc) throw new Error("no seeker profile");
  const seeker = seekerProfileFromDoc(seekerDoc as never);
  console.log("SEEKER", JSON.stringify({
    roles: seeker.preferredRoles, skills: seeker.skills?.slice(0, 15), locations: seeker.locations,
    cities: seeker.cities, years: seeker.experienceYears, jobType: seeker.jobType, salary: [seeker.salaryExpectation, seeker.salaryCurrency],
  }));

  const projection = Object.fromEntries(RECOMMENDED_JOB_SELECT.split(/\s+/).filter(Boolean).map((f) => [f, 1]));
  const jobs = await db.collection("jobs").find({ status: "active" }, { projection }).toArray();
  const candidates = jobs.map((j) => toCandidateJob(j as never));
  const vectors = await loadSkillVectors(collectSkillVocabulary(candidates, [seeker]), { allowEmbedding: process.argv.includes("--warm") });

  const rows = candidates.map((c, i) => {
    const gate = checkEligibility(seeker, c.profile);
    const b = calculateRelevance(seeker, c.profile, vectors);
    const sort = gate.eligible ? b.overall : Math.max(0, b.overall - IRRELEVANT_SORT_PENALTY);
    const sal = (jobs[i] as { salary?: { min?: number; max?: number; currency?: string; period?: string } }).salary;
    return {
      title: c.title.slice(0, 34), score: b.overall, rel: b.relatedness, sort, gate: gate.eligible ? "ok" : gate.reason,
      skills: b.skills, role: b.role, roleBasis: b.roleBasis, exp: b.experience, edu: b.education,
      matched: b.matchedSkills.slice(0, 3).join(","),
      salary: sal ? `${sal.min}-${sal.max} ${sal.currency ?? ""} ${sal.period ?? ""}` : "",
    };
  });
  rows.sort((a, b) => b.sort - a.sort);
  if (process.argv.includes("--compact")) {
    for (const r of rows.slice(0, 6)) {
      console.log(`  ${String(r.score).padStart(3)}% ${r.gate === "ok" ? "  " : "↓ "}${r.title.padEnd(36)} gate=${r.gate} skills=${r.skills} role=${r.role} rel=${r.rel}`);
    }
  } else {
    console.table(process.argv.includes("--all") ? rows : rows.slice(0, 25));
  }
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
