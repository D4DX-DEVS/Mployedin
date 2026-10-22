"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { InlineFilterBar, InlineFilterSearch } from "@/components/shared/InlineFilterBar";
import { useTableExport } from "@/hooks/useTableExport";
import type { ExportColumn } from "@/lib/export";
import { formatCurrency } from "@/lib/currency";

export interface AgentPerformanceRow extends Record<string, unknown> {
  agentId: string;
  name: string;
  isActive: boolean;
  leads: number;
  convertedLeads: number;
  placements: number;
  conversionRate: number;
  commission: number;
}

interface AgentPerformanceTableProps {
  rows: AgentPerformanceRow[];
  currency: string;
}

/**
 * Every agent in the team on one row — the dashboard shows the top five, this
 * is the full list to review, search and export. It replaced a stack of cards
 * whose coloured bars were scaled by hand (leads × 2 %, placements × 5 %) and
 * so compared nothing.
 */
export function AgentPerformanceTable({ rows, currency }: AgentPerformanceTableProps) {
  const t = useTranslations("superAgentReports");
  const locale = useLocale();
  const [search, setSearch] = useState("");

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? rows.filter((row) => row.name.toLowerCase().includes(q)) : rows;
  }, [rows, search]);

  const exportColumns: ExportColumn<AgentPerformanceRow>[] = [
    { header: t("agent"), key: "name" },
    { header: t("placements"), key: "placements" },
    { header: t("commissionIn", { currency }), key: "commission" },
    { header: t("leads"), key: "leads" },
    { header: t("convertedLeads"), key: "convertedLeads" },
    { header: t("conversion"), key: "conversionRate", formatter: (value) => `${value}%` },
  ];
  const { handleExportCsv, handleExportExcel } = useTableExport({
    data: visible,
    columns: exportColumns,
    filename: "sa-team-performance",
  });

  return (
    <div className="space-y-3">
      <InlineFilterBar onExportCsv={handleExportCsv} onExportExcel={handleExportExcel}>
        <InlineFilterSearch value={search} onChange={setSearch} placeholder={t("searchAgents")} />
      </InlineFilterBar>

      {visible.length === 0 ? (
        <div className="rounded-2xl border border-border/70 bg-secondary/50 text-sm leading-6 text-muted-foreground panel-body">
          {t("noAgentMatch")}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-border/60">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/30 hover:bg-muted/30">
                {/* Placements and commission lead: on phones the table becomes
                    cards that show only the first two cells until tapped. */}
                <TableHead>{t("agent")}</TableHead>
                <TableHead className="text-end">{t("placements")}</TableHead>
                <TableHead className="text-end">{t("commission")}</TableHead>
                <TableHead className="text-end">{t("leads")}</TableHead>
                <TableHead className="text-end">{t("convertedLeads")}</TableHead>
                <TableHead className="text-end">{t("conversion")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.map((row) => (
                <TableRow key={row.agentId} className="bg-transparent">
                  <TableCell className="min-w-0">
                    <div className="flex items-center gap-2">
                      <Link
                        href={`/${locale}/super-agent/agents/${row.agentId}`}
                        className="!justify-start truncate font-medium text-foreground hover:text-primary hover:underline"
                      >
                        {row.name}
                      </Link>
                      {!row.isActive ? <Badge variant="secondary">{t("inactive")}</Badge> : null}
                    </div>
                  </TableCell>
                  <TableCell className="text-end tabular-nums font-medium text-foreground">{row.placements}</TableCell>
                  <TableCell className="text-end tabular-nums text-foreground">{formatCurrency(row.commission, currency)}</TableCell>
                  <TableCell className="text-end tabular-nums text-muted-foreground">{row.leads}</TableCell>
                  <TableCell className="text-end tabular-nums text-muted-foreground">{row.convertedLeads}</TableCell>
                  <TableCell className="text-end tabular-nums text-muted-foreground">
                    {row.leads > 0 ? `${row.conversionRate}%` : "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
