/**
 * @jest-environment node
 */
/**
 * GET /api/cron/target-risk-check — kpi3 targets: the weakest pillar behind
 * pace is named, the agent's super agent is told, and nobody is told twice in
 * a week. Profit targets are not run through the kpi3 check. Mocks only.
 */
import { NextRequest } from "next/server";

jest.mock("@/lib/db/mongoose", () => ({ connectDB: jest.fn().mockResolvedValue(undefined) }));
jest.mock("@/lib/security/cron-auth", () => ({ verifyCronRequest: () => null }));

const AGENT_USER = "64b000000000000000000001";
const SA_USER = "64b000000000000000000002";
let profiles: Record<string, unknown>[] = [];
let alreadyTold = false;

const chain = (v: unknown) => {
  const c: Record<string, unknown> = {};
  c.sort = () => c; c.limit = () => c; c.select = () => c;
  c.lean = async () => v;
  return c;
};
let served = false;
jest.mock("@/models/TargetProfile", () => ({
  __esModule: true,
  PROFIT_TARGET_FILTER: {},
  default: { find: jest.fn(() => { const v = served ? [] : profiles; served = true; return chain(v); }) },
}));
jest.mock("@/models/Notification", () => ({ __esModule: true, default: { findOne: jest.fn(() => chain(alreadyTold ? { _id: "n" } : null)) } }));
jest.mock("@/models/User", () => ({ __esModule: true, default: { find: jest.fn(() => chain([{ _id: AGENT_USER, name: "Asha" }])) } }));
jest.mock("@/models/Agent", () => ({ __esModule: true, default: { find: jest.fn(() => chain([{ userId: AGENT_USER, superAgentId: "sa1" }])) } }));
jest.mock("@/models/SuperAgent", () => ({ __esModule: true, default: { find: jest.fn(() => chain([{ _id: "sa1", userId: SA_USER }])) } }));
const enrichProfiles = jest.fn(async () => []);
jest.mock("@/lib/targets/profileAchievementCalculator", () => ({ enrichProfiles: (...a: unknown[]) => enrichProfiles(...(a as [])) }));
jest.mock("@/lib/targets/kpiCalculator", () => ({
  kpiOwnerKey: (role: string, id: string) => `${role}:${id}`,
  calculateKpis: jest.fn(async () => new Map([[`agent:${AGENT_USER}`, { totals: { jobs: 1, onboarded: 0, revenue: 0 } }]])),
}));
const notifyKpiTargetAtRisk = jest.fn();
const notifyTeamKpiTargetAtRisk = jest.fn();
jest.mock("@/lib/notifications/trigger", () => ({
  notifyKpiTargetAtRisk: (...a: unknown[]) => notifyKpiTargetAtRisk(...a),
  notifyTeamKpiTargetAtRisk: (...a: unknown[]) => notifyTeamKpiTargetAtRisk(...a),
  notifyTargetAtRisk: jest.fn(),
  notifyTeamTargetAtRisk: jest.fn(),
  notifyTargetMilestone: jest.fn(),
}));

import { GET } from "@/app/api/cron/target-risk-check/route";

const run = () => GET(new NextRequest("http://localhost/api/cron/target-risk-check"));

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers({ now: new Date(Date.UTC(2026, 6, 2)), doNotFake: ["nextTick", "setImmediate"] });
  served = false;
  alreadyTold = false;
  profiles = [{ _id: "p1", targetType: "kpi3", assigneeId: AGENT_USER, assigneeRole: "agent", jobTarget: 100, conversionTarget: 10 }];
});
afterEach(() => jest.useRealTimers());

it("alerts the agent and their super agent about the weakest pillar", async () => {
  const json = await (await run()).json();
  expect(json.atRiskAlerted).toBe(1);
  expect(notifyKpiTargetAtRisk).toHaveBeenCalledWith(AGENT_USER, "agent", "p1", "onboarded", 0, 50);
  expect(notifyTeamKpiTargetAtRisk).toHaveBeenCalledWith(SA_USER, "Asha", "p1", "onboarded", 0, 50);
  expect(enrichProfiles).not.toHaveBeenCalled();
});

it("does not repeat an alert sent this week", async () => {
  alreadyTold = true;
  await run();
  expect(notifyKpiTargetAtRisk).not.toHaveBeenCalled();
  expect(notifyTeamKpiTargetAtRisk).not.toHaveBeenCalled();
});

it("keeps profit targets on the profit check", async () => {
  profiles = [{ _id: "p2", targetType: "profit", assigneeId: AGENT_USER, assigneeRole: "agent" }];
  await run();
  expect(enrichProfiles).toHaveBeenCalledTimes(1);
  expect(notifyKpiTargetAtRisk).not.toHaveBeenCalled();
});
