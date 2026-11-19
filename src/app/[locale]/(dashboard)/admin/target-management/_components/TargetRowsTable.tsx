"use client";

import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { Ban, CheckCircle2, Eye, MapPin, Pencil, SplitSquareVertical, Trash2, UsersRound } from "lucide-react";
import { RowActions, type RowAction } from "@/components/shared/RowActions";
import { SortableTableHeader } from "@/components/shared/TableSortControl";
import { PhoneRecordList } from "@/components/shared/PhoneRecordList";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PerformanceBadge, RiskBadge } from "@/components/features/targets/TargetComponents";
import { formatProfit } from "@/components/features/targets/profitFormat";
import type { TargetProfileSortField } from "@/lib/targets/profileSortFields";

export interface TargetListRow {
  _id: string;
  /** The assignee's USER id (revenue permission is set on it). */
  assigneeId: string;
  assigneeName: string;
  assigneeEmail: string;
  assigneeRole: string;
  year: number;
  region?: string;
  currency: string;
  targetType?: "profit" | "kpi3";
  jobTarget?: number;
  conversionTarget?: number;
  revenueTarget?: number;
  jobActual?: number;
  onboardedActual?: number;
  revenueActual?: number;
  overallProgress: number;
  setByRole?: "admin" | "super_agent";
  overriddenByAdmin?: boolean;
  canSetRevenueTargets?: boolean;
  riskScore: "high" | "medium" | "low";
  teamSize: number;
}

interface TargetRowsTableProps {
  rows: TargetListRow[];
  loading: boolean;
  empty: React.ReactNode;
  sortBy: string;
  order: "asc" | "desc";
  onSort: (field: TargetProfileSortField) => void;
  onEdit: (row: TargetListRow) => void;
  onReassign: (row: TargetListRow) => void;
  onRevenuePermission: (row: TargetListRow) => void;
  onRemove: (row: TargetListRow) => void;
}

export function TargetRowsTable({ rows, loading, empty, sortBy, order, onSort, onEdit, onReassign, onRevenuePermission, onRemove }: TargetRowsTableProps) {
  const t = useTranslations("profitTargets");
  const intl = useLocale();
  const href = (row: TargetListRow) => `/${intl}/admin/target-management/${row._id}`;
  const header = (field: TargetProfileSortField, label: string) => (
    <SortableTableHeader label={label} active={sortBy === field} order={order} onClick={() => onSort(field)} />
  );

  const isKpi = (row: TargetListRow) => row.targetType === "kpi3";
  /** "3 of 12" (or money), a dash when that target is not set. */
  const pair = (row: TargetListRow, actual?: number, target?: number, money = false) => {
    if (!isKpi(row) || !(target && target > 0)) return <span className="text-xs text-muted-foreground">—</span>;
    const fmt = (n: number) => (money ? formatProfit(n, row.currency, intl, "compact") : String(n));
    return (
      <span className="tabular-nums text-sm">
        <span className="font-medium text-foreground">{fmt(actual ?? 0)}</span>
        <span className="text-muted-foreground"> {t("ofTarget", { target: fmt(target) })}</span>
      </span>
    );
  };

  const menu = (row: TargetListRow): RowAction[] => [
    { key: "view", label: t("viewTarget"), icon: Eye, href: href(row) },
    ...(isKpi(row) ? [{ key: "edit", label: t("a11yEdit"), icon: Pencil, onSelect: () => onEdit(row) }] : []),
    { key: "reassign", label: t("a11yReassign"), icon: SplitSquareVertical, onSelect: () => onReassign(row) },
    ...(row.assigneeRole === "super_agent"
      ? [{
          key: "revenue",
          label: row.canSetRevenueTargets ? t("stopRevenueTargets") : t("allowRevenueTargets"),
          icon: row.canSetRevenueTargets ? Ban : CheckCircle2,
          onSelect: () => onRevenuePermission(row),
        }]
      : []),
    { key: "remove", label: t("removeTarget"), icon: Trash2, onSelect: () => onRemove(row), destructive: true },
  ];

  const source = (row: TargetListRow) =>
    row.overriddenByAdmin ? t("overriddenByAdmin") : row.setByRole === "super_agent" ? t("setBySuperAgent") : null;

  return (
    <>
      <PhoneRecordList
        className="sm:hidden"
        label={t("title")}
        loading={loading}
        empty={empty}
        items={rows.map((row) => ({
          key: row._id,
          href: href(row),
          title: row.assigneeName,
          subtitle: row.assigneeEmail,
          trailing: <PerformanceBadge pct={row.overallProgress} />,
          actions: <RowActions name={row.assigneeName} menu={menu(row)} />,
          meta: isKpi(row) ? (
            <div className="space-y-0.5 text-xs">
              <p>{t("jobProgressShort")}: {pair(row, row.jobActual, row.jobTarget)}</p>
              <p>{t("conversionProgressShort")}: {pair(row, row.onboardedActual, row.conversionTarget)}</p>
              <p>{t("revenueProgressShort")}: {pair(row, row.revenueActual, row.revenueTarget, true)}</p>
            </div>
          ) : <p className="text-xs text-muted-foreground">{t("legacyProfitTarget")}</p>,
          badges: (
            <>
              <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs font-semibold tabular-nums">
                <UsersRound className="size-3" aria-hidden="true" /> {row.teamSize}
              </span>
              <RiskBadge risk={row.riskScore} />
            </>
          ),
        }))}
      />

      <div className="overflow-x-auto rounded-2xl border border-border/60 bg-card max-sm:hidden">
        <Table className="sm:[&_td]:px-3 sm:[&_th]:px-3">
          <TableHeader>
            <TableRow className="bg-muted/30 hover:bg-muted/30">
              <TableHead>{header("name", t("superAgentHeader"))}</TableHead>
              <TableHead className="hidden text-center lg:table-cell">{header("teamSize", t("teamHeader"))}</TableHead>
              <TableHead>{header("jobProgress", t("jobProgressShort"))}</TableHead>
              <TableHead>{header("onboardedProgress", t("conversionProgressShort"))}</TableHead>
              <TableHead>{header("revenueProgress", t("revenueProgressShort"))}</TableHead>
              <TableHead>{header("profitProgress", t("overallHeader"))}</TableHead>
              <TableHead>{header("risk", t("riskHeader"))}</TableHead>
              <TableHead className="w-12"><span className="sr-only">{t("actionsHeader")}</span></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 8 }).map((__, j) => (
                    <TableCell key={j}><div className="h-4 w-16 animate-pulse rounded bg-muted" /></TableCell>
                  ))}
                </TableRow>
              ))
            ) : rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="py-12">{empty}</TableCell>
              </TableRow>
            ) : (
              rows.map((row) => (
                <TableRow key={row._id}>
                  <TableCell>
                    <Link href={href(row)} className="block min-w-0">
                      <p className="font-medium hover:underline">{row.assigneeName}</p>
                      <p className="text-xs text-muted-foreground [overflow-wrap:anywhere]">{row.assigneeEmail}</p>
                    </Link>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {row.region && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs">
                          <MapPin className="size-3" aria-hidden="true" /> {row.region}
                        </span>
                      )}
                      {source(row) && (
                        <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">{source(row)}</span>
                      )}
                      {!isKpi(row) && (
                        <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">{t("legacyProfitTarget")}</span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="hidden text-center lg:table-cell">
                    <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs font-semibold tabular-nums">
                      <UsersRound className="size-3" aria-hidden="true" /> {row.teamSize}
                    </span>
                  </TableCell>
                  <TableCell>{pair(row, row.jobActual, row.jobTarget)}</TableCell>
                  <TableCell>{pair(row, row.onboardedActual, row.conversionTarget)}</TableCell>
                  <TableCell>{pair(row, row.revenueActual, row.revenueTarget, true)}</TableCell>
                  <TableCell><PerformanceBadge pct={row.overallProgress} /></TableCell>
                  <TableCell><RiskBadge risk={row.riskScore} /></TableCell>
                  <TableCell className="text-end">
                    <RowActions name={row.assigneeName} menu={menu(row)} />
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </>
  );
}
