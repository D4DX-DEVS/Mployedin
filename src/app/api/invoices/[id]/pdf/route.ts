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
import User from "@/models/User";
import SuperAgent from "@/models/SuperAgent";
import Agent from "@/models/Agent";
import "@/models/Job";
import "@/models/Employer";
import "@/models/City";
import logger from "@/lib/logger";

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
  ).catch((err) => logger.error({ err, invoiceId: invoice._id.toString() }, "Failed to mark invoice as downloaded"));

  // Resolve "Issued By" label for the PDF
  let issuedByLabel: string | undefined;
  if (invoice.createdBy) {
    const creator = await User.findById(invoice.createdBy).select("name role").lean();
    if (creator?.name && creator?.role) {
      if (creator.role === "admin") {
        issuedByLabel = `${creator.name} — Mployedin Admin`;
      } else if (creator.role === "super_agent") {
        const saProfile = await SuperAgent.findOne({ userId: creator._id })
          .select("assignedCityIds")
          .populate("assignedCityIds", "name")
          .lean();
        const cityNames = ((saProfile?.assignedCityIds ?? []) as unknown as Array<{ name?: string }>)
          .map(c => c.name).filter(Boolean).slice(0, 3);
        issuedByLabel = cityNames.length > 0
          ? `${creator.name} — Super Agent, ${cityNames.join(", ")} region`
          : `${creator.name} — Super Agent`;
      } else if (creator.role === "agent") {
        const agentProfile = await Agent.findOne({ userId: creator._id })
          .select("assignedCityIds")
          .populate("assignedCityIds", "name")
          .lean();
        const cityNames = ((agentProfile?.assignedCityIds ?? []) as unknown as Array<{ name?: string }>)
          .map(c => c.name).filter(Boolean).slice(0, 3);
        issuedByLabel = cityNames.length > 0
          ? `${creator.name} — Agent, ${cityNames.join(", ")} region`
          : `${creator.name} — Agent`;
      }
    }
  }

  const pdfInvoice = { ...invoice, issuedByLabel } as Parameters<typeof generateInvoicePdf>[0];
  const pdfBuffer = generateInvoicePdf(pdfInvoice, ctx.role);

  await logActivity({
    ...actorFromCtx(ctx),
    action: "invoice.pdf_download",
    resource: "invoices",
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
