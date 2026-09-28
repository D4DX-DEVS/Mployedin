import { toAgentOptions, toSuperAgentOptions } from "@/components/features/invoices/teamFilterOptions";

describe("invoice team filter options", () => {
  it("keeps every agent when some belong to no super agent", () => {
    // /api/admin/agents sends superAgentId: null for an unassigned agent, and
    // typeof null === "object" — reading ._id off it used to throw, which the
    // caller swallowed, leaving both pickers empty ("0 SA · 0 agents").
    const agents = toAgentOptions({
      agents: [
        { _id: "u1", name: "Assigned", agentProfile: { _id: "a1", superAgentId: "sa1", assignedStateIds: [{ name: "Kerala" }] } },
        { _id: "u2", name: "Unassigned", agentProfile: { _id: "a2", superAgentId: null } },
        { _id: "u3", email: "no-profile@x.co" },
        { _id: "u4", name: "Populated", agentProfile: { _id: "a4", superAgentId: { _id: "sa2" } } },
      ],
    });

    expect(agents).toEqual([
      { _id: "a1", name: "Assigned", superAgentId: "sa1", regions: ["Kerala"] },
      { _id: "a2", name: "Unassigned", superAgentId: undefined, regions: [] },
      { _id: "u3", name: "no-profile@x.co", superAgentId: undefined, regions: [] },
      { _id: "a4", name: "Populated", superAgentId: "sa2", regions: [] },
    ]);
  });

  it("maps super agents to their profile id, regions and team size", () => {
    const superAgents = toSuperAgentOptions({
      superAgents: [
        {
          _id: "u1",
          name: "Priya",
          superAgentProfile: { _id: "sa1", assignedStateIds: [{ name: "Kerala" }], assignedCityIds: [{ name: "Kochi" }, null], agentCount: 3 },
        },
        { _id: "u2", email: "no-profile@x.co", superAgentProfile: null },
      ],
    });

    expect(superAgents).toEqual([
      { _id: "sa1", name: "Priya", regions: ["Kerala", "Kochi"], agentCount: 3 },
      { _id: "u2", name: "no-profile@x.co", regions: [], agentCount: 0 },
    ]);
  });

  it("returns empty lists for a failed or malformed response", () => {
    expect(toAgentOptions(null)).toEqual([]);
    expect(toSuperAgentOptions({ superAgents: "nope" })).toEqual([]);
  });
});
