/**
 * @jest-environment node
 *
 * QA retest 2026-10-06 (BUG-05): the job card showed "93% match" but the job
 * page showed no percentage and nothing anywhere said what the number was made
 * of. GET /api/job-seeker/match?jobId= returns the engine's score for one job —
 * the same scorePair the job list uses — with its parts.
 */
import { NextRequest } from "next/server";

jest.mock("@/lib/db/mongoose", () => ({ connectDB: jest.fn().mockResolvedValue(undefined) }));
let role = "job_seeker";
jest.mock("@/lib/auth/withAuth", () => ({
  withAuth: (handler: (...args: unknown[]) => unknown) => async (req: NextRequest) =>
    handler(req, { userId: "seeker_user_1", role, locale: "en" }),
}));

const JOB_ID = "64b000000000000000000002";
let jobDoc: Record<string, unknown> | null = null;
const jobFindOne = jest.fn((_q: unknown) => ({ select: () => ({ lean: async () => jobDoc }) }));
jest.mock("@/models/Job", () => ({ __esModule: true, default: { findOne: (q: unknown) => jobFindOne(q) } }));
let seekerDoc: Record<string, unknown> | null = { _id: "s1", skills: ["React.js"] };
jest.mock("@/models/JobSeeker", () => ({
  __esModule: true,
  default: { findOne: jest.fn(() => ({ select: () => ({ lean: async () => seekerDoc }) })) },
}));
jest.mock("@/lib/effectiveSeekerProfile", () => ({ effectiveSeekerProfile: jest.fn(async () => ({ skills: ["react.js"] })) }));

const scoreOnePair = jest.fn();
jest.mock("@/lib/matching/seekerMatches", () => ({ scoreOnePair: (...a: unknown[]) => scoreOnePair(...a) }));

import { GET } from "@/app/api/job-seeker/match/route";

async function match(jobId: string | null = JOB_ID) {
  const qs = jobId === null ? "" : `?jobId=${jobId}`;
  return (GET as unknown as (req: NextRequest) => Promise<Response>)(
    new NextRequest(`http://localhost:3888/api/job-seeker/match${qs}`),
  );
}

beforeEach(() => {
  role = "job_seeker";
  jobDoc = { _id: JOB_ID, title: "Senior React Developer", requirements: { skills: ["React"] } };
  seekerDoc = { _id: "s1", skills: ["React.js"] };
  scoreOnePair.mockReset();
});

describe("GET /api/job-seeker/match", () => {
  it("returns the engine's score and its parts, with the AI adjustment separated out", async () => {
    scoreOnePair.mockResolvedValue({
      eligible: true,
      score: 93,
      aiConfidence: 0.9,
      breakdown: {
        overall: 90, skills: 100, role: 80, experience: 70,
        matchedSkills: ["React"], missingSkills: [], skillsUnknown: false,
      },
    });
    const res = await match();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      score: 93,
      eligible: true,
      parts: { skills: 100, role: 80, experience: 70 },
      aiAdjustment: 3,
      matchedSkills: ["React"],
      missingSkills: [],
      skillsUnknown: false,
    });
    // Only live jobs are scored for a seeker, as on the job page itself.
    expect(jobFindOne).toHaveBeenCalledWith(expect.objectContaining({ _id: JOB_ID, status: "active" }));
  });

  it("says which gate a job failed", async () => {
    scoreOnePair.mockResolvedValue({
      eligible: false,
      reason: "country",
      score: 70,
      breakdown: { overall: 70, skills: 80, role: 60, experience: 50, matchedSkills: [], missingSkills: ["Go"], skillsUnknown: false },
    });
    const body = await (await match()).json();
    expect(body).toMatchObject({ eligible: false, reason: "country", score: 70, aiAdjustment: 0 });
  });

  it("404s for a job a seeker can't see", async () => {
    jobDoc = null;
    expect((await match()).status).toBe(404);
  });

  it("400s for a missing or malformed id and 403s for other roles", async () => {
    expect((await match(null)).status).toBe(400);
    expect((await match("nope")).status).toBe(400);
    role = "employer";
    expect((await match()).status).toBe(403);
  });

  it("answers with no score when the seeker has no profile yet", async () => {
    seekerDoc = null;
    const body = await (await match()).json();
    expect(body).toEqual({ score: null });
    expect(scoreOnePair).not.toHaveBeenCalled();
  });
});
