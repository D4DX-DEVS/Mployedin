/**
 * @jest-environment node
 */
const connectDB = jest.fn();
jest.mock("@/lib/db/mongoose", () => ({ connectDB: (...a: unknown[]) => connectDB(...a) }));
const findOne = jest.fn();
jest.mock("@/models/SystemSettings", () => ({ __esModule: true, default: { findOne: (...a: unknown[]) => findOne(...a) } }));
const findById = jest.fn();
jest.mock("@/models/Employer", () => ({ Employer: { findById: (...a: unknown[]) => findById(...a) } }));
jest.mock("@/lib/security/encryption", () => {
  // Like the real decrypt, this fails on anything that is not ciphertext. "enc:" is ciphertext, "bad:" is
  // ciphertext under another key; anything else is plaintext, which decryptIfEncrypted hands back as is.
  const decrypt = (v: string) => {
    if (!v.startsWith("enc:")) throw new Error("Unsupported state or unable to authenticate data");
    return v.slice(4);
  };
  return { decrypt, decryptIfEncrypted: (v: string) => (v.startsWith("enc:") || v.startsWith("bad:") ? decrypt(v) : v) };
});
const warn = jest.fn();
jest.mock("@/lib/logger", () => ({ __esModule: true, default: { warn: (...a: unknown[]) => warn(...a), info: jest.fn(), error: jest.fn(), debug: jest.fn() } }));
const createSesTransporter = jest.fn((..._a: unknown[]) => ({ kind: "ses" }));
jest.mock("@/lib/communications/email/transports/ses", () => {
  const actual = jest.requireActual("@/lib/communications/email/transports/ses");
  return { ...actual, createSesTransporter: (...a: unknown[]) => createSesTransporter(...a) };
});
const createSmtpTransporter = jest.fn((..._a: unknown[]) => ({ kind: "smtp-db" }));
const getEnvTransporter = jest.fn(() => ({ kind: "smtp-env" }));
jest.mock("@/lib/communications/email/transports/smtp", () => ({
  createSmtpTransporter: (...a: unknown[]) => createSmtpTransporter(...a),
  getEnvTransporter: () => getEnvTransporter(),
  envFromEmail: () => "env@mployedin.com",
}));

import { resolveTransport } from "@/lib/communications/email/resolveTransport";

const selectSpy = jest.fn();
const settingsWith = (doc: unknown) =>
  findOne.mockReturnValue({ select: (...a: unknown[]) => { selectSpy(...a); return { lean: async () => doc }; } });
const employerWith = (doc: unknown) => findById.mockReturnValue({ select: () => ({ lean: async () => doc }) });
const ses = { region: "eu-west-1", accessKeyId: "AKIA1", secretAccessKey: "enc:s3cr3t", fromEmail: "ses@mployedin.com", fromName: "MPLOYEDIN", configurationSet: "mployedin" };
const smtp = { smtpEmail: "smtp@mployedin.com", smtpAppPassword: "enc:pw", smtpHost: "smtp.gmail.com", smtpPort: 587, smtpSecure: false };
const envSes = () => Object.assign(process.env, { SES_REGION: "us-east-1", SES_ACCESS_KEY_ID: "A", SES_SECRET_ACCESS_KEY: "B", SES_FROM_EMAIL: "env-ses@mployedin.com" });
const ENV_SMTP_RESULT = { transporter: { kind: "smtp-env" }, fromEmail: "env@mployedin.com", provider: "smtp" };
/** Every argument given to logger.warn as one string. JSON.stringify alone renders an Error as {}, so expand them. */
const loggedText = () =>
  JSON.stringify(warn.mock.calls, (_key, value) => (value instanceof Error ? { name: value.name, message: value.message, stack: value.stack } : value));

describe("resolveTransport provider chain", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    connectDB.mockReset();
    findOne.mockReset();
    findById.mockReset();
    for (const k of ["EMAIL_PROVIDER", "SES_REGION", "SES_ACCESS_KEY_ID", "SES_SECRET_ACCESS_KEY", "SES_FROM_EMAIL", "SES_FROM_NAME", "SES_CONFIGURATION_SET"]) process.env[k] = "";
  });

  describe("env SES spelling", () => {
    it("reads EMAIL_PROVIDER case-insensitively and trimmed, and trims every SES_* value", async () => {
      settingsWith(null);
      Object.assign(process.env, {
        EMAIL_PROVIDER: " SES\n",
        SES_REGION: " us-east-1 ",
        SES_ACCESS_KEY_ID: "AKIAENV\n",
        SES_SECRET_ACCESS_KEY: " env-secret ",
        SES_FROM_EMAIL: " env-ses@mployedin.com",
        SES_FROM_NAME: " MPLOYEDIN ",
        SES_CONFIGURATION_SET: "  ",
      });
      const r = await resolveTransport();
      expect(r.provider).toBe("ses");
      expect(r.fromEmail).toBe("env-ses@mployedin.com");
      expect(r.fromName).toBe("MPLOYEDIN");
      expect(r.sesConfigurationSet).toBeUndefined();
      expect(createSesTransporter).toHaveBeenCalledWith({ region: "us-east-1", accessKeyId: "AKIAENV", secretAccessKey: "env-secret", fromEmail: "env-ses@mployedin.com", fromName: "MPLOYEDIN", configurationSet: undefined });
    });

    it("treats an SES_* value of only whitespace as missing", async () => {
      settingsWith(null);
      process.env.EMAIL_PROVIDER = "ses";
      envSes();
      process.env.SES_SECRET_ACCESS_KEY = "   ";
      expect(await resolveTransport()).toEqual(ENV_SMTP_RESULT);
      expect(warn).toHaveBeenCalledWith(expect.stringContaining("SES_* is incomplete"));
    });
  });

  it("uses SES when the admin chose it and the DB config is complete (secret decrypted)", async () => {
    settingsWith({ smtp, email: { provider: "ses", ses } });
    const r = await resolveTransport();
    expect(r.provider).toBe("ses");
    expect(r.fromEmail).toBe("ses@mployedin.com");
    expect(r.fromName).toBe("MPLOYEDIN");
    expect(r.sesConfigurationSet).toBe("mployedin");
    expect(createSesTransporter).toHaveBeenCalledWith(expect.objectContaining({ secretAccessKey: "s3cr3t" }));
  });

  it("falls back to DB SMTP when SES is chosen but incomplete", async () => {
    settingsWith({ smtp, email: { provider: "ses", ses: { ...ses, secretAccessKey: "" } } });
    const r = await resolveTransport();
    expect(r.provider).toBe("smtp");
    expect(r.fromEmail).toBe("smtp@mployedin.com");
    expect(createSmtpTransporter).toHaveBeenCalledWith(expect.objectContaining({ smtpAppPassword: "pw" }));
  });

  it("uses DB SMTP when the admin chose SMTP even if SES_* env is set", async () => {
    settingsWith({ smtp, email: { provider: "smtp", ses } });
    process.env.EMAIL_PROVIDER = "ses";
    envSes();
    const r = await resolveTransport();
    expect(r.provider).toBe("smtp");
    expect(r.fromEmail).toBe("smtp@mployedin.com");
  });

  it("uses SES_* env when the DB has no provider config and EMAIL_PROVIDER=ses", async () => {
    settingsWith({});
    process.env.EMAIL_PROVIDER = "ses";
    envSes();
    const r = await resolveTransport();
    expect(r.provider).toBe("ses");
    expect(r.fromEmail).toBe("env-ses@mployedin.com");
  });

  it("ends at the env SMTP chain", async () => {
    settingsWith(null);
    const r = await resolveTransport();
    expect(r).toEqual({ transporter: { kind: "smtp-env" }, fromEmail: "env@mployedin.com", provider: "smtp" });
  });

  describe("precedence pinned", () => {
    it("employer SMTP override beats a system SES choice and the system settings are never read", async () => {
      employerWith({ smtpOverride: { smtpEmail: "hr@acme.com", smtpAppPassword: "enc:acme-pw", smtpHost: "smtp.acme.com", smtpPort: 465, smtpSecure: true } });
      settingsWith({ smtp, email: { provider: "ses", ses } });
      const r = await resolveTransport("emp-1");
      expect(r).toEqual({ transporter: { kind: "smtp-db" }, fromEmail: "hr@acme.com", provider: "smtp" });
      expect(createSmtpTransporter).toHaveBeenCalledWith({ smtpEmail: "hr@acme.com", smtpAppPassword: "acme-pw", smtpHost: "smtp.acme.com", smtpPort: 465, smtpSecure: true });
      expect(createSesTransporter).not.toHaveBeenCalled();
      expect(findOne).not.toHaveBeenCalled();
    });

    it("an employer without a usable override falls through to the system SES choice", async () => {
      employerWith({ smtpOverride: { smtpEmail: "hr@acme.com" } });
      settingsWith({ smtp, email: { provider: "ses", ses } });
      const r = await resolveTransport("emp-1");
      expect(r.provider).toBe("ses");
      expect(r.fromEmail).toBe("ses@mployedin.com");
    });

    it("an employer lookup failure is logged and falls through to the system chain", async () => {
      findById.mockImplementation(() => { throw new Error("employer db down"); });
      settingsWith({ smtp });
      const r = await resolveTransport("emp-1");
      expect(r.fromEmail).toBe("smtp@mployedin.com");
      expect(warn).toHaveBeenCalledWith(expect.objectContaining({ employerId: "emp-1" }), expect.stringContaining("Employer SMTP override"));
    });

    it("resolves the existing DB SMTP path exactly as before when no email provider is saved", async () => {
      settingsWith({ smtp });
      const r = await resolveTransport();
      expect(r).toEqual({ transporter: { kind: "smtp-db" }, fromEmail: "smtp@mployedin.com", provider: "smtp" });
      expect(createSmtpTransporter).toHaveBeenCalledWith({ smtpEmail: "smtp@mployedin.com", smtpAppPassword: "pw", smtpHost: "smtp.gmail.com", smtpPort: 587, smtpSecure: false });
      expect(createSesTransporter).not.toHaveBeenCalled();
    });

    it("DB SMTP beats env SES when the admin saved no provider choice", async () => {
      settingsWith({ smtp });
      process.env.EMAIL_PROVIDER = "ses";
      envSes();
      const r = await resolveTransport();
      expect(r.provider).toBe("smtp");
      expect(r.fromEmail).toBe("smtp@mployedin.com");
      expect(createSesTransporter).not.toHaveBeenCalled();
    });

    it("a saved SMTP choice without usable SMTP creds goes to the env SMTP chain, not env SES", async () => {
      settingsWith({ email: { provider: "smtp" } });
      process.env.EMAIL_PROVIDER = "ses";
      envSes();
      expect(await resolveTransport()).toEqual(ENV_SMTP_RESULT);
      expect(createSesTransporter).not.toHaveBeenCalled();
    });

    it("a chosen but incomplete SES with no SMTP in the DB goes to the env SMTP chain, not env SES", async () => {
      settingsWith({ email: { provider: "ses", ses: { ...ses, region: "" } } });
      process.env.EMAIL_PROVIDER = "ses";
      envSes();
      expect(await resolveTransport()).toEqual(ENV_SMTP_RESULT);
      expect(createSesTransporter).not.toHaveBeenCalled();
    });

    it("provider ses with no ses block falls back to DB SMTP and says so", async () => {
      settingsWith({ smtp, email: { provider: "ses" } });
      const r = await resolveTransport();
      expect(r.provider).toBe("smtp");
      expect(r.fromEmail).toBe("smtp@mployedin.com");
      expect(createSesTransporter).not.toHaveBeenCalled();
      expect(warn).toHaveBeenCalledWith(expect.stringContaining("incomplete"));
    });

    it("EMAIL_PROVIDER=ses with incomplete SES_* env falls back to the env SMTP chain and says so", async () => {
      settingsWith(null);
      process.env.EMAIL_PROVIDER = "ses";
      Object.assign(process.env, { SES_REGION: "us-east-1", SES_ACCESS_KEY_ID: "A" });
      expect(await resolveTransport()).toEqual(ENV_SMTP_RESULT);
      expect(warn).toHaveBeenCalledWith(expect.stringContaining("SES_* is incomplete"));
    });

    it("complete SES_* env is ignored unless EMAIL_PROVIDER=ses", async () => {
      settingsWith(null);
      envSes();
      expect(await resolveTransport()).toEqual(ENV_SMTP_RESULT);
      expect(createSesTransporter).not.toHaveBeenCalled();
    });

    it("an unreadable system settings document is logged and the env chain still applies", async () => {
      connectDB.mockRejectedValue(new Error("db down"));
      expect(await resolveTransport()).toEqual(ENV_SMTP_RESULT);
      expect(warn).toHaveBeenCalledWith(expect.objectContaining({ err: expect.any(Error) }), expect.stringMatching(/system email settings/i));
    });

    it("with the DB down and EMAIL_PROVIDER=ses, the env SES config is used", async () => {
      connectDB.mockRejectedValue(new Error("db down"));
      process.env.EMAIL_PROVIDER = "ses";
      envSes();
      const r = await resolveTransport();
      expect(r.provider).toBe("ses");
      expect(r.fromEmail).toBe("env-ses@mployedin.com");
    });
  });

  describe("secrets", () => {
    it("selects both encrypted secret paths", async () => {
      settingsWith({});
      await resolveTransport();
      const selected = String(selectSpy.mock.calls[0][0]);
      expect(selected).toContain("+smtp.smtpAppPassword");
      expect(selected).toContain("+email.ses.secretAccessKey");
    });

    it("uses secrets the model's read hook already decrypted as they are, with no decrypt warning", async () => {
      settingsWith({ smtp: { ...smtp, smtpAppPassword: "pw-plain" }, email: { provider: "ses", ses: { ...ses, secretAccessKey: "s3cr3t-plain" } } });
      await resolveTransport();
      expect(createSesTransporter).toHaveBeenCalledWith(expect.objectContaining({ secretAccessKey: "s3cr3t-plain" }));

      settingsWith({ smtp: { ...smtp, smtpAppPassword: "pw-plain" } });
      await resolveTransport();
      expect(createSmtpTransporter).toHaveBeenCalledWith(expect.objectContaining({ smtpAppPassword: "pw-plain" }));

      employerWith({ smtpOverride: { smtpEmail: "hr@acme.com", smtpAppPassword: "acme-plain", smtpHost: "smtp.acme.com", smtpPort: 465, smtpSecure: true } });
      await resolveTransport("emp-1");
      expect(createSmtpTransporter).toHaveBeenCalledWith(expect.objectContaining({ smtpAppPassword: "acme-plain" }));
      expect(warn).not.toHaveBeenCalled();
    });

    it("still warns when real ciphertext will not decrypt (a changed ENCRYPTION_KEY), on every path", async () => {
      settingsWith({ smtp: { ...smtp, smtpAppPassword: "bad:pw" } });
      await resolveTransport();
      expect(warn).toHaveBeenCalledWith(expect.objectContaining({ err: expect.any(Error) }), expect.stringContaining("System SMTP password decrypt failed"));
      employerWith({ smtpOverride: { smtpEmail: "hr@acme.com", smtpAppPassword: "bad:acme" } });
      await resolveTransport("emp-1");
      expect(warn).toHaveBeenCalledWith(expect.objectContaining({ employerId: "emp-1" }), expect.stringContaining("SMTP password decrypt failed"));
    });

    it("keeps a stored secret that will not decrypt and never logs it", async () => {
      settingsWith({ email: { provider: "ses", ses: { ...ses, secretAccessKey: "bad:plain-secret-value" } } });
      const r = await resolveTransport();
      expect(r.provider).toBe("ses");
      expect(createSesTransporter).toHaveBeenCalledWith(expect.objectContaining({ secretAccessKey: "bad:plain-secret-value" }));
      expect(warn).toHaveBeenCalled();
      expect(loggedText()).not.toContain("plain-secret-value");
    });

    it("never logs the SES secret when the config is incomplete", async () => {
      settingsWith({ smtp, email: { provider: "ses", ses: { ...ses, region: "", secretAccessKey: "enc:hunter2-secret" } } });
      await resolveTransport();
      expect(warn).toHaveBeenCalledWith(expect.stringContaining("incomplete"));
      expect(loggedText()).not.toContain("hunter2-secret");
    });

    it("loggedText looks inside Errors, so the secret assertions are not vacuous", () => {
      warn({ err: new Error("leak-me") }, "msg");
      expect(loggedText()).toContain("leak-me");
    });
  });
});
