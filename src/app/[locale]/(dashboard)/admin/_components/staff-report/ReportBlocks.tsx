"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { AlertTriangle, CheckCircle2, ChevronRight, CircleAlert, Info, type LucideIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/shared/EmptyState";
import { formatCurrency } from "@/lib/currency";
import { formatCount, formatListDate } from "@/lib/ui/intlFormat";
import { cn } from "@/lib/utils";
import type { Capped, Money, MoneyByStatus, ReportGap, WorkState } from "@/lib/admin/staffReport/types";

export function Panel({ title, action, children, className }: { title: ReactNode; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn("workspace-panel-surface min-w-0 rounded-2xl p-4 sm:p-5", className)}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

/** Amounts per currency, never added across currencies. */
export function MoneyText({ items, empty = "0", className }: { items: Money[]; empty?: string; className?: string }) {
  if (items.length === 0) return <span className={className}>{empty}</span>;
  return (
    <span className={cn("flex flex-wrap gap-x-2", className)}>
      {items.map((m) => <span key={m.currency} className="whitespace-nowrap tabular-nums">{formatCurrency(m.amount, m.currency, "code")}</span>)}
    </span>
  );
}

export interface TileItem {
  key: string;
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  icon: LucideIcon;
  /** warn = the number itself is the problem (red); alert = only the icon flags it. */
  tone?: "default" | "warn" | "alert";
  /** Opens the tab that lists what this number counts. */
  onOpen?: () => void;
  openLabel?: string;
}

function TileBody({ k }: { k: TileItem }) {
  return (
    <>
      <div className="flex min-w-0 items-center gap-2 text-muted-foreground">
        <k.icon className={cn("size-4 shrink-0", k.tone && k.tone !== "default" ? "text-destructive" : "text-primary")} aria-hidden="true" />
        <span className="truncate text-xs sm:text-sm">{k.label}</span>
        {k.onOpen && <ChevronRight className="ms-auto size-4 shrink-0 opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100 rtl:rotate-180" aria-hidden="true" />}
      </div>
      <div className={cn("min-w-0 text-lg font-semibold tabular-nums sm:text-2xl", k.tone === "warn" && "text-destructive")}>{k.value}</div>
      {k.hint && <div className="min-w-0 text-xs text-muted-foreground [overflow-wrap:anywhere]">{k.hint}</div>}
    </>
  );
}

/** One labelled row of tiles; on desktop the tiles share the row evenly. */
export function TileGroup({ title, items }: { title: string; items: TileItem[] }) {
  if (items.length === 0) return null;
  const box = "workspace-panel-surface flex h-full min-w-0 flex-col gap-1 rounded-2xl p-3 text-start sm:p-4";
  return (
    <section className="space-y-2">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</h2>
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-flow-col lg:grid-cols-none lg:auto-cols-fr">
        {items.map((k) => k.onOpen ? (
          <button
            key={k.key}
            type="button"
            onClick={k.onOpen}
            aria-label={k.openLabel}
            className={cn(box, "group transition-colors hover:border-primary/40 hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring")}
          >
            <TileBody k={k} />
          </button>
        ) : (
          <div key={k.key} className={box}><TileBody k={k} /></div>
        ))}
      </div>
    </section>
  );
}


const SEVERITY: Record<ReportGap["severity"], { icon: LucideIcon; cls: string }> = {
  high: { icon: CircleAlert, cls: "border-destructive/30 bg-destructive/5 text-destructive" },
  medium: { icon: AlertTriangle, cls: "border-amber-300/60 bg-amber-50 text-amber-800" },
  low: { icon: Info, cls: "border-border bg-muted/40 text-muted-foreground" },
};

export function GapList({ gaps }: { gaps: ReportGap[] }) {
  const t = useTranslations("adminStaffReport");
  if (gaps.length === 0) {
    return (
      <p className="flex items-center gap-2 text-sm text-emerald-700">
        <CheckCircle2 className="size-4" aria-hidden="true" /> {t("noGaps")}
      </p>
    );
  }
  return (
    <ul className="flex flex-col gap-2">
      {gaps.map((g) => {
        const s = SEVERITY[g.severity];
        return (
          <li key={g.key} className={cn("flex items-start gap-2 rounded-xl border px-3 py-2 text-sm", s.cls)}>
            <s.icon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <span className="min-w-0 flex-1 text-foreground">{t(`gap.${g.key}`, { count: g.value ?? 0 })}</span>
            <Badge variant="outline" className="shrink-0 text-[11px]">{t(`severity.${g.severity}`)}</Badge>
          </li>
        );
      })}
    </ul>
  );
}

type MoneyCol = "pending" | "approved" | "paid" | "disputed" | "total";
const MONEY_COLS: MoneyCol[] = ["pending", "approved", "paid", "disputed", "total"];

export function MoneyTable({ rows, label }: { rows: MoneyByStatus[]; label?: string }) {
  const t = useTranslations("adminStaffReport");
  if (rows.length === 0) return <p className="text-sm text-muted-foreground">{t("noCommissions")}</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[460px] text-sm">
        {label && <caption className="sr-only">{label}</caption>}
        <thead>
          <tr className="text-xs text-muted-foreground">
            <th scope="col" className="py-1.5 pe-3 text-start font-medium">{t("currency")}</th>
            {MONEY_COLS.map((c) => <th key={c} scope="col" className="py-1.5 pe-3 text-end font-medium">{t(`money.${c}`)}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.currency} className="border-t">
              <td className="py-2 pe-3 font-medium">{r.currency}</td>
              {MONEY_COLS.map((c) => (
                <td key={c} className={cn("py-2 pe-3 text-end tabular-nums", c === "total" && "font-semibold")}>
                  {formatCurrency(r[c], r.currency, "code")}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Several money-by-status groups in one table, each row labelled with whose money it is. */
export function GroupedMoneyTable({ groups }: { groups: Array<{ label: string; rows: MoneyByStatus[]; strong?: boolean }> }) {
  const t = useTranslations("adminStaffReport");
  const lines = groups.flatMap((g) => g.rows.map((r) => ({ g, r })));
  if (lines.length === 0) return <p className="text-sm text-muted-foreground">{t("noCommissions")}</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] text-sm">
        <thead>
          <tr className="text-xs text-muted-foreground">
            <th scope="col" className="py-1.5 pe-3 text-start font-medium">{t("col.earnedBy")}</th>
            <th scope="col" className="py-1.5 pe-3 text-start font-medium">{t("currency")}</th>
            {MONEY_COLS.map((c) => <th key={c} scope="col" className="py-1.5 pe-3 text-end font-medium">{t(`money.${c}`)}</th>)}
          </tr>
        </thead>
        <tbody>
          {lines.map(({ g, r }) => (
            <tr key={`${g.label}-${r.currency}`} className={cn("border-t", g.strong && "bg-muted/40 font-semibold")}>
              <td className="py-2 pe-3">{g.label}</td>
              <td className="py-2 pe-3">{r.currency}</td>
              {MONEY_COLS.map((c) => (
                <td key={c} className={cn("py-2 pe-3 text-end tabular-nums", c === "total" && "font-semibold")}>
                  {formatCurrency(r[c], r.currency, "code")}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export interface Column<T> {
  key: string;
  label: string;
  render: (row: T) => ReactNode;
  className?: string;
}

/**
 * A read-only table; the first column links to `hrefOf(row)` when given.
 * Wide tables scroll inside their panel, never the page.
 */
export function SimpleTable<T>({
  data, columns, empty, hrefOf, rowKey,
}: { data: Capped<T>; columns: Column<T>[]; empty: string; hrefOf?: (row: T) => string | null; rowKey: (row: T, i: number) => string }) {
  const t = useTranslations("adminStaffReport");
  if (data.rows.length === 0) return <EmptyState title={empty} />;
  return (
    <>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="text-xs text-muted-foreground">
              {columns.map((c) => <th key={c.key} scope="col" className={cn("py-2 pe-3 text-start font-medium", c.className)}>{c.label}</th>)}
            </tr>
          </thead>
          <tbody>
            {data.rows.map((r, i) => {
              const href = hrefOf?.(r) ?? null;
              return (
                <tr key={rowKey(r, i)} className="border-t hover:bg-muted/30">
                  {columns.map((c, ci) => (
                    <td key={c.key} className={cn("py-2.5 pe-3 align-top", c.className)}>
                      {ci === 0 && href ? (
                        <Link href={href} className="rounded font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                          {c.render(r)}
                        </Link>
                      ) : c.render(r)}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {data.total > data.rows.length && (
        <p className="mt-2 text-xs text-muted-foreground">{t("showingFirst", { shown: data.rows.length, total: data.total })}</p>
      )}
    </>
  );
}

export function DateCell({ value }: { value?: string | null }) {
  const locale = useLocale();
  return <span className="whitespace-nowrap text-muted-foreground">{value ? formatListDate(new Date(value), locale) : "—"}</span>;
}

export function Num({ value }: { value: number }) {
  return <span className="tabular-nums">{formatCount(value)}</span>;
}

const STATE_CLS: Record<WorkState, string> = {
  working: "border-emerald-300 bg-emerald-50 text-emerald-800",
  idle: "border-amber-300 bg-amber-50 text-amber-800",
  inactive: "border-border bg-muted text-muted-foreground",
};

export function WorkStateBadge({ state }: { state: WorkState }) {
  const t = useTranslations("adminStaffReport");
  return <Badge variant="outline" className={cn("text-xs", STATE_CLS[state])}>{t(`state.${state}`)}</Badge>;
}

/** Status words: a translated label when we have one, else the raw value tidied. */
export function useStatusLabel() {
  const t = useTranslations("adminStaffReport");
  return (group: "appStatus" | "invoiceStatus" | "exStatus" | "commissionStatus" | "taskStatus" | "jobStatus" | "ctype" | "priority", key: string) =>
    t.has(`${group}.${key}`) ? t(`${group}.${key}`) : key.replace(/_/g, " ");
}
