/**
 * POST /api/invoices/recruitment — Create a recruitment invoice against an employer/job.
 *
 * Auto-generates commissions for the assigned agent & super-agent based on their rates.
 * Accessible by: admin, super_agent, agent.
 */

import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/withAuth";
import { validateBody } from "@/lib/validators";
import { recruitmentInvoiceCreateSchema } from "@/lib/validators/subscriptions";
import { generateInvoiceNumber } from "@/lib/subscription/invoiceNumber";
import { logActivity, actorFromCtx } from "@/lib/audit/log";
import { resolveCommissionRate, resolveOverrideRate } from "@/lib/commissions/resolveRate";
import { dispatchWebhook } from "@/lib/integrations/webhookDispatcher";
import connectDB from "@/lib/db/mongoose";
import Invoice from "@/models/Invoice";
import Job from "@/models/Job";
import Employer from "@/models/Employer";
import Agent from "@/models/Agent";
import SuperAgent from "@/models/SuperAgent";
import Commission from "@/models/Commission";
import SystemSettings from "@/models/SystemSettings";
import type { UserRole } from "@/types/user";

interface AuthCtx { userId: string; role: UserRole; locale: string }

async function postHandler(req: NextRequest, ctx: AuthCtx) {
  await connectDB();

  const body = await validateBody(req, recruitmentInvoiceCreateSchema);
  const { jobId, employerId, amount, currency, notes } = body;

  // Validate job exists
  const job = await Job.findById(jobId).lean();
  if (!job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  // Validate employer exists
  const employer = await Employer.findById(employerId).lean();
  if (!employer) {
    return NextResponse.json({ error: "Employer not found" }, { status: 404 });
  }

  // Verify job belongs to employer
  if (job.employerId.toString() !== employerId) {
    return NextResponse.json(
      { error: "Job does not belong to the specified employer" },
      { status: 400 },
    );
  }

  // Determine agent from job or ctx
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

  // Resolve default currency from system settings
  const defaultCurrency = (await SystemSettings.findOne().lean())?.defaultCurrency ?? "AED";
  const invoiceCurrency = currency ?? defaultCurrency;

  // Generate invoice
  const invoiceNumber = await generateInvoiceNumber();
  const invoice = await Invoice.create({
    invoiceNumber,
    category: "recruitment",
    userId: employer.userId,
    jobId,
    employerId,
    agentId: agentId ?? undefined,
    type: "recruitment",
    description: `Recruitment invoice for job: ${job.title}`,
    amount,
    currency: invoiceCurrency,
    status: "issued",
    issuedAt: new Date(),
    notes,
  });

  // Auto-create commissions based on agent/super-agent rates (with country overrides)
  const commissions = [];
  const employerCountry = employer.country ?? null;

  if (agentDoc && agentDoc.commissionRate && agentDoc.commissionRate > 0) {
    const resolved = await resolveCommissionRate(agentDoc.commissionRate, employerCountry);
    const agentCommissionAmount = (amount * resolved.rate) / 100;
    const sourceNote = resolved.source === "country_override"
      ? ` [Country override: ${resolved.countryCode} → ${resolved.rate}%]`
      : "";
    const agentCommission = await Commission.create({
      agentId: agentDoc._id,
      superAgentId: agentDoc.superAgentId ?? undefined,
      type: "placement",
      amount: Math.round(agentCommissionAmount * 100) / 100,
      currency: currency ?? "AED",
      rate: resolved.rate,
      status: "pending",
      notes: `Auto-generated from invoice ${invoiceNumber}${sourceNote}`,
    });
    commissions.push(agentCommission);
  }

  if (superAgentDoc && superAgentDoc.overrideRate && superAgentDoc.overrideRate > 0) {
    const resolved = await resolveOverrideRate(superAgentDoc.overrideRate, employerCountry);
    const overrideAmount = (amount * resolved.rate) / 100;
    const sourceNote = resolved.source === "country_override"
      ? ` [Country override: ${resolved.countryCode} → ${resolved.rate}%]`
      : "";
    const overrideCommission = await Commission.create({
      superAgentId: superAgentDoc._id,
      type: "override",
      amount: Math.round(overrideAmount * 100) / 100,
      currency: currency ?? "AED",
      rate: resolved.rate,
      status: "pending",
      notes: `Override commission from invoice ${invoiceNumber}${sourceNote}`,
    });
    commissions.push(overrideCommission);
  }

  // Audit log
  await logActivity({
    ...actorFromCtx(ctx),
    action: "invoice.create_recruitment",
    resource: "subscriptions",
    resourceId: String(invoice._id),
    meta: { jobId, employerId, amount, currency, commissionsCreated: commissions.length },
    req,
  });

  // Dispatch webhook
  dispatchWebhook("invoice.created", {
    invoiceId: String(invoice._id),
    invoiceNumber,
    category: "recruitment",
    amount,
    currency: invoiceCurrency,
    employerId,
    jobId,
    status: "issued",
  });

  return NextResponse.json({
    invoice,
    commissions,
    message: `Invoice created. ${commissions.length} commission(s) auto-generated.`,
  }, { status: 201 });
}

export const POST = withAuth(postHandler, { resource: "subscriptions", action: "create" });
