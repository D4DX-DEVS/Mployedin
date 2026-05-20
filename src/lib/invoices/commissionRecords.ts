import mongoose from "mongoose";
import Commission, { type ICommission } from "@/models/Commission";
import Agent from "@/models/Agent";
import type { IInvoiceCommission } from "@/models/Invoice";
import SuperAgent from "@/models/SuperAgent";
import { notifyCommissionApproved } from "@/lib/notifications/trigger";

interface CreateCommissionRecordsForInvoiceInput {
  invoiceId: unknown;
  commissions: IInvoiceCommission[];
  currency: string;
  session?: mongoose.ClientSession;
}

interface ReverseCommissionsResult {
  reversed: number;
  alreadyPaid: number;
}

interface ApproveCommissionsResult {
  approved: number;
  notificationFailures: number;
  approvedCommissionIds: unknown[];
  notifications: CommissionApprovalNotification[];
}

interface ApproveCommissionsOptions {
  sendNotifications?: boolean;
  session?: mongoose.ClientSession;
}

export interface CommissionApprovalNotification {
  userId: string;
  role: "agent" | "super_agent";
  amount: number;
  currency: string;
}

function invoiceCommissionNote(notes?: string): string {
  return notes ? `Auto-generated from approved invoice - ${notes}` : "Auto-generated from approved invoice";
}

export async function createCommissionRecordsForInvoice({
  invoiceId,
  commissions,
  currency,
  session,
}: CreateCommissionRecordsForInvoiceInput): Promise<ICommission[]> {
  const createdRecords: ICommission[] = [];
  const opts = session ? { session } : {};

  // Idempotency: check if commission records already exist for this invoice
  const existingCount = await Commission.countDocuments({ invoiceId }).session(session ?? null);
  if (existingCount > 0) return [];

  for (const commission of commissions) {
    if (commission.amount <= 0 || commission.rate <= 0) continue;

    if (commission.role === "agent" && commission.agentId) {
      const [created] = await Commission.create([{
        invoiceId,
        agentId: commission.agentId,
        superAgentId: commission.superAgentId,
        type: "placement",
        amount: commission.amount,
        currency,
        rate: commission.rate,
        status: "pending",
        notes: invoiceCommissionNote(commission.notes),
      }], opts);
      createdRecords.push(created);
    }

    if (commission.role === "super_agent" && commission.superAgentId) {
      const [created] = await Commission.create([{
        invoiceId,
        superAgentId: commission.superAgentId,
        type: "override",
        amount: commission.amount,
        currency,
        rate: commission.rate,
        status: "pending",
        notes: invoiceCommissionNote(commission.notes),
      }], opts);
      createdRecords.push(created);
    }
  }

  return createdRecords;
}

/**
 * Reverse (cancel) commissions tied to an invoice when it is voided or cancelled.
 *
 * - Pending/approved commissions → deleted
 * - Paid commissions → left untouched (require manual adjustment)
 *
 * Returns counts of reversed vs already-paid commissions.
 */
export async function reverseCommissionsForInvoice(
  invoiceId: unknown,
): Promise<ReverseCommissionsResult> {
  const commissions = await Commission.find({ invoiceId }).lean();

  if (commissions.length === 0) {
    return { reversed: 0, alreadyPaid: 0 };
  }

  const reversible = commissions.filter(
    (c) => c.status === "pending" || c.status === "approved",
  );
  const alreadyPaid = commissions.filter((c) => c.status === "paid");

  if (reversible.length > 0) {
    await Commission.deleteMany({
      _id: { $in: reversible.map((c) => c._id) },
    });
  }

  return {
    reversed: reversible.length,
    alreadyPaid: alreadyPaid.length,
  };
}

export async function approvePendingCommissionsForPaidInvoice(
  invoiceId: unknown,
  approvedBy: unknown,
  options: ApproveCommissionsOptions = {},
): Promise<ApproveCommissionsResult> {
  const { session } = options;
  const approvedAt = new Date();
  const pendingCommissions = await Commission.find({ invoiceId, status: "pending" })
    .select("_id agentId superAgentId amount currency")
    .session(session ?? null)
    .lean();

  if (pendingCommissions.length === 0) {
    return { approved: 0, notificationFailures: 0, approvedCommissionIds: [], notifications: [] };
  }

  const commissionIds = pendingCommissions.map((commission) => commission._id);
  const result = await Commission.updateMany(
    { _id: { $in: commissionIds } },
    {
      $set: {
        status: "approved",
        approvedBy,
        approvedAt,
      },
    },
    session ? { session } : {},
  );

  const agentIds = pendingCommissions
    .map((commission) => commission.agentId)
    .filter(Boolean);
  const superAgentIds = pendingCommissions
    .map((commission) => commission.superAgentId)
    .filter(Boolean);

  const [agents, superAgents] = await Promise.all([
    agentIds.length > 0
      ? Agent.find({ _id: { $in: agentIds } }).select("_id userId").lean()
      : Promise.resolve([]),
    superAgentIds.length > 0
      ? SuperAgent.find({ _id: { $in: superAgentIds } }).select("_id userId").lean()
      : Promise.resolve([]),
  ]);

  const agentUserMap = new Map(agents.map((agent) => [String(agent._id), String(agent.userId)]));
  const superAgentUserMap = new Map(superAgents.map((superAgent) => [String(superAgent._id), String(superAgent.userId)]));

  const notifications = pendingCommissions.flatMap((commission) => {
    const tasks: CommissionApprovalNotification[] = [];
    if (commission.agentId) {
      const userId = agentUserMap.get(String(commission.agentId));
      if (userId) {
        tasks.push({ userId, role: "agent", amount: commission.amount, currency: commission.currency });
      }
    }
    if (commission.superAgentId) {
      const userId = superAgentUserMap.get(String(commission.superAgentId));
      if (userId) {
        tasks.push({ userId, role: "super_agent", amount: commission.amount, currency: commission.currency });
      }
    }
    return tasks;
  });

  const notificationFailures = options.sendNotifications === false
    ? 0
    : await sendCommissionApprovalNotifications(notifications);

  return {
    approved: result.modifiedCount ?? 0,
    notificationFailures,
    approvedCommissionIds: commissionIds,
    notifications,
  };
}

export async function revertApprovedCommissions(commissionIds: unknown[]): Promise<number> {
  if (commissionIds.length === 0) return 0;

  const result = await Commission.updateMany(
    { _id: { $in: commissionIds }, status: "approved" },
    {
      $set: { status: "pending" },
      $unset: { approvedBy: 1, approvedAt: 1 },
    },
  );

  return result.modifiedCount ?? 0;
}

export async function sendCommissionApprovalNotifications(
  notifications: CommissionApprovalNotification[],
): Promise<number> {
  const notificationResults = await Promise.allSettled(
    notifications.map((notification) => notifyCommissionApproved(
      notification.userId,
      notification.role,
      notification.amount,
      notification.currency,
    )),
  );

  return notificationResults.filter((item) => item.status === "rejected").length;
}