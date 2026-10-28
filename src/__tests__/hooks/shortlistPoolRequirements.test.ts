/**
 * Shortlist Top picks from the list the employer is looking at. The list's
 * must-haves filter (2026-10-28) narrows that pool like every other filter:
 * "met" leaves out candidates whose must-haves could not be checked, and
 * "not_met" leaves nobody to pick.
 */
import { fetchShortlistPool } from "@/hooks/useApplications";

const fetchMock = jest.fn();

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockImplementation(async () => ({
    ok: true,
    json: async () => ({ applications: [{ _id: "a1" }], pagination: { total: 1, page: 1, limit: 1 } }),
  }));
  global.fetch = fetchMock as unknown as typeof fetch;
});

const requested = () => fetchMock.mock.calls.map(([url]) => new URL(String(url), "http://x").searchParams.get("requirements"));

describe("fetchShortlistPool", () => {
  it("picks from everyone not known to fail a must-have when the list is not filtered by must-haves", async () => {
    await fetchShortlistPool({ jobId: "job-1" });
    expect(requested()).toEqual(["qualified", "qualified", "not_met"]);
  });

  it("picks only from candidates who meet every must-have while the list shows only them", async () => {
    await fetchShortlistPool({ jobId: "job-1", requirements: "met" });
    expect(requested()).toEqual(["met", "met", "not_met"]);
  });

  it("picks nobody while the list shows only candidates missing a must-have", async () => {
    const pool = await fetchShortlistPool({ jobId: "job-1", requirements: "not_met" });
    expect(pool.candidates).toEqual([]);
    expect(pool.eligibleTotal).toBe(0);
    expect(requested()).toEqual(["not_met"]);
  });
});
