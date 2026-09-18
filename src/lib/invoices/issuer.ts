/**
 * Who issues the invoice — the FROM block on every PDF.
 *
 * Invoices used to print only a logo, so a downloaded document named no legal
 * entity, no registered address, no tax registration and no way to pay. The
 * details live in SystemSettings (admin ▸ Settings ▸ Invoice issuer) rather
 * than in code, because a company address or tax number changing should not
 * need a deploy. Anything left blank is omitted from the PDF, never printed
 * as an empty label.
 */

import connectDB from "@/lib/db/mongoose";
import SystemSettings from "@/models/SystemSettings";
import logger from "@/lib/logger";

export type InvoiceIssuerBank = {
  bankName?: string;
  accountName?: string;
  accountNumber?: string;
  iban?: string;
  swift?: string;
  branch?: string;
  instructions?: string;
};

export type ResolvedIssuer = {
  legalName: string;
  addressLines: string[];
  country?: string;
  taxRegNo?: string;
  email?: string;
  phone?: string;
  website?: string;
  bank?: InvoiceIssuerBank;
  footerNote?: string;
  /** True once bank details exist and payment instructions can be printed. */
  hasBankDetails: boolean;
};

function clean(value?: string | null): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

/**
 * Shape the stored settings into what the PDF needs.
 *
 * Exported separately from the database read so it can be unit-tested and so
 * callers that already hold a settings document do not query again.
 */
export function buildIssuer(
  issuer: Record<string, unknown> | null | undefined,
  defaults: { platformName?: string; supportEmail?: string } = {},
): ResolvedIssuer {
  const raw = (issuer ?? {}) as {
    legalName?: string;
    addressLines?: string[];
    country?: string;
    taxRegNo?: string;
    email?: string;
    phone?: string;
    website?: string;
    bank?: InvoiceIssuerBank;
    footerNote?: string;
  };

  const bankEntries: InvoiceIssuerBank = {
    bankName: clean(raw.bank?.bankName),
    accountName: clean(raw.bank?.accountName),
    accountNumber: clean(raw.bank?.accountNumber),
    iban: clean(raw.bank?.iban),
    swift: clean(raw.bank?.swift),
    branch: clean(raw.bank?.branch),
    instructions: clean(raw.bank?.instructions),
  };
  // Instructions alone are not payment details — an employer cannot pay a note.
  const hasBankDetails = Boolean(
    bankEntries.bankName || bankEntries.accountNumber || bankEntries.iban,
  );

  return {
    legalName: clean(raw.legalName) ?? clean(defaults.platformName) ?? "MPLOYEDIN",
    addressLines: (raw.addressLines ?? []).map((l) => clean(l)).filter((l): l is string => Boolean(l)),
    country: clean(raw.country),
    taxRegNo: clean(raw.taxRegNo),
    email: clean(raw.email) ?? clean(defaults.supportEmail),
    phone: clean(raw.phone),
    website: clean(raw.website),
    bank: hasBankDetails || bankEntries.instructions ? bankEntries : undefined,
    footerNote: clean(raw.footerNote),
    hasBankDetails,
  };
}

/**
 * Read the issuer from system settings.
 *
 * Never throws: a PDF that loses its FROM block is better than a download that
 * 500s, so a settings read failure falls back to the platform defaults.
 */
export async function getInvoiceIssuer(): Promise<ResolvedIssuer> {
  try {
    await connectDB();
    const settings = await SystemSettings.findOne()
      .select("invoiceIssuer platformName supportEmail")
      .lean<{
        invoiceIssuer?: Record<string, unknown>;
        platformName?: string;
        supportEmail?: string;
      }>();

    return buildIssuer(settings?.invoiceIssuer, {
      platformName: settings?.platformName,
      supportEmail: settings?.supportEmail,
    });
  } catch (err) {
    logger.error({ err }, "Failed to load invoice issuer settings; using defaults");
    return buildIssuer(null);
  }
}
