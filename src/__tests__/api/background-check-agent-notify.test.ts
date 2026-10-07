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
let jobDoc: Record<string, unknown> | null;
const JOB_AGENT_ID = "651000000000000000000a11";
const JOB_AGENT_USER_ID = "651000000000000000000a12";
const agentUsers: Record<string, string> = { [AGENT_ID]: AGENT_USER_ID, [JOB_AGENT_ID]: JOB_AGENT_USER_ID };
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
jest.mock("@/models/Agent", () => ({
  __esModule: true,
  default: {
    find: jest.fn((q: { _id: { $in: string[] } }) => chain(q._id.$in.map((id) => ({ userId: agentUsers[id] })))),
  },
}));
jest.mock("@/models/Job", () => ({ __esModule: true, default: { findById: jest.fn(() => chain(jobDoc)) } }));
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
  jobDoc = { title: "Accountant" };
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

it("also tells the job's own agent when it differs from the employer's (QA EMP-002)", async () => {
  jobDoc = { title: "Accountant", agentId: JOB_AGENT_ID };
  expect((await post()).status).toBe(201);
  await new Promise((r) => setImmediate(r));
  const told = mockNotify.mock.calls.map((c) => c[0].userId).sort();
  expect(told).toEqual([AGENT_USER_ID, JOB_AGENT_USER_ID].sort());
});

it("tells the job's agent when the employer has none", async () => {
  employerDoc = { _id: EMPLOYER_ID, companyName: "Acme" };
  jobDoc = { title: "Accountant", agentId: JOB_AGENT_ID };
  expect((await post()).status).toBe(201);
  await new Promise((r) => setImmediate(r));
  expect(mockNotify).toHaveBeenCalledTimes(1);
  expect(mockNotify.mock.calls[0][0].userId).toBe(JOB_AGENT_USER_ID);
});

it("tells a shared agent only once", async () => {
  jobDoc = { title: "Accountant", agentId: AGENT_ID };
  expect((await post()).status).toBe(201);
  await new Promise((r) => setImmediate(r));
  expect(mockNotify).toHaveBeenCalledTimes(1);
});
