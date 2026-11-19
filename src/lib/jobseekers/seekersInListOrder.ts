/**
 * The first rows of a staff seeker list, in the order the list shows them.
 *
 * The CV export used to run its own Mongo query, which ignored the list's sort
 * (newest first) and half its filters, so the ZIP held a different 200 people
 * from the ones on screen. Paging through the SAME list endpoint the table uses
 * keeps the export identical to what the admin sees, filters, sort and all.
 *
 * Rows come back whole so the caller can build the export's details sheet from
 * them. Everyone counts, with or without an uploaded CV: the export dialog's
 * Standardised CV is made from the profile, and it reports who has no file.
 */
export interface SeekerListRow {
  _id?: unknown;
}

export type FetchSeekerPage<T extends SeekerListRow> = (page: number, limit: number) => Promise<{ rows: T[]; total: number }>;

export async function seekersInListOrder<T extends SeekerListRow>(
  fetchPage: FetchSeekerPage<T>,
  max: number,
  pageSize = 50,
  maxPages = 20,
): Promise<T[]> {
  const out: T[] = [];
  for (let page = 1; page <= maxPages && out.length < max; page += 1) {
    const { rows, total } = await fetchPage(page, pageSize);
    for (const row of rows) {
      if (out.length >= max) break;
      if (row._id) out.push(row);
    }
    if (rows.length < pageSize || page * pageSize >= total) break;
  }
  return out;
}
