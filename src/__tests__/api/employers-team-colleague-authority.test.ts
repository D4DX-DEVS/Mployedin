/**
 * @jest-environment node
 *
 * Team management must judge a colleague on their OWN membership, never on the
 * owner's (audit 2026-09-24, SEC-04). withAuth swaps ctx.userId to the company
 * owner for a colleague, and these handlers used to look the caller up by it —
 * so any colleague holding the team function acted as the owner: promote to
 * admin, invite admins, remove admins.
 */
import { NextRequest } from "next/server";

const OWNER = "aaaaaaaaaaaaaaaaaaaaaaaa";
const COLLEAGUE = "bbbbbbbbbbbbbbbbbbbbbbbb";
const COMPANY = "cccccccccccccccccccccccc";
const VIEWER_ROW = "dddddddddddddddddddddddd";
const ADMIN_ROW = "eeeeeeeeeeeeeeeeeeeeeeee";
const SELF_ROW = "ffffffffffffffffffffffff";

let currentCtx: Record<string, unknown> = {};
jest.mock("@/lib/auth/withAuth", () => ({
  withAuth:
    (h: (req: NextRequest, ctx: unknown, params?: Record<string, string>) => Promise<Response>) =>
    async (req: NextRequest, rc?: { params?: Promise<Record<string, string>> }) =>
      h(req, currentCtx, rc?.params ? await rc.params : undefined),
}));
jest.mock("@/lib/subscription/withSubscription", () => ({
  withSubscription: (h: unknown) => h,
}));
jest.mock("@/lib/db/mongoose", () => ({ connectDB: jest.fn().mockResolvedValue(undefined) }));
jest.mock("@/lib/audit/log", () => ({ logActivity: jest.fn(), actorFromCtx: jest.fn(() => ({})) }));
jest.mock("@/lib/notifications/trigger", () => ({ notify: jest.fn() }));
jest.mock("@/lib/communications/email", () => ({ sendEmail: jest.fn() }));
jest.mock("@/models/User", () => ({ User: { findOne: jest.fn(), find: jest.fn() } }));
jest.mock("@/models/Employer", () => ({
  Employer: {
    findOne: () => ({
      select: () => ({ lean: () => Promise.resolve({ _id: COMPANY, companyEmail: "o@co.test", companyName: "Co" }) }),
    }),
  },
}));

const ownerRow = { companyRole: "owner", companyRoles: ["owner"] };
jest.mock("@/lib/employers/company-membership", () => ({
  ensureEmployerOwnerMembership: jest.fn(async ({ userId }: { userId: string }) =>
    userId === OWNER ? ownerRow : null,
  ),
}));

/** The colleague's own live row — what the caller check must read. */
let colleagueRow: Record<string, unknown> | null = null;

function makeTarget(id: string, roles: string[], userId: string) {
  return {
    _id: id,
    userId,
    email: `${id}@co.test`,
    companyRole: roles[0],
    companyRoles: roles,
    jobAccess: [],
    status: "active",
    save: jest.fn().mockResolvedValue(undefined),
  };
}
let targets: Record<string, ReturnType<typeof makeTarget>> = {};

function q<T>(value: T) {
  const p = Promise.resolve(value);
  const chain: Record<string, unknown> = {
    select: () => chain,
    lean: () => p,
    then: (res: (v: T) => unknown, rej: (e: unknown) => unknown) => p.then(res, rej),
  };
  return chain;
}

jest.mock("@/models/CompanyUser", () => ({
  CompanyUser: {
    findOne: (filter: Record<string, unknown>) => {
      if (filter._id) return q(targets[String(filter._id)] ?? null);
      if (String(filter.userId) === COLLEAGUE) return q(colleagueRow);
      if (String(filter.userId) === OWNER) return q(ownerRow);
      return q(null);
    },
  },
  getPrimaryRole: (roles: string[]) => roles[0],
  computeEffectivePermissions: () => ({}),
}));

import { PATCH, DELETE } from "@/app/api/employers/team/[id]/route";
import { POST } from "@/app/api/employers/team/route";

const colleagueCtx = {
  userId: OWNER, // swapped by withAuth
  role: "employer",
  locale: "en",
  member: {
    actorId: COLLEAGUE,
    companyId: COMPANY,
    companyRoles: ["hiring_manager"],
    permissions: { canManageTeam: true },
    jobAccess: [],
  },
};
const ownerCtx = { userId: OWNER, role: "employer", locale: "en" };

function patch(id: string, body: unknown) {
  return PATCH(
    new NextRequest(`http://localhost/api/employers/team/${id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
      headers: { "content-type": "application/json" },
    }),
    { params: Promise.resolve({ id }) } as never,
  );
}
function del(id: string) {
  return DELETE(
    new NextRequest(`http://localhost/api/employers/team/${id}`, { method: "DELETE" }),
    { params: Promise.resolve({ id }) } as never,
  );
}

beforeEach(() => {
  targets = {
    [VIEWER_ROW]: makeTarget(VIEWER_ROW, ["viewer"], "111111111111111111111111"),
    [ADMIN_ROW]: makeTarget(ADMIN_ROW, ["admin"], "222222222222222222222222"),
    [SELF_ROW]: makeTarget(SELF_ROW, ["hiring_manager"], COLLEAGUE),
  };
  colleagueRow = {
    companyRole: "hiring_manager",
    companyRoles: ["hiring_manager"],
    permissions: { canManageTeam: true },
  };
});

describe("colleague holding the team function", () => {
  beforeEach(() => {
    currentCtx = colleagueCtx;
  });

  it("cannot promote a member to admin", async () => {
    const res = await patch(VIEWER_ROW, { companyRoles: ["admin"] });
    expect(res.status).toBe(403);
    expect(targets[VIEWER_ROW].save).not.toHaveBeenCalled();
  });

  it("can still manage a lower role (the granted function keeps working)", async () => {
    const res = await patch(VIEWER_ROW, { companyRoles: ["hiring_manager"] });
    expect(res.status).toBe(200);
    expect(targets[VIEWER_ROW].save).toHaveBeenCalled();
  });

  it("cannot change their own access", async () => {
    const res = await patch(SELF_ROW, { companyRoles: ["accounting"] });
    expect(res.status).toBe(403);
    expect(targets[SELF_ROW].save).not.toHaveBeenCalled();
  });

  it("cannot demote or deactivate an admin", async () => {
    expect((await patch(ADMIN_ROW, { companyRoles: ["viewer"] })).status).toBe(403);
    expect((await del(ADMIN_ROW)).status).toBe(403);
    expect(targets[ADMIN_ROW].save).not.toHaveBeenCalled();
  });

  it("cannot deactivate themselves", async () => {
    const res = await del(SELF_ROW);
    expect(res.status).toBe(400);
    expect(targets[SELF_ROW].save).not.toHaveBeenCalled();
  });

  it("is refused once their own row no longer grants the team function", async () => {
    colleagueRow = { companyRole: "hiring_manager", companyRoles: ["hiring_manager"], permissions: {} };
    expect((await patch(VIEWER_ROW, { companyRoles: ["viewer"] })).status).toBe(403);
    expect((await del(VIEWER_ROW)).status).toBe(403);
  });

  it("cannot invite an admin", async () => {
    const res = await POST(
      new NextRequest("http://localhost/api/employers/team", {
        method: "POST",
        body: JSON.stringify({ email: "new@co.test", companyRoles: ["admin"] }),
        headers: { "content-type": "application/json" },
      }),
      {} as never,
    );
    expect(res.status).toBe(403);
  });
});

describe("owner", () => {
  beforeEach(() => {
    currentCtx = ownerCtx;
  });

  it("can promote a member to admin", async () => {
    const res = await patch(VIEWER_ROW, { companyRoles: ["admin"] });
    expect(res.status).toBe(200);
  });

  it("can deactivate an admin", async () => {
    const res = await del(ADMIN_ROW);
    expect(res.status).toBe(200);
    expect(targets[ADMIN_ROW].status).toBe("deactivated");
  });
});
