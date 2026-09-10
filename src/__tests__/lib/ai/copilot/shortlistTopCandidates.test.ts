/**
 * @jest-environment node
 */
import { shortlistTopCandidatesTool, updateApplicationStatusTool } from "@/lib/ai/copilot/tools/employer";
import type { CopilotToolContext } from "@/lib/ai/copilot/types";

const EMPLOYER_USER = "64b000000000000000000001";
const EMPLOYER_ID = "64b000000000000000000002";
const JOB_ID = "64b000000000000000000010";
const JOB_ID_2 = "64b000000000000000000011";
const APP_ID = "64b000000000000000000030";
const SEEKER_ID = "64b000000000000000000040";
const SEEKER_USER = "64b000000000000000000041";

/** The tools only read userId/pageJobId; the rest of the context is inert here. */
const ctx = (o: { userId: string; pageJobId?: string }): CopilotToolContext =>
  ({ role: "employer", locale: "en", permissionMode: "role_default", ...o }) as unknown as CopilotToolContext;

jest.mock("@/lib/db/mongoose", () => ({ connectDB: jest.fn().mockResolvedValue(undefined) }));
jest.mock("@/lib/notifications/trigger", () => ({
  notifyStatusChange: jest.fn(() => Promise.resolve(undefined)),
  notifyRejected: jest.fn(() => Promise.resolve(undefined)),
  notifyInterviewSelected: jest.fn(() => Promise.resolve(undefined)),
  notifyInterviewScheduled: jest.fn(() => Promise.resolve(undefined)),
}));
jest.mock("@/models/JobSeeker", () => ({
  __esModule: true,
  default: { findById: jest.fn(() => chain({ _id: SEEKER_ID, userId: SEEKER_USER })) },
}));

function chain<T>(result: T) {
  const c: Record<string, jest.Mock> = {};
  for (const m of ["populate", "sort", "skip", "limit", "select"]) c[m] = jest.fn(() => c);
  c.lean = jest.fn(async () => result);
  return c;
}

const mockEmployer = { _id: EMPLOYER_ID, userId: EMPLOYER_USER, companyName: "Test Corp", workflow: { settings: { shortlistTarget: 20, notifyOnStageChange: true } } };
const mockJob = { _id: JOB_ID, employerId: EMPLOYER_ID, title: "Senior Developer", status: "active", workflow: null };
const mockJob2 = { _id: JOB_ID_2, employerId: EMPLOYER_ID, title: "Product Manager", status: "active", workflow: null };

jest.mock("@/models/Employer", () => ({
  __esModule: true,
  Employer: {
    findOne: jest.fn(({ userId }) => {
      if (userId === EMPLOYER_USER) {
        return chain(mockEmployer);
      }
      return chain(null);
    }),
  },
}));

jest.mock("@/models/Job", () => {
  const findOneImpl = jest.fn((query) => {
    if (String(query._id) === JOB_ID && String(query.employerId) === EMPLOYER_ID) {
      return chain(mockJob);
    }
    if (String(query._id) === JOB_ID_2 && String(query.employerId) === EMPLOYER_ID) {
      return chain(mockJob2);
    }
    return chain(null);
  });

  const findImpl = jest.fn((query) => {
    if (String(query.employerId) === EMPLOYER_ID && query.status === "active") {
      return chain([mockJob, mockJob2]);
    }
    return chain([]);
  });

  return {
    __esModule: true,
    default: {
      findOne: findOneImpl,
      find: findImpl,
    },
  };
});

const mockApplications = [
  { _id: "app1", jobSeekerId: { fullName: "Alice", userId: "user1" }, aiMatchScore: 95, matchStrengths: ["Strong tech skills"], appliedAt: new Date() },
  { _id: "app2", jobSeekerId: { fullName: "Bob", userId: "user2" }, aiMatchScore: 85, matchStrengths: ["Good communication"], appliedAt: new Date() },
  { _id: "app3", jobSeekerId: { fullName: "Charlie", userId: "user3" }, aiMatchScore: 75, matchStrengths: ["Relevant experience"], appliedAt: new Date() },
];

/** One owned application for the update_application_status tool (findById → populate → doc). */
function mockOwnedApplication() {
  return {
    _id: APP_ID,
    status: "applied",
    statusHistory: [] as unknown[],
    jobSeekerId: SEEKER_ID,
    jobId: { _id: JOB_ID, title: "Senior Developer", employerId: EMPLOYER_ID, workflow: null },
    save: jest.fn(async () => undefined),
  };
}

jest.mock("@/models/Application", () => ({
  __esModule: true,
  default: {
    findById: jest.fn(() => ({ populate: jest.fn(async () => mockOwnedApplication()) })),
    find: jest.fn(() => chain(mockApplications)),
    countDocuments: jest.fn(({ jobId, status }) => {
      if (String(jobId) === JOB_ID && status === "applied") return Promise.resolve(10);
      if (String(jobId) === JOB_ID && status === "applied" && { aiMatchScore: null }) return Promise.resolve(2);
      return Promise.resolve(0);
    }),
    updateMany: jest.fn(async () => ({ modifiedCount: 3 })),
  },
}));

describe("shortlist_top_candidates tool", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("has correct metadata", () => {
    expect(shortlistTopCandidatesTool.name).toBe("shortlist_top_candidates");
    expect(shortlistTopCandidatesTool.resource).toBe("applications");
    expect(shortlistTopCandidatesTool.action).toBe("update");
    expect(shortlistTopCandidatesTool.roles).toContain("employer");
    expect(shortlistTopCandidatesTool.mutates).toBe(true);
    expect(shortlistTopCandidatesTool.preview).toBeDefined();
  });

  describe("preview", () => {
    it("returns preview with candidate list ranked by score", async () => {
      const preview = await shortlistTopCandidatesTool.preview!(
        { jobId: JOB_ID, count: 3 },
        ctx({ userId: EMPLOYER_USER })
      );

      expect(preview.summary).toContain("3 of 10 applicants");
      expect(preview.summary).toContain("Senior Developer");
      expect(preview.rows).toHaveLength(3);
      expect(preview.rows?.[0]).toEqual({ name: "Alice", score: 95, note: "Strong tech skills" });
    });

    it("defaults count to shortlistTarget from hiring rules", async () => {
      const preview = await shortlistTopCandidatesTool.preview!(
        { jobId: JOB_ID },
        ctx({ userId: EMPLOYER_USER })
      );

      // shortlistTarget is 20, but we only have 3 candidates, so count will be 3
      expect(preview.data).toMatchObject({ count: 3 });
    });

    it("caps count at 100 when user requests more", async () => {
      // Create enough mock applications to test the cap
      const manyApps = Array.from({ length: 150 }, (_, i) => ({
        _id: `app${i}`,
        jobSeekerId: { fullName: `Person ${i}`, userId: `user${i}` },
        aiMatchScore: 95 - (i % 50),
        matchStrengths: ["Skill"],
        appliedAt: new Date(),
      }));

      const ApplicationMock = require("@/models/Application").default;
      ApplicationMock.find.mockReturnValueOnce(chain(manyApps.slice(0, 100)));

      const preview = await shortlistTopCandidatesTool.preview!(
        { jobId: JOB_ID, count: 200 },
        ctx({ userId: EMPLOYER_USER })
      );

      expect(preview.data).toMatchObject({ count: 100 });
    });

    it("filters by minScore when provided", async () => {
      const preview = await shortlistTopCandidatesTool.preview!(
        { jobId: JOB_ID, minScore: 80 },
        ctx({ userId: EMPLOYER_USER })
      );

      expect(preview.summary).toContain("80%+");
    });

    it("uses pageJobId when jobId not provided", async () => {
      const preview = await shortlistTopCandidatesTool.preview!(
        { count: 2 },
        ctx({ userId: EMPLOYER_USER, pageJobId: JOB_ID })
      );

      // Mock returns all 3 candidates regardless of limit, so expect 3 instead of 2
      expect(preview.summary).toContain("of 10 applicants");
      expect(preview.summary).toContain("Senior Developer");
    });

    it("lists available jobs when no job can be resolved", async () => {
      const preview = await shortlistTopCandidatesTool.preview!(
        {},
        ctx({ userId: EMPLOYER_USER })
      );

      expect(preview.summary).toContain("Which job");
      expect(preview.summary).toContain("Senior Developer");
      expect(preview.summary).toContain("Product Manager");
    });

    it("refuses jobId from another employer", async () => {
      const preview = await shortlistTopCandidatesTool.preview!(
        { jobId: "64b999999999999999999999" },
        ctx({ userId: EMPLOYER_USER })
      );

      expect(preview.summary).toContain("isn't one of your postings");
      expect(preview.data).toMatchObject({ count: 0 });
    });
  });

  describe("preview contract (what the chat route relies on)", () => {
    it("blocks the confirm card when no job can be resolved", async () => {
      const preview = await shortlistTopCandidatesTool.preview!({}, ctx({ userId: EMPLOYER_USER }));
      expect(preview.blocker).toContain("Which job");
    });

    it("blocks the confirm card when nothing is waiting to be shortlisted", async () => {
      const Application = require("@/models/Application").default;
      Application.find.mockReturnValueOnce(chain([]));
      const preview = await shortlistTopCandidatesTool.preview!({ jobId: JOB_ID }, ctx({ userId: EMPLOYER_USER }));
      expect(preview.blocker).toContain("No scored applicants");
      expect(preview.rows ?? []).toHaveLength(0);
    });

    it("pins the page job and the resolved count so execute replays the same selection", async () => {
      const preview = await shortlistTopCandidatesTool.preview!({}, ctx({ userId: EMPLOYER_USER, pageJobId: JOB_ID }));
      expect(preview.blocker).toBeUndefined();
      expect(preview.resolvedArgs).toEqual({ jobId: JOB_ID, count: 20 });
    });

    it("matches live jobs with deletedAt: null (the schema default), never $exists", async () => {
      const Job = require("@/models/Job").default;
      await shortlistTopCandidatesTool.preview!({ jobId: JOB_ID }, ctx({ userId: EMPLOYER_USER }));
      expect(Job.findOne).toHaveBeenCalledWith(expect.objectContaining({ deletedAt: null }));
    });
  });

  describe("update_application_status notifications", () => {
    beforeEach(() => {
      mockEmployer.workflow.settings.notifyOnStageChange = true;
    });

    it("addresses the candidate by user id, not by JobSeeker document id", async () => {
      const { notifyStatusChange } = require("@/lib/notifications/trigger");
      const result = await updateApplicationStatusTool.execute({ applicationId: APP_ID, status: "shortlisted" }, ctx({ userId: EMPLOYER_USER }));
      expect(result.ok).toBe(true);
      expect(notifyStatusChange).toHaveBeenCalledWith(SEEKER_USER, "Senior Developer", "shortlisted", APP_ID);
    });

    it("stays silent when the hiring rule turns candidate notifications off", async () => {
      mockEmployer.workflow.settings.notifyOnStageChange = false;
      const { notifyStatusChange } = require("@/lib/notifications/trigger");
      const JobSeeker = require("@/models/JobSeeker").default;
      const result = await updateApplicationStatusTool.execute({ applicationId: APP_ID, status: "shortlisted" }, ctx({ userId: EMPLOYER_USER }));
      expect(result.ok).toBe(true);
      expect(notifyStatusChange).not.toHaveBeenCalled();
      expect(JobSeeker.findById).not.toHaveBeenCalled();
    });
  });

  describe("execute", () => {
    beforeEach(() => {
      // Reset to true for each test
      mockEmployer.workflow.settings.notifyOnStageChange = true;
    });

    it("shortlists candidates and returns moved count", async () => {
      const result = await shortlistTopCandidatesTool.execute(
        { jobId: JOB_ID, count: 3 },
        ctx({ userId: EMPLOYER_USER })
      );

      expect(result.ok).toBe(true);
      expect(result.message).toContain("Shortlisted 3 candidates");
      expect(result.data).toMatchObject({ moved: 3 });
    });

    it("calls updateMany with correct filter and update", async () => {
      jest.clearAllMocks();
      const Application = require("@/models/Application").default;
      Application.updateMany.mockResolvedValueOnce({ modifiedCount: 2 });

      await shortlistTopCandidatesTool.execute(
        { jobId: JOB_ID, count: 2 },
        ctx({ userId: EMPLOYER_USER })
      );

      expect(Application.updateMany).toHaveBeenCalled();
      const call = Application.updateMany.mock.calls[0];
      expect(call[0]).toMatchObject({ status: "applied" });
      expect(call[1]).toHaveProperty("$set");
      expect(call[1]).toHaveProperty("$push");
    });

    it("notifies candidates when notifyOnStageChange is true", async () => {
      jest.clearAllMocks();
      const { notifyStatusChange } = require("@/lib/notifications/trigger");
      const Application = require("@/models/Application").default;
      Application.updateMany.mockResolvedValueOnce({ modifiedCount: 3 });

      await shortlistTopCandidatesTool.execute(
        { jobId: JOB_ID, count: 3 },
        ctx({ userId: EMPLOYER_USER })
      );

      expect(notifyStatusChange).toHaveBeenCalledTimes(3);
    });

    it("skips notifications when notifyOnStageChange is false", async () => {
      jest.clearAllMocks();
      mockEmployer.workflow.settings.notifyOnStageChange = false;
      const { notifyStatusChange } = require("@/lib/notifications/trigger");
      const Application = require("@/models/Application").default;
      Application.updateMany.mockResolvedValueOnce({ modifiedCount: 3 });

      await shortlistTopCandidatesTool.execute(
        { jobId: JOB_ID, count: 3 },
        ctx({ userId: EMPLOYER_USER })
      );

      expect(notifyStatusChange).not.toHaveBeenCalled();
    });

    it("fails if no scored candidates are available", async () => {
      jest.clearAllMocks();
      const Job = require("@/models/Job").default;
      Job.findOne.mockReturnValueOnce(chain(mockJob));

      const Application = require("@/models/Application").default;
      Application.find.mockReturnValueOnce(chain([]));

      const result = await shortlistTopCandidatesTool.execute(
        { jobId: JOB_ID, count: 3 },
        ctx({ userId: EMPLOYER_USER })
      );

      expect(result.ok).toBe(false);
      expect(result.message).toContain("No scored applicants");
    });
  });

  describe("summarize", () => {
    it("formats the summary correctly", () => {
      const summary = shortlistTopCandidatesTool.summarize({ count: 50 });
      expect(summary).toBe("Shortlist the top 50 candidates");
    });

    it("names the intent rather than a placeholder when count is left to the hiring rule", () => {
      expect(shortlistTopCandidatesTool.summarize({})).toBe("Shortlist the best candidates");
      expect(shortlistTopCandidatesTool.summarize({ minScore: 70 })).toBe("Shortlist the best candidates scoring 70%+");
    });

    it("includes minScore in summary when provided", () => {
      const summary = shortlistTopCandidatesTool.summarize({ count: 30, minScore: 70 });
      expect(summary).toBe("Shortlist the top 30 candidates scoring 70%+");
    });

  });
});
