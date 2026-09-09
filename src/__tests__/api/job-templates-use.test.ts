/**
 * @jest-environment node
 */
/**
 * POST /api/employers/job-templates/[id]/use creates a *draft* from a
 * template. Templates are often saved without a description or a city, and
 * the Job model requires both — `Job.create()` validated on insert and the
 * route answered 500 for any such template (the picker and the library page
 * both dead-ended). Drafts skip validation, as the POST and PATCH job
 * handlers already do; validation runs when the job leaves draft.
 */
import { NextRequest } from "next/server";

const EMPLOYER_USER = "64b000000000000000000001";
const EMPLOYER_ID = "64b000000000000000000002";
const TEMPLATE_ID = "64b000000000000000000003";
const NEW_JOB_ID = "64b000000000000000000004";

jest.mock("@/lib/db/mongoose", () => ({ connectDB: jest.fn().mockResolvedValue(undefined) }));
jest.mock("@/lib/audit/log", () => ({
  actorFromCtx: jest.fn((ctx) => ({ actorId: ctx.userId, actorRole: ctx.role })),
  logActivity: jest.fn().mockResolvedValue(undefined),
}));
jest.mock("@/lib/auth/withAuth", () => ({
  withAuth: (handler: (req: NextRequest, ctx: unknown, params?: Record<string, string>) => Promise<Response>) =>
    (req: NextRequest, context: { params: Promise<Record<string, string>> }) =>
      context.params.then((params) => handler(req, { userId: EMPLOYER_USER, role: "employer", locale: "en" }, params)),
}));

const mockSave = jest.fn().mockResolvedValue(undefined);
const mockJobCtor = jest.fn();
jest.mock("@/models/Job", () => ({
  __esModule: true,
  default: jest.fn().mockImplementation((doc: Record<string, unknown>) => {
    mockJobCtor(doc);
    return { ...doc, _id: NEW_JOB_ID, save: mockSave };
  }),
}));
jest.mock("@/models/Employer", () => ({
  __esModule: true,
  Employer: {
    findOne: jest.fn().mockReturnValue({
      select: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue({ _id: EMPLOYER_ID }) }),
    }),
  },
}));
const mockTemplateUpdateOne = jest.fn().mockResolvedValue({ modifiedCount: 1 });
jest.mock("@/models/JobTemplate", () => ({
  __esModule: true,
  JobTemplate: {
    findById: jest.fn().mockReturnValue({
      lean: jest.fn().mockResolvedValue({
        _id: TEMPLATE_ID,
        employerId: EMPLOYER_ID,
        name: "Bare template",
        title: "QA Engineer",
        // No description, no location: exactly the shape that used to 500.
        requirements: { skills: ["Playwright"] },
      }),
    }),
    updateOne: (...args: unknown[]) => mockTemplateUpdateOne(...args),
  },
}));

describe("POST /api/employers/job-templates/[id]/use", () => {
  it("creates an unvalidated draft from an incomplete template and counts the use", async () => {
    const { POST } = await import("@/app/api/employers/job-templates/[id]/use/route");
    const req = new NextRequest(`http://localhost:3000/api/employers/job-templates/${TEMPLATE_ID}/use`, { method: "POST" });
    const res = await POST(req, { params: Promise.resolve({ id: TEMPLATE_ID }) });

    expect(res.status).toBe(201);
    await expect(res.json()).resolves.toEqual({ job: { _id: NEW_JOB_ID } });
    expect(mockJobCtor).toHaveBeenCalledWith(expect.objectContaining({ title: "QA Engineer", description: "", status: "draft", employerId: EMPLOYER_ID }));
    expect(mockSave).toHaveBeenCalledWith({ validateBeforeSave: false });
    expect(mockTemplateUpdateOne).toHaveBeenCalledWith({ _id: TEMPLATE_ID }, { $inc: { usageCount: 1 } });
  });
});
