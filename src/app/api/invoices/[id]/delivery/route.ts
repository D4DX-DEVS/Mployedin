/**
 * POST /api/invoices/[id]/delivery — Track invoice delivery lifecycle actions.
 */

import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/withAuth";
import { validateBody } from "@/lib/validators";
import { invoiceDeliverySchema } from "@/lib/validators/subscriptions";
import { logActivity, actorFromCtx } from "@/lib/audit/log";
import { canAccessInvoice } from "@/lib/invoices/access";
import { getInvoiceDeliveryState } from "@/lib/invoices/status";
import connectDB from "@/lib/db/mongoose";
import Invoice from "@/models/Invoice";
import type { UserRole } from "@/types/user";

interface AuthCtx { userId: string; role: UserRole; locale: string }

type DeliveryAction = "sent" | "viewed" | "downloaded" | "reminder" | "payment_notification";

const STAFF_ACTIONS: readonly DeliveryAction[] = ["sent", "reminder"];
const EMPLOYER_ACTIONS: readonly DeliveryAction[] = ["viewed", "downloaded", "payment_notification"];
const SENDABLE_STATUSES = ["issued", "sent", "partially_paid", "overdue"];
const REMINDABLE_STATUSES = ["sent", "partially_paid", "overdue"];
const EMPLOYER_EVENT_STATUSES = ["sent", "partially_paid", "overdue", "paid"];
const MAX_REMINDERS_PER_INVOICE = 10;

function idString(value: unknown): string | null {
  if (!value) return null;
  if (typeof value === "string") return value;
  if (typeof value === "object" && "toHexString" in value) {
    const maybeObjectId = value as { toHexString?: () => string };
    if (typeof maybeObjectId.toHexString === "function") return maybeObjectId.toHexString();
  }
  if (typeof value === "object" && "_id" in value) {
    const nestedId = (value as { _id?: unknown })._id;
    return nestedId === value ? null : idString(nestedId);
  }
  return null;
}

function idsMatch(left: unknown, right: unknown): boolean {
  const leftId = idString(left);
  const rightId = idString(right);
  return Boolean(leftId && rightId && leftId === rightId);
}

async function logAccessDenied(req: NextRequest, ctx: AuthCtx, invoice: { _id?: unknown; userId?: unknown; agentId?: unknown }, operation: string) {
  await logActivity({
    ...actorFromCtx(ctx),
    action: "invoice.access_denied",
    resource: "subscriptions",
    resourceId: String(invoice._id ?? "unknown"),
    meta: {
      operation,
      invoiceUserId: String(invoice.userId ?? ""),
      invoiceAgentId: String(invoice.agentId ?? ""),
    },
    req,
  });
}

function deliverySummary(invoice: {
  _id: unknown;
  invoiceNumber: string;
  status: string;
  sentAt?: Date | null;
  viewedAt?: Date | null;
  downloadedAt?: Date | null;
  reminderCount?: number;
  lastReminderAt?: Date | null;
}) {
  return {
    _id: invoice._id,
    invoiceNumber: invoice.invoiceNumber,
    status: invoice.status,
    sentAt: invoice.sentAt,
    viewedAt: invoice.viewedAt,
    downloadedAt: invoice.downloadedAt,
    reminderCount: invoice.reminderCount ?? 0,
    lastReminderAt: invoice.lastReminderAt,
    deliveryState: getInvoiceDeliveryState(invoice),
  };
}

async function postHandler(
  req: NextRequest,
  ctx: AuthCtx,
  params?: Record<string, string>,
) {
  await connectDB();
  const body = await validateBody(req, invoiceDeliverySchema);

  const invoice = await Invoice.findById(params?.id);
  if (!invoice) {
    return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
  }

  if (!(await canAccessInvoice(ctx, invoice))) {
    await logAccessDenied(req, ctx, invoice, `DELIVERY_${body.action.toUpperCase()}`);
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (STAFF_ACTIONS.includes(body.action) && !["admin", "super_agent"].includes(ctx.role)) {
    return NextResponse.json({ error: "Only admin or super-agent users can update invoice delivery" }, { status: 403 });
  }

  if (EMPLOYER_ACTIONS.includes(body.action) && !idsMatch(invoice.userId, ctx.userId)) {
    await logAccessDenied(req, ctx, invoice, `EMPLOYER_DELIVERY_${body.action.toUpperCase()}`);
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const before = deliverySummary(invoice);
  const now = new Date();
  let activityAction = `invoice.delivery_${body.action}`;
  let changed = false;

  if (body.action === "sent") {
    if (!SENDABLE_STATUSES.includes(invoice.status)) {
      return NextResponse.json({ error: "Invoice must be issued before it can be sent" }, { status: 400 });
    }
    if (!invoice.sentAt) {
      invoice.sentAt = now;
      changed = true;
    }
    if (invoice.status === "issued") {
      invoice.status = "sent";
      changed = true;
    }
    activityAction = "invoice.delivery_sent";
  } else if (body.action === "reminder") {
    if (!invoice.sentAt || !REMINDABLE_STATUSES.includes(invoice.status)) {
      return NextResponse.json({ error: "Invoice must be sent before reminders can be recorded" }, { status: 400 });
    }
    if ((invoice.reminderCount ?? 0) >= MAX_REMINDERS_PER_INVOICE) {
      return NextResponse.json({ error: "Maximum reminders reached for this invoice" }, { status: 400 });
    }
    invoice.reminderCount = (invoice.reminderCount ?? 0) + 1;
    invoice.lastReminderAt = now;
    changed = true;
    activityAction = "invoice.delivery_reminder";
  } else if (body.action === "viewed") {
    if (!invoice.sentAt || !EMPLOYER_EVENT_STATUSES.includes(invoice.status)) {
      return NextResponse.json({ error: "Invoice must be sent before it can be viewed" }, { status: 400 });
    }
    if (!invoice.viewedAt) {
      invoice.viewedAt = now;
      changed = true;
    }
    activityAction = "invoice.delivery_viewed";
  } else if (body.action === "downloaded") {
    if (!invoice.sentAt || !EMPLOYER_EVENT_STATUSES.includes(invoice.status)) {
      return NextResponse.json({ error: "Invoice must be sent before it can be downloaded" }, { status: 400 });
    }
    if (!invoice.viewedAt) {
      invoice.viewedAt = now;
      changed = true;
    }
    if (!invoice.downloadedAt) {
      invoice.downloadedAt = now;
      changed = true;
    }
    activityAction = "invoice.delivery_downloaded";
  } else if (body.action === "payment_notification") {
    // Employer notifies admin they've made a payment
    const payableStatuses = ["issued", "sent", "partially_paid", "overdue"];
    if (!payableStatuses.includes(invoice.status)) {
      return NextResponse.json({ error: "Cannot submit payment notification for this invoice status" }, { status: 400 });
    }
    if (!invoice.paymentNotifications) {
      invoice.paymentNotifications = [];
    }
    invoice.paymentNotifications.push({
      paymentMethod: body.paymentMethod ?? "bank_transfer",
      referenceNumber: body.referenceNumber ?? undefined,
      notes: body.notes ?? undefined,
      notifiedAt: now,
      notifiedBy: ctx.userId as unknown as typeof invoice.markedPaidBy,
    });
    changed = true;
    activityAction = "invoice.payment_notification";
  }

  if (!changed) {
    return NextResponse.json({ invoice: deliverySummary(invoice) });
  }

  await invoice.save();

  await logActivity({
    ...actorFromCtx(ctx),
    action: activityAction,
    resource: "subscriptions",
    resourceId: invoice._id.toString(),
    changes: { before, after: deliverySummary(invoice) },
    req,
  });

  return NextResponse.json({ invoice: deliverySummary(invoice) });
}

export const POST = withAuth(postHandler, { resource: "subscriptions", action: "read" });