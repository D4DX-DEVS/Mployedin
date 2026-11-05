/**
 * Downloads for the Copilot's ranked candidate shortlist: an Excel sheet, a
 * PDF report, or a ZIP with every CV beside the sheet. Contact details are
 * fetched here, at click time, so they never pass through the chat model.
 */

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
  cv: string;
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

function sheetRows(
  details: ShortlistDetail[],
  fits: Map<string, number>,
  cols: ShortlistColumns,
  cvFiles?: Map<string, string>,
): string[][] {
  const header = [cols.rank, cols.name, cols.title, cols.fit, cols.experience, cols.location, cols.nationality, cols.email, cols.phone, cols.skills];
  return [
    cvFiles ? [...header, cols.cv] : header,
    ...details.map((d, i) => {
      const row = [
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
      ];
      return cvFiles ? [...row, cvFiles.get(d.id) ?? ""] : row;
    }),
  ];
}

function triggerDownload(blob: Blob, filename: string) {
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(link.href);
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

const extFromType = (ct: string | null): string =>
  ct?.includes("pdf") ? "pdf"
  : ct?.includes("wordprocessingml") ? "docx"
  : ct?.includes("msword") ? "doc"
  : ct?.includes("png") ? "png"
  : ct?.includes("jpeg") ? "jpg"
  : "pdf";

/** ZIP of every CV plus the sheet (with each CV's file name). Returns how many CVs made it in. */
export async function downloadShortlistZip(details: ShortlistDetail[], fits: Map<string, number>, cols: ShortlistColumns, brief: string): Promise<number> {
  const [{ default: JSZip }, { xlsxBlobFromRows }] = await Promise.all([import("jszip"), import("@/lib/export")]);
  const zip = new JSZip();
  const cvFiles = new Map<string, string>();
  for (const [i, d] of details.entries()) {
    if (!d.hasCV) continue;
    try {
      // Streamed through the authenticated endpoint: stored files are private.
      const fileRes = await fetch(`/api/employers/candidates/${d.id}/cv`);
      if (!fileRes.ok) continue;
      const name = `CVs/${String(i + 1).padStart(2, "0")}-${fileSafe(d.name)}.${extFromType(fileRes.headers.get("content-type"))}`;
      zip.file(name, await fileRes.arrayBuffer());
      cvFiles.set(d.id, name);
    } catch {
      // One unreadable CV must not sink the rest.
    }
  }
  zip.file("candidates.xlsx", await xlsxBlobFromRows(sheetRows(details, fits, cols, cvFiles), "Shortlist"));
  triggerDownload(await zip.generateAsync({ type: "blob" }), shortlistFileName(brief, "zip"));
  return cvFiles.size;
}
