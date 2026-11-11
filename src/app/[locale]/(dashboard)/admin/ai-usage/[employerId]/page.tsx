"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { ArrowLeft, Coins, Activity, Hash, ScrollText } from "lucide-react";
import { ReportTabs } from "@/components/features/admin/ReportTabs";
import { PageHero } from "@/components/shared/PageHero";
import { ErrorState } from "@/components/shared/ErrorState";
import { EmptyState } from "@/components/shared/EmptyState";
import { PaginationControls } from "@/components/shared/PaginationControls";
import { PhoneRecordList } from "@/components/shared/PhoneRecordList";
import { ReportKpiGrid, type ReportKpi } from "@/components/features/admin/reports/ReportKpiGrid";
import { ReportCardHeader, reportCardClassName } from "@/components/features/admin/reports/ReportCard";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useUrlFilter } from "@/hooks/useUrlFilter";
import { formatCount, formatDateTime } from "@/lib/ui/intlFormat";
import { AI_FEATURES } from "@/lib/ai/aiFeatures";
import { MONTH_RE } from "@/lib/admin/aiUsageConstants";
import { recentMonths, useCallLog, useEmployerUsage } from "@/components/features/admin/ai-usage/useAiUsage";
import { changePct, compact, featureColour, usd } from "@/components/features/admin/ai-usage/format";
import { InlineLabelled } from "@/components/shared/LabelledControl";

const MONTHS = recentMonths();

function EmployerContent() {
  const t = useTranslations("adminAiUsage");
  const te = useTranslations("adminAiUsage.employer");
  const locale = useLocale();
  const { employerId } = useParams<{ employerId: string }>();
  const [month, setMonth] = useUrlFilter("month", MONTHS[0], { allow: MONTHS });
  const safeMonth = MONTH_RE.test(month) ? month : MONTHS[0];
  const [feature, setFeature] = useState("all");
  const [result, setResult] = useState("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  const usage = useEmployerUsage(employerId, safeMonth);
  const log = useCallLog({ employerId, month: safeMonth, feature, result, page, pageSize });
  const label = (f: string) => t(`features.${f}` as never);

  const kpis: ReportKpi[] = [];
  if (usage.data) {
    const k = usage.data.kpis;
    const pct = changePct(k.costUsd, k.prevCostUsd);
    const change =
      pct === "new" ? t("changeNew") : pct === 0 ? t("changeNone") : pct > 0 ? t("changeUp", { pct }) : t("changeDown", { pct: Math.abs(pct) });
    kpis.push(
      { key: "spend", label: t("kpiSpend"), value: usd(k.costUsd, locale), detail: t("kpiSpendDetail"), footer: <span className="text-xs text-muted-foreground">{change}</span>, dot: "bg-indigo-500", tone: "workspace-tone-indigo", icon: Coins },
      { key: "calls", label: t("kpiCalls"), value: formatCount(k.calls, undefined, locale), detail: t("kpiCallsDetail", { failed: formatCount(k.failed, undefined, locale) }), dot: "bg-emerald-500", tone: "workspace-tone-emerald", icon: Activity },
      { key: "tokens", label: t("kpiTokens"), value: compact(k.inputTokens + k.outputTokens, locale), detail: t("kpiTokensDetail", { input: compact(k.inputTokens, locale), output: compact(k.outputTokens, locale) }), dot: "bg-blue-500", tone: "workspace-tone-sky", icon: Hash },
    );
  }
  const maxFeature = Math.max(0.0001, ...(usage.data?.features.map((f) => f.costUsd) ?? [0]));

  return (
    <div className="page-container">
      <ReportTabs />
      <Link href={`/${locale}/admin/ai-usage?month=${safeMonth}`} className="mb-3 inline-flex min-h-10 items-center gap-1.5 text-sm font-medium text-primary hover:underline">
        <ArrowLeft className="size-4 rtl:rotate-180" aria-hidden="true" />
        {te("back")}
      </Link>

      {usage.error && !usage.data ? (
        <ErrorState title={te("notFound")} onRetry={() => { void usage.refetch(); }} />
      ) : !usage.data ? (
        <div className="space-y-6" role="status" aria-label={t("loading")}>
          <div className="workspace-panel-surface h-24 animate-pulse rounded-3xl" />
          <div className="workspace-panel-surface h-64 animate-pulse rounded-3xl" />
        </div>
      ) : (
        <div className="space-y-6">
          <PageHero
            compact
            compactOnMobile
            title={usage.data.employer.name}
            description={usage.data.employer.city || t("description")}
            actions={
              <InlineLabelled label={t("month")}>
                {(id) => (
                  <Select value={safeMonth} onValueChange={(v) => { setMonth(v); setPage(1); }}>
                    <SelectTrigger id={id} className="h-10 w-[11rem] rounded-xl border-border/70 bg-background/90 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {MONTHS.map((m) => (
                        <SelectItem key={m} value={m}>{m}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </InlineLabelled>
            }
          />
          <ReportKpiGrid kpis={kpis} ariaLabel={t("a11yTotals")} />

          <div className="grid gap-6 xl:grid-cols-12">
            <section className={`${reportCardClassName} xl:col-span-6`}>
              <ReportCardHeader title={te("byFeature")} description={t("kpiSpendDetail")} icon={Coins} tone="workspace-tone-indigo" />
              <ul className="mt-4 space-y-3">
                {usage.data.features.map((f) => (
                  <li key={f.feature} className="space-y-1.5">
                    <div className="flex justify-between gap-3 text-sm">
                      <span>{label(f.feature)} <span className="text-muted-foreground">· {formatCount(f.calls, undefined, locale)}</span></span>
                      <span className="font-semibold tabular-nums">{usd(f.costUsd, locale)}</span>
                    </div>
                    <div className="h-2 rounded-full bg-secondary" aria-hidden="true">
                      <div className="h-2 rounded-full" style={{ width: `${(f.costUsd / maxFeature) * 100}%`, background: featureColour(f.feature) }} />
                    </div>
                  </li>
                ))}
              </ul>
            </section>
            <section className={`${reportCardClassName} xl:col-span-6`}>
              <ReportCardHeader title={te("whoMade")} description={te("whoNote")} icon={Activity} tone="workspace-tone-emerald" />
              <ul className="mt-4 divide-y divide-border/60">
                {usage.data.people.map((u, i) => (
                  <li key={`${u.userId ?? "system"}-${u.onBehalf}-${i}`} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                    <div className="min-w-0">
                      <p className="truncate font-semibold">{u.userId ? u.name : te("system")}</p>
                      <p className="text-xs text-muted-foreground">
                        {u.role}{u.onBehalf ? ` · ${te("behalfLabel")}` : ""}
                      </p>
                    </div>
                    <div className="text-end">
                      <p className="font-semibold tabular-nums">{usd(u.costUsd, locale)}</p>
                      <p className="text-xs text-muted-foreground tabular-nums">{formatCount(u.calls, undefined, locale)}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          </div>

          <section className={reportCardClassName} aria-labelledby="ai-log">
            <ReportCardHeader title={te("logTitle")} description={te("logHint")} icon={ScrollText} tone="workspace-tone-sky" />
            {/* Phone: the two filters share one row evenly. */}
            <div className="mt-4 flex flex-wrap gap-3 max-sm:grid max-sm:grid-cols-2 max-sm:gap-2">
              <Select value={feature} onValueChange={(v) => { setFeature(v); setPage(1); }}>
                <SelectTrigger aria-label={t("colFeature")} className="h-10 w-48 text-sm max-sm:h-11 max-sm:w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{te("allFeatures")}</SelectItem>
                  {AI_FEATURES.map((f) => (
                    <SelectItem key={f} value={f}>{label(f)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={result} onValueChange={(v) => { setResult(v); setPage(1); }}>
                <SelectTrigger aria-label={te("colResult")} className="h-10 w-44 text-sm max-sm:h-11 max-sm:w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{te("allResults")}</SelectItem>
                  <SelectItem value="ok">{te("resultOk")}</SelectItem>
                  <SelectItem value="failed">{te("resultFailed")}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {log.error && !log.data ? (
              <ErrorState title={t("loadError")} onRetry={() => { void log.refetch(); }} />
            ) : !log.data ? (
              <div className="workspace-panel-surface mt-4 h-48 animate-pulse rounded-2xl" role="status" aria-label={t("loading")} />
            ) : log.data.data.length === 0 ? (
              <EmptyState icon={ScrollText} title={te("logEmpty")} />
            ) : (
              <>
                <PhoneRecordList
                  className="mt-4 sm:hidden"
                  label={te("logTitle")}
                  items={log.data.data.map((c) => ({
                    key: c.id,
                    title: label(c.feature),
                    subtitle: (
                      <>
                        {c.user}
                        {c.onBehalf ? <> · {te("behalfLabel")}</> : null}
                      </>
                    ),
                    trailing: (
                      <span className="text-xs font-medium">
                        {!c.ok ? te("resultFailed") : c.cacheHit ? te("resultCached") : te("resultOk")}
                      </span>
                    ),
                    meta: (
                      <>
                        <p>{formatDateTime(c.at, undefined, locale)}</p>
                        <p className="truncate">{c.model}</p>
                        {!c.priced ? <p>{te("colCost")}: {te("unpriced")}</p> : null}
                      </>
                    ),
                    stats: [
                      { label: te("colIn"), value: formatCount(c.inputTokens, undefined, locale) },
                      { label: te("colOut"), value: formatCount(c.outputTokens, undefined, locale) },
                      { label: te("colCost"), value: usd(c.costUsd, locale) },
                    ],
                  }))}
                />
                <div className="mt-4 overflow-x-auto max-sm:hidden">
                  <Table data-mobile-table="scroll">
                    <TableHeader>
                      <TableRow>
                        <TableHead>{te("colTime")}</TableHead>
                        <TableHead>{te("colUser")}</TableHead>
                        <TableHead>{t("colFeature")}</TableHead>
                        <TableHead className="hidden md:table-cell">{te("colModel")}</TableHead>
                        <TableHead className="hidden text-end md:table-cell">{te("colIn")}</TableHead>
                        <TableHead className="hidden text-end md:table-cell">{te("colOut")}</TableHead>
                        <TableHead className="text-end">{te("colCost")}</TableHead>
                        <TableHead>{te("colResult")}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {log.data.data.map((c) => (
                        <TableRow key={c.id}>
                          <TableCell className="whitespace-nowrap text-xs">{formatDateTime(c.at, undefined, locale)}</TableCell>
                          <TableCell className="text-sm">
                            {c.user}
                            {c.onBehalf ? <span className="block text-xs text-muted-foreground">{te("behalfLabel")}</span> : null}
                          </TableCell>
                          <TableCell className="text-sm">{label(c.feature)}</TableCell>
                          <TableCell className="hidden text-xs text-muted-foreground md:table-cell">{c.model}</TableCell>
                          <TableCell className="hidden text-end tabular-nums md:table-cell">{formatCount(c.inputTokens, undefined, locale)}</TableCell>
                          <TableCell className="hidden text-end tabular-nums md:table-cell">{formatCount(c.outputTokens, undefined, locale)}</TableCell>
                          <TableCell className="text-end font-semibold tabular-nums">
                            {usd(c.costUsd, locale)}
                            {!c.priced ? <span className="block text-xs font-normal text-muted-foreground">{te("unpriced")}</span> : null}
                          </TableCell>
                          <TableCell className="text-xs font-medium">
                            {!c.ok ? te("resultFailed") : c.cacheHit ? te("resultCached") : te("resultOk")}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                <PaginationControls
                  className="mt-4"
                  page={page}
                  totalPages={log.data.totalPages}
                  total={log.data.total}
                  limit={pageSize}
                  onPageChange={setPage}
                  onLimitChange={(n) => { setPageSize(n); setPage(1); }}
                />
              </>
            )}
          </section>
        </div>
      )}
    </div>
  );
}

export default function AdminAiUsageEmployerPage() {
  return (
    <Suspense fallback={null}>
      <EmployerContent />
    </Suspense>
  );
}
