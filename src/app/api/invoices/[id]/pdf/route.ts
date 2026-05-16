/**
 * GET /api/invoices/[id]/pdf — Download invoice as PDF
 *
 * Generates a PDF on-the-fly from the invoice data and returns it
 * as an attachment. Also marks `downloadedAt` for delivery tracking.
 */

import { NextRequest, NextResponse } from "next/server";
import { withAuth, type AuthContext } from "@/lib/auth/withAuth";
import { canAccessInvoice } from "@/lib/invoices/access";
import { generateInvoicePdf } from "@/lib/invoices/generatePdf";
import { logActivity, actorFromCtx } from "@/lib/audit/log";
import connectDB from "@/lib/db/mongoose";
import Invoice from "@/models/Invoice";
import "@/models/Job";
import "@/models/Employer";
import "@/models/Agent";

async function handler(
  req: NextRequest,
  ctx: AuthContext,
  params?: Record<string, string>,
) {
  await connectDB();

  const invoice = await Invoice.findById(params?.id)
    .populate("employerId", "companyName companyEmail phone address country taxId")
    .populate("agentId", "userId commissionRate")
    .populate("jobId", "title")
    .lean();

  if (!invoice) {
    return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
  }

  if (!(await canAccessInvoice(ctx, invoice))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Mark downloadedAt for delivery tracking (fire-and-forget)
  Invoice.updateOne(
    { _id: invoice._id, downloadedAt: { $exists: false } },
    { $set: { downloadedAt: new Date() } },
  ).catch(() => {});

  const pdfBuffer = generateInvoicePdf(invoice as Parameters<typeof generateInvoicePdf>[0]);

  await logActivity({
    ...actorFromCtx(ctx),
    action: "invoice.pdf_download",
    resource: "subscriptions",
    resourceId: String(invoice._id),
    req,
  });

  const filename = `${invoice.invoiceNumber || "invoice"}.pdf`;

  return new NextResponse(new Uint8Array(pdfBuffer), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Length": String(pdfBuffer.length),
      "Cache-Control": "no-store",
    },
  });
}

export const GET = withAuth(handler);
