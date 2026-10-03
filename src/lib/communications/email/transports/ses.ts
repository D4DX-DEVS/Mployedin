import { createHash } from "node:crypto";
import nodemailer from "nodemailer";
import { SESv2Client, SendEmailCommand } from "@aws-sdk/client-sesv2";

export interface SesConfig {
  /** e.g. "eu-west-1" — must be the region where the From identity is verified. */
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  /** A verified SES identity (address or domain). */
  fromEmail: string;
  fromName?: string;
  /** Optional configuration set for bounce/complaint event publishing. */
  configurationSet?: string;
}

export function isSesConfigComplete(c: Partial<SesConfig> | null | undefined): c is SesConfig {
  return Boolean(c && c.region && c.accessKeyId && c.secretAccessKey && c.fromEmail);
}

/**
 * SES_* env — the fallback when the admin has not saved a provider in Settings. Values are trimmed
 * (a stray space or newline from editing .env would otherwise break the credentials), and one that
 * is only whitespace counts as missing.
 */
export function sesEnvConfig(): SesConfig | null {
  const env = (name: string): string | undefined => process.env[name]?.trim() || undefined;
  const c: Partial<SesConfig> = {
    region: env("SES_REGION"),
    accessKeyId: env("SES_ACCESS_KEY_ID"),
    secretAccessKey: env("SES_SECRET_ACCESS_KEY"),
    fromEmail: env("SES_FROM_EMAIL"),
    fromName: env("SES_FROM_NAME"),
    configurationSet: env("SES_CONFIGURATION_SET"),
  };
  return isSesConfigComplete(c) ? c : null;
}

const sesTransporterCache = new Map<string, nodemailer.Transporter>();

/**
 * One transporter per credential set (a rotated secret makes a new entry). SES
 * has no connection to pool; the cache only avoids re-creating the SDK client on
 * every send.
 *
 * ponytail: nodemailer 9's SES transport has no `sendingRate` / `maxConnections`,
 * so nothing throttles here. A burst above the account's SES rate (14/s in
 * production, 1/s in the sandbox) comes back as a Throttling error and is logged
 * as a failed send. The only pacing is the Inngest functions' own concurrency
 * (account cap 5, new functions use `concurrency: { limit: 1 }`).
 */
export function createSesTransporter(config: SesConfig): nodemailer.Transporter {
  const key = [config.region, config.accessKeyId, config.fromEmail, createHash("sha256").update(config.secretAccessKey).digest("hex").slice(0, 12)].join("|");
  const cached = sesTransporterCache.get(key);
  if (cached) return cached;

  const sesClient = new SESv2Client({
    region: config.region,
    credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
  });
  const transporter = nodemailer.createTransport({
    SES: { sesClient, SendEmailCommand },
  });
  sesTransporterCache.set(key, transporter);
  return transporter;
}
