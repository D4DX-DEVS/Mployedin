/**
 * @jest-environment node
 *
 * The agent dashboard lists the accounts assigned to the agent, each with
 * its numbers (client feedback 2026-10-12): the "Active Accounts" figure
 * used to count every employer in the agent's region.
 */
jest.mock("@/lib/db/mongoose", () => ({ connectDB: jest.fn().mockResolvedValue(undefined) }));

const employerFind = jest.fn();
const userFind = jest.fn();
const jobAggregate = jest.fn();
const applicationAggregate = jest.fn();
const interviewAggregate = jest.fn();
const placementAggregate = jest.fn();

function chain(result: unknown) {
  const node: Record<string, jest.Mock> = {};
  for (const m of ["select", "sort", "limit", "populate"]) node[m] = jest.fn(() => node);
  node.lean = jest.fn(async () => result);
  return node;
}

jest.mock("@/models/Employer", () => ({ __esModule: true, default: { find: (...a: unknown[]) => employerFind(...a) } }));
jest.mock("@/models/User", () => ({ __esModule: true, default: { find: (...a: unknown[]) => userFind(...a) } }));
jest.mock("@/models/Job", () => ({ __esModule: true, default: { aggregate: (...a: unknown[]) => jobAggregate(...a) } }));
jest.mock("@/models/Application", () => ({ __esModule: true, default: { aggregate: (...a: unknown[]) => applicationAggregate(...a) } }));
jest.mock("@/models/Interview", () => ({ __esModule: true, default: { aggregate: (...a: unknown[]) => interviewAggregate(...a) } }));
jest.mock("@/models/Placement", () => ({ __esModule: true, default: { aggregate: (...a: unknown[]) => placementAggregate(...a) } }));

import mongoose from "mongoose";
import { countAccountActivity, loadAssignedAccounts } from "@/lib/agents/assignedAccounts";

const id = () => new mongoose.Types.ObjectId();
const NOW = new Date("2026-10-12T10:00:00Z");

const busy = { _id: id(), companyName: "Busy Co", userId: id() };
const quiet = { _id: id(), companyName: "Quiet Co", userId: id() };
const closed = { _id: id(), companyName: "Closed Co", userId: id() };

beforeEach(() => {
  jest.clearAllMocks();
  employerFind.mockReturnValue(chain([quiet, busy, closed]));
  // Closed Co's login is deactivated: still assigned, flagged inactive.
  userFind.mockReturnValue(chain([{ _id: busy.userId }, { _id: quiet.userId }]));
  jobAggregate.mockResolvedValue([{ _id: busy._id, count: 4 }, { _id: quiet._id, count: 1 }]);
  applicationAggregate.mockResolvedValue([{ _id: busy._id, count: 3 }]);
  interviewAggregate.mockResolvedValue([{ _id: busy._id, count: 2 }]);
  placementAggregate.mockResolvedValue([{ _id: quiet._id, count: 1 }]);
});

it("lists the assigned accounts with their numbers, busiest first", async () => {
  const result = await loadAssignedAccounts([busy._id, quiet._id, closed._id], NOW);

  // The same set as the "Assigned to me" list the tile opens: a deactivated
  // login is still an assigned account, flagged rather than hidden.
  expect(result.total).toBe(3);
  // The dashboard's "Active employers" tile: active logins only.
  expect(result.active).toBe(2);
  expect(result.rows).toEqual([
    { employerId: String(busy._id), companyName: "Busy Co", isActive: true, openJobs: 4, newApplicants: 3, upcomingInterviews: 2, hires: 0 },
    { employerId: String(quiet._id), companyName: "Quiet Co", isActive: true, openJobs: 1, newApplicants: 0, upcomingInterviews: 0, hires: 1 },
    { employerId: String(closed._id), companyName: "Closed Co", isActive: false, openJobs: 0, newApplicants: 0, upcomingInterviews: 0, hires: 0 },
  ]);
});

it("reads only the assigned ids, skips archived profiles and counts on the right windows", async () => {
  await loadAssignedAccounts([busy._id, quiet._id, closed._id], NOW);

  expect(employerFind).toHaveBeenCalledWith({ _id: { $in: [busy._id, quiet._id, closed._id] }, roleArchivedAt: null });
  expect(userFind).toHaveBeenCalledWith({ _id: { $in: [quiet.userId, busy.userId, closed.userId] }, isActive: true });

  const activeIds = [quiet._id, busy._id, closed._id];
  const firstMatch = (mock: jest.Mock) => (mock.mock.calls[0][0] as { $match: Record<string, unknown> }[])[0].$match;
  expect(firstMatch(jobAggregate)).toEqual({ employerId: { $in: activeIds }, status: "active", deletedAt: null });
  expect(firstMatch(applicationAggregate)).toEqual({
    employerId: { $in: activeIds },
    createdAt: { $gte: new Date("2026-10-05T10:00:00Z") },
  });
  expect(firstMatch(interviewAggregate)).toEqual({
    employerId: { $in: activeIds },
    scheduledAt: { $gte: NOW },
    status: { $in: ["scheduled", "confirmed"] },
  });
  expect(firstMatch(placementAggregate)).toEqual({ employerId: { $in: activeIds } });
});

it("caps the rows but keeps the full count", async () => {
  const result = await loadAssignedAccounts([busy._id, quiet._id, closed._id], NOW, 1);
  expect(result.total).toBe(3);
  expect(result.rows.map((r) => r.companyName)).toEqual(["Busy Co"]);
});

it("does no reads for an agent with nothing assigned", async () => {
  await expect(loadAssignedAccounts([], NOW)).resolves.toEqual({ total: 0, active: 0, rows: [] });
  expect(employerFind).not.toHaveBeenCalled();
});

it("counts any page of accounts in four grouped reads", async () => {
  const counts = await countAccountActivity([busy._id, quiet._id], NOW);

  expect(counts.get(String(busy._id))).toEqual({ openJobs: 4, newApplicants: 3, upcomingInterviews: 2, hires: 0 });
  expect(counts.get(String(quiet._id))).toEqual({ openJobs: 1, newApplicants: 0, upcomingInterviews: 0, hires: 1 });
  for (const mock of [jobAggregate, applicationAggregate, interviewAggregate, placementAggregate]) {
    expect(mock).toHaveBeenCalledTimes(1);
  }
  await expect(countAccountActivity([], NOW)).resolves.toEqual(new Map());
});
