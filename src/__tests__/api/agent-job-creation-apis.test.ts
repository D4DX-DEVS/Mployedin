/**
 * @jest-environment node
 *
 * The employer's ways to start a job — AI creator, saved template, uploaded
 * document — opened to agents, each for an employer assigned to the agent.
 * Every route below decides "may this agent act for this employer?" with
 * agentPostingFor; these tests pin where it is asked and what it guards.
 */
import { NextRequest } from "next/server";

const AGENT_USER = "64b000000000000000000001";
const ASSIGNED = "64b000000000000000000002";
const OTHER = "64b000000000000000000009";
const TEMPLATE_ID = "64b000000000000000000003";
const DRAFT_ID = "64b000000000000000000005";
const AGENT_ID = "64b000000000000000000006";

let role = "agent";
const agentPostingFor = jest.fn();

jest.mock("@/lib/jobs/agentPosting", () => ({ agentPostingFor: (...a: unknown[]) => agentPostingFor(...a) }));
jest.mock("@/lib/db/mongoose", () => ({ __esModule: true, connectDB: jest.fn().mockResolvedValue(undefined), default: jest.fn() }));
jest.mock("@/lib/auth/config", () => ({ auth: jest.fn(async () => ({ user: { id: AGENT_USER, role } })) }));
jest.mock("@/lib/auth/withAuth", () => ({
  withAuth: (handler: (req: NextRequest, ctx: unknown, params?: Record<string, string>) => Promise<Response>) =>
    (req: NextRequest, context?: { params: Promise<Record<string, string>> }) =>
      Promise.resolve(context?.params ?? {}).then((params) => handler(req, { userId: AGENT_USER, role, locale: "en" }, params)),
}));
jest.mock("@/lib/audit/log", () => ({
  actorFromCtx: jest.fn((ctx) => ({ actorId: ctx.userId, actorRole: ctx.role })),
  logActivity: jest.fn().mockResolvedValue(undefined),
}));
jest.mock("@/lib/logger", () => ({ __esModule: true, default: { error: jest.fn(), warn: jest.fn(), info: jest.fn() } }));
jest.mock("@/lib/security/rateLimit", () => ({
  checkRateLimit: jest.fn(async () => ({ allowed: true })),
  RATE_LIMIT_CONFIGS: { upload: {} },
}));
jest.mock("@/lib/ai/dailyQuota", () => ({ enforceDailyAiQuota: jest.fn(async () => null) }));
jest.mock("@/lib/security/file-validation", () => ({ validateUploadedFile: jest.fn(() => null) }));
jest.mock("@/lib/security/malware-scan", () => ({ scanForMalware: jest.fn(async () => ({ clean: true })) }));
const generateMultimodal = jest.fn();
jest.mock("@/lib/ai/gemini", () => ({
  generateMultimodal: (...a: unknown[]) => generateMultimodal(...a),
  generateText: jest.fn(),
  GEMINI_MODELS: { flash: "flash" },
}));

const lean = (value: unknown) => ({ select: () => ({ lean: async () => value }), lean: async () => value });
const employerFindById = jest.fn(() => lean({ _id: ASSIGNED, companyName: "Gulf Care Clinic" }));
const employerFindOne = jest.fn(() => lean(null));
jest.mock("@/models/Employer", () => ({
  __esModule: true,
  Employer: { findById: (...a: unknown[]) => employerFindById(...(a as [])), findOne: (...a: unknown[]) => employerFindOne(...(a as [])) },
}));

const templateFind = jest.fn();
jest.mock("@/models/JobTemplate", () => ({
  __esModule: true,
  JobTemplate: {
    find: (...a: unknown[]) => templateFind(...a),
    countDocuments: jest.fn(async () => 0),
    findById: jest.fn(() => lean({ _id: TEMPLATE_ID, employerId: ASSIGNED, name: "Nurse", title: "Staff Nurse" })),
    updateOne: jest.fn().mockResolvedValue({}),
  },
}));

const jobCtor = jest.fn();
jest.mock("@/models/Job", () => ({
  __esModule: true,
  default: jest.fn().mockImplementation((doc: Record<string, unknown>) => {
    jobCtor(doc);
    return { ...doc, _id: "64b000000000000000000004", save: jest.fn().mockResolvedValue(undefined) };
  }),
}));

const draftCreate = jest.fn(async () => ({ _id: DRAFT_ID }));
const draftFindById = jest.fn();
jest.mock("@/models/ExtractionDraft", () => ({
  ExtractionDraft: { create: (...a: unknown[]) => draftCreate(...(a as [])), findById: (...a: unknown[]) => draftFindById(...(a as [])) },
}));

const threadCreate = jest.fn(async () => ({ _id: "thread-1" }));
jest.mock("@/models/ConversationThread", () => ({ ConversationThread: { create: (...a: unknown[]) => threadCreate(...(a as [])) } }));

beforeEach(() => {
  role = "agent";
  agentPostingFor.mockReset();
  agentPostingFor.mockImplementation(async (_user: string, employerId: unknown) => (String(employerId) === ASSIGNED ? AGENT_ID : null));
  jobCtor.mockClear();
  draftCreate.mockClear();
  generateMultimodal.mockReset();
  templateFind.mockReset();
  templateFind.mockReturnValue({ sort: () => ({ skip: () => ({ limit: () => ({ lean: async () => [] }) }) }) });
});

describe("job templates", () => {
  it("lists an assigned employer's templates for an agent, and refuses any other employer", async () => {
    const { GET } = await import("@/app/api/employers/job-templates/route");
    const ok = await GET(new NextRequest(`http://localhost/api/employers/job-templates?employerId=${ASSIGNED}`), { params: Promise.resolve({}) });
    expect(ok.status).toBe(200);
    expect(templateFind).toHaveBeenCalledWith({ employerId: ASSIGNED });

    templateFind.mockClear();
    const refused = await GET(new NextRequest(`http://localhost/api/employers/job-templates?employerId=${OTHER}`), { params: Promise.resolve({}) });
    expect(refused.status).toBe(403);
    expect(templateFind).not.toHaveBeenCalled();
  });

  it("still refuses the roles that never had templates", async () => {
    role = "super_agent";
    const { GET } = await import("@/app/api/employers/job-templates/route");
    const res = await GET(new NextRequest(`http://localhost/api/employers/job-templates?employerId=${ASSIGNED}`), { params: Promise.resolve({}) });
    expect(res.status).toBe(403);
  });

  it("starts a draft from an assigned employer's template, credited to the agent", async () => {
    const { POST } = await import("@/app/api/employers/job-templates/[id]/use/route");
    const res = await POST(new NextRequest(`http://localhost/x`, { method: "POST" }), { params: Promise.resolve({ id: TEMPLATE_ID }) });
    expect(res.status).toBe(201);
    expect(agentPostingFor).toHaveBeenCalledWith(AGENT_USER, ASSIGNED);
    expect(jobCtor).toHaveBeenCalledWith(expect.objectContaining({
      employerId: ASSIGNED,
      agentId: AGENT_ID,
      postedBy: AGENT_USER,
      status: "draft",
      title: "Staff Nurse",
    }));
  });

  it("refuses a template of an employer not assigned to the agent", async () => {
    agentPostingFor.mockResolvedValue(null);
    const { POST } = await import("@/app/api/employers/job-templates/[id]/use/route");
    const res = await POST(new NextRequest(`http://localhost/x`, { method: "POST" }), { params: Promise.resolve({ id: TEMPLATE_ID }) });
    expect(res.status).toBe(403);
    expect(jobCtor).not.toHaveBeenCalled();
  });
});

describe("document upload (job-extract)", () => {
  function upload(employerId?: string) {
    const form = new FormData();
    form.append("file", new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], "poster.png", { type: "image/png" }));
    if (employerId) form.append("employerId", employerId);
    return new NextRequest("http://localhost/api/ai/job-extract", { method: "POST", body: form });
  }

  it("refuses an agent's upload for an unassigned employer before any AI is spent", async () => {
    const { POST } = await import("@/app/api/ai/job-extract/route");
    for (const req of [upload(OTHER), upload()]) {
      const res = await POST(req);
      expect(res.status).toBe(403);
    }
    expect(generateMultimodal).not.toHaveBeenCalled();
    expect(draftCreate).not.toHaveBeenCalled();
  });

  it("files an agent's extraction under the assigned employer, with that employer's name", async () => {
    generateMultimodal.mockResolvedValue(JSON.stringify({ jobs: [{ title: "Staff Nurse" }] }));
    const { POST } = await import("@/app/api/ai/job-extract/route");
    const res = await POST(upload(ASSIGNED));
    expect(res.status).toBe(200);
    expect(employerFindById).toHaveBeenCalledWith(ASSIGNED);
    expect(draftCreate).toHaveBeenCalledWith(expect.objectContaining({ employerId: ASSIGNED, companyName: "Gulf Care Clinic" }));
    expect((await res.json()).draftId).toBe(DRAFT_ID);
  });
});

describe("extraction drafts", () => {
  const activeDraft = { _id: DRAFT_ID, employerId: ASSIGNED, status: "active", expiresAt: new Date(Date.now() + 86_400_000) };

  it("lets the agent resume a draft filed under an assigned employer, and nobody else's", async () => {
    const { GET } = await import("@/app/api/ai/job-extract/drafts/[id]/route");
    draftFindById.mockReturnValue(lean(activeDraft));
    const ok = await GET(new NextRequest("http://localhost/x"), { params: Promise.resolve({ id: DRAFT_ID }) });
    expect(ok.status).toBe(200);

    draftFindById.mockReturnValue(lean({ ...activeDraft, employerId: OTHER }));
    const refused = await GET(new NextRequest("http://localhost/x"), { params: Promise.resolve({ id: DRAFT_ID }) });
    expect(refused.status).toBe(403);
  });
});

describe("AI creator conversation drafts", () => {
  it("saves an agent's conversation as the agent's own thread", async () => {
    const { POST } = await import("@/app/api/ai/chat/drafts/route");
    const res = await POST(new NextRequest("http://localhost/api/ai/chat/drafts", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ messages: [{ role: "user", content: "Staff nurse for a clinic" }] }),
    }));
    expect(res.status).toBe(200);
    expect(threadCreate).toHaveBeenCalledWith(expect.objectContaining({ userId: AGENT_USER, context: "job_creator" }));
  });

  it("still refuses a job seeker", async () => {
    role = "job_seeker";
    const { POST } = await import("@/app/api/ai/chat/drafts/route");
    const res = await POST(new NextRequest("http://localhost/api/ai/chat/drafts", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ messages: [{ role: "user", content: "hi" }] }),
    }));
    expect(res.status).toBe(403);
  });
});
