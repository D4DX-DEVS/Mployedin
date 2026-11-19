/**
 * Downloads for the Copilot's ranked candidate shortlist: an Excel sheet, a PDF
 * report, and the rows the shared CV export (CvExportDialog) writes beside the
 * CVs. Contact details are fetched here, at click time, so they never pass
 * through the chat model.
 */

import type { CvDetails } from "@/lib/cv/cvZip";

export interface ShortlistDetail {
  id: string;
  name: string;
  headline: string;
  title: string;
  email: string;
  phone: string;
  skills: string[];
  nationality: string;
  location: string;
  experienceYears: number | null;
  hasCV: boolean;
}

export interface ShortlistColumns {
  rank: string;
  name: string;
  title: string;
  fit: string;
  experience: string;
  location: string;
  nationality: string;
  email: string;
  phone: string;
  skills: string;
}

/** The picked seekers' full details, in the ranking's order. Admin-only route. */
export async function fetchShortlistDetails(ids: string[]): Promise<ShortlistDetail[]> {
  const res = await fetch("/api/job-seekers/bulk-cv-download", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ids, includeWithoutCv: true }),
  });
  if (!res.ok) throw new Error(`shortlist details ${res.status}`);
  const json = (await res.json()) as { cvs?: ShortlistDetail[] };
  return json.cvs ?? [];
}

function fileSafe(text: string): string {
  return text.replace(/[^\p{L}\p{N} _-]/gu, "").trim().replace(/\s+/g, "-").slice(0, 60) || "candidates";
}

export function shortlistFileName(brief: string, ext: string): string {
  return `shortlist-${fileSafe(brief)}.${ext}`;
}

function sheetRows(details: ShortlistDetail[], fits: Map<string, number>, cols: ShortlistColumns): string[][] {
  const header = [cols.rank, cols.name, cols.title, cols.fit, cols.experience, cols.location, cols.nationality, cols.email, cols.phone, cols.skills];
  return [
    header,
    ...details.map((d, i) => [
      String(i + 1),
      d.name,
      d.title || d.headline,
      fits.has(d.id) ? `${fits.get(d.id)}%` : "",
      d.experienceYears != null ? String(d.experienceYears) : "",
      d.location,
      d.nationality,
      d.email,
      d.phone,
      d.skills.join(", "),
    ]),
  ];
}

/**
 * The shortlist's sheet columns for the CV export's `candidates.xlsx`, keyed by
 * seeker id (the export matches rows to candidates by id, never by position).
 * The export appends its own "Standardised" / "Original" columns.
 */
export function shortlistCvDetails(details: ShortlistDetail[], fits: Map<string, number>, cols: ShortlistColumns): CvDetails {
  const [header, ...rows] = sheetRows(details, fits, cols);
  return { header, rowsById: new Map(details.map((d, i) => [d.id, rows[i]])) };
}

export async function downloadShortlistExcel(details: ShortlistDetail[], fits: Map<string, number>, cols: ShortlistColumns, brief: string) {
  const { exportExcelRows } = await import("@/lib/export");
  await exportExcelRows(sheetRows(details, fits, cols), shortlistFileName(brief, "xlsx"), "Shortlist");
}

export async function downloadShortlistPdf(details: ShortlistDetail[], fits: Map<string, number>, cols: ShortlistColumns, brief: string, title: string) {
  const { exportPdf } = await import("@/lib/export");
  const rows = details.map((d, i) => ({
    rank: String(i + 1),
    name: d.name,
    title: d.title || d.headline,
    fit: fits.has(d.id) ? `${fits.get(d.id)}%` : "",
    experience: d.experienceYears != null ? String(d.experienceYears) : "",
    location: d.location,
    email: d.email,
    phone: d.phone,
  }));
  type Row = (typeof rows)[number];
  const columns: Array<{ header: string; key: keyof Row }> = [
    { header: cols.rank, key: "rank" },
    { header: cols.name, key: "name" },
    { header: cols.title, key: "title" },
    { header: cols.fit, key: "fit" },
    { header: cols.experience, key: "experience" },
    { header: cols.location, key: "location" },
    { header: cols.email, key: "email" },
    { header: cols.phone, key: "phone" },
  ];
  await exportPdf(rows, columns, shortlistFileName(brief, "pdf"), brief ? `${title} — ${brief}` : title);
}
