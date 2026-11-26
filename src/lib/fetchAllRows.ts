/**
 * Fetch every page of a paginated list API so exports cover the full filtered
 * result set instead of just the rows on screen (BUG-004).
 *
 * The caller supplies a URL builder (same filters as the list view, any page
 * and limit) and a picker that reads rows + total out of that endpoint's
 * JSON shape. Pages are pulled at 100 rows until the accumulated rows reach
 * the reported total, a page comes back empty, or `maxRows` is hit (audit
 * logs can exceed 7k rows — cap stops a runaway export).
 *
 * A short page is NOT the end when the endpoint reports a total: list APIs cap
 * `limit` below 100 (job seekers: 50) or drop rows after paging (employers
 * without a profile), so stopping on the first short page exported 50 of
 * 6,165 seekers and 92 of 180 employers (audit 2026-11-26 F-01/F-09). The
 * endpoint applies its own capped limit to the page number, so walking pages
 * still covers every row. Only an endpoint with no usable total falls back to
 * "short page = last page".
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
  let previousFirstRow: string | null = null;

  for (let seen = 0; seen < maxPages; seen += 1) {
    const res = await fetch(buildUrl(page, pageSize));
    if (!res.ok) {
      throw new Error(`Export fetch failed (page ${page}): ${res.status}`);
    }
    const json = (await res.json()) as Record<string, unknown>;
    const { rows, total } = pick(json);
    if (!rows.length) break;
    // An endpoint that ignores `page` returns the same rows again. Stop
    // instead of exporting duplicates up to maxRows.
    const firstRow = JSON.stringify(rows[0]);
    if (firstRow === previousFirstRow) break;
    previousFirstRow = firstRow;
    all.push(...rows);
    const hasTotal = Number.isFinite(total) && total > 0;
    if (all.length >= maxRows) break;
    if (hasTotal ? all.length >= total : rows.length < pageSize) break;
    page += 1;
  }

  return all.slice(0, maxRows);
}
