/**
 * @jest-environment node
 */
/**
 * Documents and timeline of an application are readable by whoever may open
 * the application itself (GET /api/applications/[id]): the owning employer
 * (subject to a colleague's job restriction), the seeker, staff in scope and
 * admin.
 *
 * Both routes used to `.select()` the application without `jobId`, then look
 * the job up by that missing id — so every employer (documents) and every
 * agent / super-agent (both) got 403. Super-agents also have no Agent profile,
 * so the old `Agent.findOne` check refused them even with a jobId.
 */
import { NextRequest } from "next/server";

jest.mock("@/lib/db/mongoose", () => ({ connectDB: jest.fn().mockResolvedValue(undefined) }));
jest.mock("@/lib/auth/withAuth", () => ({
  withAuth: (handler: Function) => async (req: NextRequest, params?: Record<string, string>) =>
    handler(req, (req as unknown as { __ctx: unknown }).__ctx, params ?? {}),
}));
jest.mock("@/lib/audit/log", () => ({ actorFromCtx: jest.fn(), logActivity: jest.fn() }));

const APP_ID = "64b0000000000000000000c1";
const JOB_ID = "64b0000000000000000000b1";
const EMP_ID = "64b0000000000000000000e1";
const OTHER_EMP = "64b0000000000000000000e2";
const AGENT_ID = "64b0000000000000000000a1";
const SEEKER_ID = "64b0000000000000000000d1";

function chain(result: unknown) {
  const node: Record<string, unknown> = {};
  for (const m of ["select", "sort", "skip", "limit", "populate"]) node[m] = jest.fn(() => node);
  node.lean = jest.fn(async () => result);
  return node;
}

/** Mimics a real `.select()`: fields not asked for come back undefined. */
const APP_DOC: Record<string, unknown> = {
  _id: APP_ID,
  jobId: JOB_ID,
  employerId: EMP_ID,
  jobSeekerId: SEEKER_ID,
  documents: [{ name: "cv.pdf", url: "https://x/cv.pdf", type: "resume" }],
};
function projected(fields: string) {
  const keep = fields.split(/\s+/).filter(Boolean);
  return Object.fromEntries(Object.entries(APP_DOC).filter(([k]) => k === "_id" || keep.includes(k)));
}
const applicationFindById = jest.fn(() => {
  let fields = "";
  const node: Record<string, unknown> = {};
  node.select = jest.fn((f: string) => { fields = f; return node; });
  node.lean = jest.fn(async () => projected(fields));
  return node;
});
jest.mock("@/models/Application", () => ({
  __esModule: true,
  default: { findById: (...a: unknown[]) => (applicationFindById as (...x: unknown[]) => unknown)(...a) },
}));

const jobFindById = jest.fn((id: unknown) =>
  chain(String(id) === JOB_ID ? { _id: JOB_ID, employerId: EMP_ID, agentId: AGENT_ID } : null));
jest.mock("@/models/Job", () => ({
  __esModule: true,
  default: { findById: (id: unknown) => jobFindById(id) },
}));

const employerFindOne = jest.fn();
jest.mock("@/models/Employer", () => {
  const model = { findOne: (...a: unknown[]) => employerFindOne(...a) };
  return { __esModule: true, default: model, Employer: model };
});
const agentFindOne = jest.fn();
jest.mock("@/models/Agent", () => {
  const model = { findOne: (...a: unknown[]) => agentFindOne(...a) };
  return { __esModule: true, default: model, Agent: model };
});
const seekerFindOne = jest.fn();
jest.mock("@/models/JobSeeker", () => ({
  __esModule: true,
  default: { findOne: (...a: unknown[]) => seekerFindOne(...a) },
}));
jest.mock("@/models/AuditLog", () => ({
  __esModule: true,
  default: { find: jest.fn(() => chain([])) },
}));

const agentCanSeeEmployer = jest.fn();
const getSuperAgentBook = jest.fn();
jest.mock("@/lib/auth/agentRestrictions", () => ({
  agentCanSeeEmployer: (...a: unknown[]) => agentCanSeeEmployer(...a),
  getSuperAgentBook: (...a: unknown[]) => getSuperAgentBook(...a),
}));
const memberMayAccessJob = jest.fn();
jest.mock("@/lib/permissions/team", () => ({
  memberMayAccessJob: (...a: unknown[]) => memberMayAccessJob(...a),
}));

import { GET as DOCS_GET } from "@/app/api/applications/[id]/documents/route";
import { GET as TIMELINE_GET } from "@/app/api/applications/[id]/timeline/route";

type Handler = (r: NextRequest, p: Record<string, string>) => Promise<Response>;
const ROUTES: Array<[string, Handler]> = [
  ["documents", DOCS_GET as unknown as Handler],
  ["timeline", TIMELINE_GET as unknown as Handler],
];

function call(handler: Handler, role: string) {
  const r = new NextRequest(`http://t/api/applications/${APP_ID}`);
  (r as unknown as { __ctx: unknown }).__ctx = { userId: `${role}-user`, role, locale: "en" };
  return handler(r, { id: APP_ID });
}

beforeEach(() => {
  jest.clearAllMocks();
  employerFindOne.mockReturnValue(chain({ _id: EMP_ID }));
  agentFindOne.mockReturnValue(chain({ _id: AGENT_ID, assignedEmployerIds: [] }));
  seekerFindOne.mockReturnValue(chain({ _id: SEEKER_ID }));
  agentCanSeeEmployer.mockResolvedValue(false);
  getSuperAgentBook.mockResolvedValue(null);
  memberMayAccessJob.mockResolvedValue(true);
});

describe.each(ROUTES)("GET /api/applications/[id]/%s — same readers as the application", (_name, handler) => {
  it("the owning employer may read it", async () => {
    expect((await call(handler, "employer")).status).toBe(200);
  });

  it("another employer is refused", async () => {
    employerFindOne.mockReturnValue(chain({ _id: OTHER_EMP }));
    expect((await call(handler, "employer")).status).toBe(403);
  });

  it("a colleague restricted away from the job is refused", async () => {
    memberMayAccessJob.mockResolvedValue(false);
    expect((await call(handler, "employer")).status).toBe(403);
  });

  it("the agent who owns the job may read it", async () => {
    expect((await call(handler, "agent")).status).toBe(200);
  });

  it("an agent who sees the employer may read it", async () => {
    agentFindOne.mockReturnValue(chain({ _id: "64b0000000000000000000a9" }));
    agentCanSeeEmployer.mockResolvedValue(true);
    expect((await call(handler, "agent")).status).toBe(200);
  });

  it("an out-of-scope agent is refused", async () => {
    agentFindOne.mockReturnValue(chain({ _id: "64b0000000000000000000a9" }));
    expect((await call(handler, "agent")).status).toBe(403);
  });

  it("a super-agent whose book holds the employer may read it (no Agent profile needed)", async () => {
    agentFindOne.mockReturnValue(chain(null));
    getSuperAgentBook.mockResolvedValue({ agentIds: [], employerIds: [EMP_ID] });
    expect((await call(handler, "super_agent")).status).toBe(200);
  });

  it("a super-agent outside the book is refused", async () => {
    getSuperAgentBook.mockResolvedValue({ agentIds: [], employerIds: [OTHER_EMP] });
    expect((await call(handler, "super_agent")).status).toBe(403);
  });

  it("the seeker who applied may read it", async () => {
    expect((await call(handler, "job_seeker")).status).toBe(200);
  });

  it("another seeker is refused", async () => {
    seekerFindOne.mockReturnValue(chain({ _id: "64b0000000000000000000d9" }));
    expect((await call(handler, "job_seeker")).status).toBe(403);
  });

  it("admin may read it", async () => {
    expect((await call(handler, "admin")).status).toBe(200);
  });
});
