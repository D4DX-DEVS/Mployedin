/**
 * @jest-environment node
 *
 * PATCH /api/jobs/[id]/workflow — the job's stages: a template picked by hand
 * (manual snapshot), back to automatic matching (templateId null), or stages
 * edited for this job only (custom, keeps the template it started from).
 * GET describes where the stages came from; a legacy job has no template.
 */
import { NextRequest, NextResponse } from "next/server";

const ADMIN_ID = "64a000000000000000000001";
const EMPLOYER_ID = "64a000000000000000000002";
const JOB_ID = "64a000000000000000000010";
const TEMPLATE_ID = "64a000000000000000000020";

jest.mock("@/lib/db/mongoose", () => ({ __esModule: true, connectDB: jest.fn().mockResolvedValue(undefined), default: jest.fn() }));
const logActivity = jest.fn().mockResolvedValue(undefined);
jest.mock("@/lib/audit/log", () => ({ logActivity: (...a: unknown[]) => logActivity(...a), actorFromCtx: () => ({}) }));
jest.mock("@/lib/subscription/withSubscription", () => ({ withSubscription: (h: unknown) => h }));
jest.mock("@/lib/auth/withAuth", () => ({
  withAuth: (handler: (req: NextRequest, ctx: unknown, params?: Record<string, string>) => Promise<Response>) =>
    async (req: NextRequest, context?: { params: Promise<Record<string, string>> }) => {
      const params = context ? await context.params : {};
      try {
        return await handler(req, { userId: ADMIN_ID, role: "admin", locale: "en" }, params);
      } catch (err) {
        if (err instanceof NextResponse) return err;
        throw err;
      }
    },
}));
jest.mock("@/models/Agent", () => ({ __esModule: true, default: { findOne: jest.fn(), findById: jest.fn() } }));
jest.mock("@/models/SuperAgent", () => ({ __esModule: true, default: { findOne: jest.fn() } }));

const lean = (value: unknown) => {
  const c: Record<string, unknown> = {};
  c.select = () => c;
  c.lean = async () => value;
  return c;
};

jest.mock("@/models/Employer", () => {
  const model = { findById: jest.fn(() => lean({ _id: EMPLOYER_ID, workflow: {} })), findOne: jest.fn(() => lean(null)) };
  return { __esModule: true, Employer: model, default: model };
});

const salesTemplate = {
  _id: TEMPLATE_ID,
  name: "Sales hiring",
  version: 3,
  scope: "system",
  isActive: true,
  stages: [
    { id: "applied", label: "Applied", phase: "applied" },
    { id: "phone_screen", label: "Phone screen", phase: "shortlisted" },
    { id: "interview_scheduled", label: "Interview", phase: "interview_scheduled" },
    { id: "hired", label: "Hired", phase: "hired" },
  ],
  match: { titleKeywords: ["sales"] },
};
let usableTemplate: unknown = salesTemplate;
let visibleTemplates: unknown[] = [salesTemplate];
jest.mock("@/models/WorkflowTemplate", () => ({
  __esModule: true,
  default: {
    findOne: jest.fn(() => lean(usableTemplate)),
    find: jest.fn(() => lean(visibleTemplates)),
  },
}));

let jobDoc: Record<string, unknown>;
const jobSave = jest.fn().mockResolvedValue(undefined);
jest.mock("@/models/Job", () => ({
  __esModule: true,
  default: {
    findById: jest.fn(() => {
      // GET reads .select().lean(); PATCH awaits the document itself.
      const chain = { select: () => chain, lean: async () => jobDoc };
      return Object.assign(Promise.resolve({ ...jobDoc, save: jobSave }), chain);
    }),
  },
}));

function req(method: string, body?: unknown) {
  return new NextRequest(`http://localhost/api/jobs/${JOB_ID}/workflow`, {
    method,
    headers: { "content-type": "application/json" },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}
const params = { params: Promise.resolve({ id: JOB_ID }) };

beforeEach(() => {
  jest.clearAllMocks();
  usableTemplate = salesTemplate;
  visibleTemplates = [salesTemplate];
  jobDoc = {
    _id: JOB_ID,
    employerId: EMPLOYER_ID,
    title: "Sales Executive",
    status: "active",
    workflow: {
      stages: salesTemplate.stages,
      template: { templateId: TEMPLATE_ID, name: "Sales hiring", version: 2, source: "auto", reason: "matched:title", appliedAt: new Date("2026-09-01") },
    },
  };
});

async function savedWorkflow() {
  const { default: Job } = await import("@/models/Job");
  const doc = await (Job.findById as jest.Mock).mock.results.at(-1)!.value;
  return doc.workflow as { stages: { id: string; phase: string }[]; template: Record<string, unknown> };
}

describe("GET /api/jobs/[id]/workflow", () => {
  it("describes the snapshot: stages, template, version and why it was picked", async () => {
    const { GET } = await import("@/app/api/jobs/[id]/workflow/route");
    const body = await (await GET(req("GET"), params)).json();

    expect(body.stages.map((s: { id: string }) => s.id)).toEqual(["applied", "phone_screen", "interview_scheduled", "hired"]);
    expect(body.template).toMatchObject({ templateId: TEMPLATE_ID, name: "Sales hiring", version: 2, source: "auto" });
    expect(body.template.reason).toMatchObject({ kind: "matched" });
  });

  it("gives a legacy job (no template source) the standard pipeline and no template", async () => {
    jobDoc.workflow = { stages: [{ id: "applied", label: "Applied", enabled: true, order: 1 }] };
    const { GET } = await import("@/app/api/jobs/[id]/workflow/route");
    const body = await (await GET(req("GET"), params)).json();

    expect(body.template).toBeNull();
    expect(body.stages[0]).toMatchObject({ id: "applied", phase: "applied" });
    expect(body.stages.at(-1)).toMatchObject({ phase: "hired" });
  });
});

describe("PATCH /api/jobs/[id]/workflow", () => {
  it("pins a template picked by hand as a manual snapshot at its current version", async () => {
    const { PATCH } = await import("@/app/api/jobs/[id]/workflow/route");
    const res = await PATCH(req("PATCH", { templateId: TEMPLATE_ID }), params);

    expect(res.status).toBe(200);
    expect(jobSave).toHaveBeenCalled();
    const wf = await savedWorkflow();
    expect(wf.template).toMatchObject({ name: "Sales hiring", version: 3, source: "manual" });
    expect(wf.stages.map((s) => s.id)).toContain("phone_screen");
    expect(logActivity).toHaveBeenCalledWith(expect.objectContaining({ action: "job.workflow_change" }));
  });

  it("404s a template the job's employer can't use, and saves nothing", async () => {
    usableTemplate = null;
    const { PATCH } = await import("@/app/api/jobs/[id]/workflow/route");
    const res = await PATCH(req("PATCH", { templateId: TEMPLATE_ID }), params);

    expect(res.status).toBe(404);
    expect(jobSave).not.toHaveBeenCalled();
  });

  it("goes back to automatic matching with templateId null", async () => {
    const { PATCH } = await import("@/app/api/jobs/[id]/workflow/route");
    const res = await PATCH(req("PATCH", { templateId: null }), params);

    expect(res.status).toBe(200);
    const wf = await savedWorkflow();
    expect(wf.template).toMatchObject({ source: "auto", name: "Sales hiring" });
    expect(String(wf.template.reason)).toContain("matched");
  });

  it("saves stages edited for this job as custom, keeping the template they started from", async () => {
    const customStages = [
      { id: "applied", label: "Applied", phase: "applied" },
      { id: "tech_1", label: "Technical round", phase: "interview_scheduled" },
      { id: "tech_2", label: "Culture fit", phase: "interview_scheduled" },
      { id: "hired", label: "Hired", phase: "hired" },
    ];
    const { PATCH } = await import("@/app/api/jobs/[id]/workflow/route");
    const res = await PATCH(req("PATCH", { customStages }), params);

    expect(res.status).toBe(200);
    const wf = await savedWorkflow();
    expect(wf.template).toMatchObject({ source: "custom", name: "Sales hiring", templateId: TEMPLATE_ID });
    expect(wf.stages.map((s) => s.id)).toEqual(["applied", "tech_1", "tech_2", "hired"]);
  });

  it("rejects a stage list that doesn't start at Applied", async () => {
    const { PATCH } = await import("@/app/api/jobs/[id]/workflow/route");
    const res = await PATCH(req("PATCH", {
      customStages: [
        { id: "screen", label: "Screen", phase: "shortlisted" },
        { id: "hired", label: "Hired", phase: "hired" },
      ],
    }), params);

    expect(res.status).toBe(400);
    expect(jobSave).not.toHaveBeenCalled();
  });

  it("a rules-only save leaves the stages alone", async () => {
    const { PATCH } = await import("@/app/api/jobs/[id]/workflow/route");
    const res = await PATCH(req("PATCH", { settings: { autoRejectEnabled: false } }), params);

    expect(res.status).toBe(200);
    const wf = await savedWorkflow();
    expect(wf.template).toMatchObject({ source: "auto", version: 2 });
    expect(logActivity).toHaveBeenCalledWith(expect.objectContaining({ action: "job.update_workflow" }));
  });
});
