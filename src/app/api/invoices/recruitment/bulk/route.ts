/**
 * POST /api/invoices/recruitment/bulk
 *
 * Generate multiple recruitment invoices in a single operation.
 * Admin-only. Accepts an array of placement IDs and generates invoices
 * with smart defaults (salary from placement, tax from country, commissions from agent setup).
 */

import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/withAuth";
import { validateBody } from "@/lib/validators";
import { z } from "zod";
import { commonSchemas } from "@/lib/validators";
import { generateInvoiceNumber } from "@/lib/subscription/invoiceNumber";
import { logActivity, actorFromCtx } from "@/lib/audit/log";
import { resolveCommissionRate, resolveOverrideRate } from "@/lib/commissions/resolveRate";
import { commissionBase } from "@/lib/invoices/linePlacements";
import type { DatedRate } from "@/lib/commissions/effectiveRate";
import { createCommissionRecordsForInvoice } from "@/lib/invoices/commissionRecords";
import { findBilledPlacements, findOpenInvoiceWithUnnamedFee } from "@/lib/invoices/hireBilling";
import { INTERNATIONAL_TAX_PRESETS } from "@/lib/invoices/taxPresets";
import { dispatchWebhook } from "@/lib/integrations/webhookDispatcher";
import connectDB from "@/lib/db/mongoose";
import { acquireLease, releaseLease } from "@/lib/db/lease";
import Invoice from "@/models/Invoice";
import Placement from "@/models/Placement";
import Job from "@/models/Job";
import Employer from "@/models/Employer";
import Agent from "@/models/Agent";
import SuperAgent from "@/models/SuperAgent";
import SystemSettings from "@/models/SystemSettings";
import type { UserRole } from "@/types/user";

const bulkInvoiceSchema = z.object({
  placementIds: z.array(commonSchemas.objectId).min(1).max(50),
  taxType: z.enum(["gst", "vat", "reverse_charge", "none"]).default("none"),
  taxPercent: z.number().min(0).max(100).default(0),
  autoDetectTax: z.boolean().default(true),
  paymentTerms: z.enum(["immediate", "net_7", "net_15", "net_30", "net_45", "net_60", "net_90", "custom"]).default("net_30"),
  currency: z.string().length(3).optional(),
  status: z.enum(["draft", "issued"]).default("issued"),
});

interface AuthCtx { userId: string; role: UserRole; locale: string }

async function postHandler(req: NextRequest, ctx: AuthCtx) {
  if (ctx.role !== "admin") {
    return NextResponse.json({ error: "Bulk invoice generation is admin-only" }, { status: 403 });
  }

  await connectDB();

  const body = await validateBody(req, bulkInvoiceSchema);
  const { placementIds, taxType: defaultTaxType, taxPercent: defaultTaxPercent, autoDetectTax, paymentTerms, currency, status: invoiceStatus } = body;

  // Resolve default currency
  const defaultCurrency = currency ?? (await SystemSettings.findOne().lean())?.defaultCurrency ?? "AED";

  // Fetch all placements with populated data
  const placements = await Placement.find({ _id: { $in: placementIds } })
    .populate("jobId", "title employerId agentId salary currency")
    .populate("employerId", "companyName companyEmail phone address country taxId userId agentCommissionRates")
    .populate("agentId", "userId commissionRate superAgentId")
    .lean();

  if (placements.length === 0) {
    return NextResponse.json({ error: "No valid placements found" }, { status: 404 });
  }

  // A hire is billed on one open invoice only, and a job whose open invoice
  // bills an unnamed fee takes no more invoices (lib/invoices/hireBilling).
  const billedPlacements = await findBilledPlacements(placements.map((p) => String(p._id)));
  const unnamedFeeByJob = new Map<string, string | null>();
  const unnamedFeeInvoice = async (jobIdStr: string): Promise<string | null> => {
    if (!unnamedFeeByJob.has(jobIdStr)) {
      unnamedFeeByJob.set(jobIdStr, (await findOpenInvoiceWithUnnamedFee(jobIdStr))?.invoiceNumber ?? null);
    }
    return unnamedFeeByJob.get(jobIdStr) ?? null;
  };

  const results: Array<{
    placementId: string;
    status: "created" | "skipped" | "error";
    invoiceNumber?: string;
    invoiceId?: string;
    reason?: string;
    totalAmount?: number;
  }> = [];

  for (const placement of placements) {
    const job = placement.jobId as {
      _id?: unknown; title?: string; employerId?: unknown;
      agentId?: unknown; salary?: number; currency?: string;
    } | null;

    if (!job?._id) {
      results.push({ placementId: String(placement._id), status: "skipped", reason: "No job linked to placement" });
      continue;
    }

    const jobIdStr = String(job._id);
    const placementIdStr = String(placement._id);
    const billedOn = billedPlacements.get(placementIdStr);
    if (billedOn) {
      results.push({ placementId: placementIdStr, status: "skipped", reason: `Hire already billed on ${billedOn}` });
      continue;
    }
    const unnamedOn = await unnamedFeeInvoice(jobIdStr);
    if (unnamedOn) {
      results.push({ placementId: placementIdStr, status: "skipped", reason: `Invoice ${unnamedOn} bills this job with a fee that names no hire` });
      continue;
    }

    const emp = placement.employerId as {
      _id?: unknown; companyName?: string; companyEmail?: string;
      phone?: string; address?: string; country?: string; taxId?: string; userId?: unknown;
      agentCommissionRates?: DatedRate[];
    } | null;

    if (!emp?._id) {
      results.push({ placementId: String(placement._id), status: "skipped", reason: "No employer linked" });
      continue;
    }

    // The existing-invoice lookup above is a snapshot: two bulk runs started
    // together both see "not invoiced" and would each bill the job. The lease
    // makes one of them skip; the re-check catches a run that finished between
    // our snapshot and this point.
    const leaseKey = `invoice:recruitment:${jobIdStr}`;
    if (!(await acquireLease(leaseKey, 2 * 60_000))) {
      results.push({ placementId: String(placement._id), status: "skipped", reason: "Another request is invoicing this job right now" });
      continue;
    }
    const racedOn = (await findBilledPlacements([placementIdStr])).get(placementIdStr)
      ?? (await findOpenInvoiceWithUnnamedFee(jobIdStr))?.invoiceNumber;
    if (racedOn) {
      await releaseLease(leaseKey);
      results.push({ placementId: placementIdStr, status: "skipped", reason: `Hire already billed on ${racedOn}` });
      continue;
    }

    let invoiceCreated = false;
    try {
      // Determine amount from placement salary or job salary
      const amount = placement.salary ?? job.salary ?? 0;
      if (amount <= 0) {
        results.push({ placementId: String(placement._id), status: "skipped", reason: "No salary/amount data available" });
        continue;
      }

      const invoiceCurrency = placement.currency ?? job.currency ?? defaultCurrency;

      // Determine tax based on employer country
      let taxType = defaultTaxType;
      let taxPercent = defaultTaxPercent;
      if (autoDetectTax && emp.country) {
        const countryPreset = INTERNATIONAL_TAX_PRESETS.find(
          (t) => t.countryCode.toUpperCase() === emp.country!.toUpperCase() ||
                 t.country.toLowerCase() === emp.country!.toLowerCase()
        );
        if (countryPreset) {
          taxType = countryPreset.taxType as typeof taxType;
          taxPercent = countryPreset.defaultRate;
        }
      }

      // Get agent data
      const agentRef = placement.agentId as { _id?: unknown; commissionRate?: number; superAgentId?: unknown } | null;
      let agentDoc = null;
      let superAgentDoc = null;

      if (agentRef?._id) {
        agentDoc = await Agent.findById(agentRef._id).lean();
        if (agentDoc?.superAgentId) {
          superAgentDoc = await SuperAgent.findById(agentDoc.superAgentId).lean();
        }
      }

      // Build line item
      const lineItems = [{
        description: `Recruitment placement fee — ${job.title}`,
        quantity: 1,
        unitPrice: amount,
        amount,
        jobId: job._id,
        placementId: placement._id,
      }];

      const subtotal = amount;
      const discountAmount = 0;
      const taxAmount = Math.round((subtotal * taxPercent) / 100 * 100) / 100;
      const billedTotal = Math.round((subtotal + taxAmount) * 100) / 100;

      // Build commissions
      const employerCountry = emp.country ?? null;
      // Commission is paid on the invoice total minus tax (owner rule, 2026-11-18); no discount or service charge here.
      const base = commissionBase(subtotal, 0);
      const invoiceDate = new Date();
      const commissions: Array<{
        agentId?: unknown; superAgentId?: unknown; role: "agent" | "super_agent";
        rate: number; amount: number; status: "pending"; notes: string;
      }> = [];

      const agentResolved = agentDoc
        ? await resolveCommissionRate(agentDoc.commissionRate ?? 0, employerCountry, { history: emp.agentCommissionRates, on: invoiceDate })
        : null;
      if (agentDoc && agentResolved && agentResolved.rate > 0) {
        const resolved = agentResolved;
        const agentAmount = Math.round((base * resolved.rate) / 100 * 100) / 100;
        const sourceNote = resolved.source === "country_override"
          ? ` [Country override: ${resolved.countryCode} → ${resolved.rate}%]`
          : resolved.source === "employer_rate" ? " [Employer rate]" : "";

        commissions.push({
          agentId: agentDoc._id,
          role: "agent",
          rate: resolved.rate,
          amount: agentAmount,
          status: "pending",
          notes: `Agent placement commission${sourceNote}`,
        });
        if (agentDoc.superAgentId) {
          commissions[commissions.length - 1].superAgentId = agentDoc.superAgentId;
        }
      }

      const saResolved = superAgentDoc
        ? await resolveOverrideRate(superAgentDoc.overrideRate ?? 0, employerCountry, { history: superAgentDoc.overrideRateHistory, on: invoiceDate })
        : null;
      if (superAgentDoc && saResolved && saResolved.rate > 0) {
        const resolved = saResolved;
        const overrideAmount = Math.round((base * resolved.rate) / 100 * 100) / 100;
        const sourceNote = resolved.source === "country_override"
          ? ` [Country override: ${resolved.countryCode} → ${resolved.rate}%]` : "";

        commissions.push({
          superAgentId: superAgentDoc._id,
          role: "super_agent",
          rate: resolved.rate,
          amount: overrideAmount,
          status: "pending",
          notes: `Super-agent override commission${sourceNote}`,
        });
      }

      // Validate combined rate doesn't exceed 100%
      const combinedRate = commissions.reduce((sum, c) => sum + c.rate, 0);
      if (combinedRate > 100) {
        results.push({
          placementId: String(placement._id),
          status: "skipped",
          reason: `Combined commission rate (${combinedRate.toFixed(1)}%) exceeds 100%`,
        });
        continue;
      }

      const invoiceNumber = await generateInvoiceNumber();

      const invoice = await Invoice.create({
        invoiceNumber,
        category: "recruitment",
        userId: emp.userId,
        jobId: job._id,
        employerId: emp._id,
        agentId: agentDoc?._id ?? undefined,
        type: "recruitment",
        description: `Recruitment invoice for job: ${job.title}`,
        lineItems,
        subtotal,
        discountPercent: 0,
        discountAmount,
        taxType,
        taxPercent,
        taxAmount,
        serviceCharge: 0,
        totalAmount: billedTotal,
        amount: billedTotal,
        currency: invoiceCurrency,
        commissions,
        billingDetails: {
          companyName: emp.companyName,
          email: emp.companyEmail,
          phone: emp.phone,
          address: emp.address,
          country: emp.country,
          taxId: emp.taxId,
        },
        paymentTerms,
        status: invoiceStatus,
        issuedAt: invoiceStatus === "issued" ? new Date() : undefined,
        internalNotes: `Bulk-generated from placement ${placement._id}`,
        createdBy: ctx.userId,
      });
      invoiceCreated = true;

      // Create external commission records if issued
      if (invoiceStatus === "issued") {
        await createCommissionRecordsForInvoice({
          invoiceId: invoice._id,
          commissions: invoice.commissions ?? [],
          currency: invoiceCurrency,
        });
      }

      // This hire is now billed; a repeat of it later in the batch skips.
      billedPlacements.set(placementIdStr, invoiceNumber);

      // Dispatch webhook
      dispatchWebhook("invoice.created", {
        invoiceId: String(invoice._id),
        invoiceNumber,
        category: "recruitment",
        totalAmount: billedTotal,
        currency: invoiceCurrency,
        employerId: String(emp._id),
        jobId: jobIdStr,
        status: invoiceStatus,
        bulkGenerated: true,
      }, { employerId: emp._id });

      results.push({
        placementId: String(placement._id),
        status: "created",
        invoiceNumber,
        invoiceId: String(invoice._id),
        totalAmount: billedTotal,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      results.push({ placementId: String(placement._id), status: "error", reason: message });
    } finally {
      // Once the invoice exists the lookup guards the job; until then free it for a retry.
      if (!invoiceCreated) await releaseLease(leaseKey).catch(() => undefined);
    }
  }

  const created = results.filter((r) => r.status === "created").length;
  const skipped = results.filter((r) => r.status === "skipped").length;
  const errors = results.filter((r) => r.status === "error").length;

  // Audit log
  await logActivity({
    ...actorFromCtx(ctx),
    action: "invoice.bulk_create_recruitment",
    resource: "invoices",
    meta: { placementCount: placementIds.length, created, skipped, errors },
    req,
  });

  return NextResponse.json({
    results,
    summary: { created, skipped, errors, total: placementIds.length },
    message: `${created} invoice(s) created, ${skipped} skipped, ${errors} error(s).`,
  }, { status: 201 });
}

export const POST = withAuth(postHandler, { resource: "invoices", action: "create" });
