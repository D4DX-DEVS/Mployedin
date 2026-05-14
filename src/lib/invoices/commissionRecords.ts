import Commission, { type ICommission } from "@/models/Commission";
import type { IInvoiceCommission } from "@/models/Invoice";

interface CreateCommissionRecordsForInvoiceInput {
  invoiceId: unknown;
  commissions: IInvoiceCommission[];
  currency: string;
}

interface ReverseCommissionsResult {
  reversed: number;
  alreadyPaid: number;
}

function invoiceCommissionNote(notes?: string): string {
  return notes ? `Auto-generated from approved invoice - ${notes}` : "Auto-generated from approved invoice";
}

export async function createCommissionRecordsForInvoice({
  invoiceId,
  commissions,
  currency,
}: CreateCommissionRecordsForInvoiceInput): Promise<ICommission[]> {
  const createdRecords: ICommission[] = [];

  for (const commission of commissions) {
    if (commission.amount <= 0 || commission.rate <= 0) continue;

    if (commission.role === "agent" && commission.agentId) {
      const created = await Commission.create({
        invoiceId,
        agentId: commission.agentId,
        superAgentId: commission.superAgentId,
        type: "placement",
        amount: commission.amount,
        currency,
        rate: commission.rate,
        status: "pending",
        notes: invoiceCommissionNote(commission.notes),
      });
      createdRecords.push(created);
    }

    if (commission.role === "super_agent" && commission.superAgentId) {
      const created = await Commission.create({
        invoiceId,
        superAgentId: commission.superAgentId,
        type: "override",
        amount: commission.amount,
        currency,
        rate: commission.rate,
        status: "pending",
        notes: invoiceCommissionNote(commission.notes),
      });
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