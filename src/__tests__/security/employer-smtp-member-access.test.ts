/**
 * @jest-environment node
 *
 * 2026-09-28 OWASP assessment H-06: /api/employers/me is on the member
 * always-allowed list and matched by prefix, which opened
 * /api/employers/me/smtp to every colleague (a hiring manager could reroute all
 * company mail through their own server). The stored host was also dialled
 * without an SSRF check.
 */
import { NextRequest } from "next/server";
import { memberCanAccessPath } from "@/lib/permissions/companyFunctions";
import type { ICompanyUserPermissions } from "@/lib/permissions/companyRoles";

const noFunctions = {} as ICompanyUserPermissions;
const settingsManager = { canManageCompanySettings: true } as unknown as ICompanyUserPermissions;

describe("memberCanAccessPath — most specific rule wins", () => {
  it("keeps /api/employers/me itself open to every member", () => {
    expect(memberCanAccessPath("/api/employers/me", noFunctions)).toBe(true);
  });

  it("gates the SMTP relay on company-settings rights", () => {
    expect(memberCanAccessPath("/api/employers/me/smtp", noFunctions)).toBe(false);
    expect(memberCanAccessPath("/api/employers/me/smtp/test", noFunctions)).toBe(false);
    expect(memberCanAccessPath("/api/employers/me/smtp", settingsManager)).toBe(true);
  });

  it("leaves other always-allowed paths unchanged", () => {
    expect(memberCanAccessPath("/api/notifications", noFunctions)).toBe(true);
  });
});

jest.mock("@/lib/auth/withAuth", () => ({
  withAuth: (h: (req: NextRequest, ctx: unknown) => Promise<Response>) => async (req: NextRequest) =>
    h(req, { userId: "aaaaaaaaaaaaaaaaaaaaaaaa", role: "employer", locale: "en" }),
}));
jest.mock("@/lib/db/mongoose", () => ({ connectDB: jest.fn().mockResolvedValue(undefined) }));
jest.mock("@/lib/audit/log", () => ({ logActivity: jest.fn(), actorFromCtx: jest.fn(() => ({})) }));
const updateOne = jest.fn();
jest.mock("@/models/Employer", () => ({
  Employer: {
    findOne: jest.fn(async () => ({ _id: "cccccccccccccccccccccccc", subscriptionType: "premium" })),
    updateOne: (...a: unknown[]) => updateOne(...a),
  },
}));
jest.mock("@/lib/security/ssrf", () => ({
  assertPublicHost: jest.fn(async (host: string) => {
    if (/^(10\.|127\.|169\.254\.|localhost)/.test(host)) throw new Error("blocked");
  }),
}));

async function save(smtpHost: string) {
  const { PUT } = await import("@/app/api/employers/me/smtp/route");
  return PUT(
    new NextRequest("http://localhost/api/employers/me/smtp", {
      method: "PUT",
      body: JSON.stringify({ smtp: { smtpEmail: "a@co.test", smtpHost, smtpPort: 587, smtpAppPassword: "x" } }),
      headers: { "content-type": "application/json" },
    }),
    { params: Promise.resolve({}) },
  );
}

describe("PUT /api/employers/me/smtp", () => {
  beforeEach(() => updateOne.mockClear());

  it("refuses internal / metadata hosts", async () => {
    for (const host of ["10.0.0.5", "169.254.169.254", "127.0.0.1"]) {
      const res = await save(host);
      expect(res.status).toBe(400);
    }
    expect(updateOne).not.toHaveBeenCalled();
  });

  it("accepts a public relay", async () => {
    const res = await save("smtp.example.com");
    expect(res.status).toBe(200);
    expect(updateOne).toHaveBeenCalledTimes(1);
  });
});
