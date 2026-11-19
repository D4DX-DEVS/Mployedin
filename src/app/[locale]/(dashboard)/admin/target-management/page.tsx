"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import { BriefcaseBusiness, Copy, Crosshair, Download, MapPin, MoreHorizontal, Plus, UserCheck, UsersRound, Wallet } from "lucide-react";
import { InlineFilterBar, InlineFilterSearch } from "@/components/shared/InlineFilterBar";
import { FilterField, PhoneFilterSheet, PhoneFiltersButton, SHEET_CONTROL } from "@/components/shared/PhoneFilterSheet";
import { DashboardPageHeader } from "@/components/shared/DashboardPageHeader";
import { PaginationControls } from "@/components/shared/PaginationControls";
import { TableSortControl } from "@/components/shared/TableSortControl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { TargetEmptyState } from "@/components/features/targets/TargetComponents";
import { TargetYearSelect } from "@/components/features/targets/TargetYearSelect";
import { formatProfit } from "@/components/features/targets/profitFormat";
import { csrfFetch } from "@/lib/security/csrf-client";
import { useConfirm } from "@/hooks/useConfirm";
import { usePagination } from "@/hooks/usePagination";
import { useUrlFilter } from "@/hooks/useUrlFilter";
import { TARGET_PROFILE_SORT_FIELDS, type TargetProfileSortField } from "@/lib/targets/profileSortFields";
import { EditTargetsDialog } from "./[id]/_components/EditTargetsDialog";
import { TargetRowsTable, type TargetListRow } from "./_components/TargetRowsTable";

type Risk = "high" | "medium" | "low";

interface Totals {
  supervisors: number;
  totalTeamSize: number;
  riskBreakdown: Record<Risk, number>;
  kpi?: {
    jobs: { target: number; actual: number };
    onboarded: { target: number; actual: number };
    revenue: { currency: string; target: number; actual: number }[];
  };
}

interface ReassignOption { value: string; label: string; email: string; teamSize: number }

const SORT_FIELDS: string[] = [...TARGET_PROFILE_SORT_FIELDS];
const RISK_CHIP: Record<Risk, string> = {
  high: "bg-status-rejected-bg text-status-rejected",
  medium: "bg-status-shortlisted-bg text-status-shortlisted",
  low: "bg-status-selected-bg text-status-selected",
};

export default function AdminTargetManagementPage() {
  const t = useTranslations("profitTargets");
  const tc = useTranslations("common");
  const intl = useLocale();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const locale = pathname.split("/")[1] || "en";
  const { confirm, ConfirmDialogNode } = useConfirm();
  const { page, limit, total, totalPages, setPage, setLimit, updateTotal, resetPage, paginationParams } = usePagination();

  const currentYear = new Date().getFullYear();
  const requestedYear = Number.parseInt(searchParams.get("year") ?? "", 10);
  const [year, setYear] = useState(Number.isFinite(requestedYear) && requestedYear > 0 ? requestedYear : currentYear);
  const [region, setRegion] = useState("");
  const [risk, setRisk] = useState<Risk | "">("");
  const [search, setSearch] = useState("");
  const [sheetOpen, setSheetOpen] = useState(false);
  const [sortBy, setSortBy] = useUrlFilter("sortBy", "", { allow: SORT_FIELDS });
  const [sortOrder, setSortOrder] = useUrlFilter("sortOrder", "desc", { allow: ["asc", "desc"] });
  const order = sortOrder === "asc" ? "asc" : "desc";

  const [rows, setRows] = useState<TargetListRow[]>([]);
  const [totals, setTotals] = useState<Totals | null>(null);
  const [regions, setRegions] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  const [editing, setEditing] = useState<TargetListRow | null>(null);
  const [cloneOpen, setCloneOpen] = useState(false);
  const [cloneAdjustment, setCloneAdjustment] = useState("0");
  const [reassigning, setReassigning] = useState<TargetListRow | null>(null);
  const [reassignTo, setReassignTo] = useState("");
  const [reassignReason, setReassignReason] = useState("");
  const [reassignOptions, setReassignOptions] = useState<ReassignOption[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = paginationParams();
      params.set("year", String(year));
      params.set("status", "active");
      if (region) params.set("region", region);
      if (risk) params.set("risk", risk);
      if (search.trim()) params.set("search", search.trim());
      if (sortBy) params.set("sortBy", sortBy);
      params.set("sortOrder", order);
      const res = await fetch(`/api/admin/target-profiles?${params}`);
      if (!res.ok) throw new Error(`targets ${res.status}`);
      const data = await res.json();
      setRows(data.profiles ?? []);
      setTotals(data.totals ?? null);
      updateTotal(data.pagination?.total ?? 0);
    } catch {
      toast.error(t("failedToLoadProfiles"));
    } finally {
      setLoading(false);
    }
     
  }, [year, region, risk, search, sortBy, order, page, limit]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { resetPage(); }, [year, region, risk, search, resetPage]);
  useEffect(() => {
    fetch(`/api/admin/target-profiles/regions?year=${year}`)
      .then((r) => (r.ok ? r.json() : { regions: [] }))
      .then((d) => setRegions(d.regions ?? []))
      .catch(() => setRegions([]));
  }, [year]);

  const onSort = (field: TargetProfileSortField) => {
    setSortBy(field);
    setSortOrder(sortBy === field && order === "asc" ? "desc" : "asc");
    resetPage();
  };

  const onRemove = async (row: TargetListRow) => {
    const ok = await confirm({ message: t("removeConfirm", { name: row.assigneeName, year: row.year }), confirmLabel: t("removeTarget") });
    if (!ok) return;
    try {
      const res = await csrfFetch(`/api/admin/target-profiles/${row._id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(`remove ${res.status}`);
      toast.success(t("targetRemoved"));
      void load();
    } catch {
      toast.error(t("removeFailed"));
    }
  };

  const onRevenuePermission = async (row: TargetListRow) => {
    const enabled = !row.canSetRevenueTargets;
    try {
      const res = await csrfFetch("/api/admin/target-profiles/revenue-permission", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ superAgentUserId: row.assigneeId, enabled }),
      });
      if (!res.ok) throw new Error(`permission ${res.status}`);
      toast.success(t(enabled ? "revenueTargetPermissionEnabled" : "revenueTargetPermissionDisabled", { name: row.assigneeName }));
      void load();
    } catch {
      toast.error(t("revenueTargetPermissionFailed"));
    }
  };

  const openReassign = async (row: TargetListRow) => {
    setReassigning(row);
    setReassignTo("");
    setReassignReason("");
    try {
      const params = new URLSearchParams({ directory: "create-target", targetYear: String(year), availability: "available", limit: "500" });
      const res = await fetch(`/api/admin/super-agents?${params}`);
      const data = res.ok ? await res.json() : { superAgents: [] };
      setReassignOptions((data.superAgents ?? []).map((s: { _id: string; name: string; email: string; directory?: { teamSize?: number } }) => ({
        value: s._id, label: s.name, email: s.email, teamSize: s.directory?.teamSize ?? 0,
      })));
    } catch {
      setReassignOptions([]);
    }
  };

  const handleReassign = async () => {
    if (!reassigning || !reassignTo) return;
    try {
      const res = await csrfFetch(`/api/admin/target-profiles/${reassigning._id}/reassign`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newAssigneeId: reassignTo, reason: reassignReason.trim() || undefined }),
      });
      if (!res.ok) throw new Error(`reassign ${res.status}`);
      toast.success(t("profileReassigned"));
      setReassigning(null);
      void load();
    } catch {
      toast.error(t("failedToReassign"));
    }
  };

  const handleClone = async () => {
    const adjustmentPct = Number(cloneAdjustment);
    if (!Number.isFinite(adjustmentPct) || adjustmentPct < -100 || adjustmentPct > 500) return void toast.error(t("cloneAdjustmentInvalid"));
    try {
      const res = await csrfFetch(`/api/admin/target-profiles?action=clone`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceYear: year - 1, targetYear: year, adjustmentPct }),
      });
      if (!res.ok) throw new Error(`clone ${res.status}`);
      const data = await res.json();
      toast.success(t("profilesCloned", { count: data.cloned, year: year - 1 }));
      setCloneOpen(false);
      void load();
    } catch {
      toast.error(t("failedToClone"));
    }
  };

  const handleExport = () => {
    const cell = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const lines = [
      [t("superAgentHeader"), t("csvHeaderEmail"), t("csvHeaderRegion"), t("csvHeaderCurrency"), t("jobProgressShort"), t("jobsTargetCsv"), t("conversionProgressShort"), t("onboardedTargetCsv"), t("revenueProgressShort"), t("revenueTargetCsv"), t("overallHeader"), t("riskHeader")].map(cell).join(","),
      ...rows.map((r) => [r.assigneeName, r.assigneeEmail, r.region, r.currency, r.jobActual, r.jobTarget, r.onboardedActual, r.conversionTarget, r.revenueActual, r.revenueTarget, r.overallProgress, r.riskScore].map(cell).join(",")),
    ];
    const url = URL.createObjectURL(new Blob([lines.join("\n")], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `targets-${year}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(t("csvExported"));
  };

  const kpi = totals?.kpi;
  const ratio = (actual: number, target: number) => t("actualOfTarget", { actual, target });
  const mainRevenue = kpi?.revenue[0];
  const otherRevenue = kpi?.revenue.slice(1) ?? [];
  const regionOptions = [{ value: "", label: t("allRegions") }, ...regions.map((r) => ({ value: r, label: r }))];
  const sortOptions = [
    { value: "dateAdded", label: t("sortDateAdded") },
    { value: "name", label: t("superAgentHeader") },
    { value: "profitProgress", label: t("overallHeader") },
    { value: "risk", label: t("riskHeader") },
  ];
  const newTargetHref = `/${locale}/admin/target-management/create`;
  const empty = (
    <TargetEmptyState
      title={t("noTargets")}
      description={t("emptyStateTargetProfile")}
      action={<Button asChild size="sm" className="mt-2 gap-2"><Link href={newTargetHref}><Plus className="size-4" /> {t("newTargetProfileButton")}</Link></Button>}
    />
  );

  return (
    <div className="page-container">
      {ConfirmDialogNode}

      <DashboardPageHeader
        compact
        compactOnMobile
        icon={Crosshair}
        title={t("title")}
        description={t("description")}
        actions={
          <div className="flex items-center gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="icon" className="size-11 rounded-xl sm:size-10" aria-label={t("moreActions")}>
                  <MoreHorizontal className="size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={handleExport} disabled={rows.length === 0}>
                  <Download className="size-4" /> {tc("export")}
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => setCloneOpen(true)}>
                  <Copy className="size-4" /> {t("copyLastYear", { year: year - 1 })}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button asChild className="min-h-11 gap-2 rounded-xl sm:min-h-10">
              <Link href={newTargetHref}><Plus className="size-4" /> {t("newTargetProfile")}</Link>
            </Button>
          </div>
        }
        metrics={[
          { label: t("superAgentsMetric"), value: totals?.supervisors ?? 0, note: t("totalAgentsNote", { count: totals?.totalTeamSize ?? 0 }), icon: UsersRound, iconClassName: "text-sky-600", iconSurfaceClassName: "bg-sky-50" },
          { label: t("kpiJobsAcquired"), value: ratio(kpi?.jobs.actual ?? 0, kpi?.jobs.target ?? 0), icon: BriefcaseBusiness, iconClassName: "text-indigo-600", iconSurfaceClassName: "bg-indigo-50" },
          { label: t("kpiOnboarded"), value: ratio(kpi?.onboarded.actual ?? 0, kpi?.onboarded.target ?? 0), icon: UserCheck, iconClassName: "text-emerald-600", iconSurfaceClassName: "bg-emerald-50" },
          {
            label: t("kpiInvoicedRevenue"),
            value: mainRevenue
              ? `${formatProfit(mainRevenue.actual, mainRevenue.currency, intl, "compact")} / ${formatProfit(mainRevenue.target, mainRevenue.currency, intl, "compact")}`
              : "—",
            note: otherRevenue.length ? t("revenueOtherCurrencies", { currencies: otherRevenue.map((r) => r.currency).join(", ") }) : undefined,
            icon: Wallet,
            iconClassName: "text-violet-600",
            iconSurfaceClassName: "bg-violet-50",
          },
        ]}
        footer={
          <div className="flex flex-wrap items-center gap-2" role="group" aria-label={t("riskOverview")}>
            <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{t("riskOverview")}</span>
            {(["high", "medium", "low"] as const).map((level) => (
              // Each chip filters the list to that risk; a second tap clears it.
              <button
                key={level}
                type="button"
                aria-pressed={risk === level}
                onClick={() => setRisk(risk === level ? "" : level)}
                className={`chip-pad min-h-9 rounded-full text-xs font-semibold ${RISK_CHIP[level]} ${risk === level ? "ring-2 ring-current ring-offset-1" : ""}`}
              >
                {t(level === "high" ? "riskHighCount" : level === "medium" ? "riskMediumCount" : "riskLowCount", { count: totals?.riskBreakdown[level] ?? 0 })}
              </button>
            ))}
          </div>
        }
      />

      <InlineFilterBar
        className="workspace-panel-surface rounded-2xl max-sm:!border-0 max-sm:!bg-transparent max-sm:!p-0 max-sm:!shadow-none"
        onClear={year !== currentYear || region || risk || search ? () => { setYear(currentYear); setRegion(""); setRisk(""); setSearch(""); } : undefined}
        clearLabel={t("resetFilters")}
      >
        <InlineFilterSearch value={search} onChange={setSearch} placeholder={t("searchSuperAgents")} />
        <PhoneFiltersButton activeCount={(year !== currentYear ? 1 : 0) + (region ? 1 : 0)} onClick={() => setSheetOpen(true)} />
        <div className="contents max-sm:hidden">
          <TargetYearSelect value={String(year)} onChange={(v) => setYear(Number.parseInt(v, 10) || currentYear)} label={t("a11yYear")} />
          {regions.length > 0 && (
            <div className="relative">
              <MapPin className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
              <SearchableSelect ariaLabel={t("regionLabel")} options={regionOptions} value={region} onValueChange={setRegion} placeholder={t("regionLabel")} className="h-11 w-44 rounded-xl ps-9" />
            </div>
          )}
        </div>
      </InlineFilterBar>

      <PhoneFilterSheet open={sheetOpen} onOpenChange={setSheetOpen} activeCount={(year !== currentYear ? 1 : 0) + (region ? 1 : 0)} onClear={() => { setYear(currentYear); setRegion(""); }}>
        <FilterField label={tc("sortBy")}>
          <TableSortControl
            value={sortBy || "dateAdded"}
            onValueChange={(v) => { setSortBy(v === "dateAdded" ? "" : v); resetPage(); }}
            options={sortOptions}
            order={order}
            onOrderChange={(next) => { setSortOrder(next); resetPage(); }}
            className="w-full [&_button]:h-11 [&>button:first-child]:min-w-0 [&>button:first-child]:flex-1 [&>button:last-child]:w-11"
          />
        </FilterField>
        <FilterField label={t("yearLabel")} htmlFor="targets-sheet-year">
          <div className="[&>button]:h-11 [&>button]:w-full [&>button]:bg-card">
            <TargetYearSelect id="targets-sheet-year" showLabel={false} value={String(year)} onChange={(v) => setYear(Number.parseInt(v, 10) || currentYear)} label={t("a11yYear")} />
          </div>
        </FilterField>
        {regions.length > 0 && (
          <FilterField label={t("regionLabel")} htmlFor="targets-sheet-region">
            <SearchableSelect id="targets-sheet-region" options={regionOptions} value={region} onValueChange={setRegion} placeholder={t("regionLabel")} className={SHEET_CONTROL} />
          </FilterField>
        )}
      </PhoneFilterSheet>

      {cloneOpen && (
        <section className="workspace-glass-panel card-pad rounded-2xl" aria-label={t("copyLastYear", { year: year - 1 })}>
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">{t("copyLastYear", { year: year - 1 })}</p>
              <p className="text-xs text-muted-foreground">{t("cloneHint", { from: year - 1, to: year })}</p>
            </div>
            <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
              {t("cloneAdjustmentLabel")}
              <Input type="number" min={-100} max={500} step={1} value={cloneAdjustment} onChange={(e) => setCloneAdjustment(e.target.value)} className="h-11 rounded-xl lg:w-40" />
            </label>
            <div className="flex gap-2">
              <Button variant="outline" className="h-11 rounded-lg" onClick={() => setCloneOpen(false)}>{t("cancelButton")}</Button>
              <Button className="h-11 rounded-lg" onClick={handleClone}>{t("cloneButton")}</Button>
            </div>
          </div>
        </section>
      )}

      {reassigning && (
        <section className="workspace-glass-panel card-pad rounded-2xl" aria-label={t("reassignTargetProfile")}>
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">{t("reassignTargetProfile")}</p>
              <p className="text-xs text-muted-foreground">{t("reassignHint", { name: reassigning.assigneeName, year: reassigning.year })}</p>
            </div>
            <SearchableSelect
              ariaLabel={t("selectSupervisor")}
              options={reassignOptions.map((o) => ({ value: o.value, label: `${o.label} · ${o.email}` }))}
              value={reassignTo}
              onValueChange={setReassignTo}
              placeholder={t("selectSupervisor")}
              className="h-11 min-w-64 rounded-xl"
            />
            <Input value={reassignReason} onChange={(e) => setReassignReason(e.target.value)} placeholder={t("reasonLabel")} aria-label={t("reasonLabel")} className="h-11 rounded-xl lg:w-64" />
            <div className="flex gap-2">
              <Button variant="outline" className="h-11 rounded-lg" onClick={() => setReassigning(null)}>{t("cancelButton")}</Button>
              <Button className="h-11 rounded-lg" onClick={handleReassign} disabled={!reassignTo}>{t("reassignButton")}</Button>
            </div>
          </div>
        </section>
      )}

      <TargetRowsTable
        rows={rows}
        loading={loading}
        empty={empty}
        sortBy={sortBy}
        order={order}
        onSort={onSort}
        onEdit={setEditing}
        onReassign={(row) => void openReassign(row)}
        onRevenuePermission={(row) => void onRevenuePermission(row)}
        onRemove={(row) => void onRemove(row)}
      />

      {total > 0 && (
        <PaginationControls page={page} totalPages={totalPages} total={total} limit={limit} onPageChange={setPage} onLimitChange={setLimit} />
      )}

      {editing && (
        <EditTargetsDialog
          open
          onOpenChange={(open) => { if (!open) setEditing(null); }}
          profileId={editing._id}
          initialData={{ jobTarget: editing.jobTarget, conversionTarget: editing.conversionTarget, revenueTarget: editing.revenueTarget, setByRole: editing.setByRole, currency: editing.currency }}
          onSuccess={() => { setEditing(null); void load(); }}
        />
      )}
    </div>
  );
}
