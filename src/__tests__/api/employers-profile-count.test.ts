/**
 * @jest-environment node
 */
/**
 * F-09 (audit 2026-11-26): GET /api/employers (admin) used to drop employer
 * Users with no Employer profile only AFTER paging and counting, so the
 * total read 180 for 170 rows and pages came back short. The User query,
 * the page slice and the count must all be limited to accounts that have a
 * profile.
 */
import { NextRequest } from "next/server";

jest.mock("@/lib/db/mongoose", () => ({ connectDB: jest.fn().mockResolvedValue(undefined) }));
jest.mock("@/lib/auth/withAuth", () => ({
  withAuth: (handler: Function) => async (req: NextRequest) =>
    handler(req, (req as unknown as { __ctx: unknown }).__ctx, {}),
}));
jest.mock("@/lib/audit/log", () => ({ actorFromCtx: jest.fn(), logActivity: jest.fn() }));
jest.mock("@/lib/communications/email", () => ({ sendEmail: jest.fn(), EmailTemplates: {} }));
jest.mock("@/lib/auth/agentRestrictions", () => ({ getSuperAgentScope: jest.fn() }));
jest.mock("@/lib/agents/employerAssignment", () => ({
  unassignedEmployerFilter: jest.fn(),
  resolveEmployerAgents: jest.fn(async () => new Map()),
}));

function chain(result: unknown) {
  const node: Record<string, unknown> = {};
  for (const m of ["select", "sort", "skip", "limit", "populate"]) node[m] = jest.fn(() => node);
  node.lean = jest.fn(async () => result);
  return node;
}

const userFind = jest.fn();
const userCount = jest.fn();
const employerFind = jest.fn();
const employerFindOne = jest.fn();

jest.mock("@/models/User", () => ({
  __esModule: true,
  default: { find: (...a: unknown[]) => userFind(...a), countDocuments: (...a: unknown[]) => userCount(...a) },
}));
jest.mock("@/models/Employer", () => ({
  __esModule: true,
  default: { find: (...a: unknown[]) => employerFind(...a), findOne: (...a: unknown[]) => employerFindOne(...a) },
}));
jest.mock("@/models/Agent", () => ({ __esModule: true, default: { distinct: jest.fn(), findById: jest.fn() } }));
jest.mock("@/models/CompanyUser", () => ({ CompanyUser: {}, getDefaultPermissions: jest.fn() }));

import { GET } from "@/app/api/employers/route";

const PROFILES = [
  { _id: "e1", userId: "u1", companyName: "Acme" },
  { _id: "e2", userId: "u2", companyName: "Beta" },
];
const PROFILE_ONLY = { $in: ["u1", "u2"] };

function get(qs: string, ctx: Record<string, unknown> = { userId: "admin", role: "admin", locale: "en" }) {
  const req = new NextRequest(`http://localhost/api/employers?${qs}`);
  (req as unknown as { __ctx: unknown }).__ctx = ctx;
  return (GET as unknown as (r: NextRequest) => Promise<Response>)(req);
}

function hasProfileConstraint(q: Record<string, unknown>): boolean {
  const and = (q.$and as Record<string, unknown>[] | undefined) ?? [];
  return and.some((c) => JSON.stringify(c) === JSON.stringify({ _id: PROFILE_ONLY }));
}

beforeEach(() => {
  jest.clearAllMocks();
  employerFind.mockImplementation(() => chain(PROFILES));
  userFind.mockReturnValue(chain([{ _id: "u1", name: "A" }, { _id: "u2", name: "B" }]));
  userCount.mockResolvedValue(2);
});

describe("GET /api/employers — profileless employer accounts (F-09)", () => {
  it("limits both the page query and the count query to users with a profile", async () => {
    const body = await (await get("status=all&page=1&limit=20")).json();
    expect(hasProfileConstraint(userFind.mock.calls[0][0])).toBe(true);
    expect(hasProfileConstraint(userCount.mock.calls[0][0])).toBe(true);
    expect(body.pagination.total).toBe(2);
    expect(body.employers).toHaveLength(2);
  });

  it("keeps the search $or and the status filter alongside the profile constraint", async () => {
    await get("status=inactive&search=acme");
    const q = userFind.mock.calls[0][0];
    expect(q.isActive).toBe(false);
    expect(Array.isArray(q.$or)).toBe(true);
    expect(hasProfileConstraint(q)).toBe(true);
    expect(hasProfileConstraint(userCount.mock.calls[0][0])).toBe(true);
  });

  it("composes with an employer-filter _id pin rather than replacing it", async () => {
    await get("industry=IT&status=all");
    const q = userFind.mock.calls[0][0];
    expect(q._id).toEqual({ $in: ["u1", "u2"] });
    expect(hasProfileConstraint(q)).toBe(true);
  });

  it("profile sort counts from the profile list, not the User collection", async () => {
    const body = await (await get("sortBy=companyName&status=all&limit=1")).json();
    expect(body.pagination.total).toBe(2);
    expect(body.pagination.pages).toBe(2);
    expect(userCount).not.toHaveBeenCalled();
  });

  it("profile sort only orders profiles of real employer accounts, even with status=all", async () => {
    await get("sortBy=companyName&status=all");
    expect(userFind.mock.calls[0][0]).toMatchObject({ role: "employer" });
    const profileQuery = employerFind.mock.calls.find((c) => c[0] && "userId" in c[0])?.[0];
    expect(profileQuery.userId).toEqual({ $in: ["u1", "u2"] });
  });

  it("breaks name ties by _id so skip() pages never repeat or skip a row", async () => {
    const node = chain([]);
    userFind.mockReturnValue(node);
    await get("status=all&sortBy=name");
    expect(node.sort).toHaveBeenCalledWith({ name: 1, _id: 1 });
  });

  it("does not add the constraint for an employer viewing its own account", async () => {
    employerFindOne.mockReturnValue(chain({ userId: "u_self" }));
    await get("", { userId: "u_self", role: "employer", locale: "en" });
    const q = userFind.mock.calls[0][0];
    expect(q._id).toBe("u_self");
    expect(q.$and).toBeUndefined();
  });
});
