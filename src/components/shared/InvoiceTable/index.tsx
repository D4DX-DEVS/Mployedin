"use client";

import { useTranslations } from "next-intl";
import { Eye, Inbox } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { EmptyState } from "@/components/shared/EmptyState";
import { ListSkeleton } from "@/components/shared/ListSkeleton";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";

export interface InvoiceTableInvoice {
  _id: string;
  invoiceNumber: string;
  category: string;
  totalAmount: number;
  paidAmount: number;
  balanceDue: number;
  currency: string;
  status: string;
  dueDate?: string;
  jobId?: { title?: string; _id?: string };
  employerId?: { companyName?: string; _id?: string };
  agentId?: { name?: string; email?: string; _id?: string };
  commissions?: Array<{ role: string; rate: number; amount: number; status: string }>;
}

interface InvoiceTableProps {
  invoices: InvoiceTableInvoice[];
  loading: boolean;
  role: "agent" | "super_agent";
  onSelect: (id: string) => void;
}

interface Column {
  key: string;
  header: string;
  headerClassName?: string;
  cellClassName?: string;
  cell: (inv: InvoiceTableInvoice) => React.ReactNode;
}

export function InvoiceTable({ invoices, loading, role, onSelect }: InvoiceTableProps) {
  const t = useTranslations("invoiceTable");
  const tc = useTranslations("common");

  // Agent's own table hides secondary columns responsively; super-agent's
  // richer team view keeps everything visible (matches pre-extraction markup).
  const hiddenMd = role === "agent" ? "hidden md:table-cell" : undefined;
  const hiddenLg = role === "agent" ? "hidden lg:table-cell" : undefined;
  const hiddenXl = role === "agent" ? "hidden xl:table-cell" : undefined;

  const columns: Column[] = [
    {
      key: "invoiceNumber",
      header: t("invoiceNumber"),
      cell: (inv) => <p className="font-mono text-sm font-medium">{inv.invoiceNumber}</p>,
    },
    {
      key: "employer",
      header: t("employer"),
      cell: (inv) => <p className="max-w-[130px] truncate font-medium">{inv.employerId?.companyName ?? "—"}</p>,
    },
    {
      key: "job",
      header: t("job"),
      headerClassName: hiddenMd,
      cellClassName: hiddenMd,
      cell: (inv) => <p className="max-w-[120px] truncate text-sm text-muted-foreground">{inv.jobId?.title ?? "—"}</p>,
    },
    ...(role === "super_agent"
      ? [{
          key: "agent",
          header: t("agent"),
          cell: (inv: InvoiceTableInvoice) => <p className="text-sm text-muted-foreground">{inv.agentId?.name ?? inv.agentId?.email ?? "—"}</p>,
        }]
      : []),
    {
      key: "category",
      header: t("category"),
      headerClassName: hiddenLg,
      cellClassName: hiddenLg,
      cell: (inv) => <span className="text-[10px] capitalize text-muted-foreground">{inv.category?.replace(/_/g, " ")}</span>,
    },
    {
      key: "total",
      header: t("total"),
      headerClassName: "text-right",
      cellClassName: "text-right font-semibold",
      cell: (inv) => `${inv.currency} ${(inv.totalAmount ?? 0).toLocaleString()}`,
    },
    {
      key: "paid",
      header: t("paid"),
      headerClassName: "text-right",
      cellClassName: "text-right text-sm text-emerald-600 dark:text-emerald-400",
      cell: (inv) => `${inv.currency} ${(inv.paidAmount ?? 0).toLocaleString()}`,
    },
    {
      key: "balance",
      header: t("balance"),
      headerClassName: "text-right",
      cellClassName: "text-right text-sm text-amber-600 dark:text-amber-400",
      cell: (inv) => `${inv.currency} ${(inv.balanceDue ?? 0).toLocaleString()}`,
    },
    {
      key: "commission",
      header: t("commission"),
      headerClassName: hiddenXl,
      cellClassName: hiddenXl,
      cell: (inv) => {
        const myComm = inv.commissions?.find((c) => c.role === role);
        return myComm ? (
          <div className="text-xs">
            <p className="font-medium text-primary">{myComm.rate}% = {inv.currency} {myComm.amount.toLocaleString()}</p>
            <StatusBadge status={myComm.status} />
          </div>
        ) : <span className="text-xs text-muted-foreground">—</span>;
      },
    },
    {
      key: "status",
      header: tc("status"),
      cell: (inv) => <StatusBadge status={inv.status} />,
    },
    {
      key: "dueDate",
      header: t("dueDate"),
      headerClassName: hiddenMd,
      cellClassName: `${hiddenMd ?? ""} text-xs text-muted-foreground`.trim(),
      cell: (inv) => (inv.dueDate ? new Date(inv.dueDate).toLocaleDateString() : "—"),
    },
    {
      key: "actions",
      header: tc("actions"),
      headerClassName: "text-right",
      cell: (inv) => (
        <div className="flex justify-end" onClick={(e) => e.stopPropagation()}>
          <Button variant="ghost" size="sm" onClick={() => onSelect(inv._id)} className="h-7 w-7 p-0">
            <Eye className="h-3.5 w-3.5" />
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow className="border-border/80 bg-secondary/72 hover:bg-secondary/72">
            {columns.map((col) => (
              <TableHead key={col.key} className={col.headerClassName}>{col.header}</TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {loading ? (
            <TableRow className="border-border/70 hover:bg-transparent">
              <TableCell colSpan={columns.length} className="p-4">
                <ListSkeleton count={5} itemClassName="h-10 rounded-lg" />
              </TableCell>
            </TableRow>
          ) : invoices.length === 0 ? (
            <TableRow className="border-border/70 hover:bg-transparent">
              <TableCell colSpan={columns.length} className="p-0">
                <EmptyState
                  icon={Inbox}
                  title={t("emptyTitle")}
                  description={role === "agent" ? t("emptyDescriptionAgent") : t("emptyDescriptionSuperAgent")}
                  className="rounded-none border-none"
                />
              </TableCell>
            </TableRow>
          ) : (
            invoices.map((inv) => (
              <TableRow
                key={inv._id}
                className="border-border/70 cursor-pointer hover:bg-secondary/30"
                onClick={() => onSelect(inv._id)}
              >
                {columns.map((col) => (
                  <TableCell key={col.key} className={col.cellClassName}>{col.cell(inv)}</TableCell>
                ))}
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}
