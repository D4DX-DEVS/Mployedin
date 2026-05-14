/**
 * POST /api/invoices/[id]/send — Email an invoice to the employer.
 *
 * Generates the PDF, attaches it, sends via the email service, and updates
 * delivery status (sentAt, status → "sent"). Requires admin or super_agent role.
 */

import { NextRequest, NextResponse } from "next/server";
import { withAuth, type AuthContext } from "@/lib/auth/withAuth";
import { canAccessInvoice } from "@/lib/invoices/access";
import { generateInvoicePdf } from "@/lib/invoices/generatePdf";
import { sendEmail } from "@/lib/communications/email";
import { logActivity, actorFromCtx } from "@/lib/audit/log";
import connectDB from "@/lib/db/mongoose";
import Invoice from "@/models/Invoice";
import User from "@/models/User";

const SENDABLE_STATUSES = ["issued", "sent", "partially_paid", "overdue"];

async function handler(
  req: NextRequest,
  ctx: AuthContext,
  params?: Record<string, string>,
) {
  if (!["admin", "super_agent"].includes(ctx.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

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

  if (!SENDABLE_STATUSES.includes(invoice.status)) {
    return NextResponse.json(
      { error: "Invoice must be issued before it can be sent" },
      { status: 400 },
    );
  }

  // Determine recipient email
  const billing = invoice.billingDetails;
  const employer =
    typeof invoice.employerId === "object" && invoice.employerId
      ? invoice.employerId as { companyName?: string; companyEmail?: string }
      : null;

  const recipientEmail = billing?.email ?? employer?.companyEmail;
  if (!recipientEmail) {
    return NextResponse.json(
      { error: "No billing email found on the invoice or employer" },
      { status: 400 },
    );
  }

  // Generate PDF
  const pdfBuffer = generateInvoicePdf(
    invoice as Parameters<typeof generateInvoicePdf>[0],
  );

  const companyName = billing?.companyName ?? employer?.companyName ?? "Customer";
  const invNumber = invoice.invoiceNumber ?? "Invoice";
  const currency = invoice.currency ?? "AED";
  const total = (invoice.totalAmount ?? invoice.amount ?? 0).toLocaleString("en-US", {
    minimumFractionDigits: 2,
  });
  const dueDateStr = invoice.dueDate
    ? new Date(invoice.dueDate).toLocaleDateString("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      })
    : "upon receipt";

  // Send email with PDF attachment
  const emailResult = await sendEmail({
    to: recipientEmail,
    subject: `Invoice ${invNumber} from Mployedin`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #2980b9;">Invoice ${invNumber}</h2>
        <p>Dear ${companyName},</p>
        <p>Please find attached your invoice <strong>${invNumber}</strong> for <strong>${currency} ${total}</strong>.</p>
        <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
          <tr>
            <td style="padding: 8px; border-bottom: 1px solid #eee; font-weight: bold;">Invoice Number</td>
            <td style="padding: 8px; border-bottom: 1px solid #eee;">${invNumber}</td>
          </tr>
          <tr>
            <td style="padding: 8px; border-bottom: 1px solid #eee; font-weight: bold;">Amount</td>
            <td style="padding: 8px; border-bottom: 1px solid #eee;">${currency} ${total}</td>
          </tr>
          <tr>
            <td style="padding: 8px; border-bottom: 1px solid #eee; font-weight: bold;">Due Date</td>
            <td style="padding: 8px; border-bottom: 1px solid #eee;">${dueDateStr}</td>
          </tr>
        </table>
        <p>If you have any questions about this invoice, please don't hesitate to contact us.</p>
        <p style="margin-top: 30px; color: #666; font-size: 12px;">This is an automated message from Mployedin.</p>
      </div>
    `,
    source: "invoice",
    category: "system",
    userId: String(invoice.userId),
    attachments: [
      {
        filename: `${invNumber}.pdf`,
        content: pdfBuffer,
        contentType: "application/pdf",
      },
    ],
  });

  // Update delivery status
  const update: Record<string, unknown> = {};
  const invoiceDoc = await Invoice.findById(invoice._id);
  if (invoiceDoc) {
    if (!invoiceDoc.sentAt) {
      update.sentAt = new Date();
    }
    if (invoiceDoc.status === "issued") {
      update.status = "sent";
    }
    invoiceDoc.reminderCount = (invoiceDoc.reminderCount ?? 0) + 1;
    invoiceDoc.lastReminderAt = new Date();
    if (update.sentAt) invoiceDoc.sentAt = update.sentAt as Date;
    if (update.status) invoiceDoc.status = update.status as typeof invoiceDoc.status;
    await invoiceDoc.save();
  }

  await logActivity({
    ...actorFromCtx(ctx),
    action: "invoice.email_sent",
    resource: "subscriptions",
    resourceId: String(invoice._id),
    meta: {
      to: recipientEmail,
      invoiceNumber: invNumber,
      messageId: emailResult?.messageId,
    },
    req,
  });

  return NextResponse.json({
    success: true,
    message: `Invoice ${invNumber} sent to ${recipientEmail}`,
    messageId: emailResult?.messageId,
  });
}

export const POST = withAuth(handler);
