"use client";

import { Suspense, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Activity, Coins, Database, Hash } from "lucide-react";
import { ReportTabs } from "@/components/features/admin/ReportTabs";
import { PageHero } from "@/components/shared/PageHero";
import { ErrorState } from "@/components/shared/ErrorState";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ReportKpiGrid, type ReportKpi } from "@/components/features/admin/reports/ReportKpiGrid";
import { useUrlFilter } from "@/hooks/useUrlFilter";
import { formatCount } from "@/lib/ui/intlFormat";
import { AI_USAGE_GROUPS, MONTH_RE, type AiUsageGroup } from "@/lib/admin/aiUsageConstants";
import { recentMonths, useAiUsage } from "@/components/features/admin/ai-usage/useAiUsage";
import { changePct, compact, usd } from "@/components/features/admin/ai-usage/format";
import { SpendCharts } from "./_components/spend-charts";
import { UsageTable } from "./_components/usage-table";
import { InlineLabelled } from "@/components/shared/LabelledControl";

const MONTHS = recentMonths();

function monthLabel(month: string, locale: string): string {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString(locale, { month: "long", year: "numeric", timeZone: "UTC" });
}

function AiUsageContent() {
  const t = useTranslations("adminAiUsage");
  const locale = useLocale();
  const [month, setMonth] = useUrlFilter("month", MONTHS[0], { allow: MONTHS });
  const [group, setGroup] = useUrlFilter("group", "employer", { allow: [...AI_USAGE_GROUPS] });
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const safeMonth = MONTH_RE.test(month) ? month : MONTHS[0];

  const { data, isLoading, isFetching, error, refetch } = useAiUsage({
    month: safeMonth,
    group: group as AiUsageGroup,
    search,
    page,
    pageSize,
  });

  const kpis: ReportKpi[] = [];
  if (data) {
    const k = data.kpis;
    const pct = changePct(k.costUsd, k.prevCostUsd);
    const change =
      pct === "new" ? t("changeNew") : pct === 0 ? t("changeNone") : pct > 0 ? t("changeUp", { pct }) : t("changeDown", { pct: Math.abs(pct) });
    kpis.push(
      {
        key: "spend",
        label: t("kpiSpend"),
        value: usd(k.costUsd, locale),
        phoneValue: usd(k.costUsd, locale),
        detail: t("kpiSpendDetail"),
        footer: <span className="text-xs text-muted-foreground">{change}</span>,
        note: k.unpriced > 0 ? t("unpricedNote", { count: formatCount(k.unpriced, undefined, locale) }) : null,
        dot: "bg-indigo-500",
        tone: "workspace-tone-indigo",
        icon: Coins,
      },
      {
        key: "calls",
        label: t("kpiCalls"),
        value: formatCount(k.calls, undefined, locale),
        detail: t("kpiCallsDetail", { failed: formatCount(k.failed, undefined, locale) }),
        dot: "bg-emerald-500",
        tone: "workspace-tone-emerald",
        icon: Activity,
      },
      {
        key: "tokens",
        label: t("kpiTokens"),
        value: compact(k.inputTokens + k.outputTokens, locale),
        detail: t("kpiTokensDetail", { input: compact(k.inputTokens, locale), output: compact(k.outputTokens, locale) }),
        dot: "bg-blue-500",
        tone: "workspace-tone-sky",
        icon: Hash,
      },
      {
        key: "cache",
        label: t("kpiCache"),
        value: formatCount(k.cacheHits, undefined, locale),
        detail: t("kpiCacheDetail"),
        dot: "bg-amber-500",
        tone: "workspace-tone-amber",
        icon: Database,
      },
    );
  }

  return (
    <div className="page-container">
      <ReportTabs />
      <PageHero
        compact
        compactOnMobile
        title={t("title")}
        description={t("description")}
        actions={
          <InlineLabelled label={t("month")}>
            {(id) => (
              <Select value={safeMonth} onValueChange={(v) => { setMonth(v); setPage(1); }}>
                <SelectTrigger id={id} className="h-10 w-[11rem] rounded-xl border-border/70 bg-background/90 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MONTHS.map((m) => (
                    <SelectItem key={m} value={m}>{monthLabel(m, locale)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </InlineLabelled>
        }
      />

      {error && !data ? (
        <ErrorState title={t("loadError")} onRetry={() => { void refetch(); }} />
      ) : isLoading || !data ? (
        <div className="space-y-6" role="status" aria-live="polite" aria-label={t("loading")}>
          <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-2 sm:gap-3 xl:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="workspace-panel-surface h-16 animate-pulse rounded-2xl sm:h-36" />
            ))}
          </div>
          <div className="workspace-panel-surface h-80 animate-pulse rounded-3xl" />
        </div>
      ) : (
        <div className={`space-y-6 transition-opacity ${isFetching ? "opacity-60" : ""}`} aria-busy={isFetching}>
          <ReportKpiGrid kpis={kpis} ariaLabel={t("a11yTotals")} />
          <SpendCharts data={data} locale={locale} month={safeMonth} />
          <UsageTable
            data={data}
            group={group as AiUsageGroup}
            onGroup={(g) => { setGroup(g); setPage(1); setSearch(""); }}
            search={search}
            onSearch={(s) => { setSearch(s); setPage(1); }}
            page={page}
            onPage={setPage}
            pageSize={pageSize}
            onPageSize={(n) => { setPageSize(n); setPage(1); }}
            locale={locale}
            month={safeMonth}
          />
        </div>
      )}
    </div>
  );
}

export default function AdminAiUsagePage() {
  // useUrlFilter reads search params, which needs a Suspense boundary.
  return (
    <Suspense fallback={null}>
      <AiUsageContent />
    </Suspense>
  );
}
