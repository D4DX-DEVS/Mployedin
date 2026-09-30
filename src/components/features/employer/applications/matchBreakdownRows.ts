/**
 * The rows of the employer's match breakdown — "why this score".
 *
 * A part the candidate gave nothing for (experience or education the checklist
 * marks unknown) is shown as "Not provided", not as the low percentage it now
 * scores; the CV gets its own row; every measured part carries a word for how
 * strong it is (client report 2026-09-30, #9).
 */

export type FitWord = "strong" | "fair" | "weak";
export type BreakdownRowKey = "skills" | "roleFit" | "experience" | "education" | "industry" | "location" | "salary" | "cv";
export type BreakdownRowState = "not_provided" | "read" | "reading" | "unreadable";

export type BreakdownRow =
  | { key: BreakdownRowKey; value: number; fit: FitWord }
  | { key: BreakdownRowKey; value: null; state: BreakdownRowState };

interface BreakdownInput {
  skills?: number;
  role?: number;
  experience?: number;
  education?: number;
  industry?: number;
  location?: number;
  salary?: number;
  /** The headline score — not a row; it is already the panel header. */
  overall?: number;
}

interface CheckInput {
  key: string;
  status: string;
  actual?: string;
}

/** Same bands as the bar colours: green from 70, amber from 50. */
export function fitWord(value: number): FitWord {
  return value >= 70 ? "strong" : value >= 50 ? "fair" : "weak";
}

const CV_STATES: readonly BreakdownRowState[] = ["read", "reading", "unreadable"];

export function matchBreakdownRows(
  breakdown: BreakdownInput,
  checks: readonly CheckInput[] | null | undefined,
): BreakdownRow[] {
  const statusOf = (key: string) => checks?.find((check) => check.key === key)?.status;
  const rows: BreakdownRow[] = [];
  const add = (key: BreakdownRowKey, value: number | undefined, checkKey?: string) => {
    // Rows whose part was never scored drop out rather than reading as 0%.
    if (typeof value !== "number") return;
    if (checkKey && statusOf(checkKey) === "unknown") rows.push({ key, value: null, state: "not_provided" });
    else rows.push({ key, value, fit: fitWord(value) });
  };

  add("skills", breakdown.skills);
  // Engine rows carry role fit and no location / salary (those are gates
  // there, not parts); older rows the reverse.
  add("roleFit", breakdown.role);
  add("experience", breakdown.experience, "experience");
  // Present only when the job names a qualification / an industry.
  add("education", breakdown.education, "education");
  add("industry", breakdown.industry);
  add("location", breakdown.location);
  add("salary", breakdown.salary);

  const cv = checks?.find((check) => check.key === "cv");
  if (cv) {
    const state = (CV_STATES as readonly string[]).includes(cv.actual ?? "") ? (cv.actual as BreakdownRowState) : "not_provided";
    rows.push({ key: "cv", value: null, state });
  }
  return rows;
}
