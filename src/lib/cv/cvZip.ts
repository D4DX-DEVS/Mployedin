/**
 * Helpers for the bulk CV export ZIP.
 *
 * Pure and browser-safe: the dialog fetches each candidate's CV(s), hands the
 * Blobs to `buildCvZip`, and downloads the result. Nothing here touches the
 * network, the DOM or storage.
 *
 * Layout (see plan section 4.3):
 *   Mployedin-CVs-YYYY-MM-DD-HHmm.zip
 *   |- Standardised/   "{Name} - Standardised CV (Mployedin).pdf"   (standardised | both)
 *   |- Original/       "{Name} - Original CV.{ext}"                 (original | both)
 *   (a folder exists only when at least one file was written into it)
 *   |- candidates.xlsx (only when detailsRows are given)
 *   `- export-report.csv
 */
import { xlsxBlobFromRows } from "@/lib/export";
import { csvCell } from "@/lib/export/csvCell";

export type CvExportMode = "standardised" | "original" | "both";

export type CvStandardisedResult =
  | { status: "ok"; blob: Blob }
  | { status: "missing" | "error"; note?: string };

export type CvOriginalResult =
  | { status: "ok"; blob: Blob; ext: string }
  | { status: "missing" | "error" | "no access"; note?: string };

export interface CvZipEntry {
  id: string;
  name: string;
  /** Result for the standardised CV. Absent for a requested type counts as "missing". */
  standardised?: CvStandardisedResult;
  /** Result for the original CV. Absent for a requested type counts as "missing". */
  original?: CvOriginalResult;
}

export interface CvReportRow {
  name: string;
  /** "" when the export mode did not include this type. */
  standardised: "ok" | "missing" | "error" | "";
  /** "" when the export mode did not include this type. */
  original: "ok" | "missing" | "error" | "no access" | "";
  note: string;
  /**
   * Paths of the CV files actually written for this candidate, relative to the
   * ZIP root (for example `Original/Sara Ahmed (2) - Original CV.docx`), so a
   * duplicate name can be matched to its " (2)" file. Empty when nothing was written.
   */
  files: string[];
}

/** Extra spreadsheet columns for `candidates.xlsx`, keyed by `CvZipEntry.id`. */
export interface CvDetails {
  /** Column headings of the existing candidate columns (no flag columns). */
  header: string[];
  /**
   * Existing column values for each candidate, keyed by entry id. Rows are matched
   * to entries by id, never by position, and are written in `entries` order. An
   * entry without a row is left out of the sheet (it is still in the report); rows
   * for ids that are not in `entries` are ignored. Each row is padded or trimmed
   * to `header.length` so the appended columns always line up.
   */
  rowsById: ReadonlyMap<string, string[]>;
}

export interface BuildCvZipInput {
  mode: CvExportMode;
  entries: CvZipEntry[];
  /** Optional: adds `candidates.xlsx` with "Standardised" and "Original" Yes/No columns appended. */
  details?: CvDetails;
  now: Date;
}

export interface BuildCvZipResult {
  blob: Blob;
  fileName: string;
  report: CvReportRow[];
  /** CV files written into the ZIP (not counting candidates.xlsx / the report). */
  fileCount: number;
  /** Candidates with at least one CV file in the ZIP. */
  exportedCandidates: number;
  /** Candidates with no CV file in the ZIP (listed in the report). */
  skippedCandidates: number;
}

const STANDARDISED_DIR = "Standardised";
const ORIGINAL_DIR = "Original";
const REPORT_FILE = "export-report.csv";
const DETAILS_FILE = "candidates.xlsx";
const MAX_NAME_LENGTH = 80;

const STANDARDISED_SUFFIX = " - Standardised CV (Mployedin).pdf";
const ORIGINAL_SUFFIX_BASE = " - Original CV.";
const MAX_EXT_LENGTH = 5;
/** Whole file name (stem + suffix + extension), in UTF-8 bytes. Most file systems allow 255. */
const MAX_FILE_NAME_BYTES = 200;
/** All suffix characters are ASCII, so length === bytes. */
const LONGEST_SUFFIX_BYTES = Math.max(
  STANDARDISED_SUFFIX.length,
  ORIGINAL_SUFFIX_BASE.length + MAX_EXT_LENGTH,
);
/** Byte budget for the candidate-name stem, so the longest possible file name still fits. */
const MAX_STEM_BYTES = MAX_FILE_NAME_BYTES - LONGEST_SUFFIX_BYTES;
const BOM = String.fromCharCode(0xfeff);

/* ── file names ──────────────────────────────────────── */

// Path separators + Windows-reserved characters.
const ILLEGAL_FILE_CHARS = /[\\/:*?"<>|]/g;
// C0/C1 control characters.
const CONTROL_CHARS = new RegExp("[\\u0000-\\u001F\\u007F-\\u009F]", "g");
// Bidi embedding/override/isolate controls (can disguise an extension).
// LRM/RLM and joiners are kept: Arabic and Persian names legitimately use them.
const BIDI_OVERRIDES = new RegExp("[\\u202A-\\u202E\\u2066-\\u2069]", "g");

function cleanName(raw: string): string {
  return String(raw ?? "")
    .replace(ILLEGAL_FILE_CHARS, "")
    .replace(CONTROL_CHARS, "")
    .replace(BIDI_OVERRIDES, "")
    .replace(/\s+/g, " ")
    .trim();
}

function utf8Length(codePoint: number): number {
  if (codePoint < 0x80) return 1;
  if (codePoint < 0x800) return 2;
  if (codePoint < 0x10000) return 3; // lone surrogates are written as U+FFFD (3 bytes)
  return 4;
}

/**
 * Cut to at most `maxUnits` UTF-16 units AND `maxBytes` UTF-8 bytes. Walks whole
 * code points, so a surrogate pair is kept or dropped together, never split.
 */
function capName(value: string, maxUnits: number, maxBytes: number): string {
  let units = 0;
  let bytes = 0;
  let out = "";
  for (const ch of Array.from(value)) {
    const size = utf8Length(ch.codePointAt(0) ?? 0);
    if (units + ch.length > maxUnits || bytes + size > maxBytes) break;
    units += ch.length;
    bytes += size;
    out += ch;
  }
  return out.trim();
}

function dedupeKey(name: string): string {
  return name.normalize("NFC").toLowerCase();
}

/**
 * A file-system-safe, unique name for one candidate (no extension, no type
 * suffix). Keeps Unicode (Arabic stays readable). The stem is capped at 80
 * characters and at a UTF-8 byte budget (166), so that stem + the longest suffix
 * + extension is at most 200 bytes. `used` is owned by this
 * function: pass one empty Set per export and reuse it for every candidate;
 * it stores normalised lower-case keys, so de-duplication is case-insensitive.
 */
export function safeCvFileName(name: string, fallbackId: string, used: Set<string>): string {
  let base = capName(cleanName(name), MAX_NAME_LENGTH, MAX_STEM_BYTES);
  if (!base) {
    base = capName(cleanName(`Candidate ${String(fallbackId ?? "").slice(-6)}`), MAX_NAME_LENGTH, MAX_STEM_BYTES);
  }

  let candidate = base;
  let n = 1;
  while (used.has(dedupeKey(candidate))) {
    n += 1;
    const suffix = ` (${n})`;
    candidate = capName(base, MAX_NAME_LENGTH - suffix.length, MAX_STEM_BYTES - suffix.length) + suffix;
  }
  used.add(dedupeKey(candidate));
  return candidate;
}

/**
 * The name one candidate's standardised CV is saved under on its own (the
 * viewer's Download): the export's "{Name} - Standardised CV (Mployedin).pdf",
 * made safe the same way. Not de-duplicated: there is only one file.
 */
export function standardisedCvFileName(name: string, fallbackId: string): string {
  return `${safeCvFileName(name, fallbackId, new Set())}${STANDARDISED_SUFFIX}`;
}

/* ── extensions ──────────────────────────────────────── */

const MIME_TO_EXT: Record<string, string> = {
  "application/pdf": "pdf",
  "application/x-pdf": "pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/msword": "doc",
  "application/rtf": "rtf",
  "text/rtf": "rtf",
  "application/vnd.oasis.opendocument.text": "odt",
  "text/plain": "txt",
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/pjpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/heic": "heic",
  "image/heif": "heic",
  "image/tiff": "tif",
};

const KNOWN_EXTS = new Set(["pdf", "docx", "doc", "rtf", "odt", "txt", "png", "jpg", "webp", "gif", "heic", "tif"]);

function normaliseExt(ext: string): string | null {
  const lower = ext.toLowerCase();
  const mapped = lower === "jpeg" ? "jpg" : lower === "tiff" ? "tif" : lower;
  return KNOWN_EXTS.has(mapped) ? mapped : null;
}

function extFromUrl(url: string): string | null {
  let path: string;
  try {
    path = new URL(url, "http://localhost").pathname; // relative URLs allowed
  } catch {
    path = url.split(/[?#]/)[0] ?? "";
  }
  let last = path.split("/").pop() ?? "";
  try {
    last = decodeURIComponent(last);
  } catch {
    // keep the raw segment
  }
  const match = /\.([A-Za-z0-9]{1,5})$/.exec(last);
  return match ? normaliseExt(match[1]) : null;
}

/**
 * File extension (no dot) for a downloaded CV. A recognised Content-Type wins;
 * otherwise the URL's extension; otherwise "pdf".
 */
export function extFromResponse(contentType?: string | null, url?: string | null): string {
  const mime = (contentType ?? "").split(";")[0].trim().toLowerCase();
  const fromMime = MIME_TO_EXT[mime];
  if (fromMime) return fromMime;
  if (url) {
    const fromUrl = extFromUrl(url);
    if (fromUrl) return fromUrl;
  }
  return "pdf";
}

/* ── ZIP name ────────────────────────────────────────── */

function pad(value: number, width = 2): string {
  return String(value).padStart(width, "0");
}

/** `Mployedin-CVs-YYYY-MM-DD-HHmm.zip` in the user's local time. */
export function cvZipFileName(now: Date): string {
  const date = `${pad(now.getFullYear(), 4)}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const time = `${pad(now.getHours())}${pad(now.getMinutes())}`;
  return `Mployedin-CVs-${date}-${time}.zip`;
}

/* ── report CSV ──────────────────────────────────────── */

const CSV_HEADER = ["name", "standardised", "original", "note", "files"];
/** "|" is stripped from file names, so it cannot appear inside one path: an unambiguous separator. */
const FILES_SEPARATOR = " | ";

function buildReportCsv(report: CvReportRow[]): string {
  // csvCell (shared with the admin exports) guards =,+,-,@,tab,CR against formula
  // injection and quotes commas, quotes and newlines.
  const lines = [
    CSV_HEADER.map(csvCell).join(","),
    ...report.map((row) =>
      [row.name, row.standardised, row.original, row.note, row.files.join(FILES_SEPARATOR)].map(csvCell).join(","),
    ),
  ];
  // BOM so Excel opens the file as UTF-8 and shows Arabic names correctly.
  return BOM + lines.join("\r\n") + "\r\n";
}

function noteOf(result: CvStandardisedResult | CvOriginalResult | undefined): string {
  if (!result || result.status === "ok") return "";
  return (result.note ?? "").trim();
}

/* ── build ───────────────────────────────────────────── */

/**
 * CV formats that are already compressed inside (a PDF's streams, a DOCX or ODT
 * is itself a ZIP, images). Deflating them again costs time and saves almost
 * nothing, so they are stored as they are; text and sheets are still deflated.
 */
const ALREADY_COMPRESSED_EXTS = new Set(["pdf", "docx", "odt", "png", "jpg", "webp", "gif", "heic"]);

function storeOptions(ext: string): { compression: "STORE" } | undefined {
  return ALREADY_COMPRESSED_EXTS.has(ext) ? { compression: "STORE" } : undefined;
}

function safeExt(ext: string): string {
  return new RegExp(`^[a-z0-9]{1,${MAX_EXT_LENGTH}}$`, "i").test(ext) ? ext.toLowerCase() : "pdf";
}

function yesNo(wanted: boolean, present: boolean | undefined): string {
  if (!wanted) return "";
  return present ? "Yes" : "No";
}

function fitToWidth(cells: readonly string[], width: number): string[] {
  const fitted = cells.slice(0, width);
  while (fitted.length < width) fitted.push("");
  return fitted;
}

export async function buildCvZip({ mode, entries, details, now }: BuildCvZipInput): Promise<BuildCvZipResult> {
  const { default: JSZip } = await import("jszip");
  const zip = new JSZip();

  const wantStandardised = mode !== "original";
  const wantOriginal = mode !== "standardised";

  const used = new Set<string>();
  const report: CvReportRow[] = [];
  const included: Array<{ standardised: boolean; original: boolean }> = [];
  let fileCount = 0;

  for (const entry of entries) {
    // One name per candidate, shared by both folders, so "(2)" lines up.
    const base = safeCvFileName(entry.name, entry.id, used);
    let hasStandardised = false;
    let hasOriginal = false;
    const files: string[] = [];

    // No folder is created up front: JSZip adds "Standardised/" / "Original/" only
    // when a file is actually written into it.
    if (wantStandardised && entry.standardised?.status === "ok") {
      const path = `${STANDARDISED_DIR}/${base}${STANDARDISED_SUFFIX}`;
      zip.file(path, entry.standardised.blob, storeOptions("pdf")); // the standardised CV is always a PDF
      files.push(path);
      hasStandardised = true;
      fileCount += 1;
    }
    if (wantOriginal && entry.original?.status === "ok") {
      const ext = safeExt(entry.original.ext);
      const path = `${ORIGINAL_DIR}/${base}${ORIGINAL_SUFFIX_BASE}${ext}`;
      zip.file(path, entry.original.blob, storeOptions(ext));
      files.push(path);
      hasOriginal = true;
      fileCount += 1;
    }
    included.push({ standardised: hasStandardised, original: hasOriginal });

    const notes: string[] = [];
    const standardisedNote = wantStandardised ? noteOf(entry.standardised) : "";
    const originalNote = wantOriginal ? noteOf(entry.original) : "";
    const label = wantStandardised && wantOriginal;
    if (standardisedNote) notes.push(label ? `Standardised: ${standardisedNote}` : standardisedNote);
    if (originalNote) notes.push(label ? `Original: ${originalNote}` : originalNote);

    report.push({
      name: String(entry.name ?? "").trim() || base,
      standardised: wantStandardised ? (entry.standardised?.status ?? "missing") : "",
      original: wantOriginal ? (entry.original?.status ?? "missing") : "",
      note: notes.join("; "),
      files,
    });
  }

  if (details) {
    // Matched by entry id, never by position: rows follow `entries`, and each row's
    // Yes/No flags come from that same entry.
    const rows: string[][] = [[...details.header, "Standardised", "Original"]];
    entries.forEach((entry, i) => {
      const cells = details.rowsById.get(entry.id);
      if (!cells) return;
      rows.push([
        ...fitToWidth(cells, details.header.length),
        yesNo(wantStandardised, included[i].standardised),
        yesNo(wantOriginal, included[i].original),
      ]);
    });
    zip.file(DETAILS_FILE, await xlsxBlobFromRows(rows, "Candidates"));
  }

  zip.file(REPORT_FILE, buildReportCsv(report));

  const blob = await zip.generateAsync({
    type: "blob",
    mimeType: "application/zip",
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
  });

  const exportedCandidates = included.filter((i) => i.standardised || i.original).length;
  return {
    blob,
    fileName: cvZipFileName(now),
    report,
    fileCount,
    exportedCandidates,
    skippedCandidates: entries.length - exportedCandidates,
  };
}
