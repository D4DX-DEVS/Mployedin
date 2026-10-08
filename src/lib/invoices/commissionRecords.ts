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
  /** Lines left pending because the approver owns them (segregation of duties). */
  skippedSelfApproval: number;
  skippedCommissionIds: unknown[];
  /** The approver's own profile ids, so callers can apply the same rule to embedded lines. */
  approver: CommissionApproverIdentity;
}

interface ApproveCommissionsOptions {
  sendNotifications?: boolean;
  session?: mongoose.ClientSession;
}

/** The acting user's commission-earning identities, if any. Admins have none. */
export interface CommissionApproverIdentity {
  agentId: string | null;
  superAgentId: string | null;
}

/** Resolve the acting user's agent / super-agent profile ids. */
export async function resolveCommissionApprover(
  userId: unknown,
  session?: mongoose.ClientSession,
): Promise<CommissionApproverIdentity> {
  const agentQuery = Agent.findOne({ userId }).select("_id");
  const superAgentQuery = SuperAgent.findOne({ userId }).select("_id");
  if (session) {
    agentQuery.session(session);
    superAgentQuery.session(session);
  }
  const [agent, superAgent] = await Promise.all([agentQuery.lean(), superAgentQuery.lean()]);
  return {
    agentId: agent ? String(agent._id) : null,
    superAgentId: superAgent ? String(superAgent._id) : null,
  };
}

/**
 * Segregation of duties: whoever triggers the paid transition must never
 * auto-approve the commission line they themselves earn. Marking an invoice
 * paid is self-asserted — there is no gateway confirmation on that path — so a
 * super-agent approving their own override would be paying themselves.
 * Their line stays pending for admin review.
 */
export function isOwnCommissionLine(
  line: { agentId?: unknown; superAgentId?: unknown; type?: unknown; role?: unknown },
  approver: CommissionApproverIdentity,
): boolean {
  // Match the BENEFICIARY, not merely a populated id. An agent's "placement"
  // line also carries the overseeing super-agent's id for scoping — that SA
  // does not earn it, and treating it as theirs would lock them out of
  // approving their own team's commissions.
  // External records carry `type`; the embedded invoice lines carry `role`.
  const earnedBySuperAgent =
    line.role === "super_agent" ||
    line.type === "override" ||
    (!line.agentId && Boolean(line.superAgentId));

  if (earnedBySuperAgent) {
    return Boolean(
      approver.superAgentId && String(line.superAgentId ?? "") === approver.superAgentId,
    );
  }
  return Boolean(approver.agentId && String(line.agentId ?? "") === approver.agentId);
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
  // NOTE: This implementation is protected by a unique compound index on
  // (invoiceId, agentId, type) in the Commission model schema to prevent race conditions.
  // Concurrent requests will fail on the second attempt with duplicate key error.
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
 * - Pending/approved/disputed commissions → status `clawed_back` with the reason
 *   appended to `notes` (CM-6). They are kept, not deleted, so the audit trail
 *   and any dispute history survive; `clawed_back` is terminal.
 * - Paid commissions → left untouched (money already went out; require manual
 *   clawback via PATCH /api/commissions/[id]).
 *
 * Returns counts of reversed vs already-paid commissions.
 */
export async function reverseCommissionsForInvoice(
  invoiceId: unknown,
  reason = "Invoice voided or cancelled",
  clawbackBy?: unknown,
): Promise<ReverseCommissionsResult> {
  const commissions = await Commission.find({ invoiceId }).lean();

  if (commissions.length === 0) {
    return { reversed: 0, alreadyPaid: 0 };
  }

  const reversible = commissions.filter(
    (c) => c.status === "pending" || c.status === "approved" || c.status === "disputed",
  );
  const alreadyPaid = commissions.filter((c) => c.status === "paid");

  if (reversible.length > 0) {
    await clawBackCommissions(reversible, reason, clawbackBy);
  }

  return {
    reversed: reversible.length,
    alreadyPaid: alreadyPaid.length,
  };
}

function appendNote(existing: string | undefined, note: string): string {
  return existing ? `${existing}\n${note}` : note;
}

async function clawBackCommissions(
  lines: Array<{ _id: unknown; amount: number; notes?: string; status: string }>,
  reason: string,
  clawbackBy?: unknown,
): Promise<void> {
  const clawbackAt = new Date();
  await Commission.bulkWrite(
    lines.map((c) => ({
      updateOne: {
        // Status guard: never overwrite a line that moved on concurrently.
        filter: { _id: c._id, status: c.status },
        update: {
          $set: {
            status: "clawed_back",
            clawbackAmount: c.amount,
            clawbackReason: reason.slice(0, 1000),
            clawbackAt,
            ...(clawbackBy ? { clawbackBy } : {}),
            notes: appendNote(c.notes, `Clawed back: ${reason}`),
          },
        },
      },
    })) as Parameters<typeof Commission.bulkWrite>[0],
  );
}

/**
 * CM-5: claw back commissions after money is returned to the client
 * (credit note or gateway refund).
 *
 * Deliberately simple rule:
 * - FULL refund/credit (`fullyRefunded`) → every non-terminal line (pending,
 *   approved, disputed, paid) becomes `clawed_back`. Paid lines are included
 *   because the fee they were earned on no longer exists; recovering the payout
 *   from the agent is an offline finance step recorded by `clawbackAmount`.
 * - PARTIAL refund/credit → lines are kept as they are, and a note recording
 *   the partial amount is appended so finance can adjust manually. No
 *   pro-rata maths is attempted.
 */
export async function clawBackCommissionsForRefund(
  invoiceId: unknown,
  opts: {
    fullyRefunded: boolean;
    amount: number;
    currency: string;
    reason: string;
    clawbackBy?: unknown;
    /** Written into the note; lines already carrying it are skipped (gateway retries). */
    dedupeKey?: string;
  },
): Promise<{ clawedBack: number; annotated: number }> {
  const candidates = await Commission.find({
    invoiceId,
    status: { $in: ["pending", "approved", "disputed", "paid"] },
  }).lean();
  const lines = opts.dedupeKey
    ? candidates.filter((c) => !c.notes?.includes(opts.dedupeKey as string))
    : candidates;
  if (lines.length === 0) return { clawedBack: 0, annotated: 0 };

  if (opts.fullyRefunded) {
    await clawBackCommissions(lines, opts.reason, opts.clawbackBy);
    return { clawedBack: lines.length, annotated: 0 };
  }

  const note = `Partial refund/credit of ${opts.amount} ${opts.currency} on the invoice (${opts.reason}) — review commission manually.${opts.dedupeKey ? ` [${opts.dedupeKey}]` : ""}`;
  await Commission.bulkWrite(
    lines.map((c) => ({
      updateOne: { filter: { _id: c._id }, update: { $set: { notes: appendNote(c.notes, note) } } },
    })) as Parameters<typeof Commission.bulkWrite>[0],
  );
  return { clawedBack: 0, annotated: lines.length };
}

export async function approvePendingCommissionsForPaidInvoice(
  invoiceId: unknown,
  approvedBy: unknown,
  options: ApproveCommissionsOptions = {},
): Promise<ApproveCommissionsResult> {
  const { session } = options;
  const approvedAt = new Date();
  const approver = await resolveCommissionApprover(approvedBy, session);

  const allPending = await Commission.find({ invoiceId, status: "pending" })
    .select("_id agentId superAgentId amount currency")
    .session(session ?? null)
    .lean();

  // The approver's own line never rides along on their own approval.
  const pendingCommissions = allPending.filter((c) => !isOwnCommissionLine(c, approver));
  const skippedCommissionIds = allPending
    .filter((c) => isOwnCommissionLine(c, approver))
    .map((c) => c._id);

  if (pendingCommissions.length === 0) {
    return {
      approved: 0,
      notificationFailures: 0,
      approvedCommissionIds: [],
      notifications: [],
      skippedSelfApproval: skippedCommissionIds.length,
      skippedCommissionIds,
      approver,
    };
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
    skippedSelfApproval: skippedCommissionIds.length,
    skippedCommissionIds,
    approver,
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