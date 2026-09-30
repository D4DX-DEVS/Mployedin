/**
 * @jest-environment node
 *
 * Adding a colleague (2026-09-29).
 *
 * The invite route used to answer 201 for an address that already had an
 * account — another company's owner, a job seeker, an agent — so the employer
 * saw "sent" for an invitation that person could never accept. It now refuses
 * with a plain "already in use" and nothing about whose account it is.
 *
 * The second mode creates the colleague's account on the spot with a temporary
 * password the employer hands over. Only the bcrypt hash is stored, the
 * password comes back in the response once, and the email we send never
 * carries it.
 */
import { NextRequest } from "next/server";
import bcrypt from "bcryptjs";
import { strongPasswordSchema } from "@/lib/security/passwordPolicy";

const OWNER = "aaaaaaaaaaaaaaaaaaaaaaaa";
const COMPANY = "cccccccccccccccccccccccc";
const EXISTING_USER = "dddddddddddddddddddddddd";
const NEW_USER = "eeeeeeeeeeeeeeeeeeeeeeee";

jest.mock("@/lib/auth/withAuth", () => ({
  withAuth:
    (h: (req: NextRequest, ctx: unknown) => Promise<Response>) =>
    async (req: NextRequest) =>
      h(req, { userId: OWNER, role: "employer", locale: "en" }),
}));
jest.mock("@/lib/subscription/withSubscription", () => ({
  withSubscription: (h: unknown) => h,
}));
jest.mock("@/lib/db/mongoose", () => ({ connectDB: jest.fn().mockResolvedValue(undefined) }));
jest.mock("@/lib/audit/log", () => ({ logActivity: jest.fn(), actorFromCtx: jest.fn(() => ({})) }));
jest.mock("@/lib/notifications/trigger", () => ({ notify: jest.fn() }));
jest.mock("@/lib/communications/email", () => ({ sendEmail: jest.fn().mockResolvedValue(undefined) }));
jest.mock("@/lib/employers/company-membership", () => ({
  ensureEmployerOwnerMembership: jest.fn(async () => ({ companyRole: "owner", companyRoles: ["owner"] })),
}));
jest.mock("@/models/Employer", () => ({
  Employer: {
    findOne: () => ({
      select: () => ({ lean: () => Promise.resolve({ _id: COMPANY, companyEmail: "o@co.test", companyName: "Acme" }) }),
    }),
  },
}));

function q<T>(value: T) {
  const p = Promise.resolve(value);
  const chain: Record<string, unknown> = {
    select: () => chain,
    lean: () => p,
    then: (res: (v: T) => unknown, rej: (e: unknown) => unknown) => p.then(res, rej),
  };
  return chain;
}

/** The account (if any) that already owns the address being added. */
let existingUser: { _id: string } | null = null;
/** This company's own membership row for the address, if any. */
let existingRow: Record<string, unknown> | null = null;

const userCreate = jest.fn();
const userDeleteOne = jest.fn().mockResolvedValue(undefined);
jest.mock("@/models/User", () => ({
  User: {
    findOne: () => q(existingUser),
    find: () => q([]),
    create: (...args: unknown[]) => userCreate(...args),
    deleteOne: (...args: unknown[]) => userDeleteOne(...args),
  },
}));

const companyUserCreate = jest.fn();
jest.mock("@/models/CompanyUser", () => ({
  CompanyUser: {
    findOne: (filter: Record<string, unknown>) => {
      // getTeamActorRole reads the owner's membership by userId; the route
      // then reads this company's row for the address being added.
      if (filter.email) return q(existingRow);
      return q(null);
    },
    countDocuments: () => Promise.resolve(1),
    create: (...args: unknown[]) => companyUserCreate(...args),
  },
  getPrimaryRole: (roles: string[]) => roles[0],
  computeEffectivePermissions: () => ({ canViewJobs: true }),
}));

import { POST } from "@/app/api/employers/team/route";
import { notify } from "@/lib/notifications/trigger";
import { sendEmail } from "@/lib/communications/email";

function post(body: unknown) {
  return POST(
    new NextRequest("http://localhost/api/employers/team", {
      method: "POST",
      body: JSON.stringify(body),
      headers: { "content-type": "application/json" },
    }),
    {} as never,
  ).catch((thrown: unknown) => thrown as Response); // validateBody throws its 400
}

beforeEach(() => {
  jest.clearAllMocks();
  existingUser = null;
  existingRow = null;
  userCreate.mockImplementation(async (doc: Record<string, unknown>) => ({ _id: NEW_USER, ...doc }));
  companyUserCreate.mockImplementation(async (doc: Record<string, unknown>) => ({ _id: "row", ...doc }));
});

describe("an address that already has an account", () => {
  beforeEach(() => {
    existingUser = { _id: EXISTING_USER };
  });

  it("is refused for an invite, with no detail about whose account it is", async () => {
    const res = await post({ email: "owner@other.test", companyRoles: ["hiring_manager"] });
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body).toEqual({ error: "This email is already in use.", code: "email_in_use" });
    expect(companyUserCreate).not.toHaveBeenCalled();
    expect(notify).not.toHaveBeenCalled();
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("is refused for a temporary password, and no account is touched", async () => {
    const res = await post({
      email: "owner@other.test",
      companyRoles: ["viewer"],
      mode: "temp_password",
      name: "Sam Lee",
    });
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe("email_in_use");
    expect(userCreate).not.toHaveBeenCalled();
    expect(companyUserCreate).not.toHaveBeenCalled();
  });

  it("still lets a deactivated member of THIS company be invited back", async () => {
    const save = jest.fn().mockResolvedValue(undefined);
    existingRow = { status: "deactivated", userId: EXISTING_USER, email: "back@co.test", save };
    const res = await post({ email: "back@co.test", companyRoles: ["viewer"] });
    expect(res.status).toBe(200);
    expect((await res.json()).reactivated).toBe(true);
    expect(save).toHaveBeenCalled();
  });
});

it("tells the employer when the address is already on their team", async () => {
  existingRow = { status: "pending", email: "dup@co.test" };
  const res = await post({ email: "dup@co.test", companyRoles: ["viewer"] });
  expect(res.status).toBe(409);
  expect((await res.json()).code).toBe("already_member");
});

describe("temporary password", () => {
  const body = {
    email: "New.Person@Co.test",
    companyRoles: ["hiring_manager"],
    mode: "temp_password",
    name: "New Person",
  };

  it("needs the colleague's name", async () => {
    const res = await post({ ...body, name: undefined });
    expect(res.status).toBe(400);
    expect(userCreate).not.toHaveBeenCalled();
  });

  it("creates an active colleague and returns the password exactly once", async () => {
    const res = await post(body);
    expect(res.status).toBe(201);
    const json = await res.json();

    const { email, password } = json.credentials;
    expect(email).toBe("new.person@co.test");
    expect(strongPasswordSchema.safeParse(password).success).toBe(true);

    const userDoc = userCreate.mock.calls[0][0];
    expect(userDoc).toMatchObject({
      name: "New Person",
      email: "new.person@co.test",
      role: "employer",
      isActive: true,
      // Nothing proved they own the address yet; the verify page mails a code
      // on their first sign-in.
      isEmailVerified: false,
    });
    expect(userDoc.tempPasswordIssuedAt).toBeInstanceOf(Date);
    expect(userDoc.password).toBeUndefined();
    expect(userDoc.passwordHash).not.toBe(password);
    expect(await bcrypt.compare(password, userDoc.passwordHash)).toBe(true);

    const rowDoc = companyUserCreate.mock.calls[0][0];
    expect(rowDoc).toMatchObject({ userId: NEW_USER, status: "active", email: "new.person@co.test" });
    expect(rowDoc.acceptedAt).toBeInstanceOf(Date);
    expect(rowDoc.inviteToken).toBeUndefined();
  });

  it("emails a heads-up that never contains the password", async () => {
    const res = await post(body);
    const { credentials, emailSent } = await res.json();
    expect(emailSent).toBe(true);
    expect(sendEmail).toHaveBeenCalledTimes(1);
    const mail = (sendEmail as jest.Mock).mock.calls[0][0];
    expect(mail.to).toBe("new.person@co.test");
    expect(mail.html).not.toContain(credentials.password);
    expect(mail.html).toContain("/en/login");
  });

  it("still returns the password when the heads-up email fails", async () => {
    (sendEmail as jest.Mock).mockRejectedValueOnce(new Error("smtp down"));
    const res = await post(body);
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.emailSent).toBe(false);
    expect(json.credentials.password).toBeTruthy();
  });

  it("removes the new account again if the membership cannot be written", async () => {
    companyUserCreate.mockRejectedValueOnce(new Error("write failed"));
    await expect(post(body)).resolves.toBeDefined();
    expect(userDeleteOne).toHaveBeenCalledWith({ _id: NEW_USER });
  });

  it("maps a lost race on the unique email index to 'already in use'", async () => {
    userCreate.mockRejectedValueOnce(Object.assign(new Error("dup"), { code: 11000 }));
    const res = await post(body);
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe("email_in_use");
  });

  it("reuses a deactivated row that never had an account", async () => {
    const save = jest.fn().mockResolvedValue(undefined);
    existingRow = { status: "deactivated", email: "new.person@co.test", save };
    const res = await post(body);
    expect(res.status).toBe(201);
    expect(companyUserCreate).not.toHaveBeenCalled();
    expect(existingRow).toMatchObject({ status: "active", userId: NEW_USER });
    expect(save).toHaveBeenCalled();
  });
});

/**
 * A temporary-password colleague stays unverified until first sign-in.
 * employer-register deletes unverified accounts older than 24h so an abandoned
 * sign-up can retry; it must not treat a colleague holding a live seat that
 * way, or the company's row would point at a deleted user. Source guard, same
 * approach as employer-register-audience-guard.test.ts (multipart route with
 * eleven collaborators).
 */
describe("employer-register stale-account cleanup", () => {
  const fs = require("node:fs") as typeof import("node:fs");
  const path = require("node:path") as typeof import("node:path");
  const src = fs.readFileSync(path.join(process.cwd(), "src/app/api/auth/employer-register/route.ts"), "utf8");

  it("spares an unverified account that holds a live team seat", () => {
    expect(src).toMatch(
      /holdsTeamSeat\s*=[\s\S]*?CompanyUser\.exists\(\{\s*userId:\s*existing\._id,\s*status:\s*\{\s*\$ne:\s*"deactivated"\s*\}\s*\}\)/,
    );
    expect(src).toMatch(/isStaleUnverified\s*=\s*!existing\.isEmailVerified\s*&&\s*!holdsTeamSeat\s*&&/);
  });
});
