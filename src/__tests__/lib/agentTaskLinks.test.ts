/**
 * @jest-environment node
 */
export {};

/**
 * A task may link only records the agent could open anyway: an employer they
 * work with, a job of one of those employers (or one they posted), and a
 * candidate they may view or who applied to one of those jobs.
 */

const AGENT_USER = "650000000000000000000001";
const AGENT_DOC = "650000000000000000000002";
const EMP_A = "650000000000000000000011";
const EMP_B = "650000000000000000000012";
const JOB_A = "650000000000000000000021";
const JOB_B = "650000000000000000000022";
const SEEKER = "650000000000000000000031";

const agentCanSeeEmployer = jest.fn();
const canStaffAccessSeeker = jest.fn();
jest.mock("@/lib/auth/agentRestrictions", () => ({
  agentCanSeeEmployer: (...a: unknown[]) => agentCanSeeEmployer(...a),
  getAgentEmployerIds: async () => [EMP_A],
  getAgentSeekerArea: async () => ({ assignedCityIds: [], assignedStateIds: [] }),
}));
jest.mock("@/lib/jobSeeker/staffAccess", () => ({
  canStaffAccessSeeker: (...a: unknown[]) => canStaffAccessSeeker(...a),
}));

const lean = <T,>(v: T) => ({ select: () => ({ lean: async () => v }), lean: async () => v });
const jobFindOne = jest.fn();
const appExists = jest.fn();
const seekerFindById = jest.fn();
// Job.find(...) is chained (.select/.populate/.sort/.limit) before .lean().
let jobRows: unknown[] = [];
const chain = () => {
  const c: Record<string, unknown> = {};
  for (const m of ["select", "populate", "sort", "limit"]) c[m] = () => c;
  c.lean = async () => jobRows;
  return c;
};
jest.mock("@/models/Agent", () => ({ __esModule: true, default: { findOne: () => lean({ _id: AGENT_DOC }) } }));
jest.mock("@/models/Job", () => ({
  __esModule: true,
  default: {
    findOne: (q: Record<string, unknown>) => ({ select: () => ({ lean: async () => jobFindOne(q) }) }),
    find: () => chain(),
  },
}));
jest.mock("@/models/Application", () => ({ __esModule: true, default: { exists: (q: unknown) => appExists(q) } }));
jest.mock("@/models/JobSeeker", () => ({
  __esModule: true,
  default: { findById: (id: string) => ({ select: () => ({ lean: async () => seekerFindById(id) }) }) },
}));
jest.mock("@/models/Employer", () => ({ __esModule: true, default: { exists: async () => ({ _id: EMP_A }) } }));
jest.mock("@/models/User", () => ({ __esModule: true, default: {} }));

const agent = { userId: AGENT_USER, role: "agent" };

async function validate(input: Record<string, string>) {
  const { validateTaskLinks } = await import("@/lib/agentTasks/links");
  return validateTaskLinks(agent, input);
}
async function rejection(input: Record<string, string>) {
  try {
    await validate(input);
  } catch (err) {
    return err as { status: number; message: string };
  }
  throw new Error("expected a rejection");
}

beforeEach(() => {
  jest.clearAllMocks();
  jobFindOne.mockResolvedValue({ employerId: EMP_A });
  agentCanSeeEmployer.mockResolvedValue(true);
  canStaffAccessSeeker.mockResolvedValue(false);
  appExists.mockResolvedValue(null);
  seekerFindById.mockResolvedValue({ _id: SEEKER });
  jobRows = [{ _id: JOB_A }];
});

describe("validateTaskLinks", () => {
  it("stores nothing when nothing is picked", async () => {
    expect(await validate({})).toBeUndefined();
  });

  it("looks the job up inside the agent's job scope and fills in its employer", async () => {
    const links = await validate({ jobId: JOB_A });
    expect(String(links?.jobId)).toBe(JOB_A);
    expect(String(links?.employerId)).toBe(EMP_A);
    const q = jobFindOne.mock.calls[0][0];
    expect(q._id).toBe(JOB_A);
    expect(q.deletedAt).toBeNull();
    expect(JSON.stringify(q.$or)).toContain(AGENT_DOC);
  });

  it("refuses a job outside the agent's scope", async () => {
    jobFindOne.mockResolvedValue(null);
    expect((await rejection({ jobId: JOB_A })).status).toBe(403);
  });

  it("refuses a job paired with a different employer", async () => {
    expect((await rejection({ jobId: JOB_A, employerId: EMP_B })).status).toBe(400);
  });

  it("refuses an employer the agent doesn't work with", async () => {
    agentCanSeeEmployer.mockResolvedValue(false);
    expect((await rejection({ employerId: EMP_B })).status).toBe(403);
    expect(agentCanSeeEmployer).toHaveBeenCalledWith(AGENT_USER, EMP_B);
  });

  it("accepts a candidate the agent may view", async () => {
    canStaffAccessSeeker.mockResolvedValue(true);
    const links = await validate({ candidateId: SEEKER });
    expect(String(links?.candidateId)).toBe(SEEKER);
    expect(canStaffAccessSeeker).toHaveBeenCalledWith({ _id: SEEKER }, agent, "view");
  });

  it("accepts a candidate outside the area who applied to the linked job", async () => {
    appExists.mockResolvedValueOnce({ _id: "app" });
    const links = await validate({ candidateId: SEEKER, jobId: JOB_A });
    expect(String(links?.candidateId)).toBe(SEEKER);
    expect(appExists).toHaveBeenCalledWith({ jobSeekerId: SEEKER, jobId: JOB_A });
  });

  it("refuses a candidate the agent can't view who never applied to their jobs", async () => {
    expect((await rejection({ candidateId: SEEKER })).status).toBe(403);
    expect(appExists).toHaveBeenCalledWith({ jobSeekerId: SEEKER, jobId: { $in: [JOB_A] } });
  });

  it("refuses a candidate that no longer exists", async () => {
    seekerFindById.mockResolvedValue(null);
    expect((await rejection({ candidateId: SEEKER })).status).toBe(400);
  });
});

describe("searchTaskLinkOptions (jobs)", () => {
  it("names a job that isn't live, so a draft and its live copy read apart", async () => {
    const employer = { _id: EMP_A, companyName: "Beta Industries" };
    jobRows = [
      { _id: JOB_A, title: "QA tester", status: "draft", createdAt: new Date("2026-09-08T13:23:00Z"), location: { city: "kochi" }, employerId: employer },
      { _id: JOB_B, title: "QA tester", status: "active", createdAt: new Date("2026-09-08T07:21:00Z"), location: { city: "kochi" }, employerId: employer },
    ];
    const { searchTaskLinkOptions } = await import("@/lib/agentTasks/links");
    const options = await searchTaskLinkOptions(agent, "job", "QA", {});
    expect(options.map((o) => o.status)).toEqual(["draft", undefined]);
    expect(options[0].employerId).toBe(EMP_A);
  });
});
