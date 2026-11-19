"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, Loader2, Save, Search, Users } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { usePathname, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { EmptyState } from "@/components/shared/EmptyState";
import { PageHeader } from "@/components/shared/PageHeader";
import { PaginationControls } from "@/components/shared/PaginationControls";
import { TargetYearSelect } from "@/components/features/targets/TargetYearSelect";
import { formatProfit } from "@/components/features/targets/profitFormat";
import { csrfFetch } from "@/lib/security/csrf-client";
import { equalKpiPeriods, kpiPeriodIssues, type KpiMonthFigures, type KpiTotals } from "@/lib/targets/kpiSchedule";
import { SupervisorTargetRow, TARGET_GRID, type SupervisorRow, type TargetDraft } from "./_components/SupervisorTargetRow";

/** Why the server left a supervisor out, as message keys. */
const SKIP_REASON_KEYS: Record<string, string> = {
  active_profile_exists: "skipActiveExists",
  active_profile_created_concurrently: "skipActiveExists",
  ineligible: "skipIneligible",
  distribution_invalid: "skipInvalidSchedule",
};

const ZERO: KpiTotals = { jobTarget: 0, conversionTarget: 0, revenueTarget: 0 };
const emptyDraft = (year: number): TargetDraft => ({ totals: ZERO, split: "equal", months: monthsOf(year, ZERO) });
/** The equal split as editable month figures — where a manual split starts. */
function monthsOf(year: number, totals: KpiTotals): KpiMonthFigures[] {
  return equalKpiPeriods(year, totals).map(({ jobTarget = 0, conversionTarget = 0, revenueTarget = 0 }) => ({ jobTarget, conversionTarget, revenueTarget }));
}
const hasAny = (d: TargetDraft) => d.totals.jobTarget > 0 || d.totals.conversionTarget > 0 || d.totals.revenueTarget > 0;

export default function CreateTargetProfilePage() {
  const t = useTranslations("profitTargets");
  const locale = useLocale();
  const pathname = usePathname();
  const routeLocale = pathname.split("/")[1] || "en";
  const router = useRouter();
  const currentYear = new Date().getFullYear();

  const [year, setYear] = useState(currentYear + 1);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [supervisors, setSupervisors] = useState<SupervisorRow[]>([]);
  const [drafts, setDrafts] = useState<Record<string, TargetDraft>>({});

  const [search, setSearch] = useState("");
  const [region, setRegion] = useState("");
  const [showUnavailable, setShowUnavailable] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  useEffect(() => {
    const controller = new AbortController();
    (async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams({ directory: "create-target", targetYear: String(year), limit: "500" });
        const res = await fetch(`/api/admin/super-agents?${params.toString()}`, { signal: controller.signal });
        if (!res.ok) throw new Error(`super-agents ${res.status}`);
        const data = await res.json();
        const rows: SupervisorRow[] = (data.superAgents ?? data.items ?? []).map(
          (sa: {
            _id?: string;
            userId?: string;
            name?: string;
            email?: string;
            user?: { name?: string; _id?: string };
            directory?: { teamSize?: number; regionNames?: string[]; currencyCode?: string; availability?: SupervisorRow["availability"] };
          }) => ({
            id: sa.userId ?? sa.user?._id ?? sa._id ?? "",
            name: sa.name ?? sa.user?.name ?? "—",
            email: sa.email ?? "",
            teamSize: sa.directory?.teamSize ?? 0,
            territory: sa.directory?.regionNames?.[0] ?? "",
            currency: sa.directory?.currencyCode ?? "AED",
            availability: sa.directory?.availability ?? "available",
          })
        );
        // Who can get a target first, then by name.
        rows.sort((a, b) => Number(a.availability !== "available") - Number(b.availability !== "available") || a.name.localeCompare(b.name));
        setSupervisors(rows);
        setDrafts(Object.fromEntries(rows.map((sup) => [sup.id, emptyDraft(year)])));
      } catch {
        if (!controller.signal.aborted) toast.error(t("failedToLoadSupervisors"));
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    })();
    return () => controller.abort();
  }, [year, t]);

  const patch = (id: string, change: (d: TargetDraft) => TargetDraft) =>
    setDrafts((prev) => (prev[id] ? { ...prev, [id]: change(prev[id]) } : prev));

  const onTotal = (id: string, field: keyof KpiTotals, value: number) =>
    patch(id, (d) => {
      const totals = { ...d.totals, [field]: value };
      // An equal split follows the totals; a manual one keeps what was typed.
      return { ...d, totals, months: d.split === "equal" ? monthsOf(year, totals) : d.months };
    });
  const onSplit = (id: string, split: "equal" | "custom") =>
    patch(id, (d) => ({ ...d, split, months: monthsOf(year, d.totals) }));
  const onMonths = (id: string, months: KpiMonthFigures[]) => patch(id, (d) => ({ ...d, months }));

  const regionOptions = useMemo(() => [...new Set(supervisors.map((s) => s.territory).filter(Boolean))].sort(), [supervisors]);
  const unavailableCount = supervisors.filter((s) => s.availability !== "available").length;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return supervisors.filter((s) => {
      if (!showUnavailable && s.availability !== "available") return false;
      if (region && s.territory !== region) return false;
      return !q || s.name.toLowerCase().includes(q) || s.email.toLowerCase().includes(q);
    });
  }, [supervisors, search, region, showUnavailable]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const shown = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);
  useEffect(() => setPage(1), [search, region, showUnavailable, pageSize, year]);

  const entered = useMemo(
    () => supervisors.filter((s) => s.availability === "available" && drafts[s.id] && hasAny(drafts[s.id])),
    [supervisors, drafts]
  );
  const broken = entered.filter((s) => drafts[s.id].split === "custom" && kpiPeriodIssues(drafts[s.id].months, drafts[s.id].totals).length > 0);

  const totalsLine = useMemo(() => {
    let jobs = 0;
    let onboarded = 0;
    const revenue = new Map<string, number>();
    for (const s of entered) {
      const d = drafts[s.id].totals;
      jobs += d.jobTarget;
      onboarded += d.conversionTarget;
      if (d.revenueTarget > 0) revenue.set(s.currency, (revenue.get(s.currency) ?? 0) + d.revenueTarget);
    }
    const money = [...revenue].map(([c, a]) => formatProfit(a, c, locale)).join(" · ");
    return t("createTotalsLine", { jobs, onboarded, revenue: money || "—" });
  }, [entered, drafts, locale, t]);

  const handleCreate = async () => {
    if (entered.length === 0) return void toast.error(t("enterTargetsForSupervisors"));
    if (broken.length > 0) return void toast.error(t("kpiMonthsInvalid"));
    setCreating(true);
    try {
      const res = await csrfFetch("/api/admin/target-profiles?action=bulk-tabular", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          year,
          assigneeRole: "super_agent",
          targets: entered.map((s) => {
            const d = drafts[s.id];
            return {
              assigneeId: s.id,
              targetType: "kpi3",
              currency: s.currency,
              ...d.totals,
              distributionStrategy: d.split,
              // Only a manual split sends its months; the server builds the equal one.
              ...(d.split === "custom" ? { periods: equalKpiPeriods(year, ZERO).map((b, i) => ({ startDate: b.startDate, endDate: b.endDate, ...d.months[i] })) } : {}),
            };
          }),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return void toast.error(t("failedToCreateProfiles"));
      const created = Number(data.created ?? 0);
      const skipped: { assigneeId: string; reason: string }[] = data.skippedDetails ?? [];
      if (skipped.length > 0) {
        const reasons = skipped
          .map((item) => `${supervisors.find((s) => s.id === item.assigneeId)?.name ?? "—"}: ${t(SKIP_REASON_KEYS[item.reason] ?? "skipUnknown", { year })}`)
          .join(" · ");
        toast.error(t("profilesSkipped", { count: skipped.length, reasons }));
      }
      if (created > 0) {
        toast.success(t("profilesCreated", { count: created }));
        router.push(`/${routeLocale}/admin/target-management?year=${year}`);
      }
    } catch {
      toast.error(t("failedToCreateProfiles"));
    } finally {
      setCreating(false);
    }
  };

  const saveButton = (
    <Button onClick={handleCreate} disabled={creating || entered.length === 0 || broken.length > 0} className="min-h-11 gap-2 rounded-xl px-6">
      {creating ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
      {t("createTargetsCount", { count: entered.length })}
    </Button>
  );

  return (
    <div className="page-container">
      <button
        type="button"
        onClick={() => router.push(`/${routeLocale}/admin/target-management`)}
        className="inline-flex min-h-11 items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-4 rtl:rotate-180" /> {t("backToTargetManagement")}
      </button>

      <div className="workspace-glass-panel rounded-2xl panel-body">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <PageHeader title={t("createTitle")} description={t("createDescription")} />
          <div className="flex flex-wrap items-end gap-2">
            <TargetYearSelect value={String(year)} onChange={(value) => setYear(Number.parseInt(value, 10) || currentYear + 1)} label={t("yearLabel")} />
            {saveButton}
          </div>
        </div>
      </div>

      <div className="workspace-glass-panel overflow-hidden rounded-2xl">
        {/* Toolbar: always visible, so finding one super agent among many is a search, not a scroll. */}
        <div className="flex flex-col gap-3 border-b border-border/50 p-4 sm:flex-row sm:items-end">
          <div className="relative flex-1">
            <Label htmlFor="target-create-search" className="sr-only">{t("createSearchPlaceholder")}</Label>
            <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <Input
              id="target-create-search"
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("createSearchPlaceholder")}
              className="h-11 ps-9 sm:h-10"
            />
          </div>
          {regionOptions.length > 1 && (
            <div className="sm:w-56">
              <SearchableSelect
                id="target-create-region"
                ariaLabel={t("regionLabel")}
                value={region}
                onValueChange={setRegion}
                options={[{ value: "", label: t("allRegions") }, ...regionOptions.map((r) => ({ value: r, label: r }))]}
                placeholder={t("allRegions")}
                searchPlaceholder={t("searchRegions")}
                emptyMessage={t("noRegionsFound")}
                className="h-11 sm:h-10"
              />
            </div>
          )}
          {unavailableCount > 0 && (
            <div className="flex min-h-11 items-center gap-2 sm:min-h-10">
              <Switch id="target-create-unavailable" checked={showUnavailable} onCheckedChange={setShowUnavailable} />
              <Label htmlFor="target-create-unavailable" className="text-sm text-muted-foreground">
                {t("showUnavailable", { count: unavailableCount })}
              </Label>
            </div>
          )}
        </div>

        <div className={`hidden border-b border-border/70 bg-muted/40 px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground ${TARGET_GRID}`}>
          <span>{t("superAgentHeader")}</span>
          <span className="text-end">{t("jobsYearHeader")}</span>
          <span className="text-end">{t("onboardedYearHeader")}</span>
          <span className="text-end">{t("revenueYearHeader")}</span>
          <span>{t("monthlySplitHeader")}</span>
        </div>

        {loading ? (
          <div className="divide-y divide-border/50">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="flex items-center gap-4 px-4 py-4">
                <Skeleton className="h-4 w-48" />
                <Skeleton className="ms-auto h-9 w-24" />
                <Skeleton className="h-9 w-24" />
                <Skeleton className="h-9 w-24" />
              </div>
            ))}
          </div>
        ) : supervisors.length === 0 ? (
          <EmptyState icon={Users} title={t("noSupervisorsFound")} className="m-4" />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={Search}
            title={t("noSupervisorsMatchFilters")}
            className="m-4"
            action={<Button variant="outline" onClick={() => { setSearch(""); setRegion(""); }}>{t("clearFilters")}</Button>}
          />
        ) : (
          <div className="divide-y divide-border/50">
            {shown.map((sup) => (
              <SupervisorTargetRow
                key={sup.id}
                supervisor={sup}
                draft={drafts[sup.id] ?? emptyDraft(year)}
                year={year}
                onTotal={onTotal}
                onSplit={onSplit}
                onMonths={onMonths}
              />
            ))}
          </div>
        )}

        {!loading && filtered.length > 0 && (
          // The shared row zeroes its own start padding from sm; the inset lives here.
          <div className="border-t border-border/50 px-4 py-3">
            <PaginationControls
              page={safePage}
              totalPages={totalPages}
              total={filtered.length}
              limit={pageSize}
              onPageChange={setPage}
              onLimitChange={setPageSize}
            />
          </div>
        )}
      </div>

      {/* Summary + Save under the list (also at the top, beside the year), never floating over rows. */}
      <div className="flex flex-col gap-3 rounded-xl border border-border bg-card px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 text-sm">
          <p className="font-medium text-foreground">{t("createSelectedCount", { count: entered.length })}</p>
          <p className="truncate text-xs text-muted-foreground">{totalsLine}</p>
          {broken.length > 0 && <p role="alert" className="text-xs font-medium text-rose-600">{t("kpiMonthsInvalid")}</p>}
        </div>
        {saveButton}
      </div>
    </div>
  );
}
