/**
 * @jest-environment node
 *
 * The workflow routes hand the editors resolved hiring rules and accept a
 * settings-only save (the builder no longer edits stages). Legacy documents
 * resolve to auto-reject OFF; a per-job save stamps `customizedAt`.
 */
import { NextRequest } from "next/server";

const EMPLOYER_USER = "64b000000000000000000001";
const EMPLOYER_ID = "64b000000000000000000002";
const JOB_ID = "64b000000000000000000010";

jest.mock("@/lib/db/mongoose", () => ({ __esModule: true, connectDB: jest.fn().mockResolvedValue(undefined), default: jest.fn().mockResolvedValue(undefined) }));
jest.mock("@/lib/audit/log", () => ({ logActivity: jest.fn().mockResolvedValue(undefined), actorFromCtx: () => ({}) }));
jest.mock("@/lib/subscription/withSubscription", () => ({ withSubscription: (h: unknown) => h }));
jest.mock("@/lib/auth/withAuth", () => ({
  withAuth: (handler: (req: NextRequest, ctx: unknown, params?: Record<string, string>) => Promise<Response>) =>
    (req: NextRequest, context?: { params: Promise<Record<string, string>> }) =>
      (context?.params ?? Promise.resolve({})).then((params) =>
        handler(req, { userId: EMPLOYER_USER, role: "employer", locale: "en" }, params)),
}));
jest.mock("@/models/Agent", () => ({ __esModule: true, default: { findOne: jest.fn(), findById: jest.fn() } }));
jest.mock("@/models/SuperAgent", () => ({ __esModule: true, default: { findOne: jest.fn() } }));

let employerDoc: Record<string, unknown> | null;
const findOneAndUpdate = jest.fn().mockResolvedValue(undefined);
jest.mock("@/models/Employer", () => {
  const findOne = jest.fn(() => ({ select: () => ({ lean: async () => employerDoc }) }));
  const findById = jest.fn(() => ({ select: () => ({ lean: async () => employerDoc }) }));
  const model = { findOne, findById, findOneAndUpdate: (...a: unknown[]) => findOneAndUpdate(...a) };
  return { __esModule: true, Employer: model, default: model };
});

let jobDoc: Record<string, unknown> | null;
const jobSave = jest.fn().mockResolvedValue(undefined);
jest.mock("@/models/Job", () => ({
  __esModule: true,
  default: {
    findById: jest.fn(() => {
      const chain = { select: () => chain, lean: async () => jobDoc };
      // PATCH awaits findById directly and needs a saveable document.
      return Object.assign(Promise.resolve(jobDoc ? { ...jobDoc, save: jobSave } : null), chain);
    }),
  },
}));

const legacyStages = [
  { id: "applied", label: "Applied", enabled: true, autoProgress: false, order: 1 },
  { id: "shortlisted", label: "Shortlisted", enabled: true, autoProgress: true, order: 2 },
];

function req(url: string, method = "GET", body?: unknown) {
  return new NextRequest(url, {
    method,
    headers: { "content-type": "application/json" },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}

describe("GET/PATCH /api/employers/workflow", () => {
  beforeEach(() => {
    findOneAndUpdate.mockClear();
    employerDoc = null;
  });

  it("returns resolved rules with auto-reject OFF for a legacy document", async () => {
    employerDoc = { _id: EMPLOYER_ID, workflow: { stages: legacyStages, settings: { aiAutoScreen: true, autoRejectBelow: 40 } } };
    const { GET } = await import("@/app/api/employers/workflow/route");
    const res = await GET(req("http://localhost:3000/api/employers/workflow"), { params: Promise.resolve({}) });
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.settings).toEqual({ autoRejectEnabled: false, autoRejectBelow: 40, notifyOnStageChange: true, shortlistTarget: 50 });
    expect(data.stages).toHaveLength(2);
  });

  it("merges a settings-only save into the stored rules without touching stages", async () => {
    employerDoc = { _id: EMPLOYER_ID, workflow: { stages: legacyStages, settings: { notifyOnStageChange: false } } };
    const { PATCH } = await import("@/app/api/employers/workflow/route");
    const res = await PATCH(
      req("http://localhost:3000/api/employers/workflow", "PATCH", { settings: { autoRejectEnabled: true, shortlistTarget: 30 } }),
      { params: Promise.resolve({}) },
    );
    expect(res.status).toBe(200);
    const update = findOneAndUpdate.mock.calls[0][1] as { $set: Record<string, unknown> };
    expect(update.$set["workflow.settings"]).toEqual({ notifyOnStageChange: false, autoRejectEnabled: true, shortlistTarget: 30 });
    expect(update.$set["workflow.stages"]).toBeUndefined();
    expect(update.$set.workflow).toBeUndefined();
  });
});

describe("GET/PATCH /api/jobs/[id]/workflow", () => {
  beforeEach(() => {
    jobSave.mockClear();
    employerDoc = { _id: EMPLOYER_ID, workflow: { settings: { autoRejectEnabled: true, autoRejectBelow: 60, notifyOnStageChange: false } } };
    jobDoc = null;
  });

  it("follows the employer rules when the job was never customised — even if defaults were persisted", async () => {
    jobDoc = { _id: JOB_ID, employerId: EMPLOYER_ID, workflow: { stages: [], settings: { notifyOnStageChange: true, autoRejectBelow: 40 } } };
    const { GET } = await import("@/app/api/jobs/[id]/workflow/route");
    const res = await GET(req(`http://localhost:3000/api/jobs/${JOB_ID}/workflow`), { params: Promise.resolve({ id: JOB_ID }) });
    const data = await res.json();
    expect(data.source).toBe("employer");
    expect(data.settings).toEqual({ autoRejectEnabled: true, autoRejectBelow: 60, notifyOnStageChange: false, shortlistTarget: 50 });
  });

  it("applies a saved per-job override field by field", async () => {
    jobDoc = { _id: JOB_ID, employerId: EMPLOYER_ID, workflow: { customizedAt: new Date(), settings: { shortlistTarget: 20, autoRejectEnabled: false } } };
    const { GET } = await import("@/app/api/jobs/[id]/workflow/route");
    const res = await GET(req(`http://localhost:3000/api/jobs/${JOB_ID}/workflow`), { params: Promise.resolve({ id: JOB_ID }) });
    const data = await res.json();
    expect(data.source).toBe("job");
    expect(data.settings).toEqual({ autoRejectEnabled: false, autoRejectBelow: 60, notifyOnStageChange: false, shortlistTarget: 20 });
  });

  it("a settings-only save stamps customizedAt, merges settings and keeps stored stages", async () => {
    jobDoc = { _id: JOB_ID, employerId: EMPLOYER_ID, workflow: { stages: legacyStages, settings: { notifyOnStageChange: true } } };
    const { PATCH } = await import("@/app/api/jobs/[id]/workflow/route");
    const res = await PATCH(
      req(`http://localhost:3000/api/jobs/${JOB_ID}/workflow`, "PATCH", { settings: { shortlistTarget: 15 } }),
      { params: Promise.resolve({ id: JOB_ID }) },
    );
    expect(res.status).toBe(200);
    expect(jobSave).toHaveBeenCalledTimes(1);
    const saved = (jobSave.mock.instances[0] ?? jobSave.mock.contexts?.[0]) as { workflow?: Record<string, unknown> } | undefined;
    const workflow = (saved?.workflow ?? (await res.json()).workflow) as { stages: unknown[]; settings: Record<string, unknown>; customizedAt?: unknown };
    expect(workflow.stages).toHaveLength(2);
    expect(workflow.settings).toEqual({ notifyOnStageChange: true, shortlistTarget: 15 });
    expect(workflow.customizedAt).toBeTruthy();
  });
});
