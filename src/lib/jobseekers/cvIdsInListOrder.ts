/**
 * Ids of the seekers who have a CV, in the order the staff list shows them.
 *
 * The bulk CV download used to run its own Mongo query, which ignored the
 * list's sort (newest first) and half its filters, so the ZIP held a different
 * 200 people from the ones on screen. Paging through the SAME list endpoint
 * the table uses keeps the download identical to what the admin sees.
 */
export interface SeekerListRow {
  _id?: unknown;
  cv?: { originalUrl?: string | null } | null;
}

export type FetchSeekerPage = (page: number, limit: number) => Promise<{ rows: SeekerListRow[]; total: number }>;

export async function cvIdsInListOrder(
  fetchPage: FetchSeekerPage,
  max: number,
  pageSize = 50,
  maxPages = 20,
): Promise<string[]> {
  const ids: string[] = [];
  for (let page = 1; page <= maxPages && ids.length < max; page += 1) {
    const { rows, total } = await fetchPage(page, pageSize);
    for (const row of rows) {
      if (ids.length >= max) break;
      if (row._id && row.cv?.originalUrl) ids.push(String(row._id));
    }
    if (rows.length < pageSize || page * pageSize >= total) break;
  }
  return ids;
}
