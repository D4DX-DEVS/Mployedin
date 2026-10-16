/**
 * Owner, 2026-10-15: the admin exhibition analytics needs each super agent
 * with their agents' performance. foldTeamPerformance does the grouping.
 */
jest.mock("@/models/ExhibitionRequest", () => ({}));
jest.mock("@/models/Agent", () => ({}));
jest.mock("@/models/SuperAgent", () => ({}));
jest.mock("@/models/User", () => ({}));

import { foldTeamPerformance, type StatsRow } from "@/lib/exhibitions/teamPerformance";

const row = (agentId: string, currency: string, over: Partial<StatsRow> = {}): StatsRow => ({
  agentId, currency, requests: 1, inReview: 0, approved: 1, rejected: 0, completed: 0,
  expectedLeads: 0, leadsCollected: 0, eventsReported: 0, approvedBudget: 0, actualSpend: 0, ...over,
});

const people = new Map([
  ["sa1", { name: "Sara Super" }], ["sa2", { name: "Omar Super" }],
  ["a1", { name: "Ali" }], ["a2", { name: "Bina" }], ["a3", { name: "Cyrus" }], ["a4", { name: "Dana" }],
]);
const superAgents = [
  { profileId: "p-sa1", userId: "sa1", agentProfileUserIds: [] },
  { profileId: "p-sa2", userId: "sa2", agentProfileUserIds: ["a3"] },
];
const agents = [
  { userId: "a1", superAgentProfileId: "p-sa1" },
  { userId: "a2", superAgentProfileId: "p-sa1" },
  { userId: "a3", superAgentProfileId: null },
  { userId: "a4", superAgentProfileId: null },
];

describe("foldTeamPerformance", () => {
  const teams = foldTeamPerformance(
    [
      row("a1", "INR", { requests: 3, approved: 2, rejected: 1, completed: 1, expectedLeads: 40, leadsCollected: 45, eventsReported: 1, approvedBudget: 3000, actualSpend: 2800 }),
      row("a1", "AED", { approvedBudget: 900 }),
      row("a3", "AED", { requests: 2, approved: 0, inReview: 2 }),
    ],
    agents,
    superAgents,
    people,
  );
  const sara = teams.find((t) => t.superAgentId === "sa1")!;

  it("puts each agent under their super agent, falling back to the team list", () => {
    expect(sara.agents.map((a) => a.name)).toEqual(["Ali", "Bina"]);
    expect(teams.find((t) => t.superAgentId === "sa2")!.agents.map((a) => a.name)).toEqual(["Cyrus"]);
    expect(teams.at(-1)).toMatchObject({ superAgentId: null, agentCount: 1 });
    expect(teams.at(-1)!.agents[0].name).toBe("Dana");
  });

  it("sums the team and keeps money per currency", () => {
    expect(sara).toMatchObject({ requests: 4, approved: 3, rejected: 1, completed: 1, leadsCollected: 45, expectedLeads: 40, agentCount: 2, activeAgents: 1 });
    expect(sara.approvedBudget).toEqual({ INR: 3000, AED: 900 });
    expect(sara.actualSpend).toEqual({ INR: 2800 });
    expect(sara.approvalRate).toBe(75);
  });

  it("shows idle agents with zeros instead of leaving them out", () => {
    const bina = sara.agents.find((a) => a.name === "Bina")!;
    expect(bina).toMatchObject({ requests: 0, approvalRate: 0, approvedBudget: {} });
  });

  it("orders teams by requests and keeps agents without a super agent last", () => {
    expect(teams.map((t) => t.superAgentId)).toEqual(["sa1", "sa2", null]);
  });

  it("still counts requests from someone no longer listed as an agent", () => {
    const withGhost = foldTeamPerformance([row("gone", "AED")], [], [], new Map());
    expect(withGhost).toHaveLength(1);
    expect(withGhost[0]).toMatchObject({ superAgentId: null, requests: 1 });
  });
});
