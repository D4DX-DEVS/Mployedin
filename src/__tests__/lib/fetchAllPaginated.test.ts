/**
 * @jest-environment node
 *
 * Audit 2026-11-26 F-01/F-09/V-1: exports stopped at the first short page.
 */
import { fetchAllPaginated } from "@/lib/fetchAllRows";

type Row = { id: number };

/** A list API over `rows` that caps limit at `cap` and may drop rows after paging. */
function mockApi(rows: Row[], cap: number, opts?: { drop?: (r: Row) => boolean; reportTotal?: number | null }) {
  return jest.fn(async (url: string) => {
    const u = new URL(url, "http://x");
    const page = Number(u.searchParams.get("page"));
    const limit = Math.min(Number(u.searchParams.get("limit")), cap);
    const slice = rows.slice((page - 1) * limit, page * limit).filter((r) => !opts?.drop?.(r));
    const total = opts?.reportTotal === undefined ? rows.length : opts.reportTotal;
    return { ok: true, status: 200, json: async () => ({ items: slice, pagination: { total } }) } as Response;
  });
}

const pick = (json: Record<string, unknown>) => ({
  rows: json.items as Row[],
  total: Number((json.pagination as { total?: number | null }).total ?? 0),
});
const build = (page: number, limit: number) => `/api/x?page=${page}&limit=${limit}`;
const rows = (n: number) => Array.from({ length: n }, (_, i) => ({ id: i + 1 }));

describe("fetchAllPaginated", () => {
  afterEach(() => jest.restoreAllMocks());

  it("keeps paging when the API caps limit below the requested page size", async () => {
    global.fetch = mockApi(rows(190), 50) as unknown as typeof fetch;
    const out = await fetchAllPaginated(build, pick);
    expect(out).toHaveLength(190);
    expect(new Set(out.map((r) => r.id)).size).toBe(190);
  });

  it("keeps paging past a short page when rows are dropped after paging, and stops on an empty page", async () => {
    const all = rows(250);
    global.fetch = mockApi(all, 100, { drop: (r) => r.id % 25 === 0 }) as unknown as typeof fetch;
    const out = await fetchAllPaginated(build, pick);
    expect(out).toHaveLength(240);
  });

  it("falls back to 'short page is the last page' when the endpoint reports no total", async () => {
    const api = mockApi(rows(130), 100, { reportTotal: null });
    global.fetch = api as unknown as typeof fetch;
    const out = await fetchAllPaginated(build, pick);
    expect(out).toHaveLength(130);
    expect(api).toHaveBeenCalledTimes(2);
  });

  it("stops when an endpoint ignores the page number, instead of exporting duplicates", async () => {
    const same = rows(30);
    const api = jest.fn(async () => ({ ok: true, status: 200, json: async () => ({ items: same, pagination: { total: 500 } }) }) as Response);
    global.fetch = api as unknown as typeof fetch;
    const out = await fetchAllPaginated(build, pick);
    expect(out).toHaveLength(30);
    expect(api).toHaveBeenCalledTimes(2);
  });

  it("stops at maxRows", async () => {
    global.fetch = mockApi(rows(500), 100) as unknown as typeof fetch;
    const out = await fetchAllPaginated(build, pick, { maxRows: 150 });
    expect(out).toHaveLength(150);
  });
});
