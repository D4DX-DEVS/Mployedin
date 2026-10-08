/**
 * @jest-environment node
 *
 * AP-1: a hire becomes exactly one Placement, derived from the application,
 * its job and the accepted offer.
 */

function chain<T>(value: T) {
  const q: Record<string, jest.Mock> = {};
  for (const k of ["select", "populate", "sort", "session"]) q[k] = jest.fn(() => q);
  q.lean = jest.fn().mockResolvedValue(value);
  (q as unknown as { then: unknown }).then = (res: (v: T) => unknown, rej?: (e: unknown) => unknown) =>
    Promise.resolve(value).then(res, rej);
  return q;
}

const Placement = { findOne: jest.fn(), create: jest.fn() };
jest.mock("@/models/Placement", () => ({ __esModule: true, default: Placement, Placement }));
const Application = { findById: jest.fn() };
jest.mock("@/models/Application", () => ({ __esModule: true, default: Application }));
const Job = { findById: jest.fn() };
jest.mock("@/models/Job", () => ({ __esModule: true, default: Job }));
const Offer = { findOne: jest.fn() };
jest.mock("@/models/Offer", () => ({ __esModule: true, default: Offer }));
const Agent = { findById: jest.fn() };
jest.mock("@/models/Agent", () => ({ __esModule: true, default: Agent }));
const Employer = { findById: jest.fn() };
jest.mock("@/models/Employer", () => ({ __esModule: true, Employer }));
const JobSeeker = { findById: jest.fn() };
jest.mock("@/models/JobSeeker", () => ({ __esModule: true, default: JobSeeker }));
const User = { findById: jest.fn() };
jest.mock("@/models/User", () => ({ __esModule: true, default: User }));
jest.mock("@/lib/logger", () => ({ __esModule: true, default: { error: jest.fn(), warn: jest.fn() } }));

const incrementAgentCounter = jest.fn();
jest.mock("@/lib/agentPerformance", () => ({ incrementAgentCounter: (...a: unknown[]) => incrementAgentCounter(...a) }));
const notifyAdminsPlacement = jest.fn().mockResolvedValue(undefined);
const notifySuperAgentPlacement = jest.fn().mockResolvedValue(undefined);
jest.mock("@/lib/notifications/trigger", () => ({
  getSuperAgentUserId: jest.fn().mockResolvedValue("sa_user"),
  notifyAdminsPlacement: (...a: unknown[]) => notifyAdminsPlacement(...a),
  notifySuperAgentPlacement: (...a: unknown[]) => notifySuperAgentPlacement(...a),
}));

// Imported after the mocks above are initialised (a static import is hoisted).
let createPlacementForHire: typeof import("@/lib/hiring/createPlacementForHire").createPlacementForHire;
let announcePlacement: typeof import("@/lib/hiring/createPlacementForHire").announcePlacement;
beforeAll(async () => {
  ({ createPlacementForHire, announcePlacement } = await import("@/lib/hiring/createPlacementForHire"));
});

const APP_ID = "64b000000000000000000a01";

beforeEach(() => {
  jest.clearAllMocks();
  Application.findById.mockReturnValue(
    chain({ _id: APP_ID, jobId: "job_1", jobSeekerId: "seeker_1", employerId: "emp_1" }),
  );
  Job.findById.mockReturnValue(chain({ employerId: "emp_1", agentId: "agent_1", title: "QA" }));
  Agent.findById.mockReturnValue(chain({ superAgentId: "sa_1" }));
  Offer.findOne.mockReturnValue(chain(null));
  Employer.findById.mockReturnValue(chain({ companyName: "Acme" }));
  JobSeeker.findById.mockReturnValue(chain({ userId: "user_seeker" }));
  User.findById.mockReturnValue(chain({ name: "Sara" }));
});

describe("createPlacementForHire", () => {
  it("returns the existing placement instead of creating a second one", async () => {
    const existing = { _id: "pl_existing" };
    Placement.findOne.mockReturnValue(chain(existing));
    const result = await createPlacementForHire(APP_ID);
    expect(result).toEqual({ placement: existing, created: false });
    expect(Placement.create).not.toHaveBeenCalled();
  });

  it("creates an active placement derived from the application, job and offer", async () => {
    Placement.findOne.mockReturnValue(chain(null));
    Placement.create.mockImplementation(async (docs: unknown[]) => docs.map((d) => ({ _id: "pl_new", ...(d as object) })));
    const startDate = new Date("2026-11-01T00:00:00Z");
    const result = await createPlacementForHire(APP_ID, {
      offer: { salary: { amount: 12000, currency: "AED", period: "monthly" }, startDate },
    });
    expect(result?.created).toBe(true);
    const [[docs]] = Placement.create.mock.calls;
    expect(docs[0]).toEqual(
      expect.objectContaining({
        applicationId: APP_ID,
        jobId: "job_1",
        jobSeekerId: "seeker_1",
        employerId: "emp_1",
        agentId: "agent_1",
        superAgentId: "sa_1",
        status: "active",
        startDate,
        salary: 12000,
        currency: "AED",
        commissionPaid: false,
      }),
    );
  });

  it("defaults the start date to now when there is no offer", async () => {
    Placement.findOne.mockReturnValue(chain(null));
    Placement.create.mockImplementation(async (docs: unknown[]) => docs);
    const before = Date.now();
    await createPlacementForHire(APP_ID);
    const [[docs]] = Placement.create.mock.calls;
    expect((docs[0].startDate as Date).getTime()).toBeGreaterThanOrEqual(before);
    expect(docs[0].salary).toBeUndefined();
  });

  it("resolves a concurrent duplicate to the winning placement", async () => {
    const winner = { _id: "pl_winner" };
    Placement.findOne.mockReturnValueOnce(chain(null)).mockReturnValueOnce(winner);
    Placement.create.mockRejectedValue(Object.assign(new Error("E11000"), { code: 11000 }));
    const result = await createPlacementForHire(APP_ID);
    expect(result).toEqual({ placement: winner, created: false });
  });

  it("returns null when the application is gone", async () => {
    Placement.findOne.mockReturnValue(chain(null));
    Application.findById.mockReturnValue(chain(null));
    expect(await createPlacementForHire(APP_ID)).toBeNull();
  });
});

describe("announcePlacement (AP-14)", () => {
  it("names the candidate through JobSeeker.userId, not the JobSeeker id", async () => {
    await announcePlacement({
      _id: "pl_1",
      agentId: "agent_1",
      jobSeekerId: "seeker_1",
      jobId: "job_1",
      employerId: "emp_1",
    } as never);
    expect(User.findById).toHaveBeenCalledWith("user_seeker");
    expect(incrementAgentCounter).toHaveBeenCalledWith("agent_1", "placementsCompleted");
    expect(notifyAdminsPlacement).toHaveBeenCalledWith("Sara", "QA", "Acme", "pl_1");
    expect(notifySuperAgentPlacement).toHaveBeenCalledWith("sa_user", "Sara", "QA", "Acme", "pl_1", "en");
  });
});
