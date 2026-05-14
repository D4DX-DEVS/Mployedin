import Agent from "@/models/Agent";
import { getSuperAgentScope } from "@/lib/auth/agentRestrictions";
import logger from "@/lib/logger";
import type { UserRole } from "@/types/user";

interface InvoiceAccessContext {
  userId: string;
  role: UserRole;
}

interface InvoiceAccessSubject {
  userId?: unknown;
  agentId?: unknown;
}

function idString(value: unknown): string | null {
  if (!value) return null;
  if (typeof value === "string") return value;
  if (typeof value === "object" && "_id" in value) {
    return idString((value as { _id?: unknown })._id);
  }
  if (typeof value === "object" && "toHexString" in value) {
    const maybeObjectId = value as { toHexString?: () => string };
    if (typeof maybeObjectId.toHexString === "function") return maybeObjectId.toHexString();
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
  if (idsMatch(invoice.userId, ctx.userId)) return true;

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