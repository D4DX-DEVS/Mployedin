/**
 * @jest-environment node
 */
process.env.ENCRYPTION_KEY = "ab".repeat(32);

import SystemSettings from "@/models/SystemSettings";
import { decrypt } from "@/lib/security/encryption";

/**
 * Regression guard for the SES provider settings: a path missing from the schema is
 * stripped by Mongoose's strict mode (the admin route answers 200 and stores nothing),
 * and a secret that is not `select: false` + encrypted would leak through every read.
 */
describe("SystemSettings schema, email provider", () => {
  it.each([
    ["email.provider", "String"],
    ["email.ses.region", "String"],
    ["email.ses.accessKeyId", "String"],
    ["email.ses.secretAccessKey", "String"],
    ["email.ses.fromEmail", "String"],
    ["email.ses.fromName", "String"],
    ["email.ses.configurationSet", "String"],
  ])("declares %s as a %s", (path, instance) => {
    const schemaPath = SystemSettings.schema.path(path);
    expect(schemaPath).toBeDefined();
    expect(schemaPath.instance).toBe(instance);
  });

  it("never selects the SES secret by default, like the SMTP password", () => {
    expect(SystemSettings.schema.path("email.ses.secretAccessKey").options.select).toBe(false);
    expect(SystemSettings.schema.path("smtp.smtpAppPassword").options.select).toBe(false);
  });

  it("bounds the free-text fields", () => {
    expect(SystemSettings.schema.path("email.ses.secretAccessKey").options.maxlength).toBe(500);
    expect(SystemSettings.schema.path("email.ses.region").options.maxlength).toBe(32);
    expect(SystemSettings.schema.path("email.ses.configurationSet").options.maxlength).toBe(64);
  });

  // setDefaultsOnInsert writes a schema default through $setOnInsert on every settings upsert
  // (admin settings GET/POST, GDPR terms version). A default here would make `email.provider`
  // look admin-chosen on a fresh database and make resolveTransport's env SES tier unreachable.
  it("has no schema default for email.provider, so an unset choice stays unset", () => {
    expect(SystemSettings.schema.path("email.provider").options.default).toBeUndefined();
    expect(new SystemSettings({}).email?.provider).toBeUndefined();
  });

  it("accepts smtp and ses and rejects any other provider", async () => {
    await expect(new SystemSettings({ email: { provider: "ses" } }).validate()).resolves.toBeUndefined();
    await expect(new SystemSettings({ email: { provider: "smtp" } }).validate()).resolves.toBeUndefined();
    await expect(new SystemSettings({ email: { provider: "mailgun" } }).validate()).rejects.toThrow(/email\.provider/);
  });

  it("encrypts the SES secret and the SMTP password on save, and only once", async () => {
    const insertOne = jest.spyOn(SystemSettings.collection, "insertOne").mockResolvedValue({ acknowledged: true, insertedId: "x" } as never);
    try {
      const doc = new SystemSettings({
        smtp: { smtpEmail: "a@mployedin.com", smtpAppPassword: "app-pw" },
        email: { provider: "ses", ses: { region: "eu-west-1", accessKeyId: "AKIA1", secretAccessKey: "plain-secret", fromEmail: "ses@mployedin.com" } },
      });
      await doc.save();
      const stored = insertOne.mock.calls[0][0] as { smtp: { smtpAppPassword: string }; email: { ses: { secretAccessKey: string } } };
      expect(stored.email.ses.secretAccessKey).not.toBe("plain-secret");
      expect(decrypt(stored.email.ses.secretAccessKey)).toBe("plain-secret");
      expect(decrypt(stored.smtp.smtpAppPassword)).toBe("app-pw");

      // A second pass over an already-encrypted value must not double-encrypt it.
      const once = stored.email.ses.secretAccessKey;
      doc.isNew = true;
      await doc.save();
      const again = insertOne.mock.calls[1][0] as { email: { ses: { secretAccessKey: string } } };
      expect(again.email.ses.secretAccessKey).toBe(once);
    } finally {
      insertOne.mockRestore();
    }
  });
});
