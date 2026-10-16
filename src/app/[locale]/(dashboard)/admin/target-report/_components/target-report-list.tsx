"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { ChevronDown, Users } from "lucide-react";
import { ErrorState } from "@/components/shared/ErrorState";
import { InlineFilterBar, InlineFilterSearch, INLINE_FILTER_CONTROL } from "@/components/shared/InlineFilterBar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ReportCardHeader, ReportEmpty, reportCardClassName } from "@/components/features/admin/reports/ReportCard";
import { ProfitReportView } from "@/components/features/targets/ProfitReportView";
import { TargetHeadline, type HeadlineData } from "@/components/features/targets/TargetProgress";
import { IncentiveTierBadge } from "@/components/features/targets/TargetComponents";
import { useTableExport } from "@/hooks/useTableExport";
import type { ExportColumn } from "@/lib/export";
import type { CompletionStatus } from "@/lib/targets/insights";
import type { TargetReport as FullReport } from "@/lib/targets/profitReport";
import { cn } from "@/lib/utils";
import type { TargetPerson } from "./types";

type RoleFilter = "all" | "super_agent" | "agent";
type StatusFilter = "all" | CompletionStatus;

const STATUSES: CompletionStatus[] = ["achieved", "onPace", "behind", "notStarted"];
const STATUS_KEYS: Record<CompletionStatus, string> = {
  achieved: "paceAchieved",
  onPace: "paceOnPace",
  behind: "paceBehind",
  notStarted: "paceNotStarted",
};

/** A short list opens with its reports showing: with a couple of targets there is nothing to scroll past. */
const OPEN_ALL_UP_TO = 3;

/** Super agents first, each followed by the agents funded from their target. */
function inTeamOrder(people: TargetPerson[]): { person: TargetPerson; nested: boolean }[] {
  const ids = new Set(people.map((person) => person.id));
  const byProgress = (left: TargetPerson, right: TargetPerson) => right.progress - left.progress || left.name.localeCompare(right.name);
  const roots = people.filter((person) => !person.parentProfileId || !ids.has(person.parentProfileId)).sort(byProgress);
  return roots.flatMap((root) => [
    { person: root, nested: false },
    ...people.filter((person) => person.parentProfileId === root.id).sort(byProgress).map((person) => ({ person, nested: true })),
  ]);
}

function headlineOf(person: TargetPerson, year: number): HeadlineData {
  return {
    year,
    currency: person.currency,
    profitTarget: person.profitTarget,
    profitAchieved: person.profitAchieved,
    profitProgress: person.progress,
    expectedProgress: person.expectedProgress,
    periodType: person.periodType,
    periods: person.periods,
    insights: person.insights,
  };
}

/** One target's full report, fetched when its card is opened and kept for the other pages that show it. */
function OpenedReport({ id, onOpenAgent }: { id: string; onOpenAgent: (profileId: string) => void }) {
  const t = useTranslations("adminTargetReport");
  const { data, isLoading, isError, refetch } = useQuery<FullReport>({
    queryKey: ["admin", "target-report", "profile", id],
    queryFn: async () => {
      const response = await fetch(`/api/admin/target-report?profileId=${id}`);
      if (!response.ok) throw new Error(`Target report error: ${response.status}`);
      return (await response.json()).report as FullReport;
    },
    staleTime: 5 * 60_000,
  });

  if (isError) {
    return <ErrorState title={t("reportFailed")} onRetry={() => { void refetch(); }} retryLabel={t("retry")} />;
  }
  if (isLoading || !data) {
    return (
      <div className="space-y-3" role="status" aria-live="polite" aria-label={t("reportLoading")}>
        <div className="h-24 animate-pulse rounded-2xl bg-muted/50" />
        <div className="h-56 animate-pulse rounded-2xl bg-muted/50" />
      </div>
    );
  }
  return <ProfitReportView report={data} headline="tiles" onSelectAgent={(agent) => onOpenAgent(agent.profileId)} />;
}

/**
 * Every active target for the year as a report card: who it is for, its
 * completion status and growth, the target bar against the pace the schedule
 * expects, and one bar per period. Each card opens into the target's full
 * report. Super agents come first, each with their agents underneath.
 */
export function TargetReportList({ people, year, locale }: { people: TargetPerson[]; year: number; locale: string }) {
  const t = useTranslations("adminTargetReport");
  const tp = useTranslations("profitReport");
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [role, setRole] = useState<RoleFilter>("all");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [opened, setOpened] = useState<Set<string>>(() => new Set(people.length <= OPEN_ALL_UP_TO ? people.map((person) => person.id) : []));

  const counts = useMemo(() => {
    const result: Record<CompletionStatus, number> = { achieved: 0, onPace: 0, behind: 0, notStarted: 0 };
    for (const person of people) result[person.insights.status] += 1;
    return result;
  }, [people]);

  const filtered = role !== "all" || status !== "all" || search.trim() !== "";
  const rows = useMemo(() => {
    const query = search.trim().toLowerCase();
    const matches = people.filter((person) =>
      (role === "all" || person.role === role)
      && (status === "all" || person.insights.status === status)
      && (!query || person.name.toLowerCase().includes(query) || person.email.toLowerCase().includes(query)));
    // A filtered list is a flat result list; the nesting only reads in the full one.
    return filtered
      ? matches.sort((left, right) => right.progress - left.progress).map((person) => ({ person, nested: false }))
      : inTeamOrder(people);
  }, [people, role, status, search, filtered]);

  const toggle = (id: string) => setOpened((current) => {
    const next = new Set(current);
    if (!next.delete(id)) next.add(id);
    return next;
  });

  // A team table row opens that agent's own card when it is on the page, else their plan's page.
  const openAgent = (profileId: string) => {
    const card = document.getElementById(`target-${profileId}`);
    if (!card) {
      router.push(`/${locale}/admin/target-management/${profileId}`);
      return;
    }
    setOpened((current) => new Set(current).add(profileId));
    requestAnimationFrame(() => card.scrollIntoView({ behavior: "smooth", block: "start" }));
  };

  const exportRows = useMemo(() => rows.map(({ person }) => {
    const { insights } = person;
    const growth = insights.yearOverYear.pct;
    return {
      name: person.name || t("unknownPerson"),
      email: person.email,
      role: t(person.role === "super_agent" ? "roleSuperAgent" : "roleAgent"),
      region: person.region ?? "",
      currency: person.currency,
      schedule: tp(`period_${person.periodType}`),
      profitTarget: person.profitTarget,
      profitAchieved: person.profitAchieved,
      remaining: insights.remaining,
      progress: `${person.progress}%`,
      expected: `${person.expectedProgress}%`,
      status: t(STATUS_KEYS[insights.status]),
      forecast: insights.forecast ? insights.forecast.profit : "",
      growth: growth === null ? "" : `${growth}%`,
    };
  }), [rows, t, tp]);

  const exportColumns: ExportColumn<Record<string, unknown>>[] = useMemo(() => [
    { header: t("exportName"), key: "name" },
    { header: t("exportEmail"), key: "email" },
    { header: t("exportRole"), key: "role" },
    { header: t("exportRegion"), key: "region" },
    { header: t("exportCurrency"), key: "currency" },
    { header: t("exportSchedule"), key: "schedule" },
    { header: t("exportProfitTarget"), key: "profitTarget" },
    { header: t("exportProfitAchieved"), key: "profitAchieved" },
    { header: t("exportRemaining"), key: "remaining" },
    { header: t("exportProgress"), key: "progress" },
    { header: t("exportExpected"), key: "expected" },
    { header: t("exportStatus"), key: "status" },
    { header: t("exportForecast"), key: "forecast" },
    { header: t("exportGrowth"), key: "growth" },
  ], [t]);

  const { handleExportCsv, handleExportExcel, handleExportPdf } = useTableExport({
    data: exportRows,
    columns: exportColumns,
    filename: `target-report-${year}`,
    title: t("exportTitle", { year }),
  });

  return (
    <section className={reportCardClassName} aria-label={t("people")}>
      <ReportCardHeader title={t("people")} description={t("peopleDescription", { year })} icon={Users} tone="workspace-tone-violet" />

      {people.length === 0 ? (
        <ReportEmpty>{t("noPeople", { year })}</ReportEmpty>
      ) : (
        <>
          <InlineFilterBar
            className="mt-4 px-0"
            onClear={filtered ? () => { setSearch(""); setRole("all"); setStatus("all"); } : undefined}
            onExportCsv={handleExportCsv}
            onExportExcel={handleExportExcel}
            onExportPdf={handleExportPdf}
          >
            <InlineFilterSearch value={search} onChange={setSearch} placeholder={t("searchPeople")} />
            <Select value={role} onValueChange={(value) => setRole(value as RoleFilter)}>
              <SelectTrigger aria-label={t("roleFilterLabel")} className={INLINE_FILTER_CONTROL}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("roleAll")}</SelectItem>
                <SelectItem value="super_agent">{t("roleSuperAgents")}</SelectItem>
                <SelectItem value="agent">{t("roleAgents")}</SelectItem>
              </SelectContent>
            </Select>
          </InlineFilterBar>

          <div role="group" aria-label={t("statusFilterLabel")} className="mt-3 flex flex-wrap gap-2">
            {(["all", ...STATUSES] as StatusFilter[]).map((option) => {
              const count = option === "all" ? people.length : counts[option];
              const active = status === option;
              return (
                <button
                  key={option}
                  type="button"
                  aria-pressed={active}
                  disabled={count === 0 && !active}
                  onClick={() => setStatus(option)}
                  className={cn(
                    "inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3 text-xs font-semibold transition-colors disabled:opacity-40",
                    active ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background hover:bg-muted/50",
                  )}
                >
                  {option === "all" ? t("statusAll") : t(STATUS_KEYS[option])}
                  <span className={cn("tabular-nums", active ? "text-primary-foreground/80" : "text-muted-foreground")}>{count}</span>
                </button>
              );
            })}
          </div>

          {rows.length === 0 ? (
            <ReportEmpty>{t("noPeopleMatch")}</ReportEmpty>
          ) : (
            <ul className="mt-4 space-y-4">
              {rows.map(({ person, nested }) => {
                const isOpen = opened.has(person.id);
                const panelId = `target-panel-${person.id}`;
                return (
                  <li key={person.id} id={`target-${person.id}`} className={cn("scroll-mt-24", nested && "ms-4 sm:ms-8")}>
                    <article className="rounded-2xl border border-border/70 bg-card">
                      <div className="space-y-4 p-4">
                        <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
                          <div className="min-w-0">
                            <Link
                              href={`/${locale}/admin/target-management/${person.id}`}
                              className="text-base font-semibold text-foreground hover:text-primary hover:underline"
                            >
                              {person.name || person.email || t("unknownPerson")}
                            </Link>
                            <p className="text-xs text-muted-foreground">
                              {t(person.role === "super_agent" ? "roleSuperAgent" : "roleAgent")}
                              {person.region ? ` · ${person.region}` : ""}
                            </p>
                          </div>
                          <IncentiveTierBadge tier={person.incentiveTier} />
                        </div>

                        <TargetHeadline data={headlineOf(person, year)} variant="compact" />

                        <button
                          type="button"
                          aria-expanded={isOpen}
                          aria-controls={panelId}
                          onClick={() => toggle(person.id)}
                          className="inline-flex min-h-9 items-center gap-1.5 text-xs font-semibold text-primary transition-colors hover:text-primary/80"
                        >
                          {isOpen ? t("hideReport") : t("showReport")}
                          <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", isOpen && "rotate-180")} aria-hidden />
                        </button>
                      </div>

                      {isOpen ? (
                        <div id={panelId} className="border-t border-border/70 bg-background/40 p-4">
                          <OpenedReport id={person.id} onOpenAgent={openAgent} />
                        </div>
                      ) : null}
                    </article>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </section>
  );
}
