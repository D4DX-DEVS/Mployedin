import { seekersInListOrder, type SeekerListRow } from "@/lib/jobseekers/seekersInListOrder";

function pager(all: SeekerListRow[]) {
  const calls: number[] = [];
  const fetchPage = async (page: number, limit: number) => {
    calls.push(page);
    return { rows: all.slice((page - 1) * limit, page * limit), total: all.length };
  };
  return { fetchPage, calls };
}

const row = (id: string): SeekerListRow & { cv?: { originalUrl?: string } | null } => ({ _id: id, cv: { originalUrl: `https://x/${id}.pdf` } });
const idsOf = (rows: SeekerListRow[]) => rows.map((r) => String(r._id));

describe("seekersInListOrder", () => {
  it("keeps the list order, and keeps people with no uploaded CV (the Standardised CV is made from the profile)", async () => {
    const { fetchPage } = pager([row("a"), { _id: "b", cv: null }, row("c"), { _id: "d", cv: { originalUrl: "" } }]);
    expect(idsOf(await seekersInListOrder(fetchPage, 10, 2))).toEqual(["a", "b", "c", "d"]);
  });

  it("returns the rows whole, for the details sheet", async () => {
    const { fetchPage } = pager([row("a")]);
    await expect(seekersInListOrder(fetchPage, 10)).resolves.toEqual([row("a")]);
  });

  it("skips a row with no id", async () => {
    const { fetchPage } = pager([row("a"), {}, row("c")]);
    expect(idsOf(await seekersInListOrder(fetchPage, 10, 2))).toEqual(["a", "c"]);
  });

  it("stops at the cap without fetching more pages", async () => {
    const all = Array.from({ length: 200 }, (_, i) => row(`s${i}`));
    const { fetchPage, calls } = pager(all);
    const rows = await seekersInListOrder(fetchPage, 50, 50);
    expect(rows).toHaveLength(50);
    expect(rows[0]._id).toBe("s0");
    expect(rows[49]._id).toBe("s49");
    expect(calls).toEqual([1]);
  });

  it("stops when the list runs out", async () => {
    const { fetchPage, calls } = pager([row("a"), row("b"), row("c")]);
    expect(idsOf(await seekersInListOrder(fetchPage, 50, 2))).toEqual(["a", "b", "c"]);
    expect(calls).toEqual([1, 2]);
  });

  it("never scans more than maxPages", async () => {
    const all = Array.from({ length: 500 }, (_, i) => row(`n${i}`));
    const { fetchPage, calls } = pager(all);
    await expect(seekersInListOrder(fetchPage, 400, 10, 3)).resolves.toHaveLength(30);
    expect(calls).toEqual([1, 2, 3]);
  });
});
