/**
 * Payer details for invoices that do not carry their own.
 *
 * Recruitment invoices are raised against an employer and snapshot the billing
 * address onto the invoice. Subscription invoices are written by the renewal
 * cron against `userId` alone — no `employerId`, no `billingDetails` — so every
 * renewal PDF printed "BILL TO —" and the dialog hid the block entirely.
 *
 * Resolving it here keeps the lookup out of the generator, which stays pure.
 */

import Employer from "@/models/Employer";
import User from "@/models/User";
import logger from "@/lib/logger";
import type { BillToFallback } from "./presentation";

type InvoiceOwner = {
  userId?: unknown;
  employerId?: unknown;
  billingDetails?: { companyName?: string } | null;
};

/**
 * Look up the payer behind `userId`, or return undefined when the invoice
 * already names one. Never throws — a missing bill-to block is better than a
 * failed download.
 */
export async function resolveBillToFallback(
  invoice: InvoiceOwner,
): Promise<BillToFallback | undefined> {
  // Already answerable from the invoice itself.
  if (invoice.employerId || invoice.billingDetails?.companyName) return undefined;
  if (!invoice.userId) return undefined;

  try {
    const employer = await Employer.findOne({ userId: invoice.userId })
      // taxId is `select: false` on the schema, so it needs asking for by name.
      .select("companyName companyEmail phone address country +taxId")
      .lean<{
        companyName?: string;
        companyEmail?: string;
        phone?: string;
        address?: string;
        country?: string;
        taxId?: string;
      }>();

    if (employer) {
      return {
        companyName: employer.companyName,
        email: employer.companyEmail,
        phone: employer.phone,
        address: employer.address,
        country: employer.country,
        taxId: employer.taxId,
      };
    }

    // Not an employer — a job seeker or staff subscription. The account holder
    // is the payer.
    const user = await User.findById(invoice.userId).select("name email phone").lean<{
      name?: string;
      email?: string;
      phone?: string;
    }>();
    if (!user) return undefined;

    return { companyName: user.name, contactPerson: user.name, email: user.email, phone: user.phone };
  } catch (err) {
    logger.error({ err }, "Failed to resolve invoice bill-to fallback");
    return undefined;
  }
}
