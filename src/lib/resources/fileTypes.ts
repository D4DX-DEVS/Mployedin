/**
 * File-type groups for the resource library. Shared by the list API (filter)
 * and the cards (label + icon), so both agree on what "Document" means.
 */

export const RESOURCE_FILE_TYPES = ["pdf", "image", "video", "document", "archive"] as const;
export type ResourceFileType = (typeof RESOURCE_FILE_TYPES)[number];

/** Mongo `files.contentType` match per group. */
export const FILE_TYPE_PATTERNS: Record<string, RegExp> = {
  pdf: /^application\/pdf$/,
  image: /^image\//,
  video: /^video\//,
  document: /^(application\/(msword|vnd\.)|text\/)/,
  archive: /^application\/(zip|x-zip)/,
};

export function fileTypeOf(contentType: string | undefined): ResourceFileType | "other" {
  const ct = contentType ?? "";
  for (const type of RESOURCE_FILE_TYPES) {
    if (FILE_TYPE_PATTERNS[type].test(ct)) return type;
  }
  return "other";
}

/** Short badge text, e.g. "PDF", "PNG", "DOCX" — from the extension, else the MIME subtype. */
export function fileExtensionLabel(fileName: string | undefined, contentType: string | undefined): string {
  const ext = fileName?.includes(".") ? fileName.split(".").pop() : "";
  if (ext && ext.length <= 5) return ext.toUpperCase();
  const sub = contentType?.split("/")[1]?.split(/[.+;-]/).pop();
  return (sub || "FILE").slice(0, 5).toUpperCase();
}

/** The browser can show these inline (img / embed / video). */
export function isPreviewable(contentType: string | undefined): boolean {
  const type = fileTypeOf(contentType);
  return type === "image" || type === "pdf" || type === "video";
}
