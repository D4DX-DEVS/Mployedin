/**
 * The non-React parts of the bulk CV export: counting what the manifest says is
 * there, fetching one candidate's files, and handing the ZIP to the browser.
 *
 * Every fetch helper returns a result and never throws for a failed file (a
 * network error, a bad status, a render that rejects), so one candidate can
 * never stop the rest. When the export is cancelled the in-flight work still
 * settles here; the caller checks its own abort signal and drops the result.
 */
import { STAFF_CV_TEMPLATE } from "@/lib/jobSeeker/cvDesign";
import type { BuiltCvResponse } from "@/lib/cv/renderBuiltCv";
import type { CVPDFLabels } from "@/app/[locale]/(dashboard)/job-seeker/cv/pdf/shared";
import type { CvExportAllowedItem, CvExportManifestItem } from "@/lib/cv/cvExportTypes";
import type { CvExportMode, CvOriginalResult, CvStandardisedResult, CvZipEntry } from "@/lib/cv/cvZip";

/** One selected candidate, as the list page knows them. */
export interface CvExportItem {
  seekerId: string;
  /** Set where the list is of applicants: the original is then the CV sent with that application. */
  applicationId?: string | null;
  /** The list's own name for the candidate; used only where the manifest gives none (a row the person may not open). */
  name?: string;
}

/** What the manifest says, for the mode that is chosen. */
export interface CvExportCounts {
  /** Candidates selected. */
  total: number;
  /** Candidates the person may export. */
  allowed: number;
  /** Candidates the person may not open (they are listed as "no access" in the report). */
  denied: number;
  /** Allowed candidates with no standardised CV; 0 when the mode does not include it. */
  missingStandardised: number;
  /** Allowed candidates with no uploaded file; 0 when the mode does not include it. */
  missingOriginal: number;
  /** Candidates with at least one file the mode asks for. */
  exportable: number;
  /** For the "Show names" disclosure. */
  names: { denied: string[]; missingStandardised: string[]; missingOriginal: string[] };
}

/** Copy for the notes written into the report, already translated. */
export interface CvExportNotes {
  noProfileDetails: string;
  noUploadedFile: string;
  noAccess: string;
  notFound: string;
  downloadError: string;
  buildError: string;
  /** The candidate's Standardised CV is already in the ZIP (another application of theirs came first). */
  standardisedAlreadyIncluded: string;
}

export const wantsStandardised = (mode: CvExportMode) => mode !== "original";
export const wantsOriginal = (mode: CvExportMode) => mode !== "standardised";

const trimmed = (value: string | null | undefined) => (typeof value === "string" ? value.trim() : "");

/** The name shown for a candidate: the manifest's, else the list's, else a short id. */
export function displayName(row: CvExportManifestItem, item: CvExportItem, unnamed: (id: string) => string): string {
  const fromManifest = row.denied ? "" : trimmed(row.name);
  return fromManifest || trimmed(item.name) || unnamed(item.seekerId.slice(-6));
}

/** The name the ZIP uses; "" lets the ZIP name the file "Candidate {last6(id)}". */
export function zipName(row: CvExportManifestItem, item: CvExportItem): string {
  const fromManifest = row.denied ? "" : trimmed(row.name);
  return fromManifest || trimmed(item.name);
}

export function computeCounts(
  rows: readonly CvExportManifestItem[],
  items: readonly CvExportItem[],
  mode: CvExportMode,
  unnamed: (id: string) => string,
): CvExportCounts {
  const wantStandardised = wantsStandardised(mode);
  const wantOriginal = wantsOriginal(mode);
  const counts: CvExportCounts = {
    total: rows.length,
    allowed: 0,
    denied: 0,
    missingStandardised: 0,
    missingOriginal: 0,
    exportable: 0,
    names: { denied: [], missingStandardised: [], missingOriginal: [] },
  };

  // A candidate selected twice (two applications) gets one Standardised CV; the repeat adds nothing.
  const standardisedTaken = new Set<string>();
  rows.forEach((row, index) => {
    const item = items[index] ?? { seekerId: row.seekerId };
    const name = displayName(row, item, unnamed);
    if (row.denied) {
      counts.denied += 1;
      counts.names.denied.push(name);
      return;
    }
    counts.allowed += 1;
    if (wantStandardised && !row.hasStandardised) {
      counts.missingStandardised += 1;
      counts.names.missingStandardised.push(name);
    }
    if (wantOriginal && !row.hasOriginal) {
      counts.missingOriginal += 1;
      counts.names.missingOriginal.push(name);
    }
    const repeat = wantStandardised && row.hasStandardised && standardisedTaken.has(item.seekerId);
    if (wantStandardised && row.hasStandardised) standardisedTaken.add(item.seekerId);
    if ((wantStandardised && row.hasStandardised && !repeat) || (wantOriginal && row.hasOriginal)) counts.exportable += 1;
  });
  return counts;
}

export interface CvExportPlan {
  /** One entry per selected candidate, in input order, keyed by the item's `seekerId`. */
  entries: CvZipEntry[];
  /** Indexes (into `entries`) of the candidates that still have a file to fetch. */
  work: number[];
}

/**
 * What the export does for each candidate before any file is fetched. What the
 * manifest says is not there is settled now, with a note for the report; what is
 * left to fetch is queued in `work` and its result left unset. A candidate the
 * person may not open is never queued: only "original" can say "no access", so
 * the standardised side says why in its note.
 */
export function planCvExportEntries(
  rows: readonly CvExportManifestItem[],
  items: readonly CvExportItem[],
  mode: CvExportMode,
  notes: CvExportNotes,
): CvExportPlan {
  const wantStandardised = wantsStandardised(mode);
  const wantOriginal = wantsOriginal(mode);
  const entries: CvZipEntry[] = [];
  const work: number[] = [];
  /** Seekers whose Standardised CV is already queued: the originals stay per application, this one is drawn once. */
  const standardisedQueued = new Set<string>();

  rows.forEach((row, index) => {
    const entry: CvZipEntry = { id: items[index].seekerId, name: zipName(row, items[index]) };
    entries.push(entry);
    if (row.denied) {
      if (wantStandardised) entry.standardised = { status: "missing", note: notes.noAccess };
      if (wantOriginal) entry.original = { status: "no access" };
      return;
    }
    let fetches = false;
    if (wantStandardised) {
      if (row.hasStandardised) {
        if (standardisedQueued.has(items[index].seekerId)) {
          entry.standardised = { status: "missing", note: notes.standardisedAlreadyIncluded };
        } else {
          standardisedQueued.add(items[index].seekerId);
          fetches = true;
        }
      } else entry.standardised = { status: "missing", note: notes.noProfileDetails };
    }
    if (wantOriginal) {
      if (row.hasOriginal) fetches = true;
      else entry.original = { status: "missing", note: notes.noUploadedFile };
    }
    if (fetches) work.push(index);
  });

  return { entries, work };
}

/** The candidate's uploaded CV (or the CV sent with their application), through the CV route's gate. */
export async function fetchOriginal(
  row: CvExportAllowedItem,
  signal: AbortSignal,
  extFromResponse: (contentType?: string | null, url?: string | null) => string,
  notes: CvExportNotes,
): Promise<CvOriginalResult> {
  try {
    const res = await fetch(row.originalUrl, { credentials: "same-origin", signal });
    if (res.status === 404) return { status: "missing", note: notes.noUploadedFile };
    if (res.status === 403) return { status: "no access" };
    if (!res.ok) return { status: "error", note: notes.downloadError };
    const blob = await res.blob();
    if (blob.size === 0) return { status: "error", note: notes.downloadError };
    return { status: "ok", blob, ext: extFromResponse(res.headers.get("Content-Type"), row.originalUrl) };
  } catch {
    return { status: "error", note: notes.downloadError };
  }
}

/** The candidate's standardised CV: their profile details fetched, then drawn as a PDF in the staff template. */
export async function fetchStandardised(
  row: CvExportAllowedItem,
  signal: AbortSignal,
  labels: CVPDFLabels,
  render: (data: BuiltCvResponse, labels: CVPDFLabels, opts: { templateId: string }) => Promise<Blob>,
  notes: CvExportNotes,
): Promise<CvStandardisedResult> {
  let built: BuiltCvResponse;
  try {
    const res = await fetch(row.builtUrl, { credentials: "same-origin", signal });
    if (res.status === 404) return { status: "missing", note: notes.notFound };
    if (res.status === 403) return { status: "error", note: notes.noAccess };
    if (!res.ok) return { status: "error", note: notes.downloadError };
    built = (await res.json()) as BuiltCvResponse;
  } catch {
    return { status: "error", note: notes.downloadError };
  }
  if (!built?.hasContent) return { status: "missing", note: notes.noProfileDetails };
  try {
    return { status: "ok", blob: await render(built, labels, { templateId: STAFF_CV_TEMPLATE }) };
  } catch {
    // The renderer is serialised and has its own timeout, so it can reject for one candidate.
    return { status: "error", note: notes.buildError };
  }
}

/** Hands a Blob to the browser as a file download: the one shared helper, with its delayed revoke. */
export { saveBlob as downloadBlob } from "@/lib/download/saveBlob";
