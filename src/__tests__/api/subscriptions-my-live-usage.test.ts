/**
 * @jest-environment node
 *
 * QA EMP-006 (2026-10-06): Subscription read "Active Jobs 0 / 2" beside 21 live
 * jobs (usage.activeJobs counts jobs created this period and never goes down)
 * and "Team Members 0 / 1" for a team of two (never counted). The route now
 * sends what exists right now.
 */
import { NextRequest } from "next/server";

const EMPLOYER_ID = "651000000000000000000e01";
let mockCtx = { userId: "651000000000000000000f01", role: "employer", locale: "en" };
const mockJobCount = jest.fn();
const mockTeamCount = jest.fn();

jest.mock("@/lib/auth/withAuth", () => ({
  withAuth: (handler: (req: NextRequest, ctx: unknown) => Promise<Response>) => (req: NextRequest) => handler(req, mockCtx),
}));
jest.mock("@/lib/db/mongoose", () => ({ __esModule: true, default: jest.fn().mockResolvedValue(undefined) }));
const chain = (value: unknown) => ({ select: () => ({ lean: async () => value }), lean: async () => value });
jest.mock("@/models/Subscription", () => ({ __esModule: true, default: { findOne: jest.fn(() => chain({ _id: "s1", usage: { activeJobs: 0 } })) } }));
jest.mock("@/models/Employer", () => {
  const model = { findOne: jest.fn(() => chain({ _id: EMPLOYER_ID })) };
  return { __esModule: true, Employer: model, default: model };
});
jest.mock("@/models/Job", () => ({ __esModule: true, default: { countDocuments: (...a: unknown[]) => mockJobCount(...a) } }));
jest.mock("@/models/CompanyUser", () => ({ CompanyUser: { countDocuments: (...a: unknown[]) => mockTeamCount(...a) } }));

async function get() {
  const { GET } = await import("@/app/api/subscriptions/my/route");
  return GET(new NextRequest("http://localhost/api/subscriptions/my"), {} as never);
}

beforeEach(() => {
  jest.clearAllMocks();
  mockCtx = { userId: "651000000000000000000f01", role: "employer", locale: "en" };
  mockJobCount.mockResolvedValue(21);
  mockTeamCount.mockResolvedValue(1);
});

it("sends the employer's live active jobs and team seats beside the subscription", async () => {
  const body = await (await get()).json();
  expect(body.subscription).toMatchObject({ _id: "s1" });
  expect(body.liveUsage).toEqual({ activeJobs: 21, teamMembers: 1 });
  expect(mockJobCount).toHaveBeenCalledWith({ employerId: EMPLOYER_ID, status: "active", deletedAt: null });
  expect(mockTeamCount).toHaveBeenCalledWith({
    companyId: EMPLOYER_ID,
    companyRole: { $ne: "owner" },
    status: { $in: ["active", "pending"] },
  });
});

it("adds nothing for a job seeker", async () => {
  mockCtx = { ...mockCtx, role: "job_seeker" };
  const body = await (await get()).json();
  expect(body.liveUsage).toBeUndefined();
  expect(mockJobCount).not.toHaveBeenCalled();
});
