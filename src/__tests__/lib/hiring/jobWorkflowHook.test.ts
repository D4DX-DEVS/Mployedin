/**
 * @jest-environment node
 *
 * Job workflow hook: applyJobWorkflowOnSave assigns the job its workflow
 * (template + stages). New jobs or drafts get auto-matched from rules;
 * live jobs are frozen. Manual/custom picks are locked unless rematchWorkflow=true.
 */
import { applyJobWorkflowOnSave } from "@/lib/hiring/jobWorkflow";

const EMPLOYER_ID = "64b000000000000000000101";
const TEMPLATE_ID = "64b000000000000000000201";

let mockTemplate: Record<string, unknown> | null = null;
let mockResolvedTemplate: Record<string, unknown> | null = null;
let mockResolvedReason: Record<string, unknown> = {};

jest.mock("@/lib/db/mongoose", () => ({ __esModule: true, default: jest.fn() }));
jest.mock("@/lib/logger", () => ({
  __esModule: true,
  default: {
    warn: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
  },
}));
jest.mock("@/models/WorkflowTemplate", () => ({
  __esModule: true,
  default: {
    find: jest.fn(() => ({
      select: jest.fn(() => ({ lean: async () => (mockResolvedTemplate ? [mockResolvedTemplate] : []) })),
    })),
    findOne: jest.fn(() => ({
      select: jest.fn(() => ({ lean: async () => mockTemplate })),
    })),
  },
}));
jest.mock("@/models/Employer", () => ({
  __esModule: true,
  default: {
    findById: jest.fn(() => ({ select: jest.fn(() => ({ lean: async () => ({ workflow: {} }) })) })),
  },
}));
jest.mock("@/lib/hiring/workflowTemplateMatch", () => ({
  pickWorkflowTemplate: jest.fn(() => ({ template: mockResolvedTemplate, reason: mockResolvedReason })),
  encodeResolutionReason: jest.fn((r: unknown) => (typeof r === "object" ? JSON.stringify(r) : String(r))),
}));

function createJobMock(overrides: Record<string, unknown> = {}) {
  const job: Record<string, unknown> = {
    _id: "64b000000000000000000010",
    employerId: EMPLOYER_ID,
    title: "Test Job",
    category: "IT",
    status: "draft",
    isNew: true,
    isModified: jest.fn(() => true),
    set: jest.fn(),
    $locals: {},
    workflow: null,
    ...overrides,
  };
  return job;
}

describe("applyJobWorkflowOnSave", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockTemplate = null;
    mockResolvedTemplate = null;
    mockResolvedReason = {};
  });

  it("matches a new job automatically with source=auto and a reason", async () => {
    mockResolvedTemplate = {
      _id: TEMPLATE_ID,
      name: "Standard Pipeline",
      version: 1,
      scope: "system",
      stages: [
        { id: "applied", label: "Applied", phase: "applied", order: 1 },
        { id: "hired", label: "Hired", phase: "hired", order: 2 },
      ],
    };
    mockResolvedReason = { matched: "by_default" };

    const job = createJobMock({ isNew: true, $locals: {} });
    await applyJobWorkflowOnSave(job as any);

    expect(job.set).toHaveBeenCalledWith("workflow.template", expect.objectContaining({ source: "auto", templateId: TEMPLATE_ID }));
    expect(job.set).toHaveBeenCalledWith("workflow.stages", expect.arrayContaining([expect.objectContaining({ id: "applied" })]));
  });

  it("sets manual source when workflowTemplateId is passed via $locals", async () => {
    mockTemplate = {
      _id: TEMPLATE_ID,
      name: "Custom Pipeline",
      version: 2,
      stages: [
        { id: "applied", label: "Applied", phase: "applied", order: 1 },
        { id: "hired", label: "Hired", phase: "hired", order: 2 },
      ],
    };

    const job = createJobMock({ isNew: true, $locals: { workflowTemplateId: TEMPLATE_ID } });
    await applyJobWorkflowOnSave(job as any);

    expect(job.set).toHaveBeenCalledWith("workflow.template", expect.objectContaining({ source: "manual", templateId: TEMPLATE_ID }));
  });

  it("re-matches a draft job when a match field changed", async () => {
    mockResolvedTemplate = {
      _id: TEMPLATE_ID,
      name: "Category Match",
      version: 1,
      stages: [{ id: "applied", label: "Applied", phase: "applied", order: 1 }],
    };

    const isModified = jest.fn((path: string) => path === "category");
    const job = createJobMock({
      isNew: false,
      $locals: { initialStatus: "draft" },
      isModified,
      workflow: { template: { source: "auto", appliedAt: new Date() }, stages: [] },
    });

    await applyJobWorkflowOnSave(job as any);

    expect(job.set).toHaveBeenCalled();
    expect(job.set).toHaveBeenCalledWith("workflow.template", expect.objectContaining({ source: "auto" }));
  });

  it("leaves a draft with manual source frozen unless rematchWorkflow=true", async () => {
    const job = createJobMock({
      isNew: false,
      $locals: { initialStatus: "draft" },
      workflow: { template: { source: "manual", appliedAt: new Date() }, stages: [] },
    });

    await applyJobWorkflowOnSave(job as any);

    expect(job.set).not.toHaveBeenCalled();
  });

  it("re-matches when rematchWorkflow=true overrides manual source", async () => {
    mockResolvedTemplate = {
      _id: TEMPLATE_ID,
      name: "Re-matched",
      version: 1,
      stages: [{ id: "applied", label: "Applied", phase: "applied", order: 1 }],
    };

    const job = createJobMock({
      isNew: false,
      $locals: { initialStatus: "draft", rematchWorkflow: true },
      workflow: { template: { source: "manual", appliedAt: new Date() }, stages: [] },
    });

    await applyJobWorkflowOnSave(job as any);

    expect(job.set).toHaveBeenCalledWith("workflow.template", expect.objectContaining({ source: "auto" }));
  });

  it("leaves a live (non-draft) job frozen", async () => {
    const job = createJobMock({
      isNew: false,
      $locals: { initialStatus: "published" },
      status: "live",
    });

    await applyJobWorkflowOnSave(job as any);

    expect(job.set).not.toHaveBeenCalled();
  });

  it("logs and silently continues when a requested template is not usable", async () => {
    const logger = await import("@/lib/logger");
    const job = createJobMock({ isNew: true, $locals: { workflowTemplateId: "invalid-id" } });

    // Force the search to fail
    mockResolvedTemplate = { _id: TEMPLATE_ID, name: "Fallback", version: 1, stages: [] };
    mockResolvedReason = { matched: "by_default" };

    await applyJobWorkflowOnSave(job as any);

    // Should continue and match auto instead
    expect(job.set).toHaveBeenCalledWith("workflow.template", expect.objectContaining({ source: "auto" }));
  });

  it("catches DB errors and logs them without throwing", async () => {
    const logger = await import("@/lib/logger");
    const WorkflowTemplate = await import("@/models/WorkflowTemplate");

    // Make findOne throw
    (WorkflowTemplate.default.findOne as jest.Mock).mockImplementationOnce(() => {
      throw new Error("DB connection failed");
    });

    const job = createJobMock({ isNew: true, $locals: { workflowTemplateId: TEMPLATE_ID } });

    // Should not throw
    await expect(applyJobWorkflowOnSave(job as any)).resolves.not.toThrow();
    expect(logger.default.error).toHaveBeenCalledWith(expect.any(Object), expect.stringContaining("[workflow]"));
  });

  it("does not re-match a draft when no match fields changed", async () => {
    const isModified = jest.fn(() => false);
    const job = createJobMock({
      isNew: false,
      $locals: { initialStatus: "draft" },
      isModified,
      workflow: { template: { source: "auto", appliedAt: new Date() }, stages: [] },
    });

    await applyJobWorkflowOnSave(job as any);

    expect(job.set).not.toHaveBeenCalled();
  });

  it("leaves a job with custom source frozen", async () => {
    const job = createJobMock({
      isNew: false,
      $locals: { initialStatus: "draft" },
      workflow: { template: { source: "custom", appliedAt: new Date() }, stages: [] },
    });

    await applyJobWorkflowOnSave(job as any);

    expect(job.set).not.toHaveBeenCalled();
  });
});
