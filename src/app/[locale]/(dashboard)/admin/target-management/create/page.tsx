"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { csrfFetch } from "@/lib/security/csrf-client";
import { SearchableSelect } from "@/components/ui/searchable-select";
import {
  ArrowLeft, Users, CalendarDays, Target, Loader2, ChevronDown, ChevronRight,
  Save, SlidersHorizontal, Search, X,
} from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { usePathname, useRouter } from "next/navigation";
import { PageHeader } from "@/components/shared/PageHeader";
import { ScheduleControls, SchedulePeriodsEditor, useScheduleIssue } from "@/components/features/targets/TargetScheduleEditor";
import { TargetYearSelect } from "@/components/features/targets/TargetYearSelect";
import { formatProfit } from "@/components/features/targets/profitFormat";
import { draftIssues, newDraft, withAmount, type ScheduleDraft } from "@/lib/targets/scheduleDraft";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface SupervisorRow {
  id: string;
  name: string;
  email: string;
  teamSize: number;
  territory: string;
  currency: string;
  /** `available`, or why a target cannot be set for this supervisor now. */
  availability: "available" | "has_active_target" | "inactive";
}

interface TargetRow {
  supervisorId: string;
  profitTarget: number;
  /** How the year is cut and what each period is worth. */
  draft: ScheduleDraft;
  showSchedule: boolean;
}

/** Why the server left a supervisor out, as message keys. */
const SKIP_REASON_KEYS: Record<string, string> = {
  active_profile_exists: "skipActiveExists",
  active_profile_created_concurrently: "skipActiveExists",
  ineligible: "skipIneligible",
  distribution_invalid: "skipInvalidSchedule",
};

const emptyRow = (supervisorId: string, year: number): TargetRow => ({
  supervisorId,
  profitTarget: 0,
  draft: newDraft(year, 0),
  showSchedule: false,
});

/* ------------------------------------------------------------------ */
/*  Main Component                                                     */
/* ------------------------------------------------------------------ */

export default function CreateTargetProfilePage() {
  const t = useTranslations("profitTargets");
  const locale = useLocale();
  const pathname = usePathname();
  const routeLocale = pathname.split("/")[1] || "en";
  const router = useRouter();
  const currentYear = new Date().getFullYear();

  const [year, setYear] = useState(currentYear + 1);
  const [creating, setCreating] = useState(false);
  const [loading, setLoading] = useState(true);

  // Supervisors list
  const [supervisors, setSupervisors] = useState<SupervisorRow[]>([]);

  // Target data per supervisor
  const [targetRows, setTargetRows] = useState<Record<string, TargetRow>>({});

  // Filters
  const [showFilters, setShowFilters] = useState(false);
  const [filterName, setFilterName] = useState("");
  const [filterRegion, setFilterRegion] = useState("");
  const [filterTeamSize, setFilterTeamSize] = useState<"all" | "small" | "medium" | "large">("all");

  // Fetch supervisors under admin
  useEffect(() => {
    const controller = new AbortController();
    (async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams({
          directory: "create-target",
          targetYear: String(year),
          limit: "500",
        });
        const res = await fetch(`/api/admin/super-agents?${params.toString()}`, {
          signal: controller.signal,
        });
        if (!res.ok) throw new Error("Failed to load supervisors");
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
            name: sa.name ?? sa.user?.name ?? "Unknown",
            email: sa.email ?? "",
            teamSize: sa.directory?.teamSize ?? 0,
            territory: sa.directory?.regionNames?.[0] ?? "",
            currency: sa.directory?.currencyCode ?? "AED",
            availability: sa.directory?.availability ?? "available",
          })
        );
        setSupervisors(rows);
        setTargetRows(Object.fromEntries(rows.map((sup) => [sup.id, emptyRow(sup.id, year)])));
      } catch {
        if (!controller.signal.aborted) {
          toast.error(t("failedToLoadSupervisors"));
        }
      } finally {
        setLoading(false);
      }
    })();
    return () => controller.abort();
  }, [year]);

  const patchRow = useCallback((supervisorId: string, change: (row: TargetRow) => TargetRow) => {
    setTargetRows((prev) => {
      const row = prev[supervisorId];
      return row ? { ...prev, [supervisorId]: change(row) } : prev;
    });
  }, []);

  // A new amount re-spreads over the periods unless they were typed by hand.
  const updateTarget = useCallback((supervisorId: string, profitTarget: number) => {
    patchRow(supervisorId, (row) => ({ ...row, profitTarget, draft: withAmount(row.draft, year, profitTarget) }));
  }, [patchRow, year]);

  const updateDraft = useCallback((supervisorId: string, draft: ScheduleDraft) => {
    patchRow(supervisorId, (row) => ({ ...row, draft }));
  }, [patchRow]);

  const toggleSchedule = useCallback((supervisorId: string) => {
    patchRow(supervisorId, (row) => ({ ...row, showSchedule: !row.showSchedule }));
  }, [patchRow]);

  // Derived region options
  const regionOptions = useMemo(() => [...new Set(supervisors.map((s) => s.territory).filter(Boolean))].sort(), [supervisors]);

  // Filtered supervisors
  const filteredSupervisors = useMemo(() => {
    return supervisors.filter((sup) => {
      if (filterName.trim()) {
        const q = filterName.trim().toLowerCase();
        if (!sup.name.toLowerCase().includes(q) && !sup.email.toLowerCase().includes(q)) return false;
      }
      if (filterRegion && sup.territory !== filterRegion) return false;
      if (filterTeamSize !== "all") {
        if (filterTeamSize === "small" && sup.teamSize > 3) return false;
        if (filterTeamSize === "medium" && (sup.teamSize < 4 || sup.teamSize > 8)) return false;
        if (filterTeamSize === "large" && sup.teamSize < 9) return false;
      }
      return true;
    });
  }, [supervisors, filterName, filterRegion, filterTeamSize]);

  const hasActiveFilters = filterName.trim() !== "" || filterRegion !== "" || filterTeamSize !== "all";

  const clearFilters = () => {
    setFilterName("");
    setFilterRegion("");
    setFilterTeamSize("all");
  };

  // Rows that have a target, and the ones among them whose months do not add up.
  const validRows = useMemo(() => Object.values(targetRows).filter((row) => row.profitTarget > 0), [targetRows]);
  const brokenRows = useMemo(() => validRows.filter((row) => draftIssues(row.draft, year, row.profitTarget).length > 0), [validRows, year]);

  // One currency at a time: supervisors in other currencies are listed apart.
  const totalsByCurrency = useMemo(() => {
    const totals = new Map<string, number>();
    for (const row of validRows) {
      const currency = supervisors.find((s) => s.id === row.supervisorId)?.currency ?? "AED";
      totals.set(currency, (totals.get(currency) ?? 0) + row.profitTarget);
    }
    return [...totals.entries()];
  }, [validRows, supervisors]);

  // Submit targets
  const handleCreate = async () => {
    if (validRows.length === 0) {
      toast.error(t("enterTargetsForSupervisors"));
      return;
    }
    if (brokenRows.length > 0) {
      toast.error(t("sumMismatchError"));
      return;
    }

    setCreating(true);
    try {
      const payload = {
        year,
        assigneeRole: "super_agent" as const,
        targets: validRows.map((row) => {
          const sup = supervisors.find((s) => s.id === row.supervisorId);
          return {
            assigneeId: row.supervisorId,
            profitTarget: row.profitTarget,
            currency: sup?.currency ?? "AED",
            periodType: row.draft.periodType,
            distributionStrategy: row.draft.strategy,
            periods: row.draft.periods,
          };
        }),
      };

      const res = await csrfFetch("/api/admin/target-profiles?action=bulk-tabular", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        const created = Number(data.created ?? 0);
        // A row the server skipped used to vanish into "0 created". Say who, and why.
        const skipped: { assigneeId: string; reason: string }[] = data.skippedDetails ?? [];
        if (skipped.length > 0) {
          const reasons = skipped
            .map((item) => {
              const who = supervisors.find((s) => s.id === item.assigneeId)?.name ?? item.assigneeId;
              return `${who}: ${t(SKIP_REASON_KEYS[item.reason] ?? "skipUnknown", { year })}`;
            })
            .join(" · ");
          toast.error(t("profilesSkipped", { count: skipped.length, reasons }));
        }
        if (created > 0) {
          toast.success(t("profilesCreated", { count: created }));
          router.push(`/${routeLocale}/admin/target-management?year=${year}`);
        }
      } else {
        toast.error(data.error ?? t("failedToCreateProfiles"));
      }
    } catch {
      toast.error(t("failedToCreateProfiles"));
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="page-container">
      {/* Back */}
      <button
        onClick={() => router.push(`/${routeLocale}/admin/target-management`)}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="h-4 w-4" /> {t("backToTargetManagement")}
      </button>

      {/* Header */}
      <div className="workspace-glass-panel rounded-2xl panel-body">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="workspace-tone-sky rounded-xl p-2.5">
              <Target className="h-5 w-5" />
            </div>
            <PageHeader title={t("createTitle")} description={t("createDescription")} />
          </div>
          <div className="flex items-center gap-2">
            <Label className="text-xs font-medium text-muted-foreground">{t("yearLabel")}</Label>
            <TargetYearSelect value={String(year)} onChange={(value) => setYear(Number.parseInt(value, 10) || currentYear + 1)} label={t("yearLabel")} />
          </div>
        </div>
      </div>

      {/* Filter Toggle + Panel */}
      <div className="workspace-glass-panel rounded-2xl overflow-hidden">
        <div className="flex items-center justify-between border-b border-border/50 panel-head">
          <button
            type="button"
            onClick={() => setShowFilters(!showFilters)}
            className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            <SlidersHorizontal className="h-4 w-4" />
            {t("filtersLabel")}
            {hasActiveFilters && (
              <Badge variant="info" className="text-[11px] px-1.5 py-0">
                {[filterName, filterRegion, filterTeamSize !== "all" ? filterTeamSize : ""].filter(Boolean).length}
              </Badge>
            )}
            {showFilters ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
          </button>
          {hasActiveFilters && (
            <button
              type="button"
              onClick={clearFilters}
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="h-3 w-3" /> {t("clearFilters")}
            </button>
          )}
        </div>

        {showFilters && (
          <div className="px-4 py-3 bg-muted/20 border-b border-border/50">
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="field">
                <Label className="text-[11px] font-medium text-muted-foreground">{t("nameEmailLabel")}</Label>
                <div className="relative">
                  <Search className="absolute start-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    aria-label={t("searchByNameEmail")}
                    value={filterName}
                    onChange={(e) => setFilterName(e.target.value)}
                    placeholder={t("searchByNameEmail")}
                    className="h-11 rounded-lg border-border bg-background ps-8 text-xs sm:h-9"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <Label className="text-[11px] font-medium text-muted-foreground">{t("regionLabel")}</Label>
                <SearchableSelect
                  value={filterRegion}
                  onValueChange={(val) => setFilterRegion(val)}
                  options={[
                    { value: "", label: t("allRegions") },
                    ...regionOptions.map((r) => ({ value: r, label: r })),
                  ]}
                  placeholder={t("allRegions")}
                  searchPlaceholder={t("searchRegions")}
                  emptyMessage={t("noRegionsFound")}
                  className="h-8 text-xs"
                />
              </div>

              <div className="space-y-1">
                <Label className="text-[11px] font-medium text-muted-foreground">{t("teamSizeLabel")}</Label>
                <SearchableSelect
                  value={filterTeamSize}
                  onValueChange={(val) => setFilterTeamSize(val as "all" | "small" | "medium" | "large")}
                  options={[
                    { value: "all", label: t("allSizes") },
                    { value: "small", label: t("smallTeam") },
                    { value: "medium", label: t("mediumTeam") },
                    { value: "large", label: t("largeTeam") },
                  ]}
                  placeholder={t("allSizes")}
                  searchPlaceholder={t("searchSizes")}
                  className="h-8 text-xs"
                />
              </div>
            </div>
            {hasActiveFilters && (
              <p className="mt-2 text-[11px] text-muted-foreground">
                {t("showingCountMessage", { filtered: filteredSupervisors.length, total: supervisors.length })}
              </p>
            )}
          </div>
        )}
      </div>

      {/* Main Table */}
      <div className="workspace-glass-panel rounded-2xl overflow-hidden">
        {loading ? (
          <div className="divide-y divide-border/50">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="flex items-center gap-4 px-4 py-3">
                <Skeleton className="h-4 w-48" />
                <Skeleton className="ml-auto h-4 w-16" />
                <Skeleton className="h-4 w-20" />
              </div>
            ))}
          </div>
        ) : supervisors.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Users className="h-10 w-10 text-muted-foreground/50 mb-3" />
            <p className="text-sm text-muted-foreground">{t("noSupervisorsFound")}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 border-b border-border/70">
                <tr>
                  <th className="px-4 py-3 text-start text-[11px] font-semibold uppercase tracking-wider text-muted-foreground min-w-[200px]">
                    {t("supervisorTableHeader")}
                  </th>
                  <th className="px-4 py-3 text-center text-[11px] font-semibold uppercase tracking-wider text-muted-foreground min-w-[180px]">
                    {t("profitTargetHeader")}
                  </th>
                  <th className="px-4 py-3 text-center text-[11px] font-semibold uppercase tracking-wider text-muted-foreground min-w-[260px]">
                    {t("scheduleTableHeader")}
                  </th>
                  <th className="px-4 py-3 text-center text-[11px] font-semibold uppercase tracking-wider text-muted-foreground min-w-[100px]">
                    {t("periodsTableHeader")}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {filteredSupervisors.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-10 text-center text-sm text-muted-foreground">
                      {t("noSupervisorsMatchFilters")}
                    </td>
                  </tr>
                ) : (
                  filteredSupervisors.map((sup) => {
                    const row = targetRows[sup.id];
                    if (!row) return null;
                    const hasTarget = row.profitTarget > 0;
                    return (
                      <SupervisorTargetRow
                        key={sup.id}
                        supervisor={sup}
                        row={row}
                        hasTarget={hasTarget}
                        locked={sup.availability !== "available"}
                        year={year}
                        onUpdateTarget={updateTarget}
                        onUpdateDraft={updateDraft}
                        onToggleSchedule={toggleSchedule}
                      />
                    );
                  })
                )}
              </tbody>
              <tfoot className="bg-muted/30 border-t-2 border-border">
                <tr>
                  <td className="px-4 py-3 text-sm font-semibold text-foreground">
                    {t("totalLabel")} ({t("supervisorCountLabel", { count: validRows.length })})
                  </td>
                  <td className="px-4 py-3 text-center text-sm font-bold text-foreground tabular-nums" colSpan={3}>
                    {totalsByCurrency.length === 0
                      ? "—"
                      : totalsByCurrency.map(([currency, amount]) => formatProfit(amount, currency, locale)).join(" · ")}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      {/* Submit Button */}
      <div className="flex flex-col items-end gap-2">
        {brokenRows.length > 0 && (
          <p role="alert" className="text-xs font-medium text-rose-600">{t("sumMismatchError")}</p>
        )}
        <Button
          onClick={handleCreate}
          disabled={creating || validRows.length === 0 || brokenRows.length > 0}
          className="gap-2 rounded-xl px-6"
        >
          {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {t("createTargetsCount", { count: validRows.length })}
        </Button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Supervisor Row Component                                           */
/* ------------------------------------------------------------------ */

interface SupervisorTargetRowProps {
  supervisor: SupervisorRow;
  row: TargetRow;
  hasTarget: boolean;
  /** Already has an active target this year (or is inactive): nothing can be set here. */
  locked: boolean;
  year: number;
  onUpdateTarget: (id: string, profitTarget: number) => void;
  onUpdateDraft: (id: string, draft: ScheduleDraft) => void;
  onToggleSchedule: (id: string) => void;
}

function SupervisorTargetRow({
  supervisor,
  row,
  hasTarget,
  locked,
  year,
  onUpdateTarget,
  onUpdateDraft,
  onToggleSchedule,
}: SupervisorTargetRowProps) {
  const ta = useTranslations("a11y");
  const t = useTranslations("profitTargets");
  const issue = useScheduleIssue(row.draft, year, row.profitTarget, supervisor.currency);

  return (
    <>
      <tr className={`transition-colors ${hasTarget ? "bg-sky-50/50" : "hover:bg-muted/20"}`}>
        <td className="px-4 py-3">
          <div>
            <p className="font-medium text-foreground">{supervisor.name}</p>
            <p className="text-[11px] text-muted-foreground">{supervisor.email}</p>
            {supervisor.territory && (
              <p className="text-[11px] text-muted-foreground mt-0.5">{supervisor.territory}</p>
            )}
            {locked && (
              <Badge variant="outline" className="mt-1 px-2 py-0.5 text-[11px]">
                {supervisor.availability === "inactive" ? t("supervisorInactive") : t("alreadyHasTarget", { year })}
              </Badge>
            )}
          </div>
        </td>

        <td className="px-4 py-3">
          <div className="relative">
            <Input
              type="number"
              aria-label={t("profitTargetLabel", { currency: supervisor.currency })}
              min={0}
              step="0.01"
              inputMode="decimal"
              value={row.profitTarget || ""}
              onChange={(e) => onUpdateTarget(supervisor.id, Number(e.target.value) || 0)}
              placeholder="0"
              disabled={locked}
              className="h-9 w-full rounded-lg border-border bg-background pe-12 text-center text-sm tabular-nums"
            />
            <span className="pointer-events-none absolute end-2.5 top-1/2 -translate-y-1/2 text-[11px] font-medium text-muted-foreground">
              {supervisor.currency}
            </span>
          </div>
        </td>

        <td className="px-4 py-3">
          <ScheduleControls
            draft={row.draft}
            year={year}
            profitTarget={row.profitTarget}
            onChange={(draft) => onUpdateDraft(supervisor.id, draft)}
            disabled={!hasTarget || locked}
          />
          {hasTarget && issue ? <p role="alert" className="mt-1 text-[11px] font-medium text-rose-600">{issue}</p> : null}
        </td>

        <td className="px-4 py-3 text-center">
          <Button
            type="button"
            aria-label={ta("toggleBreakdown")}
            variant={row.showSchedule ? "default" : "outline"}
            size="dense"
            className="rounded-lg text-xs gap-1"
            onClick={() => onToggleSchedule(supervisor.id)}
            disabled={!hasTarget}
          >
            <CalendarDays className="h-3.5 w-3.5" />
            {row.showSchedule ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
          </Button>
        </td>
      </tr>

      {row.showSchedule && hasTarget && (
        <tr className="bg-muted/10">
          <td colSpan={4} className="px-4 py-3">
            <SchedulePeriodsEditor
              draft={row.draft}
              year={year}
              profitTarget={row.profitTarget}
              currency={supervisor.currency}
              onChange={(draft) => onUpdateDraft(supervisor.id, draft)}
            />
          </td>
        </tr>
      )}
    </>
  );
}
