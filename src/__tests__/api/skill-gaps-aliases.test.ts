/**
 * @jest-environment node
 *
 * QA retest 2026-10-06 (BUG-04): the job asks for "React", the profile says
 * "React.js". The job card scored it 93% with React matched, while the job
 * page's "Profile insights" showed React as missing and Easy Apply asked "Do
 * you have experience in React?". This route compared raw lowercase strings;
 * the scorer normalises ("react.js" == "react"). Both now use the same rule.
 */
import { NextRequest } from "next/server";

jest.mock("@/lib/db/mongoose", () => ({ connectDB: jest.fn().mockResolvedValue(undefined) }));
jest.mock("@/lib/auth/withAuth", () => ({
  withAuth: (handler: (...args: unknown[]) => unknown) => async (req: NextRequest) =>
    handler(req, { userId: "seeker_user_1", role: "job_seeker", locale: "en" }),
}));

let jobDoc: Record<string, unknown> = {};
let seekerSkills: string[] = [];
let confirmations: Array<{ skill: string; status: string; updatedAt: Date }> = [];
jest.mock("@/models/Job", () => ({
  __esModule: true,
  default: { findById: jest.fn(() => ({ select: () => ({ lean: async () => jobDoc }) })) },
}));
jest.mock("@/models/JobSeeker", () => ({
  __esModule: true,
  default: { findOne: jest.fn(() => ({ select: () => ({ lean: async () => ({ skills: seekerSkills }) }) })) },
}));
jest.mock("@/models/SkillConfirmation", () => ({
  __esModule: true,
  default: { find: jest.fn(() => ({ lean: async () => confirmations })) },
}));

import { GET } from "@/app/api/job-seeker/skill-gaps/route";

async function gaps() {
  const res = await (GET as unknown as (req: NextRequest) => Promise<Response>)(
    new NextRequest("http://localhost:3888/api/job-seeker/skill-gaps?jobId=64b000000000000000000002"),
  );
  return res.json();
}

beforeEach(() => { confirmations = []; });

describe("GET /api/job-seeker/skill-gaps — skill aliases", () => {
  it("counts React as matched when the profile says React.js, and does not ask about it", async () => {
    jobDoc = { requirements: { skills: ["React"] } };
    seekerSkills = ["React.js", "Node.js"];
    const body = await gaps();
    expect(body.matchedSkills).toEqual(["React"]);
    expect(body.unansweredSkills).toEqual([]);
  });

  it("matches the other way round and inside compound profile skills", async () => {
    jobDoc = { requirements: { skills: ["Node.js", "AWS"], preferredSkills: ["Azure"] } };
    seekerSkills = ["NodeJS", "Cloud Platforms (AWS/Azure)"];
    const body = await gaps();
    expect(body.matchedSkills).toEqual(["Node.js", "AWS", "Azure"]);
  });

  it("still asks about a skill the profile does not have", async () => {
    jobDoc = { requirements: { skills: ["Java"] } };
    seekerSkills = ["JavaScript"];
    const body = await gaps();
    expect(body.matchedSkills).toEqual([]);
    expect(body.unansweredSkills).toEqual(["Java"]);
  });

  it("applies an answer given for one spelling to the other", async () => {
    jobDoc = { requirements: { skills: ["ReactJS"] } };
    seekerSkills = [];
    confirmations = [{ skill: "React", status: "denied", updatedAt: new Date() }];
    const body = await gaps();
    expect(body.deniedSkills).toEqual(["ReactJS"]);
    expect(body.unansweredSkills).toEqual([]);
  });

  it("reports each job skill once when a job lists it as both required and preferred", async () => {
    jobDoc = { requirements: { skills: ["React"], preferredSkills: ["React.js", "Docker"] } };
    seekerSkills = ["React"];
    const body = await gaps();
    expect(body.totalJobSkills).toBe(2);
    expect(body.matchedSkills).toEqual(["React"]);
    expect(body.unansweredSkills).toEqual(["Docker"]);
  });
});
