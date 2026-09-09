/**
 * sitemap.ts must never hang a production build: the dynamic part (jobs +
 * blog posts from MongoDB) runs under a time budget and falls back to the
 * static entries when the database is slow or down.
 */

const connectDBMock = jest.fn();
const jobFindMock = jest.fn();
const postFindMock = jest.fn();

jest.mock("@/lib/db/mongoose", () => ({
  __esModule: true,
  connectDB: (...args: unknown[]) => connectDBMock(...args),
  default: (...args: unknown[]) => connectDBMock(...args),
}));
jest.mock("@/models/Job", () => ({ __esModule: true, default: { find: (...args: unknown[]) => jobFindMock(...args) } }));
jest.mock("@/models/BlogPost", () => ({ __esModule: true, default: { find: (...args: unknown[]) => postFindMock(...args) } }));

function chain<T>(rows: T[]) {
  const q = {
    sort: () => q,
    limit: () => q,
    select: () => q,
    lean: () => Promise.resolve(rows),
  };
  return q;
}

import sitemap, { revalidate } from "@/app/sitemap";

// Longer than any sane database budget; the route must have given up by then.
const WELL_PAST_THE_BUDGET_MS = 60_000;

describe("sitemap", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useRealTimers();
  });

  it("regenerates on a schedule instead of only at build time", () => {
    expect(typeof revalidate).toBe("number");
    expect(revalidate).toBeGreaterThan(0);
  });

  it("lists static routes, active jobs and published posts for both locales when the database answers", async () => {
    connectDBMock.mockResolvedValue({});
    jobFindMock.mockReturnValue(chain([{ _id: "job1", updatedAt: new Date("2026-09-01") }]));
    postFindMock.mockReturnValue(chain([{ slug: "hello", publishedAt: new Date("2026-08-01") }]));

    const entries = await sitemap();
    const urls = entries.map((e) => e.url);

    expect(urls).toEqual(expect.arrayContaining([
      expect.stringMatching(/\/en$/),
      expect.stringMatching(/\/ar\/jobs$/),
      expect.stringMatching(/\/en\/jobs\/job1$/),
      expect.stringMatching(/\/ar\/jobs\/job1$/),
      expect.stringMatching(/\/en\/blog\/hello$/),
      expect.stringMatching(/\/ar\/blog\/hello$/),
    ]));
    expect(jobFindMock).toHaveBeenCalledWith({ status: "active" });
  });

  it("falls back to the static routes when the database does not answer inside the budget", async () => {
    jest.useFakeTimers();
    connectDBMock.mockReturnValue(new Promise(() => {})); // never resolves, like a build-time index sweep

    const pending = sitemap();
    await jest.advanceTimersByTimeAsync(WELL_PAST_THE_BUDGET_MS);
    const entries = await pending;
    const urls = entries.map((e) => e.url);

    expect(urls.length).toBeGreaterThan(0);
    expect(urls.every((u) => !/\/jobs\/[^/]+$/.test(u) && !/\/blog\/[^/]+$/.test(u))).toBe(true);
    expect(jobFindMock).not.toHaveBeenCalled();
  });

  it("falls back to the static routes when the database throws", async () => {
    connectDBMock.mockRejectedValue(new Error("MONGODB_URI is not defined"));

    const entries = await sitemap();

    expect(entries.length).toBeGreaterThan(0);
    expect(entries.every((e) => !/\/jobs\/[^/]+$/.test(e.url))).toBe(true);
  });
});
