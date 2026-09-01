/**
 * GET /api/invoices/check-duplicate?jobId=...&employerId=...
 * Returns whether an active invoice already exists for a job+employer pair.
 * Used by InvoiceBuilder to warn users before they fill out the form.
 */

import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/withAuth";
import { INVOICE_TERMINAL_STATUSES } from "@/lib/invoices/status";
import connectDB from "@/lib/db/mongoose";
import Invoice from "@/models/Invoice";
import { getScopedEmployerIds } from "@/lib/auth/agentRestrictions";
import type { UserRole } from "@/types/user";

interface AuthCtx { userId: string; role: UserRole; locale: string }

async function getHandler(req: NextRequest, ctx: AuthCtx) {
  if (!["admin", "super_agent", "agent"].includes(ctx.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const jobId = searchParams.get("jobId");
  const employerId = searchParams.get("employerId");

  if (!jobId || !employerId) {
    return NextResponse.json({ exists: false });
  }

  await connectDB();

  // The answer reveals an invoice number and status, so confine the probe to
  // employers the caller actually manages — otherwise any staff user can
  // enumerate job+employer pairs across the whole platform. Out-of-scope pairs
  // answer "no duplicate", which is true for the caller and leaks nothing.
  const employerIds = await getScopedEmployerIds(ctx);
  if (employerIds !== null && !employerIds.map(String).includes(String(employerId))) {
    return NextResponse.json({ exists: false });
  }

  const existingInvoice = await Invoice.findOne({
    jobId,
    employerId,
    status: { $nin: INVOICE_TERMINAL_STATUSES },
  }).select("_id invoiceNumber status").lean();

  if (existingInvoice) {
    return NextResponse.json({
      exists: true,
      invoiceNumber: existingInvoice.invoiceNumber,
      status: existingInvoice.status,
    });
  }

  return NextResponse.json({ exists: false });
}

export const GET = withAuth(getHandler as Parameters<typeof withAuth>[0]);
