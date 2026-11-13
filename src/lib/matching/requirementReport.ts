/**
 * The requirement report: every requirement the job states, one row each, with
 * what this candidate has against it. The employer reads it on each applicant
 * ("has / partly / does not have / needs checking"); the seeker reads the same
 * rows on the job page. Built from one RequirementEvaluation (requirementParts.ts)
 * plus the skill match, so both sides and both scores agree.
 *
 * Pure, no I/O. Serialisable: stored on Application.requirementReport.
 */

import type { RelevanceBreakdown } from "@/lib/matching/relevance";
import type { RequirementEvaluation, MustHaveStatus } from "@/lib/matching/requirementParts";
import type { JobRequirements } from "@/lib/matching/jobRequirements";

/** "info": shown for the employer's eye only — not asked, never a must-have, no points. */
export type ReportVerdict = "has" | "partial" | "missing" | "verify" | "info";
export type ReportKind = "education" | "experience" | "skill" | "preferred_skill" | "credential" | "language" | "visa";

export interface ReportItem {
  kind: ReportKind;
  verdict: ReportVerdict;
  mustHave: boolean;
  /** "Has" by an equivalent rather than the exact wording (a master's for a bachelor's). */
  equivalent?: boolean;
  /** The job's words: "Bachelor's in Computer Science", "5+ years in MERN stack". */
  required: string;
  /** What the candidate shows, as written; empty when nothing. */
  actual: string;
  /** Machine-readable details, for copy built in the UI. */
  detail?: {
    level?: number;
    heldLevel?: number;
    relation?: string;
    minYears?: number;
    maxYears?: number;
    totalYears?: number | null;
    relevantYears?: number | null;
    relevantRoles?: string[];
    /** Roles whose missing end date keeps the years requirement unconfirmed. */
    needsEndDate?: string[];
    /** Years counted without those roles' guessed spans. */
    confirmedYears?: number;
    have?: string[];
    missing?: string[];
  };
  /** Where the evidence came from. */
  source?: "profile" | "cv" | "none";
}

export interface RequirementReport {
  items: ReportItem[];
  counts: Record<ReportVerdict, number>;
  /** Must-haves only. */
  mustHaves: { total: number; has: number; partial: number; missing: number; verify: number };
  status: MustHaveStatus;
}

const VERDICT: Record<string, ReportVerdict> = { met: "has", partial: "partial", not_met: "missing", unknown: "verify" };

const languageLabel = (name: string) => name.replace(/(^|[\s-])(\p{L})/gu, (_m, sep: string, c: string) => sep + c.toUpperCase());

const LEVEL_NAME = ["", "School", "Diploma", "Bachelor's degree", "Master's degree", "Doctorate"];

function educationRequired(req: JobRequirements["education"]): string {
  if (req.text.trim()) return req.text.trim();
  const field = req.fields[0] ? ` in ${req.fields[0]}` : "";
  return `${LEVEL_NAME[req.level] ?? ""}${field}`.trim();
}

function yearsRequired(req: JobRequirements["experience"]): string {
  const band =
    req.maxYears > req.minYears && req.maxYears < 50 ? `${req.minYears}–${req.maxYears} years` : `${req.minYears}+ years`;
  // "in X" only when the employer named the subject (form or a qualification
  // line); a subject read off the title printed "1–10 years in E2E Pipeline
  // QA Engineer 1794404268367".
  return req.subject && req.subjectSource !== "title" ? `${band} in ${req.subject}` : band;
}

type SkillSide = Pick<
  RelevanceBreakdown,
  "requiredMatched" | "requiredMissing" | "skillsUnknown" | "preferredMatched" | "preferredMissing"
>;

/** Report from a relevance breakdown (it carries the evaluation and the skill split). */
export function reportFromBreakdown(
  breakdown: SkillSide & { evaluation?: RequirementEvaluation },
  requirements: JobRequirements | undefined,
): RequirementReport {
  // A breakdown stored or built before requirement evaluation existed.
  if (!breakdown.evaluation) return EMPTY_REPORT;
  return buildRequirementReport(breakdown.evaluation, breakdown, requirements);
}

const EMPTY_REPORT: RequirementReport = {
  items: [],
  counts: { has: 0, partial: 0, missing: 0, verify: 0, info: 0 },
  mustHaves: { total: 0, has: 0, partial: 0, missing: 0, verify: 0 },
  status: "met",
};

export function buildRequirementReport(
  evaluation: RequirementEvaluation,
  skills: SkillSide,
  requirements: JobRequirements | undefined,
): RequirementReport {
  const items: ReportItem[] = [];
  const preferred = { matched: skills.preferredMatched ?? [], missing: skills.preferredMissing ?? [] };

  const ed = evaluation.education;
  if (ed) {
    items.push({
      kind: "education",
      verdict: VERDICT[ed.status],
      mustHave: ed.asked.importance === "must",
      ...(ed.equivalent ? { equivalent: true } : {}),
      required: educationRequired(ed.asked),
      actual: ed.entry ?? "",
      detail: { level: ed.asked.level, heldLevel: ed.held, relation: ed.relation },
      source: ed.entry ? "profile" : "none",
    });
  } else {
    // The job sets no education, so it scores nothing (D19) — but HR still
    // wants to see what the candidate holds (owner, 2026-11-12). Display only.
    const held = evaluation.heldEducation ?? "";
    items.push({ kind: "education", verdict: "info", mustHave: false, required: "", actual: held, source: held ? "profile" : "none" });
  }

  const ex = evaluation.experience;
  if (ex.asked.minYears > 0) {
    items.push({
      kind: "experience",
      verdict: VERDICT[ex.status],
      mustHave: ex.asked.importance === "must",
      required: yearsRequired(ex.asked),
      actual: ex.relevantRoles
        .slice(0, 3)
        .map((r) => [r.title, r.company].filter(Boolean).join(" · "))
        .join("; "),
      detail: {
        minYears: ex.asked.minYears,
        maxYears: ex.asked.maxYears,
        totalYears: ex.known ? Math.round(ex.totalYears * 10) / 10 : null,
        relevantYears: ex.relevantYears,
        relevantRoles: ex.relevantRoles.slice(0, 5).map((r) => r.title).filter(Boolean),
        ...(ex.needsEndDate?.length ? { needsEndDate: ex.needsEndDate.slice(0, 3), confirmedYears: ex.confirmedYears } : {}),
      },
      source: ex.known ? "profile" : "none",
    });
  }

  if (!skills.skillsUnknown) {
    for (const s of skills.requiredMatched ?? []) items.push({ kind: "skill", verdict: "has", mustHave: true, required: s, actual: s, source: "profile" });
    for (const s of skills.requiredMissing ?? []) items.push({ kind: "skill", verdict: "missing", mustHave: true, required: s, actual: "", source: "none" });
  }
  for (const s of preferred.matched) items.push({ kind: "preferred_skill", verdict: "has", mustHave: false, required: s, actual: s, source: "profile" });
  for (const s of preferred.missing) items.push({ kind: "preferred_skill", verdict: "missing", mustHave: false, required: s, actual: "", source: "none" });

  for (const c of evaluation.credentials) {
    items.push({
      kind: "credential",
      verdict: VERDICT[c.status],
      mustHave: c.asked.importance === "must",
      required: c.asked.name,
      actual: c.quote ?? "",
      source: c.found === "listed" ? "profile" : c.found === "cv" ? "cv" : "none",
    });
  }

  const lang = evaluation.languages;
  if (lang) {
    // Stored lower-cased for matching; shown as names: "English, Malayalam".
    const have = lang.have.map(languageLabel);
    const missing = lang.missing.map(languageLabel);
    items.push({
      kind: "language",
      verdict: VERDICT[lang.status],
      mustHave: lang.importance === "must",
      required: [...have, ...missing].join(", "),
      actual: have.join(", "),
      detail: { have, missing },
      source: have.length ? "profile" : "none",
    });
  }

  for (const line of requirements?.visaLines ?? []) {
    items.push({ kind: "visa", verdict: "verify", mustHave: false, required: line, actual: "", source: "none" });
  }

  const counts: Record<ReportVerdict, number> = { has: 0, partial: 0, missing: 0, verify: 0, info: 0 };
  // "info" rows are not requirements: they count toward nothing.
  for (const item of items) if (item.verdict !== "info") counts[item.verdict] += 1;
  const must = items.filter((i) => i.mustHave && i.kind !== "skill");
  return {
    items,
    counts,
    mustHaves: {
      total: must.length,
      has: must.filter((i) => i.verdict === "has").length,
      partial: must.filter((i) => i.verdict === "partial").length,
      missing: must.filter((i) => i.verdict === "missing").length,
      verify: must.filter((i) => i.verdict === "verify").length,
    },
    status: evaluation.mustHaveStatus,
  };
}
