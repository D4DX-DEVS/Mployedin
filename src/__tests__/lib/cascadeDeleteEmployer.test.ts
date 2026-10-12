/**
 * @jest-environment node
 *
 * Permanently deleting an employer removed jobs, applications, interviews,
 * offers and placements, but left everything else the company owned. Live on
 * 2026-10-12 the deleted QA company's career page was still served publicly
 * and its talent pool stayed (audit FUNC-015); API keys, background checks,
 * diversity answers and feedback were left the same way. Invoices are kept:
 * they are the accounting record.
 */
const EMP_USER = "650000000000000000000801";
const EMP_ID = "650000000000000000000802";

const mockCalls: Array<{ model: string; op: string; query: unknown }> = [];
const mockModel = (model: string) => {
  const record = (op: string) => jest.fn(async (query: unknown) => {
    mockCalls.push({ model, op, query });
    return { deletedCount: 1, modifiedCount: 1 };
  });
  return {
    deleteMany: record("deleteMany"),
    updateMany: record("updateMany"),
    find: jest.fn(() => ({ select: () => ({ lean: async () => [] }) })),
    findOne: jest.fn(() => ({ select: () => ({ lean: async () => ({ _id: EMP_ID }) }) })),
  };
};

jest.mock("@/lib/db/mongoose", () => ({ connectDB: jest.fn().mockResolvedValue(undefined) }));
jest.mock("@/lib/logger", () => ({ __esModule: true, default: { error: jest.fn(), warn: jest.fn(), info: jest.fn() } }));
// Already covered before the fix.
jest.mock("@/models/Employer", () => ({ __esModule: true, default: mockModel("Employer") }));
jest.mock("@/models/JobSeeker", () => ({ __esModule: true, default: mockModel("JobSeeker") }));
jest.mock("@/models/Agent", () => ({ __esModule: true, default: mockModel("Agent") }));
jest.mock("@/models/SuperAgent", () => ({ __esModule: true, default: mockModel("SuperAgent") }));
jest.mock("@/models/Application", () => ({ __esModule: true, default: mockModel("Application") }));
jest.mock("@/models/Interview", () => ({ __esModule: true, default: mockModel("Interview") }));
jest.mock("@/models/Offer", () => ({ __esModule: true, default: mockModel("Offer") }));
jest.mock("@/models/OfferLetter", () => ({ __esModule: true, default: mockModel("OfferLetter") }));
jest.mock("@/models/Placement", () => ({ __esModule: true, default: mockModel("Placement") }));
jest.mock("@/models/Commission", () => ({ __esModule: true, default: mockModel("Commission") }));
jest.mock("@/models/Lead", () => ({ __esModule: true, default: mockModel("Lead") }));
jest.mock("@/models/Job", () => ({ __esModule: true, default: mockModel("Job") }));
jest.mock("@/models/JobTemplate", () => ({ __esModule: true, default: mockModel("JobTemplate") }));
jest.mock("@/models/Notification", () => ({ __esModule: true, default: mockModel("Notification") }));
jest.mock("@/models/Invoice", () => ({ __esModule: true, default: mockModel("Invoice") }));
// Left behind before the fix.
jest.mock("@/models/ApiKey", () => ({ __esModule: true, default: mockModel("ApiKey") }));
jest.mock("@/models/ApplicationFeedback", () => ({ __esModule: true, ApplicationFeedback: mockModel("ApplicationFeedback") }));
jest.mock("@/models/ApplicationForm", () => ({ __esModule: true, default: mockModel("ApplicationForm") }));
jest.mock("@/models/ApprovalWorkflow", () => ({ __esModule: true, default: mockModel("ApprovalWorkflow") }));
jest.mock("@/models/BackgroundCheck", () => ({ __esModule: true, BackgroundCheck: mockModel("BackgroundCheck") }));
jest.mock("@/models/CandidateSurvey", () => ({ __esModule: true, SurveyTemplate: mockModel("SurveyTemplate"), SurveyResponse: mockModel("SurveyResponse") }));
jest.mock("@/models/CareerPage", () => ({ __esModule: true, default: mockModel("CareerPage") }));
jest.mock("@/models/CommTemplate", () => ({ __esModule: true, CommTemplate: mockModel("CommTemplate") }));
jest.mock("@/models/CompanyProfileView", () => ({ __esModule: true, CompanyProfileView: mockModel("CompanyProfileView") }));
jest.mock("@/models/CompanyReview", () => ({ __esModule: true, CompanyReview: mockModel("CompanyReview") }));
jest.mock("@/models/DiversityResponse", () => ({ __esModule: true, default: mockModel("DiversityResponse") }));
jest.mock("@/models/EmailSequence", () => ({ __esModule: true, default: mockModel("EmailSequence") }));
jest.mock("@/models/EmployeeReferral", () => ({ __esModule: true, default: mockModel("EmployeeReferral") }));
jest.mock("@/models/ExtractionDraft", () => ({ __esModule: true, ExtractionDraft: mockModel("ExtractionDraft") }));
jest.mock("@/models/HiringDecision", () => ({ __esModule: true, HiringDecision: mockModel("HiringDecision") }));
jest.mock("@/models/MatchingWeightTemplate", () => ({ __esModule: true, MatchingWeightTemplate: mockModel("MatchingWeightTemplate") }));
jest.mock("@/models/OnboardingChecklist", () => ({ __esModule: true, OnboardingChecklist: mockModel("OnboardingChecklist") }));
jest.mock("@/models/PosterGeneration", () => ({ __esModule: true, default: mockModel("PosterGeneration") }));
jest.mock("@/models/ReferralLink", () => ({ __esModule: true, ReferralLink: mockModel("ReferralLink") }));
jest.mock("@/models/Requisition", () => ({ __esModule: true, default: mockModel("Requisition") }));
jest.mock("@/models/Scorecard", () => ({ __esModule: true, Scorecard: mockModel("Scorecard") }));
jest.mock("@/models/SkillAssessment", () => ({ __esModule: true, SkillAssessment: mockModel("SkillAssessment") }));
jest.mock("@/models/TalentPool", () => ({ __esModule: true, default: mockModel("TalentPool") }));
jest.mock("@/models/TenantViewSession", () => ({ __esModule: true, default: mockModel("TenantViewSession") }));
jest.mock("@/models/WorkflowTemplate", () => ({ __esModule: true, WorkflowTemplate: mockModel("WorkflowTemplate") }));

const deletedByEmployer = () =>
  mockCalls
    .filter((c) => c.op === "deleteMany" && String((c.query as { employerId?: unknown })?.employerId) === EMP_ID)
    .map((c) => c.model);

beforeEach(() => { mockCalls.length = 0; });

describe("cascadeDeleteEmployer", () => {
  it("removes everything the company owned, keyed by its profile id", async () => {
    const { cascadeDeleteEmployer } = await import("@/lib/db/cascade");
    await cascadeDeleteEmployer(EMP_USER);

    expect(deletedByEmployer().sort()).toEqual([
      "ApiKey", "ApplicationFeedback", "ApplicationForm", "Application", "ApprovalWorkflow", "BackgroundCheck",
      "CareerPage", "CommTemplate", "CompanyProfileView", "CompanyReview", "DiversityResponse", "EmailSequence",
      "EmployeeReferral", "ExtractionDraft", "HiringDecision", "Interview", "JobTemplate", "Job",
      "MatchingWeightTemplate", "OfferLetter", "Offer", "OnboardingChecklist", "Placement", "PosterGeneration",
      "ReferralLink", "Requisition", "Scorecard", "SkillAssessment", "SurveyResponse", "SurveyTemplate",
      "TalentPool", "TenantViewSession", "WorkflowTemplate",
    ].sort());
  });

  it("removes the employer's own notifications and keeps invoices", async () => {
    const { cascadeDeleteEmployer } = await import("@/lib/db/cascade");
    await cascadeDeleteEmployer(EMP_USER);

    expect(mockCalls).toContainEqual({ model: "Notification", op: "deleteMany", query: { userId: EMP_USER } });
    expect(mockCalls.some((c) => c.model === "Invoice")).toBe(false);
  });
});
