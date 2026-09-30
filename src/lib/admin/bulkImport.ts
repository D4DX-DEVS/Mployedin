/**
 * Admin bulk import: the CSV templates, the row checks and the job mapping.
 * The page validates rows with these before upload and the route re-checks
 * them, so a row the preview marks valid is one the server will accept.
 */

export type BulkImportType = "users" | "jobs" | "employers";

/** Column order of each downloadable template. */
export const BULK_IMPORT_TEMPLATES: Record<BulkImportType, readonly string[]> = {
  // The users import creates job seekers only: employers have their own
  // import, and staff accounts need territories and rates set one by one.
  users: ["fullName", "email", "phone", "country"],
  // City and country are separate columns: a "Dubai, UAE" cell would need
  // quoting that spreadsheet exports do not always apply.
  jobs: ["title", "company", "city", "country", "description", "type", "salaryMin", "salaryMax", "currency"],
  employers: ["companyName", "email", "industry", "phone", "country", "website"],
};

export const BULK_IMPORT_REQUIRED: Record<BulkImportType, readonly string[]> = {
  users: ["fullName", "email"],
  jobs: ["title", "company", "city", "country", "description"],
  employers: ["companyName", "email"],
};

/** Mirrors the Job model's employmentType enum. */
export const JOB_EMPLOYMENT_TYPES = ["full_time", "part_time", "contract", "internship", "freelance", "walk_in"] as const;
export type JobEmploymentType = (typeof JOB_EMPLOYMENT_TYPES)[number];

export type BulkImportErrorCode =
  | "missing_fields"
  | "invalid_email"
  | "role_not_allowed"
  | "invalid_type"
  | "invalid_salary"
  | "email_exists"
  | "employer_not_found"
  | "employer_ambiguous"
  | "duplicate"
  | "failed";

export interface RowIssue {
  code: BulkImportErrorCode;
  params?: Record<string, string>;
}

export interface ImportRow {
  rowNumber: number;
  data: Record<string, string>;
  issues: RowIssue[];
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** RFC 4180-style CSV: quoted fields may hold commas, quotes ("") and newlines. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text; // byte-order mark
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") { row.push(field); field = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += ch;
  }
  if (field !== "" || row.length > 0) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((cell) => cell.trim() !== ""));
}

function normaliseType(value: string): string {
  return value.trim().toLowerCase().replace(/[\s-]+/g, "_");
}

function salaryNumber(value: string | undefined): number | null | undefined {
  if (!value?.trim()) return undefined;
  const n = Number(value.replace(/,/g, "").trim());
  return Number.isFinite(n) && n >= 0 ? n : null;
}

export function validateImportRow(type: BulkImportType, row: Record<string, string>): RowIssue[] {
  const issues: RowIssue[] = [];
  const missing = BULK_IMPORT_REQUIRED[type].filter((field) => !row[field]?.trim());
  if (missing.length) issues.push({ code: "missing_fields", params: { fields: missing.join(", ") } });
  if (row.email?.trim() && !EMAIL_RE.test(row.email.trim())) issues.push({ code: "invalid_email" });

  if (type === "users") {
    // Older templates carried a role column; honour it only when it says job seeker.
    const role = row.role?.trim();
    if (role && normaliseType(role) !== "job_seeker") issues.push({ code: "role_not_allowed", params: { role } });
  }

  if (type === "jobs") {
    if (row.type?.trim() && !JOB_EMPLOYMENT_TYPES.includes(normaliseType(row.type) as JobEmploymentType)) {
      issues.push({ code: "invalid_type", params: { value: row.type.trim() } });
    }
    const min = salaryNumber(row.salaryMin);
    const max = salaryNumber(row.salaryMax);
    if (min === null || max === null || (min != null && max != null && min > max)) issues.push({ code: "invalid_salary" });
  }
  return issues;
}

/** CSV text → rows keyed by the header line, each with its issues. */
export function parseImportRows(type: BulkImportType, text: string): ImportRow[] {
  const [headers, ...lines] = parseCsv(text);
  if (!headers) return [];
  const keys = headers.map((h) => h.trim());
  return lines.map((values, index) => {
    const data: Record<string, string> = {};
    keys.forEach((key, i) => { if (key) data[key] = (values[i] ?? "").trim(); });
    return { rowNumber: index + 1, data, issues: validateImportRow(type, data) };
  });
}

export interface JobDraft {
  title: string;
  description: string;
  location: { city: string; country: string; isRemote: false };
  employmentType: JobEmploymentType;
  salary?: { min?: number; max?: number; currency: string; period: "monthly" };
}

/** A validated jobs row → the fields of a draft Job (employer resolved by the caller). */
export function jobDraftFromRow(row: Record<string, string>): JobDraft {
  const type = row.type?.trim() ? normaliseType(row.type) : "full_time";
  const min = salaryNumber(row.salaryMin) ?? undefined;
  const max = salaryNumber(row.salaryMax) ?? undefined;
  return {
    title: row.title.trim(),
    description: row.description.trim(),
    location: { city: row.city.trim(), country: row.country.trim(), isRemote: false },
    employmentType: type as JobEmploymentType,
    ...(min !== undefined || max !== undefined
      ? { salary: { ...(min !== undefined ? { min } : {}), ...(max !== undefined ? { max } : {}), currency: (row.currency?.trim() || "AED").toUpperCase(), period: "monthly" as const } }
      : {}),
  };
}
