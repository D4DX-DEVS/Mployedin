/**
 * @jest-environment node
 *
 * POST /api/employer/background-checks — the agent who works with the
 * employer is told when a check is requested (client report 2026-09-30, #16).
 * The employer's team still runs it.
 */
import { NextRequest } from "next/server";

const EMPLOYER_ID = "651000000000000000000e01";
const AGENT_ID = "651000000000000000000a01";
const AGENT_USER_ID = "651000000000000000000a02";
const APP_ID = "651000000000000000000c01";
const JOB_ID = "651000000000000000000b01";
const OWNER_ID = "651000000000000000000f01";

let employerDoc: Record<string, unknown> | null;
const mockNotify = jest.fn().mockResolvedValue(undefined);

jest.mock("@/lib/auth/withAuth", () => ({
  withAuth: (handler: (req: NextRequest, ctx: unknown) => Promise<Response>) =>
    (req: NextRequest) => handler(req, { userId: OWNER_ID, role: "employer", locale: "en" }),
}));
jest.mock("@/lib/db/mongoose", () => ({ connectDB: jest.fn().mockResolvedValue(undefined) }));
jest.mock("@/lib/audit/log", () => ({ actorFromCtx: jest.fn(() => ({})), logActivity: jest.fn().mockResolvedValue(undefined) }));
jest.mock("@/lib/notifications/trigger", () => ({ notify: (...a: unknown[]) => mockNotify(...a) }));
jest.mock("@/lib/logger", () => ({ __esModule: true, default: { error: jest.fn(), warn: jest.fn(), info: jest.fn() } }));

const chain = (value: unknown) => {
  const c: Record<string, unknown> = {};
  c.select = () => c;
  c.lean = async () => value;
  return c;
};
jest.mock("@/models/Employer", () => {
  const model = { findOne: jest.fn(() => chain(employerDoc)) };
  return { __esModule: true, Employer: model, default: model };
});
jest.mock("@/models/Application", () => ({
  __esModule: true,
  default: { findById: jest.fn(() => chain({ employerId: EMPLOYER_ID, jobId: JOB_ID, jobSeekerId: "651000000000000000000d01" })) },
}));
jest.mock("@/models/Agent", () => ({ __esModule: true, default: { findById: jest.fn(() => chain({ userId: AGENT_USER_ID })) } }));
jest.mock("@/models/Job", () => ({ __esModule: true, default: { findById: jest.fn(() => chain({ title: "Accountant" })) } }));
jest.mock("@/models/BackgroundCheck", () => ({ __esModule: true, default: { create: jest.fn(async (doc: unknown) => ({ _id: "check1", ...(doc as object) })) } }));

async function post() {
  const { POST } = await import("@/app/api/employer/background-checks/route");
  return POST(new NextRequest("http://localhost/api/employer/background-checks", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ applicationId: APP_ID, checkType: "background" }),
  }), {} as never);
}

beforeEach(() => {
  jest.clearAllMocks();
  employerDoc = { _id: EMPLOYER_ID, agentId: AGENT_ID, companyName: "Acme" };
});

it("tells the employer's agent that a check was requested", async () => {
  const res = await post();
  expect(res.status).toBe(201);
  await new Promise((r) => setImmediate(r));
  expect(mockNotify).toHaveBeenCalledWith(expect.objectContaining({
    userId: AGENT_USER_ID,
    actorId: OWNER_ID,
    titleKey: "backgroundCheckRequestedTitle",
    link: "/agent/background-checks",
    params: { companyName: "Acme", jobTitle: "Accountant" },
  }));
});

it("tells nobody when the employer has no agent", async () => {
  employerDoc = { _id: EMPLOYER_ID, companyName: "Acme" };
  expect((await post()).status).toBe(201);
  await new Promise((r) => setImmediate(r));
  expect(mockNotify).not.toHaveBeenCalled();
});
