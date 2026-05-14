/**
 * GET /api/cron/invoice-overdue — Mark past-due invoices as overdue.
 *
 * Runs daily. Finds invoices where dueDate has passed and status is still
 * one of the payable statuses (issued, sent, partially_paid), then marks
 * them overdue and sends a notification to admin/accounting.
 */

import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongoose";
import { verifyCronRequest } from "@/lib/security/cron-auth";
import Invoice from "@/models/Invoice";
import { notify } from "@/lib/notifications/trigger";
import User from "@/models/User";

const BATCH_SIZE = 50;

export async function GET(req: NextRequest) {
  const authError = verifyCronRequest(req);
  if (authError) return authError;

  await connectDB();

  const now = new Date();

  // Find invoices that have a due date in the past and are still in a payable status
  const overdueInvoices = await Invoice.find({
    dueDate: { $lt: now },
    status: { $in: ["issued", "sent", "partially_paid"] },
  })
    .select("_id invoiceNumber status dueDate totalAmount currency userId employerId")
    .limit(500)
    .lean();

  let updated = 0;
  let notified = 0;
  const errors: string[] = [];

  // Process in batches
  for (let i = 0; i < overdueInvoices.length; i += BATCH_SIZE) {
    const batch = overdueInvoices.slice(i, i + BATCH_SIZE);
    const ids = batch.map((inv) => inv._id);

    try {
      const result = await Invoice.updateMany(
        { _id: { $in: ids } },
        { $set: { status: "overdue" } },
      );
      updated += result.modifiedCount;
    } catch (err) {
      errors.push(`Batch update failed: ${String(err)}`);
      continue;
    }

    // Notify admins about newly overdue invoices
    for (const inv of batch) {
      try {
        // Find admin users to notify
        const admins = await User.find({ role: "admin", isActive: true })
          .select("_id")
          .limit(5)
          .lean();

        for (const admin of admins) {
          await notify({
            userId: admin._id.toString(),
            type: "system",
            title: "Invoice Overdue",
            message: `Invoice ${inv.invoiceNumber} (${inv.currency} ${(inv.totalAmount ?? 0).toLocaleString()}) is now overdue.`,
            link: `/en/admin/invoices`,
            sendEmail: true,
          });
          notified++;
        }
      } catch (err) {
        errors.push(`Notification failed for ${inv.invoiceNumber}: ${String(err)}`);
      }
    }
  }

  return NextResponse.json({
    success: true,
    found: overdueInvoices.length,
    updated,
    notified,
    errors: errors.length > 0 ? errors : undefined,
    timestamp: now.toISOString(),
  });
}
