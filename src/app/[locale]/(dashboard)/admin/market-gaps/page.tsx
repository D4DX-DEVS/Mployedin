"use client";

import { Suspense, useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import { Briefcase, Building2, Loader2, MapPin, RefreshCw, Search, UserX } from "lucide-react";
import { ReportTabs } from "@/components/features/admin/ReportTabs";
import { PageHero } from "@/components/shared/PageHero";
import { ErrorState } from "@/components/shared/ErrorState";
import { EmptyState } from "@/components/shared/EmptyState";
import { PaginationControls } from "@/components/shared/PaginationControls";
import { PhoneRecordList } from "@/components/shared/PhoneRecordList";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ReportKpiGrid, type ReportKpi } from "@/components/features/admin/reports/ReportKpiGrid";
import { ReportCardHeader, reportCardClassName } from "@/components/features/admin/reports/ReportCard";
import { useUrlFilter } from "@/hooks/useUrlFilter";
import { formatCount, formatDateTime } from "@/lib/ui/intlFormat";
import { GAP_KINDS, GAP_PRIORITIES, GAP_STATUS_FILTERS } from "@/lib/admin/marketGapsConstants";
import {
  postJson,
  useInvalidateGaps,
  useMarketGaps,
  type GapRow,
} from "@/components/features/admin/market-gaps/useMarketGaps";
import { GapSheet } from "./_components/gap-sheet";
import { gapSentence } from "./_components/gap-text";

const PRIORITY_TONE: Record<string, string> = {
  high: "bg-amber-100 text-amber-900 dark:bg-amber-500/20 dark:text-amber-200",
  medium: "bg-secondary text-foreground",
  low: "bg-secondary/60 text-muted-foreground",
};
const STATUS_TONE: Record<string, string> = {
  new: "bg-blue-100 text-blue-900 dark:bg-blue-500/20 dark:text-blue-200",
  assigned: "bg-amber-100 text-amber-900 dark:bg-amber-500/20 dark:text-amber-200",
  done: "bg-emerald-100 text-emerald-900 dark:bg-emerald-500/20 dark:text-emerald-200",
  dismissed: "bg-secondary text-muted-foreground",
  resolved: "bg-emerald-100 text-emerald-900 dark:bg-emerald-500/20 dark:text-emerald-200",
};

function MarketGapsContent() {
  const t = useTranslations("adminMarketGaps");
  const locale = useLocale();
  const invalidate = useInvalidateGaps();
  const [status, setStatus] = useUrlFilter("status", "open", { allow: [...GAP_STATUS_FILTERS] });
  const [kind, setKind] = useUrlFilter("kind", "all", { allow: ["all", ...GAP_KINDS] });
  const [priority, setPriority] = useUrlFilter("priority", "all", { allow: ["all", ...GAP_PRIORITIES] });
  const [territory, setTerritory] = useUrlFilter("territory", "all");
  const [area, setArea] = useUrlFilter("area", "all");
  const [draft, setDraft] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [sheet, setSheet] = useState<{ id: string; mode: "view" | "assign" | "dismiss" } | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    const id = setTimeout(() => { setSearch(draft); setPage(1); }, 300);
    return () => clearTimeout(id);
  }, [draft]);

  const { data, isLoading, isFetching, error, refetch } = useMarketGaps({
    kind, status, priority, territory, area, search, sort: "seekers", page, pageSize,
  });

  const filtersActive = kind !== "all" || priority !== "all" || territory !== "all" || area !== "all" || status !== "open" || Boolean(search);
  const reset = () => { setKind("all"); setPriority("all"); setTerritory("all"); setArea("all"); setStatus("open"); setDraft(""); setPage(1); };
  const filter = (set: (v: string) => void) => (v: string) => { set(v); setPage(1); };

  async function refresh() {
    setRefreshing(true);
    const res = await postJson("/api/admin/market-gaps/refresh");
    setRefreshing(false);
    if (res.ok) { toast.success(t("refreshDone")); invalidate(); return; }
    if (res.status === 429) {
      const minutes = Math.max(1, Math.ceil(Number(res.data.retryAfter ?? 60) / 60));
      toast.message(t("refreshRecent", { minutes }));
      return;
    }
    toast.error(t("refreshError"));
  }

  const kpis: ReportKpi[] = data
    ? [
        { key: "unplaced", label: t("kpiUnplaced"), value: formatCount(data.kpis.unplacedSeekers, undefined, locale), detail: t("kpiUnplacedDetail"), dot: "bg-indigo-500", tone: "workspace-tone-indigo", icon: UserX },
        { key: "nojobs", label: t("kpiNoJobs"), value: formatCount(data.kpis.rolesWithNoJobs, undefined, locale), detail: t("kpiNoJobsDetail"), dot: "bg-amber-500", tone: "workspace-tone-amber", icon: Briefcase },
        { key: "areas", label: t("kpiAreas"), value: formatCount(data.kpis.areasAffected, undefined, locale), detail: t("kpiAreasDetail"), dot: "bg-blue-500", tone: "workspace-tone-sky", icon: MapPin },
        { key: "open", label: t("kpiOpen"), value: formatCount(data.kpis.openSuggestions, undefined, locale), detail: t("kpiOpenDetail", { count: data.kpis.newThisWeek }), dot: "bg-emerald-500", tone: "workspace-tone-emerald", icon: Building2 },
      ]
    : [];

  const sentence = (g: GapRow) => gapSentence(t as never, g);
  const maxArea = Math.max(1, ...(data?.snapshot?.areas.map((a) => a.seekers) ?? [1]), data?.snapshot?.noAreaCount ?? 0);

  return (
    <div className="page-container">
      <ReportTabs />
      <PageHero
        compact
        compactOnMobile
        title={t("title")}
        description={data?.snapshot ? `${t("description")} ${t("updated", { when: formatDateTime(data.snapshot.generatedAt, { dateStyle: "medium", timeStyle: "short" }, locale) })}` : t("description")}
        actions={
          <Button variant="outline" className="h-10 rounded-xl" disabled={refreshing} onClick={() => { void refresh(); }}>
            {refreshing ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <RefreshCw className="size-4" aria-hidden="true" />}
            {refreshing ? t("refreshing") : t("refresh")}
          </Button>
        }
      />

      {error && !data ? (
        <ErrorState title={t("loadError")} onRetry={() => { void refetch(); }} />
      ) : isLoading || !data ? (
        <div className="space-y-6" role="status" aria-live="polite" aria-label={t("loading")}>
          <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-2 sm:gap-3 xl:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => <div key={i} className="workspace-panel-surface h-16 animate-pulse rounded-2xl sm:h-36" />)}
          </div>
          <div className="workspace-panel-surface h-72 animate-pulse rounded-3xl" />
        </div>
      ) : (
        <div className={`space-y-6 transition-opacity ${isFetching ? "opacity-60" : ""}`} aria-busy={isFetching}>
          {!data.snapshot ? <p className="rounded-2xl border border-dashed border-border/70 p-4 text-sm text-muted-foreground">{t("neverBuilt")}</p> : null}

          <section className={`${reportCardClassName} gap-3`} aria-label={t("filterKind")}>
            <div className="flex flex-wrap items-end gap-3">
              <Select value={territory} onValueChange={filter(setTerritory)}>
                <SelectTrigger aria-label={t("filterTerritory")} className="h-10 w-48 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t("allTerritories")}</SelectItem>
                  {data.territories.map((x) => <SelectItem key={x.id} value={x.id}>{x.name}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={kind} onValueChange={filter(setKind)}>
                <SelectTrigger aria-label={t("filterKind")} className="h-10 w-48 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t("allKinds")}</SelectItem>
                  {GAP_KINDS.map((k) => <SelectItem key={k} value={k}>{t(`kind.${k}`)}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={status} onValueChange={filter(setStatus)}>
                <SelectTrigger aria-label={t("filterStatus")} className="h-10 w-40 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>{GAP_STATUS_FILTERS.map((s) => <SelectItem key={s} value={s}>{t(`status.${s}`)}</SelectItem>)}</SelectContent>
              </Select>
              <Select value={priority} onValueChange={filter(setPriority)}>
                <SelectTrigger aria-label={t("filterPriority")} className="h-10 w-40 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t("allPriorities")}</SelectItem>
                  {GAP_PRIORITIES.map((p) => <SelectItem key={p} value={p}>{t(`priority.${p}`)}</SelectItem>)}
                </SelectContent>
              </Select>
              <div className="relative w-full sm:w-64">
                <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                <Input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={t("search")} aria-label={t("search")} className="h-10 ps-9" />
              </div>
              {filtersActive ? <Button variant="ghost" className="h-10" onClick={reset}>{t("clearFilters")}</Button> : null}
            </div>
          </section>

          <ReportKpiGrid kpis={kpis} ariaLabel={t("a11yTotals")} />

          {data.doFirst.length > 0 && status === "open" ? (
            <section className={reportCardClassName} aria-labelledby="gaps-first">
              <ReportCardHeader title={t("firstTitle")} description={t("firstHint")} icon={Briefcase} tone="workspace-tone-amber" />
              <ul className="mt-4 space-y-3">
                {data.doFirst.map((g) => (
                  <li key={g.id} className="flex flex-wrap items-center gap-3 rounded-2xl border border-border/70 p-3.5">
                    <div className="min-w-0 flex-1 basis-80 space-y-1.5">
                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        <span className={`rounded-full px-2 py-0.5 font-medium ${PRIORITY_TONE[g.priority]}`}>{t(`priority.${g.priority}`)}</span>
                        <span className="rounded-full bg-secondary px-2 py-0.5">{t(`kind.${g.kind}`)}</span>
                        <span className="text-muted-foreground">{[g.areaName, g.saName].filter(Boolean).join(" · ")}</span>
                      </div>
                      <p className="font-semibold leading-snug">{sentence(g)}</p>
                    </div>
                    <div className="flex flex-wrap gap-2 max-sm:w-full">
                      <Button variant="outline" className="min-h-10 max-sm:min-h-11 max-sm:flex-1" onClick={() => setSheet({ id: g.id, mode: "view" })}>{t("view")}</Button>
                      <Button className="min-h-10 max-sm:min-h-11 max-sm:flex-1" onClick={() => setSheet({ id: g.id, mode: "assign" })}>{t("assign")}</Button>
                      <Button variant="ghost" className="min-h-10 max-sm:min-h-11 max-sm:flex-1" onClick={() => setSheet({ id: g.id, mode: "dismiss" })}>{t("dismiss")}</Button>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <div className="grid gap-6 xl:grid-cols-12">
            <section className={`${reportCardClassName} xl:col-span-8`} aria-labelledby="gaps-table">
              <ReportCardHeader title={t("tableTitle")} description={t("description")} icon={MapPin} tone="workspace-tone-sky" />
              {data.data.length === 0 ? (
                <EmptyState
                  icon={MapPin}
                  title={filtersActive ? t("empty") : t("emptyNone")}
                  description={filtersActive ? t("emptyHint") : t("emptyNoneHint")}
                  action={filtersActive ? <Button variant="outline" onClick={reset}>{t("clearFilters")}</Button> : undefined}
                />
              ) : (
                <>
                  <PhoneRecordList
                    className="mt-4 sm:hidden"
                    label={t("tableTitle")}
                    items={data.data.map((g) => ({
                      key: g.id,
                      title: (
                        <button type="button" onClick={() => setSheet({ id: g.id, mode: "view" })} className="text-start font-semibold text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                          {g.role || t(`kind.${g.kind}`)}
                        </button>
                      ),
                      subtitle: t(`kind.${g.kind}`),
                      trailing: <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_TONE[g.status]}`}>{t(`status.${g.status}`)}</span>,
                      meta: (
                        <p className="flex min-w-0 items-center gap-1">
                          <MapPin className="h-3 w-3 shrink-0" aria-hidden="true" />
                          <span className="truncate">{g.areaName || t("areaNotSet")}{g.saName ? ` · ${g.saName}` : ""}</span>
                        </p>
                      ),
                      badges: g.topSkills.length > 0
                        ? g.topSkills.slice(0, 2).map((s) => <span key={s.skill} className="rounded-full bg-secondary px-2 py-0.5 text-xs">{s.skill}</span>)
                        : undefined,
                      stats: [
                        { label: t("colSeekers"), value: formatCount(g.seekers, undefined, locale) },
                        { label: t("colJobs"), value: formatCount(g.jobs, undefined, locale) },
                        { label: t("colWaiting"), value: g.medianWaitDays > 0 ? t("days", { count: g.medianWaitDays }) : "—" },
                      ],
                    }))}
                  />
                  <div className="mt-4 overflow-x-auto max-sm:hidden">
                    <Table data-mobile-table="scroll">
                      <TableHeader>
                        <TableRow>
                          <TableHead>{t("colArea")}</TableHead>
                          <TableHead>{t("colRole")}</TableHead>
                          <TableHead className="text-end">{t("colSeekers")}</TableHead>
                          <TableHead className="text-end">{t("colJobs")}</TableHead>
                          <TableHead className="hidden lg:table-cell">{t("colSkills")}</TableHead>
                          <TableHead className="hidden text-end md:table-cell">{t("colWaiting")}</TableHead>
                          <TableHead>{t("colStatus")}</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {data.data.map((g) => (
                          <TableRow key={g.id}>
                            <TableCell>
                              <div className="font-semibold">{g.areaName || t("areaNotSet")}</div>
                              <div className="text-xs text-muted-foreground">{g.saName}</div>
                            </TableCell>
                            <TableCell>
                              <button type="button" onClick={() => setSheet({ id: g.id, mode: "view" })} className="text-start font-semibold text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                                {g.role || t(`kind.${g.kind}`)}
                              </button>
                              <div className="text-xs text-muted-foreground">{t(`kind.${g.kind}`)}</div>
                            </TableCell>
                            <TableCell className="text-end font-semibold tabular-nums">{formatCount(g.seekers, undefined, locale)}</TableCell>
                            <TableCell className="text-end tabular-nums">{formatCount(g.jobs, undefined, locale)}</TableCell>
                            <TableCell className="hidden lg:table-cell">
                              <div className="flex flex-wrap gap-1">
                                {g.topSkills.slice(0, 2).map((s) => <span key={s.skill} className="rounded-full bg-secondary px-2 py-0.5 text-xs">{s.skill}</span>)}
                              </div>
                            </TableCell>
                            <TableCell className="hidden text-end tabular-nums md:table-cell">{g.medianWaitDays > 0 ? t("days", { count: g.medianWaitDays }) : "—"}</TableCell>
                            <TableCell><span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_TONE[g.status]}`}>{t(`status.${g.status}`)}</span></TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                  <PaginationControls className="mt-4" page={page} totalPages={data.totalPages} total={data.total} limit={pageSize} onPageChange={setPage} onLimitChange={(n) => { setPageSize(n); setPage(1); }} />
                </>
              )}
            </section>

            <section className={`${reportCardClassName} xl:col-span-4`} aria-labelledby="gaps-areas">
              <ReportCardHeader title={t("byAreaTitle")} description={t("byAreaHint")} icon={UserX} tone="workspace-tone-indigo" />
              <ul className="mt-4 space-y-1">
                {(data.snapshot?.areas ?? []).map((a) => (
                  <li key={a.areaId ?? a.name}>
                    <button
                      type="button"
                      onClick={() => a.areaId && filter(setArea)(String(a.areaId))}
                      aria-pressed={area === String(a.areaId)}
                      className="w-full space-y-1.5 rounded-lg px-2 py-2 text-start hover:bg-secondary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <span className="flex justify-between text-sm"><span className="font-medium">{a.name || t("areaNotSet")}</span><span className="font-semibold tabular-nums">{formatCount(a.seekers, undefined, locale)}</span></span>
                      <span className="block h-2 rounded-full bg-secondary"><span className="block h-2 rounded-full bg-primary" style={{ width: `${(a.seekers / maxArea) * 100}%` }} /></span>
                    </button>
                  </li>
                ))}
              </ul>
              {data.snapshot && data.snapshot.noAreaCount > 0 ? (
                <p className="mt-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-500/10 dark:text-amber-200">
                  {t("noAreaNote", { count: formatCount(data.snapshot.noAreaCount, undefined, locale) })}
                </p>
              ) : null}
            </section>
          </div>
        </div>
      )}

      <GapSheet id={sheet?.id ?? null} initialMode={sheet?.mode ?? "view"} onClose={() => setSheet(null)} />
    </div>
  );
}

export default function AdminMarketGapsPage() {
  return (
    <Suspense fallback={null}>
      <MarketGapsContent />
    </Suspense>
  );
}
