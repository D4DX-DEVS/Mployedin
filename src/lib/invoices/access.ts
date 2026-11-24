import Agent from "@/models/Agent";
import { getSuperAgentScope } from "@/lib/auth/agentRestrictions";
import logger from "@/lib/logger";
import type { UserRole } from "@/types/user";

interface InvoiceAccessContext {
  userId: string;
  role: UserRole;
}

interface InvoiceAccessSubject {
  _id?: unknown;
  userId?: unknown;
  agentId?: unknown;
  status?: string;
}

const STAFF_ROLES: readonly UserRole[] = ["admin", "super_agent", "agent"];

/**
 * Invoices the billed customer (employer / job seeker) must not see yet: a
 * draft, or an agent's invoice still waiting for a super agent or admin to
 * approve it. They reach the customer once issued.
 */
export const CUSTOMER_HIDDEN_INVOICE_STATUSES = ["draft", "pending_approval"] as const;

export function isCustomerRole(role: UserRole): boolean {
  return !STAFF_ROLES.includes(role);
}

/** Status filter for a customer's invoice list; respects an explicit status request. */
export function customerStatusFilter(requested: string | null | undefined): unknown {
  const hidden: readonly string[] = CUSTOMER_HIDDEN_INVOICE_STATUSES;
  if (!requested) return { $nin: [...hidden] };
  return hidden.includes(requested) ? { $in: [] } : requested;
}

async function hiddenFromCustomer(invoice: InvoiceAccessSubject): Promise<boolean> {
  let status = invoice.status;
  if (status === undefined && invoice._id) {
    // Some routes load only the fields they need; look the status up rather
    // than let a missing field read as "visible".
    const { default: Invoice } = await import("@/models/Invoice");
    status = ((await Invoice.findById(invoice._id).select("status").lean()) as { status?: string } | null)?.status;
  }
  return status === undefined || (CUSTOMER_HIDDEN_INVOICE_STATUSES as readonly string[]).includes(status);
}

function idString(value: unknown): string | null {
  if (!value) return null;
  if (typeof value === "string") return value;
  if (typeof value === "object" && "toHexString" in value) {
    const maybeObjectId = value as { toHexString?: () => string };
    if (typeof maybeObjectId.toHexString === "function") return maybeObjectId.toHexString();
  }
  if (typeof value === "object" && "_id" in value) {
    return idString((value as { _id?: unknown })._id);
  }
  return null;
}

function idsMatch(left: unknown, right: unknown): boolean {
  const leftId = idString(left);
  const rightId = idString(right);
  return Boolean(leftId && rightId && leftId === rightId);
}

export async function canAccessInvoice(ctx: InvoiceAccessContext, invoice: InvoiceAccessSubject): Promise<boolean> {
  if (ctx.role === "admin") return true;
  if (idsMatch(invoice.userId, ctx.userId)) {
    return isCustomerRole(ctx.role) ? !(await hiddenFromCustomer(invoice)) : true;
  }

  if (ctx.role === "agent") {
    try {
      const agent = await Agent.findOne({ userId: ctx.userId }).select("_id").lean();
      return Boolean(agent && idsMatch(invoice.agentId, agent._id));
    } catch (err: unknown) {
      logger.warn({ err, userId: ctx.userId }, "Invoice access agent lookup failed");
      return false;
    }
  }

  if (ctx.role === "super_agent") {
    try {
      const scope = await getSuperAgentScope(ctx.userId);
      const invoiceAgentId = idString(invoice.agentId);
      return Boolean(
        invoiceAgentId && scope?.effectiveAgentIds.some((agentId) => idsMatch(agentId, invoiceAgentId)),
      );
    } catch (err: unknown) {
      logger.warn({ err, userId: ctx.userId }, "Invoice access super-agent scope lookup failed");
      return false;
    }
  }

  return false;
}