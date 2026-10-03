/**
 * @jest-environment node
 */
import { NextRequest, NextResponse } from "next/server";

let ctxRole = "admin";
jest.mock("@/lib/auth/withAuth", () => ({
  withAuth: (handler: (req: NextRequest, ctx: unknown) => Promise<Response>) => async (req: NextRequest) => {
    try { return await handler(req, { userId: "admin1", role: ctxRole, locale: "en" }); } catch (err) { if (err instanceof NextResponse) return err; throw err; }
  },
}));
jest.mock("@/lib/db/mongoose", () => ({ connectDB: jest.fn() }));
const logActivity = jest.fn();
jest.mock("@/lib/audit/log", () => ({ logActivity: (...a: unknown[]) => logActivity(...a), actorFromCtx: () => ({ actorId: "admin1", actorRole: "admin" }) }));
jest.mock("@/lib/commissions/resolveRate", () => ({ clearCommissionOverrideCache: jest.fn() }));
jest.mock("@/lib/subscription/enforcementFlag", () => ({ clearSubscriptionEnforcementCache: jest.fn() }));
// Like the real decrypt, this one fails on anything that is not ciphertext ("enc:" here).
const decryptSpy = jest.fn((v: string) => {
  if (!v.startsWith("enc:")) throw new Error("Unsupported state or unable to authenticate data");
  return v.slice(4);
});
jest.mock("@/lib/security/encryption", () => ({
  encryptIfPlain: (v: string) => `enc:${v}`,
  decrypt: (v: string) => decryptSpy(v),
  decryptIfEncrypted: (v: string) => (v.startsWith("enc:") ? decryptSpy(v) : v),
}));
const assertPublicHost = jest.fn(async (..._a: unknown[]) => undefined);
jest.mock("@/lib/security/ssrf", () => ({ assertPublicHost: (...a: unknown[]) => assertPublicHost(...a) }));
const checkRateLimit = jest.fn(async (..._a: unknown[]) => ({ allowed: true, remaining: 9, resetAt: Date.now() + 1000 }));
jest.mock("@/lib/security/rateLimit", () => ({ checkRateLimit: (...a: unknown[]) => checkRateLimit(...a) }));
const loggerWarn = jest.fn();
jest.mock("@/lib/logger", () => ({ __esModule: true, default: { warn: (...a: unknown[]) => loggerWarn(...a), error: jest.fn(), info: jest.fn(), debug: jest.fn() } }));

const baseStored = () => ({
  platformName: "MPLOYEDIN",
  smtp: { smtpEmail: "smtp@mployedin.com", smtpAppPassword: "enc:pw", smtpHost: "smtp.gmail.com", smtpPort: 587, smtpSecure: false },
  email: { provider: "ses", ses: { region: "eu-west-1", accessKeyId: "AKIA1", secretAccessKey: "enc:s3cr3t", fromEmail: "noreply@mployedin.com", fromName: "MPLOYEDIN" } } as Record<string, unknown>,
});
// The routes mask the lean document in place, so every query hands out a fresh copy.
let stored: ReturnType<typeof baseStored> | null = baseStored();
const copy = () => (stored ? structuredClone(stored) : null);
const select = jest.fn();
const findOne = jest.fn((..._a: unknown[]) => ({ select: (...s: unknown[]) => { select(...s); return { lean: async () => copy() }; }, lean: async () => copy() }));
const findOneAndUpdate = jest.fn((..._a: unknown[]) => ({ select: (...s: unknown[]) => { select(...s); return { lean: async () => copy() }; }, lean: async () => copy() }));
jest.mock("@/models/SystemSettings", () => ({
  __esModule: true,
  default: { findOne: (...a: unknown[]) => findOne(...a), findOneAndUpdate: (...a: unknown[]) => findOneAndUpdate(...a) },
}));

const sesSendMail = jest.fn().mockResolvedValue({ messageId: "<ses-1>" });
const createSesTransporter = jest.fn((..._a: unknown[]) => ({ sendMail: sesSendMail }));
jest.mock("@/lib/communications/email/transports/ses", () => {
  const actual = jest.requireActual("@/lib/communications/email/transports/ses");
  return { ...actual, createSesTransporter: (...a: unknown[]) => createSesTransporter(...a) };
});
const smtpSendMail = jest.fn().mockResolvedValue({ messageId: "<smtp-1>" });
const smtpVerify = jest.fn().mockResolvedValue(true);
jest.mock("nodemailer", () => ({ __esModule: true, default: { createTransport: () => ({ verify: smtpVerify, sendMail: smtpSendMail }) } }));

import { GET as settingsGET, POST as settingsPOST } from "@/app/api/admin/settings/route";
import { POST as testEmailPOST } from "@/app/api/admin/settings/test-email/route";
import { emailProviderTestSchema, smtpTestSchema, SES_REGION_RE, SECRET_MASK } from "@/lib/validators/settings";

const noParams = { params: Promise.resolve({}) };
const GET = (req: NextRequest) => settingsGET(req, noParams);
const POST = (req: NextRequest) => settingsPOST(req, noParams);
const TEST = (req: NextRequest) => testEmailPOST(req, noParams);
const post = (url: string, body: unknown) => new NextRequest(`http://localhost${url}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
const setOf = (call: number) => ((findOneAndUpdate.mock.calls[call] as unknown[])[1] as { $set: Record<string, unknown> }).$set;
const SES_FORM = { region: "eu-west-1", accessKeyId: "AKIA1", secretAccessKey: "••••••••", fromEmail: "noreply@mployedin.com", fromName: "MPLOYEDIN" };

describe("email provider settings", () => {
  beforeEach(() => { jest.clearAllMocks(); ctxRole = "admin"; stored = baseStored(); });

  it("exports the shared mask and region pattern", () => {
    expect(SECRET_MASK).toBe("••••••••");
    expect(SES_REGION_RE.test("eu-west-1")).toBe(true);
    expect(SES_REGION_RE.test("me-central-1")).toBe(true);
    expect(SES_REGION_RE.test("Europe")).toBe(false);
  });

  describe("GET", () => {
    it("masks the SES secret and the SMTP password", async () => {
      const res = await GET(new NextRequest("http://localhost/api/admin/settings"));
      const data = await res.json();
      expect(data.settings.email.ses.secretAccessKey).toBe("••••••••");
      expect(data.settings.smtp.smtpAppPassword).toBe("••••••••");
      expect(findOne).toHaveBeenCalled();
      expect(select).toHaveBeenCalledWith("+smtp.smtpAppPassword +email.ses.secretAccessKey");
      expect(JSON.stringify(data)).not.toContain("s3cr3t");
    });

    it("leaves an unset provider unset, so the page can say none was chosen (the transport still treats it as smtp)", async () => {
      delete stored!.email.provider;
      const data = await (await GET(new NextRequest("http://localhost/api/admin/settings"))).json();
      expect(data.settings.email.provider).toBeUndefined();
      expect(data.settings.email.ses.region).toBe("eu-west-1");
    });

    it("reports no provider when the document has no email block at all", async () => {
      delete (stored as Partial<ReturnType<typeof baseStored>>).email;
      const data = await (await GET(new NextRequest("http://localhost/api/admin/settings"))).json();
      expect(data.settings.email?.provider).toBeUndefined();
    });

    it("keeps an explicit provider as stored", async () => {
      const data = await (await GET(new NextRequest("http://localhost/api/admin/settings"))).json();
      expect(data.settings.email.provider).toBe("ses");
    });

    it("does not write email.* when it creates the first settings document", async () => {
      stored = null;
      findOneAndUpdate.mockImplementationOnce(() => ({ lean: async () => ({ platformName: "MPLOYEDIN" }) }) as never);
      const res = await GET(new NextRequest("http://localhost/api/admin/settings"));
      expect(res.status).toBe(200);
      const update = (findOneAndUpdate.mock.calls[0] as unknown[])[1] as { $setOnInsert: Record<string, unknown> };
      expect(Object.keys(update.$setOnInsert).some((k) => k.startsWith("email"))).toBe(false);
      expect((await res.json()).settings.email?.provider).toBeUndefined();
    });

    it("is admin-only", async () => {
      ctxRole = "employer";
      expect((await GET(new NextRequest("http://localhost/api/admin/settings"))).status).toBe(403);
    });
  });

  describe("POST", () => {
    it("writes provider + encrypted secret, skips the mask", async () => {
      const res = await POST(post("/api/admin/settings", { email: { provider: "ses", ses: { region: "eu-west-1", accessKeyId: "AKIA2", secretAccessKey: "new-secret", fromEmail: "noreply@mployedin.com", configurationSet: "mployedin" } } }));
      expect(res.status).toBe(200);
      const $set = setOf(0);
      expect($set["email.provider"]).toBe("ses");
      expect($set["email.ses.accessKeyId"]).toBe("AKIA2");
      expect($set["email.ses.secretAccessKey"]).toBe("enc:new-secret");
      expect($set["email.ses.configurationSet"]).toBe("mployedin");

      await POST(post("/api/admin/settings", { email: { ses: { secretAccessKey: "••••••••" } } }));
      expect(setOf(1)["email.ses.secretAccessKey"]).toBeUndefined();
    });

    it("writes email.provider only when the body carries email", async () => {
      await POST(post("/api/admin/settings", { platformName: "Acme", smtp: { smtpHost: "smtp.example.com", smtpAppPassword: "new-pw" } }));
      const $set = setOf(0);
      expect($set.platformName).toBe("Acme");
      expect(Object.keys($set).some((k) => k.startsWith("email"))).toBe(false);
    });

    it("does not touch the stored secret or provider for an email block without them", async () => {
      await POST(post("/api/admin/settings", { email: { ses: { fromName: "Acme" } } }));
      const $set = setOf(0);
      expect($set["email.ses.fromName"]).toBe("Acme");
      expect($set["email.provider"]).toBeUndefined();
      expect($set["email.ses.secretAccessKey"]).toBeUndefined();
    });

    it("lets the admin switch back to smtp", async () => {
      await POST(post("/api/admin/settings", { email: { provider: "smtp" } }));
      expect(setOf(0)["email.provider"]).toBe("smtp");
    });

    it("selects the SES secret on the returned document and masks it, never returning the secret", async () => {
      const res = await POST(post("/api/admin/settings", { email: { provider: "ses" } }));
      const data = await res.json();
      expect(select).toHaveBeenCalledWith("+email.ses.secretAccessKey");
      expect(data.settings.email.ses.secretAccessKey).toBe("••••••••");
      expect(JSON.stringify(data)).not.toContain("s3cr3t");
    });

    it("answers with the ses_incomplete warning when SES is chosen but a field is blank", async () => {
      delete (stored!.email.ses as Record<string, unknown>).fromEmail;
      const data = await (await POST(post("/api/admin/settings", { email: { provider: "ses" } }))).json();
      expect(data.warning).toBe("ses_incomplete");
    });

    it("has no warning when the stored SES config is complete or the provider is smtp", async () => {
      const complete = await (await POST(post("/api/admin/settings", { email: { provider: "ses" } }))).json();
      expect(complete.warning).toBeUndefined();
      stored!.email.provider = "smtp";
      delete (stored!.email.ses as Record<string, unknown>).fromEmail;
      const smtp = await (await POST(post("/api/admin/settings", { email: { provider: "smtp" } }))).json();
      expect(smtp.warning).toBeUndefined();
    });

    it("leaves an unset provider unset in the response too", async () => {
      delete stored!.email.provider;
      const data = await (await POST(post("/api/admin/settings", { platformName: "Acme" }))).json();
      expect(data.settings.email.provider).toBeUndefined();
      expect(data.warning).toBeUndefined();
    });

    describe("the access key ID and its secret stay a pair", () => {
      it("refuses the masked secret with an access key ID other than the stored one (400, nothing written)", async () => {
        const res = await POST(post("/api/admin/settings", { email: { provider: "ses", ses: { ...SES_FORM, accessKeyId: "AKIA-OTHER" } } }));
        expect(res.status).toBe(400);
        expect(findOneAndUpdate).not.toHaveBeenCalled();
        expect(logActivity).not.toHaveBeenCalled();
      });

      it.each([
        ["no secret at all", {}],
        ["a blank secret", { secretAccessKey: "" }],
        ["a secret that is only whitespace", { secretAccessKey: "  	 " }],
      ])("refuses an access key ID other than the stored one with %s (400, nothing written)", async (_label, secret) => {
        const res = await POST(post("/api/admin/settings", { email: { provider: "ses", ses: { region: "eu-west-1", accessKeyId: "AKIA-OTHER", ...secret } } }));
        expect(res.status).toBe(400);
        expect(findOneAndUpdate).not.toHaveBeenCalled();
        expect(logActivity).not.toHaveBeenCalled();
      });

      it("accepts a new access key ID with no secret while none is stored (nothing to mismatch yet)", async () => {
        delete (stored!.email.ses as Record<string, unknown>).secretAccessKey;
        const res = await POST(post("/api/admin/settings", { email: { ses: { accessKeyId: "AKIA-OTHER" } } }));
        expect(res.status).toBe(200);
        expect(setOf(0)["email.ses.accessKeyId"]).toBe("AKIA-OTHER");
        expect(setOf(0)["email.ses.secretAccessKey"]).toBeUndefined();
      });

      it("accepts the stored access key ID with no secret, and a save that does not carry an access key ID", async () => {
        expect((await POST(post("/api/admin/settings", { email: { ses: { accessKeyId: "AKIA1" } } }))).status).toBe(200);
        expect((await POST(post("/api/admin/settings", { email: { ses: { region: "eu-west-1", fromName: "Careers" } } }))).status).toBe(200);
        expect(setOf(1)["email.ses.fromName"]).toBe("Careers");
        expect(setOf(1)["email.ses.accessKeyId"]).toBeUndefined();
      });

      it("accepts the masked secret with the stored access key ID", async () => {
        expect((await POST(post("/api/admin/settings", { email: { provider: "ses", ses: SES_FORM } }))).status).toBe(200);
        expect(setOf(0)["email.ses.secretAccessKey"]).toBeUndefined();
      });

      it("accepts a new access key ID with a newly typed secret", async () => {
        expect((await POST(post("/api/admin/settings", { email: { provider: "ses", ses: { ...SES_FORM, accessKeyId: "AKIA-OTHER", secretAccessKey: "new-secret" } } }))).status).toBe(200);
        expect(setOf(0)["email.ses.accessKeyId"]).toBe("AKIA-OTHER");
        expect(setOf(0)["email.ses.secretAccessKey"]).toBe("enc:new-secret");
      });
    });

    // The stored SMTP password was saved for one host and one login. Sent to another host it would hand the
    // password to whoever runs that host; this mirrors the SES key-ID pairing guard above.
    describe("the SMTP password stays with its host and user", () => {
      const SMTP_FORM = { smtpEmail: "smtp@mployedin.com", smtpAppPassword: "••••••••", smtpHost: "smtp.gmail.com", smtpPort: 587, smtpSecure: false };

      it.each([
        ["another host", { smtpHost: "smtp.attacker.example" }],
        ["another user", { smtpEmail: "other@mployedin.com" }],
      ])("refuses the masked password with %s (400, nothing written)", async (_label, change) => {
        const res = await POST(post("/api/admin/settings", { smtp: { ...SMTP_FORM, ...change } }));
        expect(res.status).toBe(400);
        // A machine code, which the page maps to its own localized hint on the password field.
        expect(await res.json()).toEqual({ error: "smtp_password_required" });
        expect(findOneAndUpdate).not.toHaveBeenCalled();
        expect(logActivity).not.toHaveBeenCalled();
      });

      it.each([
        ["no password at all", {}],
        ["a blank password", { smtpAppPassword: "" }],
      ])("refuses another host with %s (400, nothing written)", async (_label, password) => {
        const { smtpAppPassword: _mask, ...form } = SMTP_FORM;
        const res = await POST(post("/api/admin/settings", { smtp: { ...form, smtpHost: "smtp.attacker.example", ...password } }));
        expect(res.status).toBe(400);
        expect(await res.json()).toEqual({ error: "smtp_password_required" });
        expect(findOneAndUpdate).not.toHaveBeenCalled();
      });

      it("accepts the page's usual save: the mask with the stored host and user", async () => {
        const res = await POST(post("/api/admin/settings", { platformName: "Acme", smtp: SMTP_FORM }));
        expect(res.status).toBe(200);
        expect(setOf(0)["smtp.smtpAppPassword"]).toBeUndefined();
      });

      it("accepts a new host with a newly typed password", async () => {
        const res = await POST(post("/api/admin/settings", { smtp: { ...SMTP_FORM, smtpHost: "smtp.office365.com", smtpAppPassword: "typed" } }));
        expect(res.status).toBe(200);
        expect(setOf(0)["smtp.smtpHost"]).toBe("smtp.office365.com");
        expect(setOf(0)["smtp.smtpAppPassword"]).toBe("enc:typed");
      });

      it("accepts a new host while no password is stored (nothing to pair yet)", async () => {
        delete (stored!.smtp as Record<string, unknown>).smtpAppPassword;
        const res = await POST(post("/api/admin/settings", { smtp: { smtpEmail: "smtp@mployedin.com", smtpHost: "smtp.office365.com" } }));
        expect(res.status).toBe(200);
      });

      it("reads the stored password to compare, never returning it", async () => {
        await POST(post("/api/admin/settings", { smtp: { ...SMTP_FORM, smtpHost: "smtp.attacker.example" } }));
        expect(select).toHaveBeenCalledWith("smtp.smtpHost smtp.smtpEmail +smtp.smtpAppPassword");
      });
    });

    // The transport dials the saved host directly: the same guard the test button runs.
    describe("the SMTP host must be public", () => {
      it("refuses a new host that resolves to a private address (400, nothing written)", async () => {
        assertPublicHost.mockRejectedValueOnce(new Error("Host resolves to a blocked address"));
        const res = await POST(post("/api/admin/settings", { smtp: { smtpEmail: "smtp@mployedin.com", smtpHost: "10.0.0.5", smtpAppPassword: "typed" } }));
        expect(res.status).toBe(400);
        expect(assertPublicHost).toHaveBeenCalledWith("10.0.0.5");
        expect(findOneAndUpdate).not.toHaveBeenCalled();
      });

      it("checks a host only when it changes, so the page's usual save does not depend on DNS", async () => {
        await POST(post("/api/admin/settings", { platformName: "Acme", smtp: { smtpEmail: "smtp@mployedin.com", smtpAppPassword: "••••••••", smtpHost: "smtp.gmail.com" } }));
        expect(assertPublicHost).not.toHaveBeenCalled();
      });

      it("does not check a blank host (the transport falls back to Gmail)", async () => {
        delete (stored!.smtp as Record<string, unknown>).smtpAppPassword;
        await POST(post("/api/admin/settings", { smtp: { smtpEmail: "smtp@mployedin.com", smtpHost: "" } }));
        expect(assertPublicHost).not.toHaveBeenCalled();
      });
    });

    it("trims a pasted SES secret before encrypting it", async () => {
      await POST(post("/api/admin/settings", { email: { ses: { secretAccessKey: "  new-secret\n" } } }));
      expect(setOf(0)["email.ses.secretAccessKey"]).toBe("enc:new-secret");
    });

    it("redacts both secrets in the audit trail", async () => {
      await POST(post("/api/admin/settings", { smtp: { smtpAppPassword: "smtp-new" }, email: { provider: "ses", ses: { secretAccessKey: "new-secret", region: "eu-west-1" } } }));
      expect(logActivity).toHaveBeenCalledTimes(1);
      const entry = logActivity.mock.calls[0][0] as { changes: { after: Record<string, unknown> } };
      expect(entry.changes.after["email.ses.secretAccessKey"]).toBe("[redacted]");
      expect(entry.changes.after["smtp.smtpAppPassword"]).toBe("[redacted]");
      expect(entry.changes.after["email.ses.region"]).toBe("eu-west-1");
      expect(JSON.stringify(entry)).not.toMatch(/new-secret|smtp-new|enc:/);
    });

    it("rejects a malformed region", async () => {
      const res = await POST(post("/api/admin/settings", { email: { ses: { region: "Europe" } } }));
      expect(res.status).toBe(400);
      expect(findOneAndUpdate).not.toHaveBeenCalled();
    });

    it("rejects an unknown provider", async () => {
      expect((await POST(post("/api/admin/settings", { email: { provider: "mailgun" } }))).status).toBe(400);
    });

    it("is admin-only", async () => {
      ctxRole = "employer";
      expect((await POST(post("/api/admin/settings", { email: { provider: "ses" } }))).status).toBe(403);
      expect(findOneAndUpdate).not.toHaveBeenCalled();
    });
  });

  describe("test-email", () => {
    it("over SES uses the stored secret when the form sends the mask", async () => {
      const res = await TEST(post("/api/admin/settings/test-email", { provider: "ses", ses: SES_FORM, to: "me@gmail.com" }));
      expect(res.status).toBe(200);
      expect(select).toHaveBeenCalledWith("+email.ses.secretAccessKey");
      expect(createSesTransporter).toHaveBeenCalledWith(expect.objectContaining({ secretAccessKey: "s3cr3t", region: "eu-west-1" }));
      expect(sesSendMail).toHaveBeenCalledWith(expect.objectContaining({ to: "me@gmail.com", from: "MPLOYEDIN <noreply@mployedin.com>" }));
    });

    it("over SES sends a typed secret as-is, without reading the stored one, to the From address by default", async () => {
      const res = await TEST(post("/api/admin/settings/test-email", { provider: "ses", ses: { ...SES_FORM, secretAccessKey: "typed", configurationSet: "mployedin" } }));
      expect(res.status).toBe(200);
      expect(findOne).not.toHaveBeenCalled();
      expect(createSesTransporter).toHaveBeenCalledWith(expect.objectContaining({ secretAccessKey: "typed" }));
      expect(sesSendMail).toHaveBeenCalledWith(expect.objectContaining({ to: "noreply@mployedin.com", ses: { ConfigurationSetName: "mployedin" } }));
    });

    it("over SES uses a stored secret the model's read hook already decrypted as is, never running it through decrypt", async () => {
      (stored!.email.ses as Record<string, unknown>).secretAccessKey = "plain-from-hook";
      const res = await TEST(post("/api/admin/settings/test-email", { provider: "ses", ses: SES_FORM }));
      expect(res.status).toBe(200);
      expect(createSesTransporter).toHaveBeenCalledWith(expect.objectContaining({ secretAccessKey: "plain-from-hook" }));
      expect(decryptSpy).not.toHaveBeenCalled();
      expect(loggerWarn).not.toHaveBeenCalled();
    });

    it("over SES logs a stored secret that is real ciphertext but fails to decrypt, and still tries the stored value", async () => {
      decryptSpy.mockImplementationOnce(() => {
        throw new Error("Unsupported state or unable to authenticate data");
      });
      const res = await TEST(post("/api/admin/settings/test-email", { provider: "ses", ses: SES_FORM }));
      expect(res.status).toBe(200);
      // The same warning resolveTransport writes, so a wrong ENCRYPTION_KEY shows up in the logs from the test button too.
      expect(loggerWarn).toHaveBeenCalledTimes(1);
      expect(loggerWarn).toHaveBeenCalledWith({ err: expect.any(Error) }, "SES secret decrypt failed, using stored value");
      expect(createSesTransporter).toHaveBeenCalledWith(expect.objectContaining({ secretAccessKey: "enc:s3cr3t" }));
      expect(JSON.stringify(loggerWarn.mock.calls)).not.toContain("s3cr3t");
    });

    it("over SES refuses the masked secret with an access key ID other than the stored one", async () => {
      const res = await TEST(post("/api/admin/settings/test-email", { provider: "ses", ses: { ...SES_FORM, accessKeyId: "AKIA-OTHER" } }));
      expect(res.status).toBe(400);
      expect(createSesTransporter).not.toHaveBeenCalled();
      expect(sesSendMail).not.toHaveBeenCalled();
    });

    it("over SES trims a pasted secret and refuses a blank one", async () => {
      await TEST(post("/api/admin/settings/test-email", { provider: "ses", ses: { ...SES_FORM, secretAccessKey: " typed \t" } }));
      expect(createSesTransporter).toHaveBeenCalledWith(expect.objectContaining({ secretAccessKey: "typed" }));
      expect((await TEST(post("/api/admin/settings/test-email", { provider: "ses", ses: { ...SES_FORM, secretAccessKey: "   " } }))).status).toBe(400);
    });

    it("over SES asks for the secret when the mask comes back and none is stored", async () => {
      delete (stored!.email.ses as Record<string, unknown>).secretAccessKey;
      const res = await TEST(post("/api/admin/settings/test-email", { provider: "ses", ses: SES_FORM }));
      expect(res.status).toBe(400);
      expect((await res.json()).message).toMatch(/secret access key/i);
      expect(createSesTransporter).not.toHaveBeenCalled();
    });

    it("over SES answers 500 with the provider's own message and never echoes the secret", async () => {
      sesSendMail.mockRejectedValueOnce(Object.assign(new Error("Email address is not verified."), { name: "MessageRejected" }));
      const res = await TEST(post("/api/admin/settings/test-email", { provider: "ses", ses: { ...SES_FORM, secretAccessKey: "typed" } }));
      expect(res.status).toBe(500);
      const { message } = await res.json();
      expect(message).toBe("SES Error: MessageRejected: Email address is not verified.");
      expect(message).not.toContain("typed");
    });

    it("rejects a malformed SES region", async () => {
      const res = await TEST(post("/api/admin/settings/test-email", { provider: "ses", ses: { ...SES_FORM, region: "Europe" } }));
      expect(res.status).toBe(400);
      expect(createSesTransporter).not.toHaveBeenCalled();
    });

    it("over SMTP keeps verifying the host and sending to the From address by default", async () => {
      const res = await TEST(post("/api/admin/settings/test-email", { provider: "smtp", smtp: { smtpEmail: "smtp@mployedin.com", smtpAppPassword: "pw", smtpHost: "smtp.gmail.com", smtpPort: 587 } }));
      expect(res.status).toBe(200);
      expect(smtpVerify).toHaveBeenCalled();
      expect(smtpSendMail).toHaveBeenCalledWith(expect.objectContaining({ to: "smtp@mployedin.com" }));
      expect(createSesTransporter).not.toHaveBeenCalled();
    });

    it("over SMTP refuses the masked password", async () => {
      const res = await TEST(post("/api/admin/settings/test-email", { provider: "smtp", smtp: { smtpEmail: "smtp@mployedin.com", smtpAppPassword: "••••••••" } }));
      expect(res.status).toBe(400);
      expect(smtpSendMail).not.toHaveBeenCalled();
    });

    it("rejects a body without a provider", async () => {
      const res = await TEST(post("/api/admin/settings/test-email", { smtp: { smtpEmail: "smtp@mployedin.com", smtpAppPassword: "pw" } }));
      expect(res.status).toBe(400);
    });

    it("is admin-only", async () => {
      ctxRole = "employer";
      const res = await TEST(post("/api/admin/settings/test-email", { provider: "smtp", smtp: { smtpEmail: "a@b.co", smtpAppPassword: "x" } }));
      expect(res.status).toBe(403);
      // Refused before spending the admin rate-limit budget.
      expect(checkRateLimit).not.toHaveBeenCalled();
    });

    // Each test dials a server and sends a real email: budgeted like the WhatsApp test send.
    describe("rate limit", () => {
      it("budgets ten test emails per admin per ten minutes", async () => {
        await TEST(post("/api/admin/settings/test-email", { provider: "ses", ses: { ...SES_FORM, secretAccessKey: "typed" } }));
        expect(checkRateLimit).toHaveBeenCalledWith("email-test:admin1", { limit: 10, windowSec: 600, prefix: "email-test" });
      });

      it("answers 429 over the budget, before reading settings or dialling anything", async () => {
        checkRateLimit.mockResolvedValueOnce({ allowed: false, remaining: 0, resetAt: Date.now() + 1000 });
        const res = await TEST(post("/api/admin/settings/test-email", { provider: "ses", ses: SES_FORM }));
        expect(res.status).toBe(429);
        expect(findOne).not.toHaveBeenCalled();
        expect(createSesTransporter).not.toHaveBeenCalled();
        expect(smtpSendMail).not.toHaveBeenCalled();
      });
    });
  });

  describe("validators", () => {
    it("leaves smtpTestSchema as the provider-less employer shape", () => {
      expect(smtpTestSchema.safeParse({ smtp: { smtpEmail: "a@b.co", smtpAppPassword: "x" } }).success).toBe(true);
      expect(emailProviderTestSchema.safeParse({ smtp: { smtpEmail: "a@b.co", smtpAppPassword: "x" } }).success).toBe(false);
    });
  });
});
