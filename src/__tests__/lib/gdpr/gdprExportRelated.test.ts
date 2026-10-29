/**
 * @jest-environment node
 */
/** The rest of a person's data export: messages, CVs, checks, evaluations, views and sent mail. */

type Call = { model: string; filter: unknown; select?: string };
const calls: Call[] = [];

function model(name: string, rows: unknown[] = [{ row: name }]) {
  return {
    __esModule: true,
    default: {
      find: (filter: unknown) => {
        const call: Call = { model: name, filter };
        calls.push(call);
        const chain = {
          select: (s: string) => { call.select = s; return chain; },
          sort: () => chain,
          lean: () => Promise.resolve(rows),
        };
        return chain;
      },
    },
  };
}

jest.mock("@/models/Conversation", () => model("Conversation", [{ _id: "conv_1" }]));
jest.mock("@/models/DirectMessage", () => model("DirectMessage"));
jest.mock("@/models/Message", () => model("Message"));
jest.mock("@/models/CvDocument", () => model("CvDocument"));
jest.mock("@/models/Offer", () => model("Offer"));
jest.mock("@/models/BackgroundCheck", () => model("BackgroundCheck"));
jest.mock("@/models/DiversityResponse", () => model("DiversityResponse"));
jest.mock("@/models/Scorecard", () => model("Scorecard"));
jest.mock("@/models/ProfileView", () => model("ProfileView"));
jest.mock("@/models/EmailLog", () => model("EmailLog"));
jest.mock("@/models/WhatsAppMessageLog", () => model("WhatsAppMessageLog"));

import { exportRelatedRecords } from "@/lib/gdpr/exportRelated";

const find = (name: string) => calls.find((c) => c.model === name);

describe("exportRelatedRecords", () => {
  beforeEach(() => { calls.length = 0; });

  it("includes every kind of record held about a job seeker", async () => {
    const out = await exportRelatedRecords("user_1", "seeker_1", ["app_1"]);
    expect(Object.keys(out).sort()).toEqual([
      "backgroundChecks", "conversations", "cvDocuments", "directMessages", "diversityResponses",
      "emails", "offers", "profileViews", "scorecards", "teamMessages", "whatsappMessages",
    ]);
    expect(find("DirectMessage")?.filter).toEqual({ conversationId: { $in: ["conv_1"] } });
    expect(find("DiversityResponse")?.filter).toEqual({ applicationId: { $in: ["app_1"] } });
    // ProfileView.jobSeekerId is the USER id.
    expect(find("ProfileView")?.filter).toEqual({ jobSeekerId: "user_1" });
  });

  it("leaves out other people's details", async () => {
    await exportRelatedRecords("user_1", "seeker_1", []);
    expect(find("BackgroundCheck")?.select).toBe("-references.email -references.phone");
    expect(find("Scorecard")?.select).toBe("-evaluatedBy");
    expect(find("ProfileView")?.select).not.toContain("viewerId");
  });

  it("skips the job-seeker collections for an account without a seeker profile", async () => {
    await exportRelatedRecords("user_1", undefined, []);
    for (const name of ["CvDocument", "Offer", "BackgroundCheck", "Scorecard", "DiversityResponse"]) {
      expect(find(name)).toBeUndefined();
    }
    expect(find("EmailLog")).toBeDefined();
  });
});
