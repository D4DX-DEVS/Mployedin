/**
 * GET /api/cron/invoice-overdue — Mark past-due invoices as overdue.
 *
 * Runs daily. Finds invoices where dueDate has passed and status is still
 * one of the payable statuses (issued, sent, partially_paid), then marks
 * them overdue and sends a notification to admin/accounting.
 *
 * Online-payment dunning (gateway mode): an overdue renewal invoice whose
 * subscription is still active moves it to past_due, and past_due
 * subscriptions whose payment grace window (PAYMENT_PAST_DUE_GRACE_DAYS) has
 * run out are suspended. Abandoned self-service checkout invoices (new plan /
 * upgrade never paid) are not escalated to admins as overdue.
 */

import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongoose";
import { verifyCronRequest } from "@/lib/security/cron-auth";
import logger from "@/lib/logger";
import { forEachBounded } from "@/lib/cron/scale";
import Invoice from "@/models/Invoice";
import { notify } from "@/lib/notifications/trigger";
import User from "@/models/User";
import {
  markSubscriptionPastDue,
  suspendLapsedPastDueSubscriptions,
} from "@/lib/payments/subscriptionFulfillment";

export const maxDuration = 300;

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
    // Unpaid self-service checkout invoices are abandoned carts, not debts.
    $nor: [{ activationPending: true, type: { $in: ["new", "upgrade", "downgrade"] } }],
  })
    .select("_id invoiceNumber status dueDate totalAmount currency userId employerId type subscriptionId activationPending")
    .limit(500)
    .lean();

  let updated = 0;
  let notified = 0;
  const errors: string[] = [];

  // Hoist admin lookup out of per-invoice loop; reuse for all invoices
  const admins = await User.find({ role: "admin", isActive: true })
    .select("_id")
    .limit(5)
    .lean();

  if (admins.length === 0) {
    // No admins to notify, just mark invoices as overdue
    try {
      const result = await Invoice.updateMany(
        { _id: { $in: overdueInvoices.map((inv) => inv._id) } },
        { $set: { status: "overdue" } },
      );
      updated += result.modifiedCount;
    } catch (err) {
      errors.push(`Batch update failed: ${String(err)}`);
    }
  } else {
    // Mark invoices as overdue FIRST (mark-first pattern)
    try {
      const result = await Invoice.updateMany(
        { _id: { $in: overdueInvoices.map((inv) => inv._id) } },
        { $set: { status: "overdue" } },
      );
      updated += result.modifiedCount;
    } catch (err) {
      errors.push(`Batch update failed: ${String(err)}`);
    }

    // Notify admins about newly overdue invoices with bounded concurrency
    const invoiceAdminPairs: Array<{ inv: typeof overdueInvoices[0]; admin: typeof admins[0] }> = [];
    for (const inv of overdueInvoices) {
      for (const admin of admins) {
        invoiceAdminPairs.push({ inv, admin });
      }
    }

    const notifyTask = async (pair: typeof invoiceAdminPairs[0]) => {
      await notify({
        userId: pair.admin._id.toString(),
        type: "system",
        title: "Invoice Overdue",
        message: `Invoice ${pair.inv.invoiceNumber} (${pair.inv.currency} ${(pair.inv.totalAmount ?? 0).toLocaleString()}) is now overdue.`,
        link: `/en/admin/invoices`,
        sendEmail: true,
      }).catch((notifyErr) => {
        logger.error(
          { err: notifyErr, invoiceId: String(pair.inv._id), adminId: String(pair.admin._id) },
          "Failed to send invoice overdue notification"
        );
      });
      notified++;
    };

    const result = await forEachBounded(invoiceAdminPairs, 10, notifyTask, "invoice-overdue-notify");
    if (result.failed > 0) errors.push(`${result.failed} notifications failed (see logs)`);
  }

  // ── Subscription dunning: renewal unpaid → past_due → suspended ──────────
  let pastDue = 0;
  let suspended = 0;
  for (const inv of overdueInvoices) {
    if (inv.type !== "renewal" || !inv.subscriptionId || !inv.activationPending) continue;
    try {
      if (await markSubscriptionPastDue(inv.subscriptionId, {
        since: inv.dueDate ? new Date(inv.dueDate) : now,
        reason: "Renewal invoice overdue",
        invoiceNumber: inv.invoiceNumber,
      })) pastDue++;
    } catch (err) {
      errors.push(`past_due transition failed for ${String(inv._id)}: ${String(err)}`);
    }
  }
  try {
    suspended = await suspendLapsedPastDueSubscriptions(now);
  } catch (err) {
    errors.push(`Suspending lapsed past_due subscriptions failed: ${String(err)}`);
  }

  if (errors.length > 0) {
    logger.error({ errors }, `[cron/invoice-overdue] ${errors.length} errors during processing`);
  }

  return NextResponse.json(
    {
      success: errors.length === 0,
      found: overdueInvoices.length,
      updated,
      notified,
      pastDue,
      suspended,
      errors: errors.length > 0 ? errors : undefined,
      timestamp: now.toISOString(),
    },
    { status: errors.length > 0 ? 500 : 200 }
  );
}
