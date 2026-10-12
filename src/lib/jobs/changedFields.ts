/**
 * The keys of `next` whose value differs from `base`, compared as JSON.
 *
 * The job edit page sent its whole form on every save, so a colleague's save
 * from a page opened earlier put back every field it had loaded — a title
 * changed in the meantime silently reverted (audit FUNC-017). Sending only
 * what this person changed keeps edits to different fields apart. `base` null
 * (nothing loaded yet) sends everything.
 */
export function changedFields(
  next: Record<string, unknown>,
  base: Record<string, unknown> | null,
): Record<string, unknown> {
  if (!base) return { ...next };
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(next)) {
    if (JSON.stringify(value) !== JSON.stringify(base[key])) out[key] = value;
  }
  return out;
}
