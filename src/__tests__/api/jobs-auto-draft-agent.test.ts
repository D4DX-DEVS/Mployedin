/**
 * @jest-environment node
 *
 * POST /api/jobs/auto-draft — the save-on-leave behind the job wizard. Agents
 * now use the wizard, so their half-filled job is kept as a draft for the
 * employer they picked, but only an employer assigned to them.
 */
import { NextRequest, NextResponse } from "next/server";

const USER = "64a000000000000000000001";
const AGENT_ID = "64a000000000000000000002";
const EMPLOYER_ID = "64a000000000000000000003";
const OTHER_EMPLOYER = "64a000000000000000000004";

let role = "agent";
jest.mock("@/lib/db/mongoose", () => ({ __esModule: true, connectDB: jest.fn().mockResolvedValue(undefined), default: jest.fn() }));
jest.mock("@/lib/auth/withAuth", () => ({
  withAuth: (handler: (req: NextRequest, ctx: unknown) => Promise<Response>) => async (req: NextRequest) => {
    try {
      return await handler(req, { userId: USER, role, locale: "en" });
    } catch (err) {
      if (err instanceof NextResponse) return err;
      throw err;
    }
  },
}));

const lean = (value: unknown) => {
  const c: Record<string, unknown> = {};
  c.select = () => c;
  c.lean = async () => value;
  return c;
};

jest.mock("@/models/Agent", () => ({
  __esModule: true,
  default: { findOne: jest.fn(() => lean({ _id: AGENT_ID, assignedEmployerIds: [EMPLOYER_ID] })) },
}));
jest.mock("@/models/Employer", () => {
  const model = { findOne: jest.fn(() => lean({ _id: EMPLOYER_ID })) };
  return { __esModule: true, Employer: model, default: model };
});
const saved: Array<Record<string, unknown>> = [];
const draftLookups: Array<Record<string, unknown>> = [];
jest.mock("@/models/Job", () => {
  function Job(this: Record<string, unknown>, data: Record<string, unknown>) {
    Object.assign(this, data);
    this.save = jest.fn(async () => { saved.push(data); });
  }
  (Job as unknown as { findOne: unknown }).findOne = jest.fn((filter: unknown) => { draftLookups.push(filter as Record<string, unknown>); return lean(null); });
  (Job as unknown as { updateOne: unknown }).updateOne = jest.fn();
  return { __esModule: true, default: Job };
});

import { POST } from "@/app/api/jobs/auto-draft/route";

function post(body: Record<string, unknown>) {
  return POST(
    new NextRequest("http://localhost/api/jobs/auto-draft", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: "Staff Nurse", ...body }),
    }),
    {} as never,
  );
}

beforeEach(() => {
  saved.length = 0;
  draftLookups.length = 0;
  role = "agent";
});

it("saves an agent's draft for an assigned employer, credited to the agent", async () => {
  const res = await post({ employerId: EMPLOYER_ID });
  expect(res.status).toBeLessThan(300);
  expect(saved).toHaveLength(1);
  expect(String(saved[0].employerId)).toBe(EMPLOYER_ID);
  expect(String(saved[0].agentId)).toBe(AGENT_ID);
  expect(saved[0].status).toBe("draft");
});

it("refuses an employer the agent is not assigned to", async () => {
  expect((await post({ employerId: OTHER_EMPLOYER })).status).toBe(403);
  expect(saved).toHaveLength(0);
});

it("refuses an agent draft with no employer picked yet", async () => {
  expect((await post({})).status).toBe(403);
});

it("keeps saving an employer's own draft as before", async () => {
  role = "employer";
  await post({ employerId: OTHER_EMPLOYER });
  expect(String(saved[0].employerId)).toBe(EMPLOYER_ID);
  expect(saved[0].agentId).toBeUndefined();
});

it("refreshes only the author's own draft, so an agent and the employer never overwrite each other", async () => {
  await post({ employerId: EMPLOYER_ID });
  expect(draftLookups[0]).toMatchObject({ employerId: EMPLOYER_ID, title: "Staff Nurse", postedBy: USER });
  expect(saved[0].postedBy).toBe(USER);

  role = "employer";
  await post({});
  // The employer's lookup leaves out drafts written by someone else.
  expect(draftLookups[1]).toMatchObject({ postedBy: { $in: [USER, null] } });
});
