/**
 * Fetch every page of a paginated list API so exports cover the full filtered
 * result set instead of just the rows on screen (BUG-004).
 *
 * The caller supplies a URL builder (same filters as the list view, any page
 * and limit) and a picker that reads rows + total out of that endpoint's
 * JSON shape. Pages are pulled at 100 rows until the accumulated rows reach
 * the reported total, a page comes back short/empty, or `maxRows` is hit
 * (audit logs can exceed 7k rows — cap stops a runaway export).
 */
export async function fetchAllPaginated<T>(
  buildUrl: (page: number, limit: number) => string,
  pick: (json: Record<string, unknown>) => { rows: T[]; total: number },
  opts?: { pageSize?: number; maxRows?: number },
): Promise<T[]> {
  const pageSize = opts?.pageSize ?? 100;
  const maxRows = opts?.maxRows ?? 10000;
  const all: T[] = [];
  let page = 1;
  // Guard against a lying total — never loop forever on a broken endpoint.
  const maxPages = Math.max(1, Math.ceil(maxRows / pageSize));

  for (let seen = 0; seen < maxPages; seen += 1) {
    const res = await fetch(buildUrl(page, pageSize));
    if (!res.ok) {
      throw new Error(`Export fetch failed (page ${page}): ${res.status}`);
    }
    const json = (await res.json()) as Record<string, unknown>;
    const { rows, total } = pick(json);
    if (!rows.length) break;
    all.push(...rows);
    if (all.length >= total || rows.length < pageSize || all.length >= maxRows) break;
    page += 1;
  }

  return all.slice(0, maxRows);
}
