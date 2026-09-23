/**
 * @jest-environment node
 *
 * GET /api/jobs, role "agent" whose Agent profile is missing (e.g. self-register
 * created the User but the Agent insert failed). The agent branch used to skip
 * scoping and leave the query as `{ deletedAt: null }` — every job on the
 * platform, drafts included, with other agents' commission rates populated.
 * It must fail closed instead.
 */
import { NextRequest } from "next/server";

jest.mock("@/lib/db/mongoose", () => ({ connectDB: jest.fn().mockResolvedValue(undefined) }));
jest.mock("@/lib/security/rateLimit", () => ({
  checkRateLimitDual: jest.fn().mockResolvedValue({ allowed: true }),
  RATE_LIMIT_CONFIGS: { api: {}, jobCreate: {} },
}));
jest.mock("@/lib/notifications/trigger", () => ({ notify: jest.fn() }));
jest.mock("@/lib/audit/log", () => ({ logActivity: jest.fn(), actorFromCtx: jest.fn() }));

const agentLean = jest.fn();
jest.mock("@/models/Agent", () => ({
  __esModule: true,
  default: { findOne: () => ({ select: () => ({ lean: agentLean }) }) },
}));
jest.mock("@/models/SuperAgent", () => ({ __esModule: true, default: {} }));
jest.mock("@/models/Employer", () => ({ Employer: { findOne: jest.fn() } }));
jest.mock("@/models/CompanyUser", () => ({ CompanyUser: { findOne: jest.fn() } }));
jest.mock("@/models/Application", () => ({ Application: { aggregate: jest.fn().mockResolvedValue([]) } }));
jest.mock("@/models/ExtractionDraft", () => ({ ExtractionDraft: {} }));

const jobFind = jest.fn();
const jobCount = jest.fn();
const jobAggregate = jest.fn();
jest.mock("@/models/Job", () => ({
  __esModule: true,
  default: {
    find: (...a: unknown[]) => jobFind(...a),
    countDocuments: (...a: unknown[]) => jobCount(...a),
    aggregate: (...a: unknown[]) => jobAggregate(...a),
  },
}));

import { getHandler } from "@/app/api/jobs/handlers";

const ctx = { userId: "aaaaaaaaaaaaaaaaaaaaaaaa", role: "agent" as const, locale: "en" };

beforeEach(() => jest.clearAllMocks());

it("refuses an agent session with no Agent profile instead of querying every job", async () => {
  agentLean.mockResolvedValue(null);
  const res = await getHandler(new NextRequest("http://localhost/api/jobs?limit=100"), ctx);
  expect(res.status).toBe(404);
  expect(jobFind).not.toHaveBeenCalled();
  expect(jobCount).not.toHaveBeenCalled();
  expect(jobAggregate).not.toHaveBeenCalled();
});
