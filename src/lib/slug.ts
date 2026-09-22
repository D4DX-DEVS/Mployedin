/**
 * URL slug for CMS entries, job attributes and location records.
 *
 * Keeps word characters (so digits and underscores survive), collapses
 * whitespace and underscores to single hyphens, and trims leading/trailing
 * hyphens. This is the exact behaviour the CMS, job-attribute and
 * location-data routes have always had — it is deliberately NOT the
 * `[^a-z0-9]+` variant, which would strip differently and change existing
 * slugs.
 */
export function slugify(str: string): string {
  return str
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}
