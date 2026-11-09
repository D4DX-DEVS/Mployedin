/**
 * @jest-environment node
 */
const assigned = jest.fn().mockResolvedValue(undefined);
const unassigned = jest.fn().mockResolvedValue(undefined);
const region = jest.fn().mockResolvedValue(undefined);
const outside = jest.fn().mockResolvedValue(undefined);
jest.mock("@/lib/notifications/trigger", () => ({
  notifyAgentEmployerAssigned: (...a: unknown[]) => assigned(...a),
  notifyAgentEmployerUnassigned: (...a: unknown[]) => unassigned(...a),
  notifyRegionEmployerRegistered: (...a: unknown[]) => region(...a),
  notifyAdminsEmployerOutsideTerritory: (...a: unknown[]) => outside(...a),
}));
const findRegionCoverage = jest.fn();
jest.mock("@/lib/agents/territoryCoverage", () => ({ findRegionCoverage: (...a: unknown[]) => findRegionCoverage(...a) }));
const agentFind = jest.fn();
jest.mock("@/models/Agent", () => ({
  __esModule: true,
  default: { find: (...a: unknown[]) => ({ select: () => ({ lean: () => Promise.resolve(agentFind(...a)) }) }) },
}));

import { notifyEmployerAgentChange, notifyEmployerRegion } from "@/lib/notifications/employerCoverage";

const DUBAI = { cityId: "c1", stateId: "s1", cityName: "Dubai", countryCode: "AE" };

beforeEach(() => {
  jest.clearAllMocks();
  agentFind.mockReturnValue([
    { _id: "a-new", userId: "u-new" },
    { _id: "a-old", userId: "u-old" },
  ]);
});

describe("notifyEmployerAgentChange", () => {
  it("tells the new agent who assigned it, and the old agent it has gone", async () => {
    await notifyEmployerAgentChange({ employerId: "e1", companyName: "Acme", newAgentId: "a-new", previousAgentIds: ["a-old"], assignedBy: "super_agent" });
    expect(assigned).toHaveBeenCalledWith("u-new", "Acme", "e1", "super_agent");
    expect(unassigned).toHaveBeenCalledWith("u-old", "Acme", "e1");
  });

  it("does not tell an agent who already had the employer that it is new", async () => {
    await notifyEmployerAgentChange({ employerId: "e1", companyName: "Acme", newAgentId: "a-new", previousAgentIds: ["a-new", "a-old"], assignedBy: "admin" });
    expect(assigned).not.toHaveBeenCalled();
    expect(unassigned).toHaveBeenCalledTimes(1);
  });

  it("removing the agent only tells the agent it was taken from", async () => {
    await notifyEmployerAgentChange({ employerId: "e1", companyName: "Acme", newAgentId: null, previousAgentIds: ["a-old"], assignedBy: "admin" });
    expect(assigned).not.toHaveBeenCalled();
    expect(unassigned).toHaveBeenCalledWith("u-old", "Acme", "e1");
  });
});

describe("notifyEmployerRegion", () => {
  it("tells every covering member except the skipped ones, with the event", async () => {
    findRegionCoverage.mockResolvedValue({ superAgents: [{ userId: "sa1" }], agents: [{ userId: "ag1" }, { userId: "creator" }] });
    await notifyEmployerRegion({ employerId: "e1", companyName: "Acme", region: DUBAI, event: "added", skipUserIds: ["creator"] });
    expect(region).toHaveBeenCalledWith("sa1", "super_agent", "Acme", "Dubai", "e1", "added");
    expect(region).toHaveBeenCalledWith("ag1", "agent", "Acme", "Dubai", "e1", "added");
    expect(region).not.toHaveBeenCalledWith("creator", expect.anything(), expect.anything(), expect.anything(), expect.anything(), expect.anything());
    expect(outside).not.toHaveBeenCalled();
  });

  it("tells admins when nobody covers a new employer, but not for an admin's own move", async () => {
    findRegionCoverage.mockResolvedValue({ superAgents: [], agents: [] });
    await notifyEmployerRegion({ employerId: "e1", companyName: "Acme", region: DUBAI, event: "registered" });
    expect(outside).toHaveBeenCalledWith("Acme", "e1", "Dubai, AE");

    outside.mockClear();
    await notifyEmployerRegion({ employerId: "e1", companyName: "Acme", region: DUBAI, event: "moved" });
    expect(outside).not.toHaveBeenCalled();
  });
});
