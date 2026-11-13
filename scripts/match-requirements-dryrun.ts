/**
 * Phase 0 of docs/superpowers/plans/2026-11-12-requirement-aware-match-scoring.md:
 * measure the requirement-aware seeker score against live data before any app
 * code changes.
 *
 * READ-ONLY. Uses the raw MongoDB driver (no Mongoose models, so no index
 * builds), reads only, writes nothing to the database, calls no AI service and
 * embeds nothing: skill vectors come from the existing cache only.
 *
 * Usage:
 *   npx tsx --env-file=.env --tsconfig tsconfig.json scripts/match-requirements-dryrun.ts [--no-vectors] [--out <dir>]
 *
 * Writes into --out (default docs/superpowers/reports/2026-11-12-match-dryrun):
 *   summary.json   every total
 *   jobs.json      what the reader found in each active job
 *   degrees.json   seeker degree strings, level today vs new
 *   pairs.csv      pairs that are eligible somewhere and score 60+ somewhere, or whose gate changed
 */

import fs from "node:fs";
import path from "node:path";
import { MongoClient, type Document } from "mongodb";
import { educationRank, jobProfileFromDoc, seekerProfileFromDoc, SEEKER_MATCH_FIELDS, type JobProfile, type SeekerProfile } from "@/lib/matchScore";
import { calculateRelevance } from "@/lib/matching/relevance";
import { checkEligibility } from "@/lib/matching/eligibility";
import { DEFAULT_MIN_RELEVANCE, JOB_MATCH_FIELDS } from "@/lib/matching/constants";
import { skillKey, SKILL_VECTOR_DIMENSIONS, type SkillVectorMap } from "@/lib/matching/skillSimilarity";
import { sharesRole } from "@/lib/matching/roleMatch";
import {
  credentialsPart, CREDENTIAL_MARK_LENIENT, seekerEntryLevel, educationPart, languagesPart, readJobCredentials, readJobEducation, readJobLanguages,
  seekerEvidence, TABLES, weightedScore, type Parts,
} from "./match-requirements-reader";

const args = process.argv.slice(2);
const USE_VECTORS = !args.includes("--no-vectors");
const OUT = args.includes("--out") ? args[args.indexOf("--out") + 1] : "docs/superpowers/reports/2026-11-12-match-dryrun";
const SHORTLIST = 50;
const projection = (fields: string) => Object.fromEntries(fields.split(/\s+/).filter(Boolean).map((f) => [f, 1]));
const log = (msg: string) => process.stdout.write(`[${new Date().toISOString().slice(11, 19)}] ${msg}\n`);

function decodeVector(raw: unknown): number[] | null {
  const bytes = raw && typeof raw === "object" && "buffer" in raw ? (raw as { buffer: Uint8Array }).buffer : null;
  if (!bytes || bytes.byteLength !== SKILL_VECTOR_DIMENSIONS * 4) return null;
  const view = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const vector = Array.from({ length: SKILL_VECTOR_DIMENSIONS }, (_, i) => view.readFloatLE(i * 4));
  return vector.every(Number.isFinite) ? vector : null;
}

/**
 * tuned = recommended, but a licence not found reads as "needs verification" (25, not 0), and the
 * languages already stored on jobs (no form sets them) count only once an employer confirms them.
 */
type Variant = "today" | "recommended" | "cautious" | "recommendedNoSkillsOut" | "tuned";
const VARIANTS: Variant[] = ["today", "recommended", "cautious", "recommendedNoSkillsOut", "tuned"];

interface PairRow {
  job: number;
  seeker: number;
  eligibleToday: boolean;
  reasonToday?: string;
  eligibleNew: boolean;
  reasonNew?: string;
  scores: Record<Variant, number>;
  education: number | null;
  relation: string;
  credentials: number | null;
  languages: number | null;
  applied: boolean;
  /** Would be listed on Suitable profiles: visible, and a skill or a role in common (talentPoolRanking.isRelevantToJob). */
  inPool: boolean;
}

async function main(): Promise<void> {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI is not set. Run with --env-file=.env");
  const client = new MongoClient(uri, { readPreference: "secondaryPreferred" });
  await client.connect();
  const db = client.db();
  const now = new Date();
  const threshold = await db
    .collection("systemconfigs")
    .findOne({}, { projection: { "matching.minScore": 1 } })
    .then((doc) => Number((doc as Document | null)?.matching?.minScore) || DEFAULT_MIN_RELEVANCE)
    .catch(() => DEFAULT_MIN_RELEVANCE);
  log(`threshold ${threshold}`);

  const jobDocs = await db
    .collection("jobs")
    .find(
      { status: "active", $or: [{ expiresAt: null }, { expiresAt: { $gte: now } }] },
      { projection: { ...projection(JOB_MATCH_FIELDS), qualifications: 1, category: 1 } },
    )
    .toArray();
  log(`${jobDocs.length} live jobs`);

  const inactiveUsers = new Set((await db.collection("users").distinct("_id", { isActive: false })).map(String));
  const seekerDocs: Document[] = [];
  const seekerFields = `${SEEKER_MATCH_FIELDS} userId languages certifications profileVisibility roleArchivedAt applicationMode`;
  const cursor = db.collection("jobseekers").find({ roleArchivedAt: null }, { projection: projection(seekerFields), batchSize: 500 });
  for await (const doc of cursor) {
    if (!inactiveUsers.has(String(doc.userId))) seekerDocs.push(doc);
    if (seekerDocs.length % 1000 === 0) log(`  ${seekerDocs.length} seekers read`);
  }
  log(`${seekerDocs.length} seekers (archived and deactivated left out)`);

  const jobIds = jobDocs.map((j) => j._id);
  const applied = new Set(
    (await db.collection("applications").find({ jobId: { $in: jobIds } }, { projection: { jobId: 1, jobSeekerId: 1 } }).toArray()).map(
      (a) => `${a.jobId}:${a.jobSeekerId}`,
    ),
  );

  // Profiles exactly as the engine builds them today, and the new evidence.
  const jobs = jobDocs.map((doc) => {
    const quals = ((doc.qualifications as string[] | undefined) ?? []).map((l) => String(l)).filter((l) => l.trim());
    const req = (doc.requirements ?? {}) as { education?: string; languages?: string[] };
    return {
      doc,
      profile: jobProfileFromDoc(doc as Parameters<typeof jobProfileFromDoc>[0]),
      education: readJobEducation(req.education, quals),
      languages: readJobLanguages(req.languages, quals),
      ...readJobCredentials(quals),
      quals,
    };
  });
  const seekers = seekerDocs.map((doc) => ({
    doc,
    profile: seekerProfileFromDoc(doc as Parameters<typeof seekerProfileFromDoc>[0]),
    evidence: seekerEvidence(doc),
  }));

  let vectors: SkillVectorMap = new Map();
  if (USE_VECTORS) {
    const vocabulary = new Set<string>();
    for (const j of jobs) for (const s of [...j.profile.skills, ...(j.profile.preferredSkills ?? [])]) vocabulary.add(skillKey(s));
    for (const s of seekers) for (const skill of s.profile.skills) vocabulary.add(skillKey(skill));
    vocabulary.delete("");
    const keys = [...vocabulary];
    log(`loading cached vectors for ${keys.length} skills (cache only, nothing embedded)`);
    for (let i = 0; i < keys.length; i += 2000) {
      const rows = await db.collection("skillvectors").find({ canonical: { $in: keys.slice(i, i + 2000) } }, { projection: { canonical: 1, vector: 1 } }).toArray();
      for (const row of rows) {
        const v = decodeVector(row.vector);
        if (v) vectors.set(String(row.canonical), v);
      }
    }
    log(`${vectors.size} vectors cached`);
  }

  log(`scoring ${jobs.length * seekers.length} pairs`);
  const pairs: PairRow[] = [];
  /** Per job and field verdict, a few seekers' education text — to check the verdicts by eye. */
  const fieldSamples = new Map<string, string[]>();
  for (let si = 0; si < seekers.length; si++) {
    const s = seekers[si];
    const newSeeker: SeekerProfile = { ...s.profile, educationLevel: s.evidence.level };
    const visible = s.doc.profileVisibility === "visible";
    const roles = [...(s.profile.roleHistory ?? []).map((r) => r.title), ...(s.profile.preferredRoles ?? [])];
    for (let ji = 0; ji < jobs.length; ji++) {
      const j = jobs[ji];
      const gateToday = checkEligibility(s.profile, j.profile);
      const newJob: JobProfile = { ...j.profile, requiredEducationLevel: j.education.importance === "must" ? j.education.level : 0 };
      const gateNew = checkEligibility(newSeeker, newJob);
      const relevance = calculateRelevance(s.profile, j.profile, vectors);
      const edu = educationPart(j.education, s.evidence);
      if (edu && gateNew.eligible && ["different", "related", "not_stated", "same"].includes(edu.relation)) {
        const key = `${j.doc.title} | asks ${j.education.fields.join("/") || j.education.families.join("/")} | ${edu.relation}`;
        const list = fieldSamples.get(key) ?? [];
        if (list.length < 6 && !list.includes(s.evidence.fieldText)) list.push(s.evidence.fieldText.slice(0, 90));
        fieldSamples.set(key, list);
      }
      const cred = credentialsPart(j.credentials, s.evidence);
      const lang = languagesPart(j.languages.names, s.evidence);
      const parts: Parts = {
        skills: relevance.skills,
        role: relevance.role,
        experience: relevance.experience,
        education: edu?.mark ?? null,
        credentials: cred?.mark ?? null,
        languages: lang,
      };
      pairs.push({
        job: ji,
        seeker: si,
        eligibleToday: gateToday.eligible,
        ...(gateToday.reason ? { reasonToday: gateToday.reason } : {}),
        eligibleNew: gateNew.eligible,
        ...(gateNew.reason ? { reasonNew: gateNew.reason } : {}),
        scores: {
          today: relevance.overall,
          recommended: weightedScore(parts, TABLES.recommended),
          cautious: weightedScore(parts, TABLES.cautious),
          recommendedNoSkillsOut: weightedScore({ ...parts, skills: relevance.skillsUnknown ? null : parts.skills }, TABLES.recommended),
          tuned: weightedScore(
            {
              ...parts,
              credentials: credentialsPart(j.credentials, s.evidence, CREDENTIAL_MARK_LENIENT)?.mark ?? null,
              languages: j.languages.source === "languages_field" ? null : lang,
            },
            TABLES.recommended,
          ),
        },
        education: parts.education,
        relation: edu?.relation ?? "-",
        credentials: parts.credentials,
        languages: lang,
        applied: applied.has(`${j.doc._id}:${s.doc._id}`),
        inPool:
          visible &&
          (relevance.matchedSkills.length > 0 || relevance.requiredMatched.length > 0 || sharesRole(j.profile.title ?? "", roles)),
      });
    }
    if (si % 1000 === 0) log(`  ${si}/${seekers.length} seekers scored`);
  }

  const summary = summarise(pairs, jobs, seekers, threshold);
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, "summary.json"), JSON.stringify(summary, null, 1));
  fs.writeFileSync(path.join(OUT, "jobs.json"), JSON.stringify(jobTable(jobs), null, 1));
  fs.writeFileSync(path.join(OUT, "degrees.json"), JSON.stringify(degreeTable(seekerDocs), null, 1));
  writePairsCsv(path.join(OUT, "pairs.csv"), pairs, jobs, seekers, threshold);
  fs.writeFileSync(path.join(OUT, "fieldSamples.json"), JSON.stringify(Object.fromEntries([...fieldSamples].sort()), null, 1));
  log(`written to ${OUT}`);
  await client.close();
}

type JobRow = { doc: Document; profile: JobProfile; education: ReturnType<typeof readJobEducation>; languages: { names: string[]; source: string }; credentials: ReturnType<typeof readJobCredentials>["credentials"]; visaLines: string[]; quals: string[] };
type SeekerRow = { doc: Document; profile: SeekerProfile; evidence: ReturnType<typeof seekerEvidence> };

const recommendable = (p: PairRow, v: Variant, t: number) => !p.applied && (v === "today" ? p.eligibleToday : p.eligibleNew) && p.scores[v] >= t;

function summarise(pairs: PairRow[], jobs: JobRow[], seekers: SeekerRow[], t: number) {
  const out: Record<string, unknown> = { threshold: t, jobs: jobs.length, seekers: seekers.length, pairs: pairs.length, vectors: USE_VECTORS };
  const count = (pred: (p: PairRow) => boolean) => pairs.reduce((n, p) => n + (pred(p) ? 1 : 0), 0);

  out.jobsAsking = {
    education: jobs.filter((j) => j.education.level > 0).length,
    educationMust: jobs.filter((j) => j.education.level > 0 && j.education.importance === "must").length,
    educationFromLine: jobs.filter((j) => j.education.source === "qualification_line").length,
    educationToday: jobs.filter((j) => (j.profile.requiredEducationLevel ?? 0) > 0).length,
    educationWithField: jobs.filter((j) => j.education.fields.length > 0 || j.education.families.length > 0).length,
    credentials: jobs.filter((j) => j.credentials.length > 0).length,
    languages: jobs.filter((j) => j.languages.names.length > 0).length,
    visaLines: jobs.filter((j) => j.visaLines.length > 0).length,
    noSkills: jobs.filter((j) => j.profile.skills.length === 0 && (j.profile.preferredSkills ?? []).length === 0).length,
  };
  out.seekersHaving = {
    educationToday: seekers.filter((s) => (s.profile.educationLevel ?? 0) > 0).length,
    educationNew: seekers.filter((s) => s.evidence.level > 0).length,
    fieldOfStudy: seekers.filter((s) => s.evidence.fieldStated).length,
    languages: seekers.filter((s) => s.evidence.languages.length > 0).length,
    autoApplyOn: seekers.filter((s) => s.doc.applicationMode === "auto").length,
  };

  out.gate = {
    eligibleToday: count((p) => p.eligibleToday),
    eligibleNew: count((p) => p.eligibleNew),
    newlyGated: count((p) => p.eligibleToday && !p.eligibleNew),
    newlyOpened: count((p) => !p.eligibleToday && p.eligibleNew),
    newlyGatedByReason: tally(pairs.filter((p) => p.eligibleToday && !p.eligibleNew).map((p) => p.reasonNew ?? "?")),
    newlyOpenedFromReason: tally(pairs.filter((p) => !p.eligibleToday && p.eligibleNew).map((p) => p.reasonToday ?? "?")),
    seekersNewlyGatedOnAtLeastOneJob: new Set(pairs.filter((p) => p.eligibleToday && !p.eligibleNew).map((p) => p.seeker)).size,
  };

  const both = pairs.filter((p) => p.eligibleToday && p.eligibleNew);
  for (const v of VARIANTS.filter((x) => x !== "today")) {
    const deltas = both.map((p) => p.scores[v] - p.scores.today);
    const rec = (variant: Variant) => pairs.filter((p) => recommendable(p, variant, t));
    const seekersWith = (variant: Variant) => new Set(rec(variant).map((p) => p.seeker));
    const before = seekersWith("today");
    const after = seekersWith(v);
    out[v] = {
      eligibleBothPairs: both.length,
      gained: deltas.filter((d) => d > 0).length,
      lost: deltas.filter((d) => d < 0).length,
      same: deltas.filter((d) => d === 0).length,
      meanChange: round1(deltas.reduce((a, b) => a + b, 0) / Math.max(1, deltas.length)),
      changeBands: tally(deltas.map((d) => (d <= -15 ? "≤-15" : d <= -5 ? "-14..-5" : d < 0 ? "-4..-1" : d === 0 ? "0" : d < 5 ? "1..4" : d < 15 ? "5..14" : "≥15"))),
      pairsAtOrAboveFloor: { today: rec("today").length, new: rec(v).length },
      crossedUp: pairs.filter((p) => !recommendable(p, "today", t) && recommendable(p, v, t)).length,
      crossedDown: pairs.filter((p) => recommendable(p, "today", t) && !recommendable(p, v, t)).length,
      seekersWithAJobAtFloor: { today: before.size, new: after.size, gainedAny: [...after].filter((s) => !before.has(s)).length, lostAll: [...before].filter((s) => !after.has(s)).length },
      aiJudgeBandPairs: {
        today: pairs.filter((p) => p.eligibleToday && !p.applied && p.scores.today >= t - 10).length,
        new: pairs.filter((p) => p.eligibleNew && !p.applied && p.scores[v] >= t - 10).length,
      },
      autoApplyPairs: {
        today: rec("today").filter((p) => seekers[p.seeker].doc.applicationMode === "auto").length,
        new: rec(v).filter((p) => seekers[p.seeker].doc.applicationMode === "auto").length,
      },
      seekersTop5Changed: top5Changed(pairs, v),
      suitableProfiles: shortlistChange(pairs, jobs, v),
    };
  }

  const withEdu = pairs.filter((p) => p.education !== null && p.eligibleNew);
  out.educationPart = { pairs: withEdu.length, marks: tally(withEdu.map((p) => String(p.education))), fieldRelation: tally(withEdu.map((p) => p.relation)) };
  const withCred = pairs.filter((p) => p.credentials !== null && p.eligibleNew);
  out.credentialsPart = { pairs: withCred.length, marks: tally(withCred.map((p) => String(p.credentials))) };
  const withLang = pairs.filter((p) => p.languages !== null && p.eligibleNew);
  out.languagesPart = { pairs: withLang.length, marks: tally(withLang.map((p) => String(p.languages))) };
  return out;
}

function top5Changed(pairs: PairRow[], v: Variant): number {
  const bySeeker = new Map<number, PairRow[]>();
  for (const p of pairs) {
    if (p.applied) continue;
    const list = bySeeker.get(p.seeker) ?? [];
    list.push(p);
    bySeeker.set(p.seeker, list);
  }
  let changed = 0;
  for (const list of bySeeker.values()) {
    const top = (variant: Variant) =>
      list
        .filter((p) => (variant === "today" ? p.eligibleToday : p.eligibleNew))
        .sort((a, b) => b.scores[variant] - a.scores[variant] || a.job - b.job)
        .slice(0, 5)
        .map((p) => p.job)
        .join(",");
    if (top("today") !== top(v)) changed++;
  }
  return changed;
}

function shortlistChange(pairs: PairRow[], jobs: JobRow[], v: Variant) {
  const perJob: number[] = [];
  for (let ji = 0; ji < jobs.length; ji++) {
    const pool = pairs.filter((p) => p.job === ji && !p.applied && p.inPool);
    const list = (variant: Variant) =>
      new Set(
        [...pool]
          .sort((a, b) => Number(variant === "today" ? b.eligibleToday : b.eligibleNew) - Number(variant === "today" ? a.eligibleToday : a.eligibleNew) || b.scores[variant] - a.scores[variant] || a.seeker - b.seeker)
          .slice(0, SHORTLIST)
          .map((p) => p.seeker),
      );
    const before = list("today");
    const after = list(v);
    perJob.push([...after].filter((s) => !before.has(s)).length);
  }
  return { jobs: perJob.length, jobsWhoseTop50Changed: perJob.filter((n) => n > 0).length, meanNewNamesInTop50: round1(perJob.reduce((a, b) => a + b, 0) / Math.max(1, perJob.length)), maxNewNames: Math.max(0, ...perJob) };
}

function jobTable(jobs: JobRow[]) {
  return jobs.map((j) => ({
    id: String(j.doc._id),
    title: j.doc.title,
    skills: j.profile.skills.length,
    educationToday: j.profile.requiredEducationLevel ?? 0,
    educationBox: (j.doc.requirements as { education?: string } | undefined)?.education ?? "",
    education: j.education,
    languages: j.languages,
    credentials: j.credentials.map((c) => ({ line: c.line, importance: c.importance, terms: c.terms, driving: c.driving, anyOf: c.anyOf })),
    visaLines: j.visaLines,
    qualifications: j.quals,
  }));
}

function degreeTable(docs: Document[]) {
  const counts = new Map<string, { n: number; today: number; new: number }>();
  for (const doc of docs) {
    for (const e of (doc.education as Array<{ degree?: string; field?: string; course?: string }> | undefined) ?? []) {
      const key = (e.degree ?? "").trim().toLowerCase();
      if (!key) continue;
      const row = counts.get(key) ?? { n: 0, today: Math.max(educationRank(e.degree), educationRank(e.field)), new: seekerEntryLevel(e) };
      row.n++;
      counts.set(key, row);
    }
  }
  const rows = [...counts.entries()].map(([degree, r]) => ({ degree, ...r })).sort((a, b) => b.n - a.n);
  const entries = rows.reduce((n, r) => n + r.n, 0);
  return {
    distinct: rows.length,
    entries,
    unreadableToday: rows.filter((r) => r.today === 0).reduce((n, r) => n + r.n, 0),
    unreadableNew: rows.filter((r) => r.new === 0).reduce((n, r) => n + r.n, 0),
    levelChanged: rows.filter((r) => r.today !== r.new).reduce((n, r) => n + r.n, 0),
    changes: tally(rows.flatMap((r) => (r.today !== r.new ? Array(r.n).fill(`${r.today}->${r.new}`) : []))),
    top: rows.slice(0, 80),
    topUnreadableNew: rows.filter((r) => r.new === 0).slice(0, 40),
    topChanged: rows.filter((r) => r.today !== r.new).slice(0, 60),
  };
}

function writePairsCsv(file: string, pairs: PairRow[], jobs: JobRow[], seekers: SeekerRow[], t: number) {
  const head = "job_id,job_title,seeker_id,applied,eligible_today,reason_today,eligible_new,reason_new,today,recommended,cautious,recommended_no_skills_out,tuned,education,field,credentials,languages";
  const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const lines = [head];
  for (const p of pairs) {
    const gateChanged = p.eligibleToday !== p.eligibleNew;
    const near = (p.eligibleToday || p.eligibleNew) && Math.max(...VARIANTS.map((v) => p.scores[v])) >= t - 20;
    if (!gateChanged && !near) continue;
    lines.push([
      String(jobs[p.job].doc._id), esc(jobs[p.job].doc.title), String(seekers[p.seeker].doc._id), p.applied, p.eligibleToday, p.reasonToday ?? "", p.eligibleNew, p.reasonNew ?? "",
      p.scores.today, p.scores.recommended, p.scores.cautious, p.scores.recommendedNoSkillsOut, p.scores.tuned, p.education ?? "", p.relation, p.credentials ?? "", p.languages ?? "",
    ].join(","));
  }
  fs.writeFileSync(file, lines.join("\n"));
}

function tally(values: string[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const v of values) out[v] = (out[v] ?? 0) + 1;
  return Object.fromEntries(Object.entries(out).sort((a, b) => b[1] - a[1]));
}
const round1 = (n: number) => Math.round(n * 10) / 10;

main().catch((err) => {
  process.stderr.write(`${err instanceof Error ? err.stack : String(err)}\n`);
  process.exit(1);
});
