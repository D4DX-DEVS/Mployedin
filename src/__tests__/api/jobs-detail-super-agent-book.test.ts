/**
 * @jest-environment node
 *
 * /super-agent/jobs listed jobs that /api/jobs/[id] then 404'd: the list scoped
 * by "posted by one of my agents OR at an employer my agents are assigned to",
 * the detail by getScopedEmployerIds (Employer.agentId only). Both now use the
 * super-agent's book (audit 2026-09-24, NAV-03).
 */
import { NextRequest } from "next/server";

const JOB_ID = "651000000000000000000003";
const BOOK_EMPLOYER = "651000000000000000000001";
const OTHER_EMPLOYER = "651000000000000000000002";
const MY_AGENT = "651000000000000000000099";

let job: Record<string, unknown> = {};
jest.mock("@/lib/db/mongoose", () => ({ connectDB: jest.fn().mockResolvedValue(undefined) }));
jest.mock("@/lib/audit/log", () => ({ actorFromCtx: jest.fn(), logActivity: jest.fn() }));
const getSuperAgentBook = jest.fn();
const getScopedEmployerIds = jest.fn();
jest.mock("@/lib/auth/agentRestrictions", () => ({
  getSuperAgentBook: (...a: unknown[]) => getSuperAgentBook(...a),
  getScopedEmployerIds: (...a: unknown[]) => getScopedEmployerIds(...a),
}));
jest.mock("@/models/Job", () => ({
  __esModule: true,
  default: { findOne: () => ({ populate: () => ({ lean: async () => ({ ...job }) }) }) },
}));
jest.mock("@/models/Employer", () => ({ __esModule: true, Employer: { findOne: jest.fn() } }));
jest.mock("@/models/Agent", () => ({ __esModule: true, default: { findOne: jest.fn() } }));

import { getHandler } from "@/app/api/jobs/[id]/handlers";

const saCtx = { userId: "651000000000000000000050", role: "super_agent" as const, locale: "en" };

function get() {
  return getHandler(new NextRequest(`http://localhost/api/jobs/${JOB_ID}`), saCtx, { id: JOB_ID });
}

beforeEach(() => {
  getSuperAgentBook.mockResolvedValue({
    agentIds: [MY_AGENT],
    employerIds: [BOOK_EMPLOYER],
    saProfileId: "x",
    ownershipMatch: {},
  });
});

it("opens a draft at an employer in the book even when another agent posted it", async () => {
  job = { _id: JOB_ID, status: "draft", employerId: { _id: BOOK_EMPLOYER }, agentId: "651000000000000000000077", applicantIds: ["a"] };
  const res = await get();
  expect(res.status).toBe(200);
  // Owning side: private fields are kept.
  expect((await res.json()).job.applicantIds).toEqual(["a"]);
  expect(getScopedEmployerIds).not.toHaveBeenCalled();
});

it("opens a draft one of their agents posted at an employer outside the book", async () => {
  job = { _id: JOB_ID, status: "draft", employerId: { _id: OTHER_EMPLOYER }, agentId: MY_AGENT };
  expect((await get()).status).toBe(200);
});

it("still hides a draft outside the book", async () => {
  job = { _id: JOB_ID, status: "draft", employerId: { _id: OTHER_EMPLOYER }, agentId: "651000000000000000000077" };
  expect((await get()).status).toBe(404);
});

it("a super-agent with no book is not the owning side", async () => {
  getSuperAgentBook.mockResolvedValue(null);
  job = { _id: JOB_ID, status: "active", employerId: { _id: BOOK_EMPLOYER }, agentId: MY_AGENT, applicantIds: ["a"] };
  const res = await get();
  expect(res.status).toBe(200);
  expect((await res.json()).job.applicantIds).toBeUndefined();
});
