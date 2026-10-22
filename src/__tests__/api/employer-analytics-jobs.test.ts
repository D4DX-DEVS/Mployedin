/**
 * @jest-environment node
 *
 * Conversion rate on the employer Performance tab = applications / total views.
 * `uniqueViews` now counts signed-in viewers only (no tracking cookie, PECR), so
 * it is far too small to be a denominator. Owner decision 2026-10-21.
 */
import { NextRequest } from "next/server";

jest.mock("@/lib/db/mongoose", () => ({ connectDB: jest.fn().mockResolvedValue(undefined) }));

jest.mock("@/lib/auth/withAuth", () => ({
  withAuth: (handler: (req: NextRequest, ctx: { userId: string; role: "employer"; locale: string }) => Promise<Response>) =>
    (req: NextRequest) => handler(req, { userId: "user_1", role: "employer", locale: "en" }),
}));

const employerFindOne = jest.fn();
jest.mock("@/models/Employer", () => ({
  Employer: { findOne: (...args: unknown[]) => employerFindOne(...args) },
}));

const jobFind = jest.fn();
jest.mock("@/models/Job", () => ({
  __esModule: true,
  default: { find: (...args: unknown[]) => jobFind(...args) },
}));

const applicationAggregate = jest.fn();
jest.mock("@/models/Application", () => ({
  Application: { aggregate: (...args: unknown[]) => applicationAggregate(...args) },
}));

interface JobRow {
  _id: string;
  title: string;
  status: string;
  views: number;
  uniqueViews: number;
  createdAt: Date;
}

interface PerformanceJob {
  jobId: string;
  views: number;
  uniqueViews: number;
  applications: number;
  conversionRate: number;
  insight?: string;
}

interface PerformanceBody {
  jobs: PerformanceJob[];
  summary: {
    totalViews: number;
    totalUniqueViews: number;
    totalApplications: number;
    overallConversion: number;
    underperforming: number;
  };
}

/** Created 3 days ago, so the "very few views, older than a week" rule stays out of the way. */
const RECENT = new Date(Date.now() - 3 * 86_400_000);
const OLD = new Date(Date.now() - 30 * 86_400_000);

function job(id: string, over: Partial<JobRow> = {}): JobRow {
  return { _id: id, title: `Job ${id}`, status: "active", views: 0, uniqueViews: 0, createdAt: RECENT, ...over };
}

function seed(jobs: JobRow[], applications: Record<string, number>): void {
  employerFindOne.mockReturnValue({
    select: () => ({ lean: () => Promise.resolve({ _id: "emp_1" }) }),
  });
  jobFind.mockReturnValue({
    select: () => ({ sort: () => ({ lean: () => Promise.resolve(jobs) }) }),
  });
  applicationAggregate.mockResolvedValue(
    Object.entries(applications).map(([id, count]) => ({ _id: id, count, avgScore: 70 })),
  );
}

async function load(): Promise<PerformanceBody> {
  const { GET } = await import("@/app/api/employers/analytics/jobs/route");
  const res = await GET(new NextRequest("http://localhost:3000/api/employers/analytics/jobs"), {
    params: Promise.resolve({}),
  });
  expect(res.status).toBe(200);
  return (await res.json()) as PerformanceBody;
}

function byId(body: PerformanceBody, id: string): PerformanceJob {
  const found = body.jobs.find((j) => j.jobId === id);
  if (!found) throw new Error(`job ${id} missing from response`);
  return found;
}

describe("GET /api/employers/analytics/jobs: conversion rate", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("divides applications by total views, not signed-in viewers", async () => {
    seed([job("a", { views: 200, uniqueViews: 10 })], { a: 8 });

    const body = await load();

    expect(byId(body, "a").conversionRate).toBe(4); // 8 / 200, not 8 / 10
    expect(byId(body, "a").uniqueViews).toBe(10); // still reported as its own figure
  });

  it("rounds to one decimal place", async () => {
    seed([job("a", { views: 300, uniqueViews: 0 })], { a: 7 });

    expect(byId(await load(), "a").conversionRate).toBe(2.3); // 2.333...
  });

  it("does not zero or flag a job that has applications but no signed-in viewers", async () => {
    seed([job("a", { views: 100, uniqueViews: 0 })], { a: 10 });

    const body = await load();
    const a = byId(body, "a");

    expect(a.conversionRate).toBe(10);
    expect(a.insight).toBeUndefined(); // not "High views but low applications"
    expect(body.summary.underperforming).toBe(0);
  });

  it("flags high views with few applications, measured per view", async () => {
    seed([job("a", { views: 100, uniqueViews: 4 })], { a: 1 });

    const body = await load();

    expect(byId(body, "a").conversionRate).toBe(1);
    expect(byId(body, "a").insight).toMatch(/High views but low applications/);
    expect(body.summary.underperforming).toBe(1);
  });

  it("calls a rate above 15% excellent", async () => {
    seed([job("a", { views: 40, uniqueViews: 1 })], { a: 8 });

    expect(byId(await load(), "a").insight).toMatch(/Excellent conversion rate/);
  });

  it("reports 0 and no 'low applications' flag when a job has no views", async () => {
    seed([job("a", { views: 0, uniqueViews: 0 })], { a: 3 });

    const body = await load();
    const a = byId(body, "a");

    expect(a.conversionRate).toBe(0);
    expect(Number.isFinite(a.conversionRate)).toBe(true);
    expect(a.insight ?? "").not.toMatch(/low applications/);
    expect(body.summary.underperforming).toBe(0);
    expect(body.summary.overallConversion).toBe(0);
  });

  it("keeps the 'very few views' hint for an old job with no views", async () => {
    seed([job("a", { views: 0, createdAt: OLD })], {});

    expect(byId(await load(), "a").insight).toMatch(/Very few views/);
  });

  it("uses the summed views for the overall conversion", async () => {
    seed(
      [
        job("a", { views: 100, uniqueViews: 2 }),
        job("b", { views: 300, uniqueViews: 5 }),
        job("c", { views: 0, uniqueViews: 0 }),
      ],
      { a: 4, b: 6, c: 0 },
    );

    const { summary } = await load();

    expect(summary.totalViews).toBe(400);
    expect(summary.totalUniqueViews).toBe(7);
    expect(summary.totalApplications).toBe(10);
    expect(summary.overallConversion).toBe(2.5); // 10 / 400, not 10 / 7
  });

  it("counts underperforming jobs by views and the per-view rate", async () => {
    seed(
      [
        job("a", { views: 100, uniqueViews: 0 }), // 1 / 100 = 1%  -> underperforming
        job("b", { views: 100, uniqueViews: 0 }), // 5 / 100 = 5%  -> fine
        job("c", { views: 49, uniqueViews: 0 }), //  0 / 49 = 0%   -> too few views to judge
      ],
      { a: 1, b: 5 },
    );

    expect((await load()).summary.underperforming).toBe(1);
  });

  it("returns the empty summary for an employer with no jobs", async () => {
    seed([], {});

    const body = await load();

    expect(body.jobs).toEqual([]);
    expect(body.summary.overallConversion).toBe(0);
  });
});
