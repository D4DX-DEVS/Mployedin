/**
 * @jest-environment node
 */
import { collectEnvErrors, collectEnvWarnings } from "@/lib/env";

const base = {
  MONGODB_URI: "mongodb://localhost/x",
  NEXTAUTH_SECRET: "a".repeat(32),
  ENCRYPTION_KEY: "0".repeat(64),
  CRON_SECRET: "b".repeat(24),
};

describe("collectEnvWarnings — SES group (warns, never fails boot)", () => {
  const SES_FULL = { SES_REGION: "eu-west-1", SES_ACCESS_KEY_ID: "AKIA1", SES_SECRET_ACCESS_KEY: "s", SES_FROM_EMAIL: "noreply@mployedin.com" };

  it("is silent unless EMAIL_PROVIDER is ses", () => {
    expect(collectEnvWarnings({ ...base })).toEqual([]);
    expect(collectEnvWarnings({ ...base, SES_REGION: "eu-west-1" })).toEqual([]);
    expect(collectEnvWarnings({ ...base, EMAIL_PROVIDER: "smtp" })).toEqual([]);
  });

  it("names every missing (or blank) SES_* value, reading EMAIL_PROVIDER trimmed and in any case", () => {
    const warnings = collectEnvWarnings({ ...base, EMAIL_PROVIDER: " SES ", SES_REGION: "eu-west-1", SES_FROM_EMAIL: "  " });
    expect(warnings).toHaveLength(3);
    for (const name of ["SES_ACCESS_KEY_ID", "SES_SECRET_ACCESS_KEY", "SES_FROM_EMAIL"]) expect(warnings.join("\n")).toContain(name);
    expect(warnings.join("\n")).not.toContain("SES_REGION ");
    // Says what is true at boot: the env SES tier is off. Where mail goes instead depends on what the admin saved, so it is not claimed.
    for (const w of warnings) {
      expect(w).toContain("the env SES fallback is off until all of SES_REGION, SES_ACCESS_KEY_ID, SES_SECRET_ACCESS_KEY, SES_FROM_EMAIL are set");
      expect(w).not.toMatch(/SMTP|goes out/);
    }
  });

  it("passes with the full group", () => {
    expect(collectEnvWarnings({ ...base, EMAIL_PROVIDER: "ses", ...SES_FULL })).toEqual([]);
  });

  it("is never a boot error", () => {
    expect(collectEnvErrors({ ...base, EMAIL_PROVIDER: "ses" })).toEqual([]);
  });
});

describe("collectEnvErrors — WhatsApp group", () => {
  it("passes with no WhatsApp keys", () => {
    expect(collectEnvErrors({ ...base })).toEqual([]);
  });
  it("names every missing key when the group is partial", () => {
    const errs = collectEnvErrors({ ...base, WHATSAPP_ACCESS_TOKEN: "t" });
    expect(errs).toHaveLength(3);
    expect(errs.join("\n")).toMatch(/WHATSAPP_PHONE_NUMBER_ID/);
    expect(errs.join("\n")).toMatch(/WHATSAPP_APP_SECRET/);
    expect(errs.join("\n")).toMatch(/WHATSAPP_WEBHOOK_VERIFY_TOKEN/);
  });
  it("passes with the full group", () => {
    expect(collectEnvErrors({ ...base, WHATSAPP_ACCESS_TOKEN: "t", WHATSAPP_PHONE_NUMBER_ID: "1", WHATSAPP_APP_SECRET: "s", WHATSAPP_WEBHOOK_VERIFY_TOKEN: "v" })).toEqual([]);
  });
});
