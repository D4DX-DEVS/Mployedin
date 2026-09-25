/**
 * @jest-environment node
 */
/**
 * assignEmployerAgent — the admin's "change this employer's agent".
 *
 * The employer↔agent link is stored on both ends (Employer.agentId and
 * Agent.assignedEmployerIds); a move must rewrite both, move the OPEN jobs to
 * the new agent, and leave closed work (and so earned commission) alone.
 */
import { assignEmployerAgent, OPEN_JOB_STATUSES } from "@/lib/agents/employerAssignment";

const EMP = "64b000000000000000000001";
const OLD_AGENT = "64b0000000000000000000a1";
const NEW_AGENT = "64b0000000000000000000a2";
const NEW_AGENT_USER = "64b0000000000000000000b2";

function lean(result: unknown) {
  const node: Record<string, unknown> = {};
  node.select = jest.fn(() => node);
  node.lean = jest.fn(async () => result);
  return node;
}

const employerFindById = jest.fn();
const employerUpdateOne = jest.fn().mockResolvedValue({});
const agentFindById = jest.fn();
const agentFind = jest.fn();
const agentUpdateMany = jest.fn().mockResolvedValue({});
const agentUpdateOne = jest.fn().mockResolvedValue({});
const userFindById = jest.fn();
const jobUpdateMany = jest.fn().mockResolvedValue({ modifiedCount: 2 });

jest.mock("@/models/Employer", () => ({
  __esModule: true,
  Employer: {
    findById: (...a: unknown[]) => employerFindById(...a),
    updateOne: (...a: unknown[]) => employerUpdateOne(...a),
  },
}));
jest.mock("@/models/Agent", () => ({
  __esModule: true,
  default: {
    findById: (...a: unknown[]) => agentFindById(...a),
    find: (...a: unknown[]) => agentFind(...a),
    updateMany: (...a: unknown[]) => agentUpdateMany(...a),
    updateOne: (...a: unknown[]) => agentUpdateOne(...a),
  },
}));
jest.mock("@/models/User", () => ({ __esModule: true, default: { findById: (...a: unknown[]) => userFindById(...a) } }));
jest.mock("@/models/Job", () => ({ __esModule: true, default: { updateMany: (...a: unknown[]) => jobUpdateMany(...a) } }));
jest.mock("@/models/SuperAgent", () => ({ __esModule: true, default: {} }));

beforeEach(() => {
  jest.clearAllMocks();
  employerFindById.mockReturnValue(lean({ _id: EMP, agentId: OLD_AGENT }));
  agentFindById.mockReturnValue(lean({ userId: NEW_AGENT_USER, roleArchivedAt: null }));
  userFindById.mockReturnValue(lean({ role: "agent", isActive: true }));
  agentFind.mockReturnValue(lean([{ _id: OLD_AGENT }]));
});

describe("assignEmployerAgent", () => {
  it("moves an employer from one agent to another on both ends of the link, with its open jobs", async () => {
    const result = await assignEmployerAgent(EMP, NEW_AGENT);

    expect(result).toEqual({ ok: true, changed: true, previousAgentIds: [OLD_AGENT], agentId: NEW_AGENT, movedOpenJobs: 2 });
    // Leaves every other agent's list…
    expect(agentUpdateMany).toHaveBeenCalledWith(
      { assignedEmployerIds: EMP, _id: { $ne: NEW_AGENT } },
      { $pull: { assignedEmployerIds: EMP } },
    );
    // …joins the new agent's list…
    expect(agentUpdateOne).toHaveBeenCalledWith({ _id: NEW_AGENT }, { $addToSet: { assignedEmployerIds: EMP } });
    // …and the employer points at the new agent.
    expect(employerUpdateOne).toHaveBeenCalledWith({ _id: EMP }, { $set: { agentId: NEW_AGENT } });
    // Only open jobs follow; closed/expired stay with whoever ran them.
    expect(jobUpdateMany).toHaveBeenCalledWith(
      { employerId: EMP, status: { $in: ["draft", "active", "paused"] }, deletedAt: null },
      { $set: { agentId: NEW_AGENT } },
    );
    expect(OPEN_JOB_STATUSES).not.toContain("closed");
    expect(OPEN_JOB_STATUSES).not.toContain("expired");
  });

  it("removes the agent entirely when agentId is null", async () => {
    const result = await assignEmployerAgent(EMP, null);

    expect(result).toMatchObject({ ok: true, changed: true, agentId: null });
    expect(agentUpdateMany).toHaveBeenCalledWith({ assignedEmployerIds: EMP }, { $pull: { assignedEmployerIds: EMP } });
    expect(agentUpdateOne).not.toHaveBeenCalled();
    expect(employerUpdateOne).toHaveBeenCalledWith({ _id: EMP }, { $unset: { agentId: "" } });
    expect(jobUpdateMany).toHaveBeenCalledWith(expect.objectContaining({ employerId: EMP }), { $unset: { agentId: "" } });
  });

  it("repairs a half link: employer points at the agent but the agent's list lacks it", async () => {
    employerFindById.mockReturnValue(lean({ _id: EMP, agentId: NEW_AGENT }));
    agentFind.mockReturnValue(lean([]));

    const result = await assignEmployerAgent(EMP, NEW_AGENT);

    expect(result).toMatchObject({ ok: true, changed: true });
    expect(agentUpdateOne).toHaveBeenCalledWith({ _id: NEW_AGENT }, { $addToSet: { assignedEmployerIds: EMP } });
  });

  it("does nothing when the employer is already exactly there", async () => {
    employerFindById.mockReturnValue(lean({ _id: EMP, agentId: NEW_AGENT }));
    agentFind.mockReturnValue(lean([{ _id: NEW_AGENT }]));

    expect(await assignEmployerAgent(EMP, NEW_AGENT)).toMatchObject({ ok: true, changed: false, movedOpenJobs: 0 });
    expect(employerUpdateOne).not.toHaveBeenCalled();
    expect(jobUpdateMany).not.toHaveBeenCalled();
  });

  it("refuses an archived agent, an inactive agent account, and bad ids — writing nothing", async () => {
    agentFindById.mockReturnValue(lean({ userId: NEW_AGENT_USER, roleArchivedAt: new Date() }));
    expect(await assignEmployerAgent(EMP, NEW_AGENT)).toEqual({ ok: false, status: 404, error: "Agent not found" });

    agentFindById.mockReturnValue(lean({ userId: NEW_AGENT_USER, roleArchivedAt: null }));
    userFindById.mockReturnValue(lean({ role: "agent", isActive: false }));
    expect(await assignEmployerAgent(EMP, NEW_AGENT)).toMatchObject({ ok: false, status: 400 });

    userFindById.mockReturnValue(lean({ role: "employer", isActive: true }));
    expect(await assignEmployerAgent(EMP, NEW_AGENT)).toMatchObject({ ok: false, status: 400 });

    expect(await assignEmployerAgent("nope", NEW_AGENT)).toMatchObject({ ok: false, status: 400 });
    expect(await assignEmployerAgent(EMP, "nope")).toMatchObject({ ok: false, status: 400 });

    employerFindById.mockReturnValue(lean(null));
    expect(await assignEmployerAgent(EMP, NEW_AGENT)).toEqual({ ok: false, status: 404, error: "Employer not found" });

    expect(agentUpdateMany).not.toHaveBeenCalled();
    expect(employerUpdateOne).not.toHaveBeenCalled();
    expect(jobUpdateMany).not.toHaveBeenCalled();
  });
});
