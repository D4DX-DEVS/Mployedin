/**
 * Which recruitment invoices may coexist on one job (owner decision D1,
 * docs/plans/2026-11-24-agent-invoice-hires-target.md).
 *
 * - A hire (placement) is billed on at most one open invoice.
 * - A fee line that names no hire can't be told apart from another, so while
 *   any open invoice on a job has one, no second invoice is raised for that
 *   job (the old "one open invoice per job" rule, now only for unnamed fees).
 *   Without this, two hand-typed "Recruitment fee" invoices could bill the same
 *   people twice.
 *
 * "Open" = any status outside INVOICE_TERMINAL_STATUSES (drafts included: a
 * draft sent back to its agent still holds its hires).
 */

import mongoose from "mongoose";
import Invoice from "@/models/Invoice";
import { INVOICE_TERMINAL_STATUSES } from "@/lib/invoices/status";
import { isFeeLine } from "@/lib/invoices/linePlacements";

export interface BillingLine {
  placementId?: unknown;
  chargeType?: "placement" | "other";
}

export type HireBillingConflict =
  | { kind: "repeated_hire"; status: 400; error: string }
  | { kind: "hire_already_billed"; status: 409; error: string; invoiceNumber: string; placementIds: string[] }
  | { kind: "job_has_unnamed_fee"; status: 409; error: string; invoiceNumber: string };

const OPEN = { $nin: [...INVOICE_TERMINAL_STATUSES] };

/** Open recruitment invoices already holding any of these hires: placementId → invoice number. */
export async function findBilledPlacements(
  placementIds: string[],
  opts: { excludeInvoiceId?: string } = {},
): Promise<Map<string, string>> {
  const ids = [...new Set(placementIds)].filter((id) => mongoose.isValidObjectId(id));
  if (!ids.length) return new Map();
  const filter: Record<string, unknown> = {
    "lineItems.placementId": { $in: ids.map((id) => new mongoose.Types.ObjectId(id)) },
    status: OPEN,
  };
  if (opts.excludeInvoiceId) filter._id = { $ne: opts.excludeInvoiceId };
  const invoices = (await Invoice.find(filter).select("invoiceNumber lineItems.placementId").lean()) as Array<{
    invoiceNumber: string;
    lineItems?: Array<{ placementId?: unknown }>;
  }>;
  const wanted = new Set(ids);
  const billed = new Map<string, string>();
  for (const inv of invoices) {
    for (const line of inv.lineItems ?? []) {
      const id = line.placementId ? String(line.placementId) : null;
      if (id && wanted.has(id) && !billed.has(id)) billed.set(id, inv.invoiceNumber);
    }
  }
  return billed;
}

/** An open recruitment invoice on this job with a fee line that names no hire. */
export async function findOpenInvoiceWithUnnamedFee(
  jobId: string,
  opts: { employerId?: string } = {},
): Promise<{ _id: unknown; invoiceNumber: string; status: string } | null> {
  const filter: Record<string, unknown> = {
    category: "recruitment",
    jobId,
    status: OPEN,
    lineItems: { $elemMatch: { placementId: null, chargeType: { $ne: "other" } } },
  };
  if (opts.employerId) filter.employerId = opts.employerId;
  return (await Invoice.findOne(filter).select("_id invoiceNumber status").lean()) as {
    _id: unknown; invoiceNumber: string; status: string;
  } | null;
}

/**
 * Checks a new invoice's lines against the rules above. Returns the first
 * conflict, or null when the invoice may be raised.
 */
export async function checkHireBilling(
  jobId: string,
  lines: BillingLine[],
  opts: { employerId?: string } = {},
): Promise<HireBillingConflict | null> {
  const named = lines.flatMap((l) => (isFeeLine(l) && l.placementId ? [String(l.placementId)] : []));
  if (new Set(named).size !== named.length) {
    return { kind: "repeated_hire", status: 400, error: "The same hire is on more than one line." };
  }

  if (named.length) {
    const billed = await findBilledPlacements(named);
    if (billed.size) {
      const [invoiceNumber] = [...billed.values()];
      return {
        kind: "hire_already_billed",
        status: 409,
        error: billed.size === 1
          ? `A hire on this invoice is already billed on ${invoiceNumber}.`
          : `${billed.size} hires on this invoice are already billed on other invoices, starting with ${invoiceNumber}.`,
        invoiceNumber,
        placementIds: [...billed.keys()],
      };
    }
  }

  // Any open invoice on the job billing an unnamed fee blocks a second invoice,
  // and so does this invoice billing an unnamed fee while the job has any open
  // invoice — either way two invoices could bill the same unnamed people.
  const thisHasUnnamedFee = lines.some((l) => isFeeLine(l) && !l.placementId);
  const blocking = await findOpenInvoiceWithUnnamedFee(jobId, opts);
  if (blocking) {
    return {
      kind: "job_has_unnamed_fee",
      status: 409,
      error: `Invoice ${blocking.invoiceNumber} is already open for this job with a fee that names no hire. Link its hires first, or void it.`,
      invoiceNumber: blocking.invoiceNumber,
    };
  }
  if (thisHasUnnamedFee) {
    const filter: Record<string, unknown> = { category: "recruitment", jobId, status: OPEN };
    if (opts.employerId) filter.employerId = opts.employerId;
    const anyOpen = (await Invoice.findOne(filter).select("_id invoiceNumber status").lean()) as {
      invoiceNumber: string;
    } | null;
    if (anyOpen) {
      return {
        kind: "job_has_unnamed_fee",
        status: 409,
        error: `Invoice ${anyOpen.invoiceNumber} is already open for this job. Pick the hire each fee line bills to invoice this job again.`,
        invoiceNumber: anyOpen.invoiceNumber,
      };
    }
  }
  return null;
}
