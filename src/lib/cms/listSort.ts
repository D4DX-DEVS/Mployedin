export type MongoSort = Record<string, 1 | -1>;

/**
 * The sort for an admin CMS list: `?sortBy=` must be one of the route's own
 * fields, `?sortOrder=asc` flips it, and `_id` breaks ties so paging never
 * repeats or drops a row. Anything else keeps the route's usual order.
 */
export function cmsListSort(params: URLSearchParams, allowed: readonly string[], fallback: MongoSort): MongoSort {
  const by = params.get("sortBy") ?? "";
  if (!allowed.includes(by)) return fallback;
  const dir = params.get("sortOrder") === "asc" ? 1 : -1;
  return { [by]: dir, _id: dir };
}
