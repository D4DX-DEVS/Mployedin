/**
 * POST /api/invoices/recruitment — Create a recruitment invoice against an employer/job.
 *
 * Production-grade: tax, discount, line items, billing details, payment terms,
 * commission auto-split, platform revenue calculation.
 * Accessible by: admin, super_agent, agent.
 */

import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/withAuth";
import { validateBody } from "@/lib/validators";
import { recruitmentInvoiceCreateSchema } from "@/lib/validators/subscriptions";
import { generateInvoiceNumber } from "@/lib/subscription/invoiceNumber";
import { logActivity, actorFromCtx } from "@/lib/audit/log";
import { resolveCommissionRate, resolveOverrideRate } from "@/lib/commissions/resolveRate";
import { createCommissionRecordsForInvoice } from "@/lib/invoices/commissionRecords";
import { INVOICE_TERMINAL_STATUSES } from "@/lib/invoices/status";
import { dispatchWebhook } from "@/lib/integrations/webhookDispatcher";
import connectDB from "@/lib/db/mongoose";
import Invoice from "@/models/Invoice";
import Job from "@/models/Job";
import Employer from "@/models/Employer";
import Agent from "@/models/Agent";
import SuperAgent from "@/models/SuperAgent";
import SystemSettings from "@/models/SystemSettings";
import type { UserRole } from "@/types/user";

interface AuthCtx { userId: string; role: UserRole; locale: string }

async function postHandler(req: NextRequest, ctx: AuthCtx) {
  if (!["admin", "super_agent", "agent"].includes(ctx.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await connectDB();

  const body = await validateBody(req, recruitmentInvoiceCreateSchema);
  const {
    jobId, employerId, amount, currency, notes, internalNotes,
    lineItems: rawLineItems, discountPercent = 0, taxType = "none",
    taxPercent = 0, serviceCharge = 0, paymentTerms = "net_30",
    customPaymentDays, dueDate, billingDetails, status: invoiceStatus = "issued",
    overrideAgentRate, overrideSuperAgentRate,
  } = body;
  const finalInvoiceStatus = ctx.role === "agent" ? "pending_approval" : invoiceStatus;

  // Validate job exists
  const job = await Job.findById(jobId).lean();
  if (!job) return NextResponse.json({ error: "Job not found" }, { status: 404 });

  // Validate employer exists
  const employer = await Employer.findById(employerId).lean();
  if (!employer) return NextResponse.json({ error: "Employer not found" }, { status: 404 });

  // Verify job belongs to employer
  if (job.employerId.toString() !== employerId) {
    return NextResponse.json({ error: "Job does not belong to the specified employer" }, { status: 400 });
  }

  const existingInvoice = await Invoice.findOne({
    category: "recruitment",
    jobId,
    employerId,
    status: { $nin: INVOICE_TERMINAL_STATUSES },
  }).select("_id invoiceNumber status").lean();

  if (existingInvoice) {
    return NextResponse.json({
      error: `Invoice ${existingInvoice.invoiceNumber} already exists for this job and employer`,
    }, { status: 409 });
  }

  // Determine agent
  const agentId = job.agentId ?? undefined;
  let agentDoc = null;
  let superAgentDoc = null;

  if (agentId) {
    agentDoc = await Agent.findById(agentId).lean();
    if (agentDoc?.superAgentId) {
      superAgentDoc = await SuperAgent.findById(agentDoc.superAgentId).lean();
    }
  }

  // Role-based access: agent can only create invoice for their own jobs
  if (ctx.role === "agent") {
    const myAgent = await Agent.findOne({ userId: ctx.userId }).select("_id").lean();
    if (!myAgent || (agentId && agentId.toString() !== myAgent._id.toString())) {
      return NextResponse.json({ error: "You can only create invoices for your assigned jobs" }, { status: 403 });
    }
  }

  // Resolve default currency
  const defaultCurrency = (await SystemSettings.findOne().lean())?.defaultCurrency ?? "AED";
  const invoiceCurrency = currency ?? defaultCurrency;

  // Build line items (if none provided, create single item from amount)
  const lineItems = (rawLineItems && rawLineItems.length > 0)
    ? rawLineItems.map((li: { description: string; quantity: number; unitPrice: number; amount: number; jobId?: string }) => ({
        description: li.description,
        quantity: li.quantity,
        unitPrice: li.unitPrice,
        amount: li.quantity * li.unitPrice,
        jobId: li.jobId ?? jobId,
      }))
    : [{ description: `Recruitment fee — ${job.title}`, quantity: 1, unitPrice: amount, amount, jobId }];

  const subtotal = lineItems.reduce((sum: number, li: { amount: number }) => sum + li.amount, 0);
  const discountAmount = Math.round((subtotal * discountPercent) / 100 * 100) / 100;
  const discountedSubtotal = subtotal - discountAmount;
  const taxAmount = Math.round((discountedSubtotal * taxPercent) / 100 * 100) / 100;
  const billedTotal = Math.round((discountedSubtotal + taxAmount + serviceCharge) * 100) / 100;

  // Auto-fill billing details from employer if not provided
  const finalBilling = billingDetails ?? {
    companyName: employer.companyName,
    contactPerson: undefined,
    email: employer.companyEmail,
    phone: employer.phone,
    address: employer.address,
    country: employer.country,
    taxId: employer.taxId,
  };

  // Build commission breakdown (embedded in invoice)
  // Admin/super_agent can override rates via overrideAgentRate/overrideSuperAgentRate
  const canOverride = ["admin", "super_agent"].includes(ctx.role);
  const employerCountry = employer.country ?? null;
  const commissions: Array<{
    agentId?: unknown; superAgentId?: unknown; role: "agent" | "super_agent";
    rate: number; amount: number; status: "pending"; notes: string;
  }> = [];
  const externalCommissions = [];

  // Determine effective agent commission rate
  const useAgentOverride = canOverride && overrideAgentRate !== undefined;
  const effectiveAgentRate = useAgentOverride ? overrideAgentRate : (agentDoc?.commissionRate ?? 0);

  if (agentDoc && effectiveAgentRate > 0) {
    let finalRate = effectiveAgentRate;
    let sourceNote = "";
    if (!useAgentOverride) {
      const resolved = await resolveCommissionRate(agentDoc.commissionRate, employerCountry);
      finalRate = resolved.rate;
      sourceNote = resolved.source === "country_override"
        ? ` [Country override: ${resolved.countryCode} → ${resolved.rate}%]` : "";
    } else {
      sourceNote = " [Manual override]";
    }
    const agentAmount = Math.round((billedTotal * finalRate) / 100 * 100) / 100;

    commissions.push({
      agentId: agentDoc._id,
      role: "agent",
      rate: finalRate,
      amount: agentAmount,
      status: "pending",
      notes: `Agent placement commission${sourceNote}`,
    });

    if (agentDoc.superAgentId) {
      commissions[commissions.length - 1].superAgentId = agentDoc.superAgentId;
    }
  }

  // Determine effective super-agent commission rate
  const useSAOverride = canOverride && overrideSuperAgentRate !== undefined;
  const effectiveSARate = useSAOverride ? overrideSuperAgentRate : (superAgentDoc?.overrideRate ?? 0);

  if (superAgentDoc && effectiveSARate > 0) {
    let finalRate = effectiveSARate;
    let sourceNote = "";
    if (!useSAOverride) {
      const resolved = await resolveOverrideRate(superAgentDoc.overrideRate, employerCountry);
      finalRate = resolved.rate;
      sourceNote = resolved.source === "country_override"
        ? ` [Country override: ${resolved.countryCode} → ${resolved.rate}%]` : "";
    } else {
      sourceNote = " [Manual override]";
    }
    const overrideAmount = Math.round((billedTotal * finalRate) / 100 * 100) / 100;

    commissions.push({
      superAgentId: superAgentDoc._id,
      role: "super_agent",
      rate: finalRate,
      amount: overrideAmount,
      status: "pending",
      notes: `Super-agent override commission${sourceNote}`,
    });

  }

  // Generate invoice
  const invoiceNumber = await generateInvoiceNumber();
  let invoice;
  try {
    invoice = await Invoice.create({
    invoiceNumber,
    category: "recruitment",
    userId: employer.userId,
    jobId,
    employerId,
    agentId: agentId ?? undefined,
    type: "recruitment",
    description: `Recruitment invoice for job: ${job.title}`,
    lineItems,
    subtotal,
    discountPercent,
    discountAmount,
    taxType,
    taxPercent,
    taxAmount,
    serviceCharge,
    totalAmount: billedTotal,
    amount: billedTotal,
    currency: invoiceCurrency,
    commissions,
    billingDetails: finalBilling,
    paymentTerms,
    customPaymentDays,
    dueDate: dueDate ? new Date(dueDate) : undefined,
    status: finalInvoiceStatus,
    issuedAt: finalInvoiceStatus === "issued" ? new Date() : undefined,
    notes,
    internalNotes,
    createdBy: ctx.userId,
    });
  } catch (err: unknown) {
    if ((err as { code?: number }).code === 11000) {
      return NextResponse.json({ error: "An active invoice already exists for this job and employer" }, { status: 409 });
    }
    throw err;
  }

  if (finalInvoiceStatus === "issued") {
    externalCommissions.push(...await createCommissionRecordsForInvoice({
      invoiceId: invoice._id,
      commissions: invoice.commissions ?? [],
      currency: invoiceCurrency,
    }));
  }

  // Audit log
  await logActivity({
    ...actorFromCtx(ctx),
    action: "invoice.create_recruitment",
    resource: "subscriptions",
    resourceId: String(invoice._id),
    meta: {
      jobId, employerId, subtotal, discountPercent, taxType, taxPercent,
      totalAmount: invoice.totalAmount, currency: invoiceCurrency, status: finalInvoiceStatus,
      commissionsCreated: externalCommissions.length,
    },
    req,
  });

  // Dispatch webhook
  dispatchWebhook("invoice.created", {
    invoiceId: String(invoice._id),
    invoiceNumber,
    category: "recruitment",
    subtotal,
    taxAmount: invoice.taxAmount,
    totalAmount: invoice.totalAmount,
    currency: invoiceCurrency,
    employerId,
    jobId,
    status: finalInvoiceStatus,
  });

  return NextResponse.json({
    invoice,
    commissions: externalCommissions,
    message: finalInvoiceStatus === "pending_approval"
      ? `Invoice ${invoiceNumber} submitted for approval.`
      : `Invoice ${invoiceNumber} created. ${externalCommissions.length} commission(s) auto-generated.`,
  }, { status: 201 });
}

export const POST = withAuth(postHandler, { resource: "subscriptions", action: "create" });
