import { cvIdsInListOrder, type SeekerListRow } from "@/lib/jobseekers/cvIdsInListOrder";

function pager(all: SeekerListRow[]) {
  const calls: number[] = [];
  const fetchPage = async (page: number, limit: number) => {
    calls.push(page);
    return { rows: all.slice((page - 1) * limit, page * limit), total: all.length };
  };
  return { fetchPage, calls };
}

const withCv = (id: string): SeekerListRow => ({ _id: id, cv: { originalUrl: `https://x/${id}.pdf` } });
const noCv = (id: string): SeekerListRow => ({ _id: id, cv: null });

describe("cvIdsInListOrder", () => {
  it("keeps the list order and skips rows without a CV", async () => {
    const { fetchPage } = pager([withCv("a"), noCv("b"), withCv("c"), { _id: "d", cv: { originalUrl: "" } }, withCv("e")]);
    await expect(cvIdsInListOrder(fetchPage, 10, 2)).resolves.toEqual(["a", "c", "e"]);
  });

  it("stops at the cap without fetching more pages", async () => {
    const all = Array.from({ length: 200 }, (_, i) => withCv(`s${i}`));
    const { fetchPage, calls } = pager(all);
    const ids = await cvIdsInListOrder(fetchPage, 50, 50);
    expect(ids).toHaveLength(50);
    expect(ids[0]).toBe("s0");
    expect(ids[49]).toBe("s49");
    expect(calls).toEqual([1]);
  });

  it("stops when the list runs out", async () => {
    const { fetchPage, calls } = pager([withCv("a"), withCv("b"), withCv("c")]);
    await expect(cvIdsInListOrder(fetchPage, 50, 2)).resolves.toEqual(["a", "b", "c"]);
    expect(calls).toEqual([1, 2]);
  });

  it("never scans more than maxPages", async () => {
    const all = Array.from({ length: 500 }, (_, i) => noCv(`n${i}`));
    const { fetchPage, calls } = pager(all);
    await expect(cvIdsInListOrder(fetchPage, 50, 10, 3)).resolves.toEqual([]);
    expect(calls).toEqual([1, 2, 3]);
  });
});
