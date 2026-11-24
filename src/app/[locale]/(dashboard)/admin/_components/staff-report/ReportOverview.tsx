"use client";

import { useTranslations } from "next-intl";
import {
  AlertTriangle, Briefcase, CalendarRange, CheckCircle2, FileText, Handshake, Receipt, Repeat, Target, Users, Wallet, Wand2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/currency";
import { formatCount } from "@/lib/ui/intlFormat";
import { cn } from "@/lib/utils";
import type { StaffReport, TargetMeasure, TargetSummary } from "@/lib/admin/staffReport/types";
import { GapList, MoneyText, Panel, TileGroup, useStatusLabel, type TileItem } from "./ReportBlocks";

/**
 * The headline numbers in three labelled rows (hiring, money, team). Each tile
 * opens the tab that lists what it counts. Red marks a problem only: overdue
 * money, most agents idle, a target at high risk.
 */
export function ReportTiles({ report, onOpenTab }: { report: StaffReport; onOpenTab: (tab: string) => void }) {
  const t = useTranslations("adminStaffReport");
  const x = report.tiles;
  const withLabel = (item: TileItem, tab: string): TileItem => ({
    ...item,
    onOpen: () => onOpenTab(tab),
    openLabel: `${item.label}: ${t("tileOpens", { tab: t(`tab.${tab}`) })}`,
  });
  const candidatesTab = report.kind === "agent" ? "candidates" : "jobs";

  const hiring: TileItem[] = [
    withLabel({ key: "jobs", label: t("tile.jobs"), value: formatCount(x.jobs.posted), hint: t("tile.jobsHint", { active: x.jobs.active, closed: x.jobs.closed }), icon: Briefcase }, "jobs"),
    withLabel({ key: "apps", label: t("tile.applications"), value: formatCount(x.applications), icon: FileText }, candidatesTab),
    withLabel({ key: "hires", label: t("tile.hires"), value: formatCount(x.hires.hired), hint: t("tile.hiresHint", { placements: x.hires.placements }), icon: Handshake }, candidatesTab),
    ...(x.candidatesMoved !== undefined ? [withLabel({ key: "moved", label: t("tile.candidatesMoved"), value: formatCount(x.candidatesMoved), icon: Repeat }, "candidates")] : []),
  ];
  const money: TileItem[] = [
    withLabel({ key: "inv", label: t("tile.invoices"), value: formatCount(x.invoices.count), hint: <MoneyText items={x.invoices.totals} empty="—" />, icon: Receipt }, "invoices"),
    withLabel({
      key: "recv", label: t("tile.receivables"), value: <MoneyText items={x.receivables.due} />,
      hint: x.receivables.overdueCount > 0
        ? <span className="font-medium text-destructive">{t("tile.overdueHint", { count: x.receivables.overdueCount })}: <MoneyText items={x.receivables.overdue} className="inline-flex" /></span>
        : t("tile.receivablesHint"),
      icon: Wallet, tone: x.receivables.overdueCount > 0 ? "alert" : "default",
    }, "invoices"),
    withLabel({
      key: "comm", label: report.kind === "super_agent" ? t("tile.commissionTeam") : t("tile.commission"),
      value: <MoneyText items={x.commission.owed} />, hint: <span>{t("tile.paid")}: <MoneyText items={x.commission.paid} className="inline-flex" /></span>, icon: Wallet,
    }, "commission"),
    withLabel({
      key: "target", label: t("tile.target"),
      value: report.target ? `${report.target.overallProgress}%` : "—",
      hint: report.target ? t("tile.targetHint", { expected: report.target.expectedProgress }) : t("tile.noTarget"),
      icon: Target, tone: report.target?.risk === "high" ? "warn" : "default",
    }, "overview"),
  ];
  const team: TileItem[] = [
    ...(x.workingAgents ? [withLabel({
      key: "working", label: t("tile.workingAgents"), value: `${formatCount(x.workingAgents.working)} / ${formatCount(x.workingAgents.total)}`,
      hint: t("tile.workingHint"), icon: Users, tone: x.workingAgents.total > 0 && x.workingAgents.working * 2 < x.workingAgents.total ? "warn" : "default",
    }, "agents")] : []),
    withLabel({ key: "subs", label: t("tile.subscriptions"), value: `${formatCount(x.subscriptions.active)} / ${formatCount(x.subscriptions.employers)}`, hint: t("tile.subscriptionsHint"), icon: CalendarRange }, "employers"),
    withLabel({ key: "ex", label: t("tile.exhibitions"), value: formatCount(x.exhibitions.total), icon: Wand2 }, "exhibitions"),
  ];
  return (
    <div className="space-y-4 sm:space-y-5">
      <TileGroup title={t("groupHiring")} items={hiring} />
      <TileGroup title={t("groupMoney")} items={money} />
      <TileGroup title={t("groupTeam")} items={team} />
    </div>
  );
}

/** The first thing admin reads: how many warnings, the worst two, and a way to all of them. */
export function AttentionStrip({ report, onSeeAll }: { report: StaffReport; onSeeAll: () => void }) {
  const t = useTranslations("adminStaffReport");
  const gaps = report.gaps;
  if (gaps.length === 0) {
    return (
      <p className="flex items-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
        <CheckCircle2 className="size-4 shrink-0" aria-hidden="true" />{t("noGaps")}
      </p>
    );
  }
  const high = gaps.some((g) => g.severity === "high");
  return (
    <section
      aria-label={t("gapsTitle")}
      className={cn(
        "flex flex-col gap-3 rounded-2xl border px-4 py-3 sm:flex-row sm:items-start sm:justify-between",
        high ? "border-destructive/30 bg-destructive/5" : "border-amber-300/60 bg-amber-50",
      )}
    >
      <div className="flex min-w-0 items-start gap-2">
        <AlertTriangle className={cn("mt-0.5 size-4 shrink-0", high ? "text-destructive" : "text-amber-700")} aria-hidden="true" />
        <div className="min-w-0 space-y-1">
          <p className="text-sm font-semibold text-foreground">{t("attentionTitle", { count: gaps.length })}</p>
          <ul className="space-y-0.5 text-sm text-foreground/80">
            {gaps.slice(0, 2).map((g) => <li key={g.key} className="[overflow-wrap:anywhere]">{t(`gap.${g.key}`, { count: g.value ?? 0 })}</li>)}
          </ul>
        </div>
      </div>
      <Button variant="outline" size="sm" className="min-h-11 shrink-0 bg-background sm:min-h-9" onClick={onSeeAll}>
        {t("attentionSeeAll")}
      </Button>
    </section>
  );
}

const FUNNEL = ["applied", "shortlisted", "interview_scheduled", "selected", "offer", "hired"];

function Funnel({ data }: { data: Record<string, number> }) {
  const t = useTranslations("adminStaffReport");
  const label = useStatusLabel();
  const max = Math.max(1, ...FUNNEL.map((k) => data[k] ?? 0));
  const closed = (data.rejected ?? 0) + (data.withdrawn ?? 0);
  return (
    <div className="space-y-2">
      {FUNNEL.map((k) => {
        const n = data[k] ?? 0;
        return (
          <div key={k} className="grid grid-cols-[7.5rem_1fr_3rem] items-center gap-2 text-sm">
            <span className="truncate text-muted-foreground">{label("appStatus", k)}</span>
            <div className="h-2.5 overflow-hidden rounded-full bg-muted" aria-hidden="true">
              <div className="h-full rounded-full bg-primary" style={{ width: `${Math.round((n / max) * 100)}%` }} />
            </div>
            <span className="text-end tabular-nums font-medium">{formatCount(n)}</span>
          </div>
        );
      })}
      <p className="pt-1 text-xs text-muted-foreground">{t("funnelNote", { closed })}</p>
    </div>
  );
}

function MeasureRow({ label, m, money }: { label: string; m: TargetMeasure; money?: string }) {
  const fmt = (n: number) => (money ? formatCurrency(n, money, "code") : formatCount(n));
  const pct = m.progress ?? 0;
  return (
    <div className="space-y-1">
      <div className="flex flex-wrap justify-between gap-2 text-sm">
        <span className="text-muted-foreground">{label}</span>
        <span className="tabular-nums"><span className="font-semibold">{fmt(m.actual)}</span> / {m.target > 0 ? fmt(m.target) : "—"}{m.progress != null && <span className="ms-2 text-muted-foreground">{pct}%</span>}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-muted" aria-hidden="true">
        <div className={cn("h-full rounded-full", pct >= 100 ? "bg-emerald-500" : "bg-primary")} style={{ width: `${Math.min(pct, 100)}%` }} />
      </div>
    </div>
  );
}

function TargetPanel({ target }: { target: TargetSummary | null }) {
  const t = useTranslations("adminStaffReport");
  if (!target) return <p className="text-sm text-muted-foreground">{t("tile.noTarget")}</p>;
  const risk = { high: "border-destructive/40 text-destructive", medium: "border-amber-300 text-amber-800", low: "border-emerald-300 text-emerald-800" }[target.risk];
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span>{t("target.year", { year: target.year })}</span>
        <Badge variant="outline" className={risk}>{t(`target.risk.${target.risk}`)}</Badge>
        <span className="text-muted-foreground">{t("target.pace", { expected: target.expectedProgress, overall: target.overallProgress })}</span>
      </div>
      {target.jobs && <MeasureRow label={t("target.jobs")} m={target.jobs} />}
      {target.onboarded && <MeasureRow label={t("target.onboarded")} m={target.onboarded} />}
      {target.revenue && <MeasureRow label={t("target.revenue")} m={target.revenue} money={target.currency} />}
      {target.profit && <MeasureRow label={t("target.profit")} m={target.profit} money={target.currency} />}
    </div>
  );
}

export function OverviewTab({ report }: { report: StaffReport }) {
  const t = useTranslations("adminStaffReport");
  return (
    <div className="grid gap-4 sm:gap-6 lg:grid-cols-2">
      <Panel title={t("gapsTitle")} action={<Badge variant="secondary">{report.gaps.length}</Badge>} className="lg:col-span-2">
        <GapList gaps={report.gaps} />
      </Panel>
      <Panel title={t("funnelTitle")}><Funnel data={report.funnel} /></Panel>
      <Panel title={t("targetTitle")}><TargetPanel target={report.target} /></Panel>
    </div>
  );
}
