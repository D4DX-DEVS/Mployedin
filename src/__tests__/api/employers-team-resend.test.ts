/**
 * @jest-environment node
 *
 * Resending, cancelling and accepting team invites (2026-10-13).
 *
 * Invites expire after 48 hours, but the team page kept showing them as
 * "Pending" and the invite form refused the address as "already a member", so
 * an expired invite could never be replaced. The resend route sends a fresh
 * link for pending, expired and cancelled rows.
 *
 * An invite also reached an account that runs its own company (sent before
 * the 09-30 "already in use" guard). Accepting it marked the membership active,
 * but that account's own company always loads at sign-in, so nothing changed.
 * Resend and accept now both refuse such an account.
 */
import { NextRequest } from "next/server";

const OWNER = "aaaaaaaaaaaaaaaaaaaaaaaa";
const COMPANY = "cccccccccccccccccccccccc";
const ROW = "bbbbbbbbbbbbbbbbbbbbbbbb";
const INVITEE = "dddddddddddddddddddddddd";

jest.mock("@/lib/auth/withAuth", () => ({
  withAuth:
    (h: (req: NextRequest, ctx: unknown, params?: unknown) => Promise<Response>) =>
    async (req: NextRequest, routeCtx?: { params?: Promise<Record<string, string>> }) =>
      h(req, { userId: mockCaller.userId, role: "employer", locale: "en" }, await routeCtx?.params),
}));
jest.mock("@/lib/subscription/withSubscription", () => ({ withSubscription: (h: unknown) => h }));
jest.mock("@/lib/db/mongoose", () => ({ connectDB: jest.fn().mockResolvedValue(undefined) }));
jest.mock("@/lib/audit/log", () => ({ logActivity: jest.fn(), actorFromCtx: jest.fn(() => ({})) }));
jest.mock("@/lib/notifications/trigger", () => ({ notify: jest.fn() }));
jest.mock("@/lib/communications/email", () => ({ sendEmail: jest.fn().mockResolvedValue(undefined) }));
jest.mock("@/lib/security/rateLimit", () => ({
  checkRateLimit: jest.fn().mockResolvedValue({ allowed: true }),
  RATE_LIMIT_CONFIGS: { auth: {} },
}));
jest.mock("@/lib/employers/company-membership", () => ({
  ensureEmployerOwnerMembership: jest.fn(async () => ({ companyRole: "owner", companyRoles: ["owner"] })),
}));

const mockCaller = { userId: OWNER };
const mockCompanyOwners = new Set<string>();
jest.mock("@/models/Employer", () => ({
  Employer: {
    exists: (filter: { userId?: unknown }) =>
      Promise.resolve(mockCompanyOwners.has(String(filter.userId)) ? { _id: "x" } : null),
    findOne: () => mockQuery({ _id: COMPANY, companyEmail: "o@co.test", companyName: "Acme" }),
    findById: () => mockQuery({ companyName: "Acme" }),
  },
}));

function mockQuery<T>(value: T) {
  const p = Promise.resolve(value);
  const chain: Record<string, unknown> = {
    select: () => chain,
    lean: () => p,
    then: (res: (v: T) => unknown, rej: (e: unknown) => unknown) => p.then(res, rej),
  };
  return chain;
}

let mockAccount: { _id: string; email?: string } | null = null;
jest.mock("@/models/User", () => ({
  User: {
    findOne: () => mockQuery(mockAccount),
    findById: () => mockQuery(mockAccount),
  },
}));

let mockRow: Record<string, unknown> | null = null;
jest.mock("@/models/CompanyUser", () => ({
  CompanyUser: {
    findOne: () => mockQuery(mockRow),
    countDocuments: () => Promise.resolve(1),
  },
}));

import { POST as resend } from "@/app/api/employers/team/[id]/resend/route";
import { POST as accept } from "@/app/api/employers/team/accept/route";
import { isInviteExpired } from "@/lib/employers/teamInvite";
import { sendEmail } from "@/lib/communications/email";
import { notify } from "@/lib/notifications/trigger";

const callResend = () =>
  resend(
    new NextRequest(`http://localhost/api/employers/team/${ROW}/resend`, { method: "POST" }),
    { params: Promise.resolve({ id: ROW }) } as never,
  );

const save = jest.fn().mockResolvedValue(undefined);
const row = (extra: Record<string, unknown>) => ({
  _id: ROW,
  companyId: COMPANY,
  email: "late@co.test",
  companyRole: "viewer",
  companyRoles: ["viewer"],
  save,
  ...extra,
});

beforeEach(() => {
  jest.clearAllMocks();
  mockCaller.userId = OWNER;
  mockCompanyOwners.clear();
  mockAccount = null;
  mockRow = null;
});

describe("isInviteExpired", () => {
  it("is true only for a pending row past its expiry", () => {
    expect(isInviteExpired({ status: "pending", inviteExpiresAt: new Date(Date.now() - 1) })).toBe(true);
    expect(isInviteExpired({ status: "pending", inviteExpiresAt: new Date(Date.now() + 60_000) })).toBe(false);
    expect(isInviteExpired({ status: "pending" })).toBe(false);
    expect(isInviteExpired({ status: "deactivated", inviteExpiresAt: new Date(0) })).toBe(false);
  });
});

describe("POST /api/employers/team/[id]/resend", () => {
  it("sends a fresh link for an expired invite", async () => {
    mockRow = row({ status: "pending", inviteToken: "old", inviteExpiresAt: new Date(0) });
    const res = await callResend();
    expect(res.status).toBe(200);
    expect(save).toHaveBeenCalled();
    expect(mockRow.status).toBe("pending");
    expect(mockRow.inviteToken).not.toBe("old");
    expect((mockRow.inviteExpiresAt as Date).getTime()).toBeGreaterThan(Date.now());
    const mail = (sendEmail as jest.Mock).mock.calls[0][0];
    expect(mail.to).toBe("late@co.test");
    expect(mail.html).toContain(`/join-team?token=${mockRow.inviteToken}`);
  });

  it("re-invites a cancelled row that never had an account", async () => {
    mockRow = row({ status: "deactivated" });
    const res = await callResend();
    expect(res.status).toBe(200);
    expect(mockRow.status).toBe("pending");
    expect(sendEmail).toHaveBeenCalledTimes(1);
  });

  it("refuses an address whose account runs its own company", async () => {
    mockAccount = { _id: INVITEE };
    mockCompanyOwners.add(INVITEE);
    mockRow = row({ status: "pending", userId: INVITEE, inviteExpiresAt: new Date(0) });
    const res = await callResend();
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe("email_in_use");
    expect(save).not.toHaveBeenCalled();
    expect(notify).not.toHaveBeenCalled();
  });

  it("refuses an address that belongs to some other account", async () => {
    mockAccount = { _id: INVITEE };
    mockRow = row({ status: "pending" });
    const res = await callResend();
    expect(res.status).toBe(409);
    expect(save).not.toHaveBeenCalled();
  });

  it("lets a former member without a company of their own come back", async () => {
    mockAccount = { _id: INVITEE };
    mockRow = row({ status: "deactivated", userId: INVITEE });
    const res = await callResend();
    expect(res.status).toBe(200);
    expect(notify).toHaveBeenCalledTimes(1);
  });

  it("does nothing for someone already on the team", async () => {
    mockRow = row({ status: "active" });
    const res = await callResend();
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe("already_member");
  });

  it("never touches the owner's row", async () => {
    mockRow = row({ status: "pending", companyRole: "owner", companyRoles: ["owner"] });
    const res = await callResend();
    expect(res.status).toBe(403);
  });
});

describe("POST /api/employers/team/accept", () => {
  const callAccept = () =>
    accept(
      new NextRequest("http://localhost/api/employers/team/accept", {
        method: "POST",
        body: JSON.stringify({ token: "t".repeat(64) }),
        headers: { "content-type": "application/json" },
      }),
      {} as never,
    );

  it("refuses an account that runs its own company", async () => {
    mockCaller.userId = INVITEE;
    mockCompanyOwners.add(INVITEE);
    mockAccount = { _id: INVITEE, email: "late@co.test" };
    mockRow = row({ status: "pending", inviteExpiresAt: new Date(Date.now() + 60_000) });
    const res = await callAccept();
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe("owns_company");
    expect(save).not.toHaveBeenCalled();
  });

  it("still accepts for an account with no company of its own", async () => {
    mockCaller.userId = INVITEE;
    mockAccount = { _id: INVITEE, email: "late@co.test" };
    mockRow = row({ status: "pending", inviteExpiresAt: new Date(Date.now() + 60_000) });
    const res = await callAccept();
    expect(res.status).toBe(200);
    expect(mockRow.status).toBe("active");
  });
});
