/**
 * GET /api/cron/invoice-overdue-reminder — Daily cron
 *
 * Sends email reminders for invoices that are overdue or approaching due date.
 * Groups by agent/super-agent so each person gets ONE consolidated email.
 * Includes escalation logic: reminder frequency increases as overdue days grow.
 *
 * Cadence: Run daily at 9 AM UTC.
 */

import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongoose";
import { verifyCronRequest } from "@/lib/security/cron-auth";
import Invoice from "@/models/Invoice";
import User from "@/models/User";
import { sendEmail } from "@/lib/communications/email";
import { logActivity } from "@/lib/audit/log";

export async function GET(req: NextRequest) {
  const authError = verifyCronRequest(req);
  if (authError) return authError;

  await connectDB();

  const now = new Date();
  const threeDaysFromNow = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);

  // Find invoices that are: overdue (past due), sent but approaching due, or issued and approaching due
  const invoices = await Invoice.find({
    status: { $in: ["issued", "sent", "overdue", "partially_paid"] },
    dueDate: { $lte: threeDaysFromNow, $exists: true },
    // Don't spam: only remind if last reminder was 3+ days ago (or never sent)
    $or: [
      { lastReminderAt: { $exists: false } },
      { lastReminderAt: { $lte: new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000) } },
    ],
  })
    .select("invoiceNumber dueDate totalAmount currency status employerId agentId userId reminderCount balanceDue")
    .populate("employerId", "companyName")
    .lean();

  if (invoices.length === 0) {
    return NextResponse.json({ sent: 0, message: "No overdue invoices" });
  }

  // Group by userId (creator - the agent or admin who made the invoice)
  const byUser = new Map<string, typeof invoices>();
  for (const inv of invoices) {
    const key = inv.userId.toString();
    if (!byUser.has(key)) byUser.set(key, []);
    byUser.get(key)!.push(inv);
  }

  let sentCount = 0;
  const errors: string[] = [];

  for (const [userId, userInvoices] of byUser) {
    try {
      const user = await User.findById(userId).select("name email isActive").lean();
      if (!user?.email || !user.isActive) continue;

      const html = buildInvoiceReminderEmail(user.name ?? "Team", userInvoices, now);
      const overdueCount = userInvoices.filter((i) => new Date(i.dueDate!).getTime() < now.getTime()).length;
      const subject = overdueCount > 0
        ? `💰 ${overdueCount} invoice${overdueCount > 1 ? "s" : ""} overdue — action needed`
        : `📄 ${userInvoices.length} invoice${userInvoices.length > 1 ? "s" : ""} due soon`;

      await sendEmail({
        to: user.email,
        subject,
        html,
        userId,
        source: "cron-invoice-overdue",
        category: "finance",
      });

      // Update reminder tracking on all invoices
      const ids = userInvoices.map((i) => i._id);
      await Invoice.updateMany(
        { _id: { $in: ids } },
        { $set: { lastReminderAt: now }, $inc: { reminderCount: 1 } },
      );

      sentCount++;
    } catch (err) {
      errors.push(`User ${userId}: ${err instanceof Error ? err.message : "Unknown"}`);
    }
  }

  await logActivity({
    action: "invoice.cron_overdue_reminder",
    resource: "invoices",
    actorRole: "system",
    meta: { sentCount, invoiceCount: invoices.length, errors: errors.length },
    req,
  });

  return NextResponse.json({
    success: true,
    sent: sentCount,
    invoicesProcessed: invoices.length,
    errors: errors.length > 0 ? errors : undefined,
    timestamp: now.toISOString(),
  });
}

// ── Email template ──────────────────────────────────────────────────

interface InvRow {
  invoiceNumber: string;
  dueDate?: Date;
  totalAmount: number;
  balanceDue?: number;
  currency: string;
  status: string;
  employerId?: { companyName?: string };
}

function buildInvoiceReminderEmail(name: string, invoices: InvRow[], now: Date): string {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? process.env.NEXTAUTH_URL ?? "https://mployedin.com";

  const overdue = invoices.filter((i) => new Date(i.dueDate!).getTime() < now.getTime());
  const dueSoon = invoices.filter((i) => new Date(i.dueDate!).getTime() >= now.getTime());

  const totalOutstanding = invoices.reduce((sum, i) => sum + (i.balanceDue ?? i.totalAmount), 0);
  const currency = invoices[0]?.currency ?? "AED";

  const renderRow = (inv: InvRow) => {
    const due = new Date(inv.dueDate!);
    const daysOverdue = Math.ceil((now.getTime() - due.getTime()) / (1000 * 60 * 60 * 24));
    const isOverdue = daysOverdue > 0;
    const dateStr = due.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
    const amountStr = (inv.balanceDue ?? inv.totalAmount).toLocaleString(undefined, { minimumFractionDigits: 2 });
    const urgencyColor = daysOverdue > 14 ? "#dc2626" : daysOverdue > 7 ? "#ea580c" : daysOverdue > 0 ? "#d97706" : "#059669";
    const urgencyLabel = daysOverdue > 14 ? `${daysOverdue}d overdue` : daysOverdue > 0 ? `${daysOverdue}d overdue` : "Due soon";

    return `
      <tr>
        <td style="padding:10px 12px;border-bottom:1px solid #f3f4f6;font-size:14px;font-weight:600;color:#111827">${esc(inv.invoiceNumber)}</td>
        <td style="padding:10px 12px;border-bottom:1px solid #f3f4f6;font-size:13px;color:#6b7280">${esc(inv.employerId?.companyName ?? "—")}</td>
        <td style="padding:10px 12px;border-bottom:1px solid #f3f4f6;font-size:13px;font-weight:600;color:#111827">${currency} ${amountStr}</td>
        <td style="padding:10px 12px;border-bottom:1px solid #f3f4f6;font-size:12px;color:#6b7280">${dateStr}</td>
        <td style="padding:10px 12px;border-bottom:1px solid #f3f4f6"><span style="background:${urgencyColor}15;color:${urgencyColor};padding:2px 8px;border-radius:10px;font-size:11px;font-weight:600">${urgencyLabel}</span></td>
      </tr>`;
  };

  return `
<div style="font-family:'Segoe UI',Arial,sans-serif;max-width:640px;margin:0 auto;background:#fff">
  <div style="background:linear-gradient(135deg,#0D6FD8 0%,#0A5BB8 100%);padding:28px 24px;border-radius:8px 8px 0 0;text-align:center">
    <h1 style="color:#fff;margin:0;font-size:22px;letter-spacing:0.5px">MPLOYEDIN</h1>
    <p style="color:rgba(255,255,255,0.8);margin:6px 0 0;font-size:13px">Invoice Payment Reminder</p>
  </div>
  <div style="padding:24px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 8px 8px">
    <p style="font-size:15px;color:#374151;margin:0 0 16px">Hi <strong>${esc(name)}</strong>,</p>

    <!-- Summary Banner -->
    <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:16px;margin-bottom:20px;text-align:center">
      <p style="font-size:24px;font-weight:700;color:#dc2626;margin:0">${currency} ${totalOutstanding.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
      <p style="font-size:12px;color:#991b1b;margin:4px 0 0">Total Outstanding (${invoices.length} invoice${invoices.length > 1 ? "s" : ""})</p>
    </div>

    ${overdue.length > 0 ? `
    <h3 style="color:#dc2626;font-size:14px;margin:0 0 10px">🔴 Overdue (${overdue.length})</h3>
    <table style="width:100%;border-collapse:collapse;border:1px solid #fee2e2;border-radius:6px;overflow:hidden;margin-bottom:20px">
      <tr style="background:#fef2f2">
        <th style="padding:8px 12px;text-align:left;font-size:11px;font-weight:600;color:#991b1b;text-transform:uppercase">Invoice</th>
        <th style="padding:8px 12px;text-align:left;font-size:11px;font-weight:600;color:#991b1b;text-transform:uppercase">Client</th>
        <th style="padding:8px 12px;text-align:left;font-size:11px;font-weight:600;color:#991b1b;text-transform:uppercase">Amount</th>
        <th style="padding:8px 12px;text-align:left;font-size:11px;font-weight:600;color:#991b1b;text-transform:uppercase">Due</th>
        <th style="padding:8px 12px;text-align:left;font-size:11px;font-weight:600;color:#991b1b;text-transform:uppercase">Status</th>
      </tr>
      ${overdue.map(renderRow).join("")}
    </table>` : ""}

    ${dueSoon.length > 0 ? `
    <h3 style="color:#d97706;font-size:14px;margin:0 0 10px">🟡 Due Soon (${dueSoon.length})</h3>
    <table style="width:100%;border-collapse:collapse;border:1px solid #fef3c7;border-radius:6px;overflow:hidden;margin-bottom:20px">
      <tr style="background:#fffbeb">
        <th style="padding:8px 12px;text-align:left;font-size:11px;font-weight:600;color:#92400e;text-transform:uppercase">Invoice</th>
        <th style="padding:8px 12px;text-align:left;font-size:11px;font-weight:600;color:#92400e;text-transform:uppercase">Client</th>
        <th style="padding:8px 12px;text-align:left;font-size:11px;font-weight:600;color:#92400e;text-transform:uppercase">Amount</th>
        <th style="padding:8px 12px;text-align:left;font-size:11px;font-weight:600;color:#92400e;text-transform:uppercase">Due</th>
        <th style="padding:8px 12px;text-align:left;font-size:11px;font-weight:600;color:#92400e;text-transform:uppercase">Status</th>
      </tr>
      ${dueSoon.map(renderRow).join("")}
    </table>` : ""}

    <div style="text-align:center;margin:24px 0">
      <a href="${baseUrl}/en/admin/invoices" style="background:#0D6FD8;color:#fff;padding:12px 32px;border-radius:6px;text-decoration:none;font-weight:600;font-size:14px;display:inline-block">View All Invoices</a>
    </div>

    <p style="color:#9ca3af;font-size:12px;margin:20px 0 0;text-align:center">
      Reminders are sent every 3 days for outstanding invoices. Mark invoices as paid to stop reminders.
    </p>
  </div>
  <div style="padding:12px 24px;text-align:center">
    <p style="color:#9ca3af;font-size:11px;margin:0">
      <a href="${baseUrl}/en/admin/settings" style="color:#6b7280;text-decoration:underline">Settings</a> · © ${new Date().getFullYear()} MPLOYEDIN
    </p>
  </div>
</div>`;
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
