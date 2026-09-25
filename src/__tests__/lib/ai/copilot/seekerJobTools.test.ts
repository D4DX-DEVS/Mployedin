/**
 * @jest-environment node
 */
import { recommendedJobsTool, searchJobsTool, myProfileTool } from "@/lib/ai/copilot/tools/jobSeeker";
import { scoreSeekerPool } from "@/lib/matching/seekerMatches";
import type { CopilotToolContext } from "@/lib/ai/copilot/types";

const SEEKER_USER = "64b000000000000000000001";
const SEEKER_ID = "64b000000000000000000002";
const JOB_A = "64b0000000000000000000a1";
const JOB_B = "64b0000000000000000000b2";
const APPLIED = "64b0000000000000000000c3";

function chain<T>(result: T) {
  const c: Record<string, jest.Mock> = {};
  for (const m of ["populate", "sort", "skip", "limit", "select"]) c[m] = jest.fn(() => c);
  c.lean = jest.fn(async () => result);
  return c;
}

let mockSeeker: Record<string, unknown> | null = null;
const mockJobFind = jest.fn();
const mockApplicationFind = jest.fn();

jest.mock("@/lib/db/mongoose", () => ({ connectDB: jest.fn().mockResolvedValue(undefined) }));
jest.mock("@/models/JobSeeker", () => ({ __esModule: true, default: { findOne: jest.fn(() => chain(mockSeeker)) } }));
jest.mock("@/models/Job", () => ({ __esModule: true, default: { find: (...a: unknown[]) => mockJobFind(...a) } }));
jest.mock("@/models/Application", () => ({ __esModule: true, default: { find: (...a: unknown[]) => mockApplicationFind(...a) } }));
jest.mock("@/models/User", () => ({ __esModule: true, default: {} }));
jest.mock("@/lib/notifications/trigger", () => ({ notifyApplicationReceived: jest.fn() }));
jest.mock("@/lib/effectiveSeekerProfile", () => ({ effectiveSeekerProfile: jest.fn(async () => ({ skills: ["React"] })) }));
jest.mock("@/lib/matching/seekerMatches", () => ({ scoreSeekerPool: jest.fn() }));

const ctx = (currentPage?: string) =>
  ({ userId: SEEKER_USER, role: "job_seeker", locale: "en", currentPage }) as unknown as CopilotToolContext;

const jobA = { _id: JOB_A, title: "Senior React Developer", location: { city: "Dubai", country: "UAE" }, employerId: { companyName: "Acme" } };
const jobB = { _id: JOB_B, title: "Accountant", location: { isRemote: true } };

beforeEach(() => {
  jest.clearAllMocks();
  mockSeeker = { _id: SEEKER_ID, preferredCountries: ["UAE"], cv: { rawText: "React developer, 5 years building dashboards." } };
  mockApplicationFind.mockImplementation(() => chain([{ jobId: APPLIED }]));
  mockJobFind.mockImplementation(() => chain([jobA, jobB]));
});

describe("recommended_jobs", () => {
  it("lists only engine-recommended jobs, each with an apply link in the page's locale", async () => {
    (scoreSeekerPool as jest.Mock).mockResolvedValue({
      jobs: [
        { ...jobA, recommended: true, matchScore: 91, matchedSkills: ["React"] },
        { ...jobB, recommended: false, matchScore: 40, matchedSkills: [] },
      ],
      recommendedCount: 1,
      threshold: 80,
    });

    const res = await recommendedJobsTool.execute({}, ctx("/ar/job-seeker"));
    const data = res.data as { jobs: Array<Record<string, unknown>>; totalMatches: number; hasCv: boolean };

    expect(res.ok).toBe(true);
    expect(data.jobs).toHaveLength(1);
    expect(data.jobs[0]).toMatchObject({ jobId: JOB_A, matchScore: 91, company: "Acme", url: `/ar/job-seeker/jobs/${JOB_A}` });
    expect(data.hasCv).toBe(true);
  });

  it("leaves out jobs the seeker already applied to", async () => {
    (scoreSeekerPool as jest.Mock).mockResolvedValue({ jobs: [], recommendedCount: 0, threshold: 80, limitingFactor: "score" });
    await recommendedJobsTool.execute({}, ctx());
    expect(JSON.stringify(mockJobFind.mock.calls[0][0])).toContain(APPLIED);
  });

  it("says why when nothing clears the threshold", async () => {
    (scoreSeekerPool as jest.Mock).mockResolvedValue({ jobs: [], recommendedCount: 0, threshold: 80, limitingFactor: "no_location" });
    const res = await recommendedJobsTool.execute({}, ctx());
    expect(res.ok).toBe(true);
    expect(res.data).toMatchObject({ jobs: [], limitingFactor: "no_location" });
  });

  it("fails cleanly without a job-seeker profile", async () => {
    mockSeeker = null;
    const res = await recommendedJobsTool.execute({}, ctx());
    expect(res.ok).toBe(false);
  });
});

describe("search_jobs", () => {
  it("flags jobs already applied to and links each result", async () => {
    mockApplicationFind.mockImplementation(() => chain([{ jobId: JOB_A }]));
    const res = await searchJobsTool.execute({ query: "react" }, ctx("/en/job-seeker/jobs"));
    const rows = res.data as Array<Record<string, unknown>>;

    expect(rows.find((r) => r.jobId === JOB_A)).toMatchObject({ alreadyApplied: true, url: `/en/job-seeker/jobs/${JOB_A}` });
    expect(rows.find((r) => r.jobId === JOB_B)).toMatchObject({ alreadyApplied: false });
  });
});

describe("my_profile", () => {
  it("includes the uploaded CV text", async () => {
    const res = await myProfileTool.execute({}, ctx());
    expect(res.data).toMatchObject({ cv: { uploaded: true, text: "React developer, 5 years building dashboards." } });
  });

  it("says when no CV is uploaded", async () => {
    mockSeeker = { _id: SEEKER_ID };
    const res = await myProfileTool.execute({}, ctx());
    expect(res.data).toMatchObject({ cv: { uploaded: false } });
  });
});
