import logger from "@/lib/logger";
import type { ResolvedTransport, SmtpConfig } from "./types";
import { createSmtpTransporter, envFromEmail, getEnvTransporter } from "./transports/smtp";
import { createSesTransporter, isSesConfigComplete, sesEnvConfig, type SesConfig } from "./transports/ses";

/** The slice of SystemSettings this resolver reads (a lean document: secrets still encrypted). */
interface StoredEmailSettings {
  smtp?: Partial<SmtpConfig>;
  email?: { provider?: "smtp" | "ses"; ses?: Partial<SesConfig> };
}

/**
 * Resolve the transporter and sender in order:
 *  1. Employer SMTP override (if employerId provided and employer has custom SMTP)
 *  2. SES, when the admin chose it in Settings (SystemSettings.email.provider) and its config is complete
 *  3. System-wide SMTP from DB (SystemSettings.smtp) — provider "smtp", unset, or SES incomplete
 *  4. Env SES (EMAIL_PROVIDER=ses + SES_*), only when the admin saved no provider choice
 *  5. Environment variable based SMTP transporter
 */
export async function resolveTransport(employerId?: string): Promise<ResolvedTransport> {
  // 1. Try employer-level SMTP override
  if (employerId) {
    try {
      const { connectDB } = await import("@/lib/db/mongoose");
      await connectDB();
      const { Employer } = await import("@/models/Employer");
      const employer = await Employer.findById(employerId)
        .select("+smtpOverride.smtpAppPassword")
        .lean();
      if (employer?.smtpOverride?.smtpEmail && employer.smtpOverride.smtpAppPassword) {
        const { decryptIfEncrypted } = await import("@/lib/security/encryption");
        let password = employer.smtpOverride.smtpAppPassword;
        // ponytail: enforce encrypt-on-save upstream
        // Plaintext (a read hook decrypted it, or it was saved before encryption) passes through; only real ciphertext that fails warns.
        try { password = decryptIfEncrypted(password); } catch (err) { logger.warn({ err, employerId }, "SMTP password decrypt failed, using plaintext fallback"); }
        const smtp: SmtpConfig = {
          smtpEmail: employer.smtpOverride.smtpEmail,
          smtpAppPassword: password,
          smtpHost: employer.smtpOverride.smtpHost,
          smtpPort: employer.smtpOverride.smtpPort,
          smtpSecure: employer.smtpOverride.smtpSecure,
        };
        return { transporter: createSmtpTransporter(smtp), fromEmail: smtp.smtpEmail, provider: "smtp" };
      }
    } catch (err) {
      logger.warn({ err, employerId }, "Employer SMTP override lookup failed, using the system-wide transport");
    }
  }

  // 2. System-wide provider chosen by the admin (SystemSettings.email.provider), read once.
  let dbSettings: StoredEmailSettings | null = null;
  try {
    const { connectDB } = await import("@/lib/db/mongoose");
    await connectDB();
    const { default: SystemSettings } = await import("@/models/SystemSettings");
    dbSettings = (await SystemSettings.findOne().select("+smtp.smtpAppPassword +email.ses.secretAccessKey").lean()) as StoredEmailSettings | null;
  } catch (err) {
    logger.warn({ err }, "System email settings could not be read, using environment configuration");
  }

  if (dbSettings?.email?.provider === "ses") {
    const raw = dbSettings.email.ses;
    if (raw) {
      let secret = raw.secretAccessKey ?? "";
      if (secret) {
        // SystemSettings' read hook has normally decrypted it already: plaintext passes through, real ciphertext that fails warns.
        const { decryptIfEncrypted } = await import("@/lib/security/encryption");
        try { secret = decryptIfEncrypted(secret); } catch (err) { logger.warn({ err }, "SES secret decrypt failed, using stored value"); }
      }
      const ses: Partial<SesConfig> = { ...raw, secretAccessKey: secret };
      if (isSesConfigComplete(ses)) {
        return { transporter: createSesTransporter(ses), fromEmail: ses.fromEmail, fromName: ses.fromName, provider: "ses", sesConfigurationSet: ses.configurationSet };
      }
    }
    // Reached when `ses` is missing or incomplete.
    logger.warn("SES is the chosen email provider but its settings are incomplete; falling back to SMTP");
  }

  // 3. System-wide SMTP from DB (provider "smtp", unset, or SES incomplete)
  if (dbSettings?.smtp?.smtpEmail && dbSettings.smtp.smtpAppPassword) {
    const { decryptIfEncrypted } = await import("@/lib/security/encryption");
    let password = dbSettings.smtp.smtpAppPassword;
    // ponytail: enforce encrypt-on-save upstream
    try { password = decryptIfEncrypted(password); } catch (err) { logger.warn({ err }, "System SMTP password decrypt failed, using plaintext fallback"); }
    const smtp: SmtpConfig = {
      smtpEmail: dbSettings.smtp.smtpEmail,
      smtpAppPassword: password,
      smtpHost: dbSettings.smtp.smtpHost,
      smtpPort: dbSettings.smtp.smtpPort,
      smtpSecure: dbSettings.smtp.smtpSecure,
    };
    return { transporter: createSmtpTransporter(smtp), fromEmail: smtp.smtpEmail, provider: "smtp" };
  }

  // 4. Env SES (EMAIL_PROVIDER=ses + SES_*), only when the admin saved no provider choice. " SES" counts too.
  if (!dbSettings?.email?.provider && process.env.EMAIL_PROVIDER?.trim().toLowerCase() === "ses") {
    const ses = sesEnvConfig();
    if (ses) {
      return { transporter: createSesTransporter(ses), fromEmail: ses.fromEmail, fromName: ses.fromName, provider: "ses", sesConfigurationSet: ses.configurationSet };
    }
    logger.warn("EMAIL_PROVIDER=ses but SES_* is incomplete; falling back to SMTP env");
  }

  // 5. Env SMTP chain
  return { transporter: getEnvTransporter(), fromEmail: envFromEmail(), provider: "smtp" };
}
