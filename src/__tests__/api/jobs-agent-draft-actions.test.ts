/**
 * @jest-environment node
 *
 * Agents can discard a draft they posted (or one at an assigned employer) and
 * nothing else; their own draft still opens after the employer moves on.
 */

import { NextRequest } from "next/server";

const AGENT_USER = "652000000000000000000009";
const AGENT_ID = "652000000000000000000010";
const OTHER_AGENT = "652000000000000000000011";
const EMPLOYER_ID = "652000000000000000000001";
const OTHER_EMPLOYER = "652000000000000000000002";
const JOB_ID = "652000000000000000000003";

type JobDoc = { _id: string; employerId: string; agentId: string | null; status: string; title: string; deletedAt: Date | null; save: jest.Mock };
let job: JobDoc;
let agentDoc: { _id: string; assignedEmployerIds: string[] } | null;

const lean = <T,>(value: () => T) => ({ select: jest.fn().mockReturnValue({ lean: jest.fn(() => Promise.resolve(value())) }) });

jest.mock("@/lib/db/mongoose", () => ({ connectDB: jest.fn().mockResolvedValue(undefined) }));
jest.mock("@/lib/audit/log", () => ({
  actorFromCtx: jest.fn((ctx) => ({ actorId: ctx.userId, actorRole: ctx.role })),
  logActivity: jest.fn().mockResolvedValue(undefined),
}));
jest.mock("@/lib/auth/agentRestrictions", () => ({ getScopedEmployerIds: jest.fn().mockResolvedValue([]) }));
jest.mock("@/lib/jobs/agentPosting", () => ({ agentPostingFor: jest.fn().mockResolvedValue(null) }));
jest.mock("@/models/Job", () => ({
  __esModule: true,
  default: {
    findById: jest.fn(() => Promise.resolve(job)),
    findOne: jest.fn(() => ({ populate: jest.fn().mockReturnValue({ lean: jest.fn(() => Promise.resolve({ ...job })) }) })),
  },
}));
jest.mock("@/models/Employer", () => ({ __esModule: true, Employer: { findOne: jest.fn() } }));
jest.mock("@/models/Agent", () => ({ __esModule: true, default: { findOne: jest.fn(() => lean(() => agentDoc)) } }));

const ctx = { userId: AGENT_USER, role: "agent" as const, locale: "en" };
const req = () => new NextRequest(`http://localhost:3000/api/jobs/${JOB_ID}`, { method: "DELETE" });

beforeEach(() => {
  job = { _id: JOB_ID, employerId: EMPLOYER_ID, agentId: AGENT_ID, status: "draft", title: "Draft", deletedAt: null, save: jest.fn().mockResolvedValue(undefined) };
  agentDoc = { _id: AGENT_ID, assignedEmployerIds: [] };
});

describe("DELETE /api/jobs/[id] as an agent", () => {
  it("discards a draft the agent posted", async () => {
    const { deleteHandler } = await import("@/app/api/jobs/[id]/handlers");
    const res = await deleteHandler(req(), ctx, { id: JOB_ID });
    expect(res.status).toBe(200);
    expect(job.deletedAt).toBeInstanceOf(Date);
  });

  it("discards a draft at an assigned employer posted by someone else", async () => {
    job.agentId = OTHER_AGENT;
    agentDoc = { _id: AGENT_ID, assignedEmployerIds: [EMPLOYER_ID] };
    const { deleteHandler } = await import("@/app/api/jobs/[id]/handlers");
    expect((await deleteHandler(req(), ctx, { id: JOB_ID })).status).toBe(200);
  });

  it("refuses a live job, even the agent's own", async () => {
    job.status = "active";
    const { deleteHandler } = await import("@/app/api/jobs/[id]/handlers");
    expect((await deleteHandler(req(), ctx, { id: JOB_ID })).status).toBe(403);
    expect(job.deletedAt).toBeNull();
  });

  it("refuses another agent's draft at an employer not assigned to them", async () => {
    job.agentId = OTHER_AGENT;
    job.employerId = OTHER_EMPLOYER;
    const { deleteHandler } = await import("@/app/api/jobs/[id]/handlers");
    expect((await deleteHandler(req(), ctx, { id: JOB_ID })).status).toBe(403);
    expect(job.deletedAt).toBeNull();
  });
});

describe("GET /api/jobs/[id] as the posting agent", () => {
  it("opens their own draft after the employer left their scope, editable", async () => {
    const { getHandler } = await import("@/app/api/jobs/[id]/handlers");
    const res = await getHandler(new NextRequest(`http://localhost:3000/api/jobs/${JOB_ID}`), ctx, { id: JOB_ID });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.job.viewerCanEdit).toBe(true);
    expect(body.job.viewerIsOwner).toBe(true);
  });

  it("still hides another agent's draft", async () => {
    job.agentId = OTHER_AGENT;
    const { getHandler } = await import("@/app/api/jobs/[id]/handlers");
    const res = await getHandler(new NextRequest(`http://localhost:3000/api/jobs/${JOB_ID}`), ctx, { id: JOB_ID });
    expect(res.status).toBe(404);
  });
});
