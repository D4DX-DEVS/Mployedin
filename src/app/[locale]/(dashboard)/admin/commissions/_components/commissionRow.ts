import type { useTranslations } from "next-intl";
import type { ExportColumn } from "@/lib/export";
import { formatDate } from "@/lib/ui/intlFormat";

/** One row of GET /api/commissions as the admin ledger reads it. */
export interface Commission {
  _id: string;
  agentId?: { fullName?: string; _id?: string };
  superAgentId?: { fullName?: string; _id?: string };
  agentName?: string | null;
  /** Whoever earns the line: the agent on a placement, the super-agent on an override. */
  recipientName?: string | null;
  recipientRole?: "agent" | "super_agent" | null;
  invoice?: { _id: string; invoiceNumber?: string | null } | null;
  amount: number;
  currency?: string;
  status: string;
  type?: string;
  rate?: number;
  notes?: string;
  paymentRef?: string;
  /** Set once the money went out; stays set through a later dispute. */
  paidAt?: string | null;
  disputeReason?: string;
  disputeResolution?: string;
  clawbackAmount?: number;
  clawbackReason?: string;
  createdAt: string;
}

type CommissionsT = ReturnType<typeof useTranslations<"adminCommissions">>;

/** Export columns: who earns it, which invoice it came from, and how it was paid. */
export function commissionExportColumns(t: CommissionsT, typeLabels: Record<string, string>): ExportColumn<Commission>[] {
  return [
    { header: t("exportHeaderRecipient"), key: "recipientName", formatter: (v) => String(v ?? "—") },
    { header: t("exportHeaderRole"), key: "recipientRole", formatter: (v) => v === "agent" ? t("recipientAgent") : v === "super_agent" ? t("recipientSuperAgent") : "—" },
    { header: t("exportHeaderType"), key: "type", formatter: (v) => typeLabels[String(v)] ?? "—" },
    { header: t("exportHeaderInvoice"), key: "invoice", formatter: (_v, r) => (r as unknown as Commission).invoice?.invoiceNumber ?? "—" },
    { header: t("exportHeaderAmount"), key: "amount", formatter: (v) => String(v ?? 0) },
    { header: t("exportHeaderCurrency"), key: "currency", formatter: (v) => String(v ?? "AED") },
    { header: t("exportHeaderRate"), key: "rate", formatter: (v) => v != null ? `${v}%` : "—" },
    // The label, not the raw value — "clawed_back" in an Arabic export said nothing.
    { header: t("exportHeaderStatus"), key: "status", formatter: (v) => ({
      pending: t("statusPending"), approved: t("statusApproved"), paid: t("statusPaid"),
      disputed: t("statusDisputed"), clawed_back: t("statusClawedBack"),
    } as Record<string, string>)[String(v)] ?? String(v ?? "—") },
    { header: t("exportHeaderPaymentRef"), key: "paymentRef", formatter: (v) => String(v ?? "—") },
    { header: t("exportHeaderCreated"), key: "createdAt", formatter: (v) => v ? formatDate(new Date(String(v)), { day: "2-digit", month: "short", year: "numeric" }) : "—" },
  ];
}
