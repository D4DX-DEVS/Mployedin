"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useLocale } from "next-intl";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  ArrowUpDown, Building2, ChevronDown, ChevronUp, DollarSign,
  Link2, LogIn, RotateCcw, ShieldCheck, UserPlus, Users,
} from "lucide-react";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { PaginationControls } from "@/components/shared/PaginationControls";
import { CrudModal, CrudField } from "@/components/shared/CrudModal";
import { usePagination } from "@/hooks/usePagination";
import { SearchableSelect } from "@/components/ui/searchable-select";
import {
  SuperAgentMetricsGrid,
  SuperAgentPageIntro,
  SuperAgentSection,
} from "@/components/features/super-agent/WorkspacePage";
import { formatCurrency } from "@/lib/currency";
import { ReferralLinkDialog } from "@/components/features/super-agent/ReferralLinkDialog";
import { useTableExport } from "@/hooks/useTableExport";
import { TableToolbar } from "@/components/shared/TableToolbar";
import type { ExportColumn } from "@/lib/export";

interface Employer {
  _id: string;
  name: string;
  email: string;
  companyName?: string;
  industry?: string;
  location?: string;
  isActive: boolean;
  assignedAgent?: { name: string };
  jobCount?: number;
  totalPaid?: number;
  isAgentVerified?: boolean;
}

/* ── Filter types ── */
interface Filters {
  search: string;
  industry: string;
  location: string;
  status: string;
  verified: string;
  sortBy: string;
  sortOrder: string;
}

const INITIAL_FILTERS: Filters = {
  search: "", industry: "", location: "", status: "", verified: "",
  sortBy: "name", sortOrder: "asc",
};

interface Facets {
  industries: string[];
  locations: string[];
}

const STATUS_OPTIONS = [
  { value: "", label: "All" },
  { value: "active", label: "Active" },
  { value: "inactive", label: "Inactive" },
];

const VERIFIED_OPTIONS = [
  { value: "", label: "All" },
  { value: "verified", label: "Verified" },
  { value: "unverified", label: "Not Verified" },
];

const SORT_OPTIONS = [
  { value: "name", label: "Name" },
  { value: "email", label: "Email" },
  { value: "createdAt", label: "Date Joined" },
];

function countActiveFilters(f: Filters): number {
  let count = 0;
  if (f.industry) count++;
  if (f.location) count++;
  if (f.status) count++;
  if (f.verified) count++;
  if (f.sortBy !== "name" || f.sortOrder !== "asc") count++;
  return count;
}

export default function SuperAgentEmployersPage() {
  const [employers, setEmployers] = useState<Employer[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<Filters>(INITIAL_FILTERS);
  const router = useRouter();
  const locale = useLocale();

  const [facets, setFacets] = useState<Facets>({ industries: [], locations: [] });
  const { page, limit, total, totalPages, setPage, setLimit, updateTotal, resetPage } = usePagination();
  const [onboardOpen, setOnboardOpen] = useState(false);
  const [referralDialogOpen, setReferralDialogOpen] = useState(false);
  const [currencyCode, setCurrencyCode] = useState("AED");
  const [switchingEmployerId, setSwitchingEmployerId] = useState<string | null>(null);

  const handleSwitchToEmployerView = async (employerId: string) => {
    setSwitchingEmployerId(employerId);
    try {
      const res = await fetch("/api/tenant/switch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ employerId }),
      });
      if (res.ok) {
        router.push(`/${locale}/employer`);
        router.refresh();
      } else {
        const data = await res.json().catch(() => ({}));
        alert(data.error ?? "Failed to switch to employer view");
      }
    } catch {
      alert("Network error — please try again");
    } finally {
      setSwitchingEmployerId(null);
    }
  };

  useEffect(() => {
    fetch("/api/super-agent/settings")
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (data?.settings?.currencyCode) setCurrencyCode(data.settings.currencyCode);
      })
      .catch(() => {});
  }, []);

  const ONBOARD_FIELDS: CrudField[] = [
    { name: "name", label: "Contact Name", type: "text", required: true },
    { name: "email", label: "Email", type: "text", required: true },
    { name: "password", label: "Temporary Password", type: "text", required: true },
    { name: "companyName", label: "Company Name", type: "text", required: true },
    { name: "industry", label: "Industry", type: "text" },
    { name: "phone", label: "Phone", type: "text" },
  ];

  const loadEmployers = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: String(limit), distinct: "true" });
      if (filters.search) params.set("search", filters.search);
      if (filters.industry) params.set("industry", filters.industry);
      if (filters.location) params.set("location", filters.location);
      if (filters.status) params.set("status", filters.status);
      if (filters.verified) params.set("verified", filters.verified);
      if (filters.sortBy) params.set("sortBy", filters.sortBy);
      if (filters.sortOrder) params.set("sortOrder", filters.sortOrder);

      const res = await fetch(`/api/employers?${params}`);
      if (res.ok) {
        const data = await res.json();
        setEmployers(data.employers ?? []);
        updateTotal(data.total ?? data.totalCount ?? data.pagination?.total ?? data.employers?.length ?? 0);
        if (data.facets) setFacets(data.facets);
      }
    } finally {
      setLoading(false);
    }
  }, [filters, page, limit, updateTotal]);

  useEffect(() => {
    const t = setTimeout(loadEmployers, 300);
    return () => clearTimeout(t);
  }, [loadEmployers]);

  /* ── Filter helpers ── */
  const updateFilter = useCallback((key: keyof Filters, value: string) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
    resetPage();
  }, [resetPage]);

  const resetFilters = useCallback(() => {
    setFilters(INITIAL_FILTERS);
    resetPage();
  }, [resetPage]);

  /* ── Column sort ── */
  const toggleSort = useCallback((field: string) => {
    setFilters((prev) => ({
      ...prev,
      sortBy: field,
      sortOrder: prev.sortBy === field && prev.sortOrder === "asc" ? "desc" : "asc",
    }));
    resetPage();
  }, [resetPage]);

  const activeFilterCount = countActiveFilters(filters);

  const exportColumns: ExportColumn<Record<string, unknown>>[] = [
    { header: "Company", key: "companyName", formatter: (_v, row) => String((row as unknown as Employer).companyName ?? (row as unknown as Employer).name ?? "") },
    { header: "Email", key: "email" },
    { header: "Industry", key: "industry" },
    { header: "Location", key: "location" },
    { header: "Agent", key: "assignedAgent", formatter: (_v, row) => (row.assignedAgent as { name?: string })?.name ?? "Unassigned" },
    { header: "Active", key: "isActive", formatter: (v) => v ? "Yes" : "No" },
    { header: "Jobs", key: "jobCount" },
  ];

  const { handleExportCsv, handleExportExcel, handleExportPdf } = useTableExport({
    data: employers as unknown as Record<string, unknown>[],
    columns: exportColumns as unknown as ExportColumn<Record<string, unknown>>[],
    filename: "super-agent-employers",
    title: "Employer Relationships",
  });

  const stats = useMemo(() => ({
    total: employers.length,
    active: employers.filter((e) => e.isActive).length,
    assigned: employers.filter((e) => Boolean(e.assignedAgent?.name)).length,
    revenue: employers.reduce((sum, employer) => sum + (employer.totalPaid ?? 0), 0),
  }), [employers]);

  const handleOnboard = async (values: Record<string, string>) => {
    const res = await fetch("/api/employers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(values),
    });
    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error || "Failed to onboard employer");
    }
    setOnboardOpen(false);
    loadEmployers();
  };

  /* ── Sortable Header Cell ── */
  function SortHeader({ field, children }: { field: string; children: React.ReactNode }) {
    const active = filters.sortBy === field;
    return (
      <button
        type="button"
        onClick={() => toggleSort(field)}
        className="group inline-flex items-center gap-1 text-muted-foreground/80 hover:text-foreground transition-colors"
      >
        {children}
        {active ? (
          filters.sortOrder === "asc"
            ? <ChevronUp className="h-3.5 w-3.5 text-primary" />
            : <ChevronDown className="h-3.5 w-3.5 text-primary" />
        ) : (
          <ArrowUpDown className="h-3 w-3 opacity-0 group-hover:opacity-50 transition-opacity" />
        )}
      </button>
    );
  }

  return (
    <div className="page-container space-y-6">
      <SuperAgentPageIntro
        title="Employer Relationships"
        description="Track employer accounts across your region, review who owns each relationship, and keep commercial coverage visible without changing the underlying account data flow."
        summaryTitle="Portfolio"
        summaryDescription="Search across employer records, compare activity, and confirm which accounts already have active agent ownership."
      >
        <div className="flex gap-2 mt-3">
          <button
            onClick={() => setOnboardOpen(true)}
            className="inline-flex h-10 items-center gap-2 rounded-xl bg-sky-600 px-4 text-sm font-semibold text-white transition-colors hover:bg-sky-700"
          >
            <UserPlus className="h-4 w-4" />
            Onboard Employer
          </button>
          <button
            onClick={() => setReferralDialogOpen(true)}
            className="inline-flex h-10 items-center gap-2 rounded-xl border border-border px-3 text-xs font-semibold text-muted-foreground transition-colors hover:border-primary/25 hover:text-primary"
          >
            <Link2 className="h-3.5 w-3.5" />
            Get Referral Link
          </button>
        </div>
      </SuperAgentPageIntro>

      <SuperAgentMetricsGrid
        items={[
          {
            label: "Total Employers",
            value: stats.total,
            helper: "Employer accounts currently visible in the regional workspace.",
            icon: <Building2 className="h-5 w-5" />,
            toneClassName: "workspace-tone-sky",
          },
          {
            label: "Active Accounts",
            value: stats.active,
            helper: "Accounts marked active and ready to work with your team.",
            icon: <ShieldCheck className="h-5 w-5" />,
            toneClassName: "workspace-tone-emerald",
          },
          {
            label: "Assigned",
            value: stats.assigned,
            helper: "Employer records that already have an assigned agent.",
            icon: <Users className="h-5 w-5" />,
            toneClassName: "workspace-tone-indigo",
          },
          {
            label: "Revenue Tracked",
            value: stats.revenue > 0 ? formatCurrency(stats.revenue, currencyCode) : "—",
            helper: "Visible account revenue surfaced by the current employer response.",
            icon: <DollarSign className="h-5 w-5" />,
            toneClassName: "workspace-tone-amber",
          },
        ]}
      />

      <SuperAgentSection
        eyebrow="Accounts"
        title="Review employer ownership and account health"
        description="Filter by industry, location, status, and verification to narrow down the employer list."
      >
        {/* ── Search + Advanced Toggle via TableToolbar ── */}
        <TableToolbar
          search={filters.search}
          onSearchChange={(v) => updateFilter("search", v)}
          searchPlaceholder="Search employers..."
          onExportCsv={handleExportCsv}
          onExportExcel={handleExportExcel}
          onExportPdf={handleExportPdf}
          hasActiveFilters={activeFilterCount > 0}
          actions={
            (activeFilterCount > 0 || filters.search) ? (
              <button
                type="button"
                onClick={resetFilters}
                className="flex h-9 items-center gap-2 rounded-lg border border-border/70 bg-card px-3 text-sm text-muted-foreground hover:bg-secondary/80 transition-all"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Reset
              </button>
            ) : undefined
          }
          filterContent={
            <div className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
                {/* Industry */}
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">Industry</label>
                  <SearchableSelect
                    options={[{ value: "", label: "All industries" }, ...facets.industries.map((i) => ({ value: i, label: i }))]}
                    value={filters.industry}
                    onValueChange={(v) => updateFilter("industry", v)}
                    placeholder="All industries"
                    searchPlaceholder="Search industry..."
                    className="h-11 rounded-xl border-border bg-card"
                  />
                </div>

                {/* Location */}
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">Location</label>
                  <SearchableSelect
                    options={[{ value: "", label: "All locations" }, ...facets.locations.map((l) => ({ value: l, label: l }))]}
                    value={filters.location}
                    onValueChange={(v) => updateFilter("location", v)}
                    placeholder="All locations"
                    searchPlaceholder="Search location..."
                    className="h-11 rounded-xl border-border bg-card"
                  />
                </div>

                {/* Status */}
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">Status</label>
                  <SearchableSelect
                    options={STATUS_OPTIONS}
                    value={filters.status}
                    onValueChange={(v) => updateFilter("status", v)}
                    placeholder="All"
                    className="h-11 rounded-xl border-border bg-card"
                  />
                </div>

                {/* Verification */}
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">Verification</label>
                  <SearchableSelect
                    options={VERIFIED_OPTIONS}
                    value={filters.verified}
                    onValueChange={(v) => updateFilter("verified", v)}
                    placeholder="All"
                    className="h-11 rounded-xl border-border bg-card"
                  />
                </div>

                {/* Sort By */}
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">Sort By</label>
                  <SearchableSelect
                    options={SORT_OPTIONS}
                    value={filters.sortBy}
                    onValueChange={(v) => updateFilter("sortBy", v)}
                    placeholder="Name"
                    className="h-11 rounded-xl border-border bg-card"
                  />
                </div>

                {/* Sort Order */}
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">Sort Order</label>
                  <SearchableSelect
                    options={[
                      { value: "asc", label: "Ascending" },
                      { value: "desc", label: "Descending" },
                    ]}
                    value={filters.sortOrder}
                    onValueChange={(v) => updateFilter("sortOrder", v)}
                    placeholder="Ascending"
                    className="h-11 rounded-xl border-border bg-card"
                  />
                </div>
              </div>

              {/* Quick Filter Chips */}
              <div className="flex flex-wrap gap-2">
                <span className="text-xs font-medium text-muted-foreground/70 self-center mr-1">Quick:</span>
                {[
                  { label: "Active Only", action: () => updateFilter("status", "active") },
                  { label: "Inactive", action: () => updateFilter("status", "inactive") },
                  { label: "Verified", action: () => updateFilter("verified", "verified") },
                  { label: "Not Verified", action: () => updateFilter("verified", "unverified") },
                  { label: "Newest First", action: () => { updateFilter("sortBy", "createdAt"); updateFilter("sortOrder", "desc"); } },
                ].map((chip) => (
                  <button
                    key={chip.label}
                    type="button"
                    onClick={chip.action}
                    className="rounded-lg border border-border/60 bg-secondary/50 px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-secondary hover:text-foreground transition-all"
                  >
                    {chip.label}
                  </button>
                ))}
              </div>
            </div>
          }
          className="mb-4"
        />

        <div className="mt-5 overflow-x-auto rounded-3xl border border-border/60">
          <Table>
            <TableHeader>
              <TableRow className="bg-background/60 hover:bg-background/60">
                <TableHead className="min-w-[180px]"><SortHeader field="name">Company</SortHeader></TableHead>
                <TableHead className="min-w-[180px]"><SortHeader field="email">Contact</SortHeader></TableHead>
                <TableHead>Industry</TableHead>
                <TableHead>Location</TableHead>
                <TableHead>Agent</TableHead>
                <TableHead>Status</TableHead>                <TableHead className="w-[80px] text-right">Actions</TableHead>              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: 7 }).map((_, j) => (
                      <TableCell key={j}><div className="h-4 w-3/4 animate-pulse rounded bg-muted/50" /></TableCell>
                    ))}
                  </TableRow>
                ))
              ) : employers.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="py-16 text-center">
                    <div className="flex flex-col items-center gap-3">
                      <div className="flex h-14 w-14 items-center justify-center rounded-3xl bg-sky-50 text-sky-600">
                        <Building2 className="h-6 w-6" />
                      </div>
                      <div>
                        <p className="text-base font-semibold text-foreground">No employers found</p>
                        <p className="mt-1 text-sm text-muted-foreground">Broaden the search or adjust filters to see more employer accounts.</p>
                      </div>
                    </div>
                  </TableCell>
                </TableRow>
              ) : employers.map((em) => (
                <TableRow key={em._id} className="bg-transparent">
                  <TableCell className="font-medium text-foreground">{em.companyName ?? em.name}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{em.email}</TableCell>
                  <TableCell className="text-muted-foreground">{em.industry ?? "—"}</TableCell>
                  <TableCell className="text-muted-foreground">{em.location ?? "—"}</TableCell>
                  <TableCell className="text-muted-foreground">{em.assignedAgent?.name ?? "Unassigned"}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1.5">
                      {em.isAgentVerified && (
                        <span className="text-[10px] bg-green-500/10 text-green-600 px-2 py-0.5 rounded-full font-medium">Verified</span>
                      )}
                      <StatusBadge status={em.isActive ? "active" : "inactive"} />
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    <button
                      onClick={() => handleSwitchToEmployerView(em._id)}
                      disabled={switchingEmployerId === em._id || !em.isActive}
                      className="inline-flex items-center gap-1 rounded-lg border border-sky-400/50 bg-sky-50 px-2.5 py-1.5 text-xs font-semibold text-sky-700 transition-colors hover:bg-sky-100 disabled:opacity-50 dark:bg-sky-950/20 dark:text-sky-400 dark:hover:bg-sky-900/30"
                      title="Switch to employer workspace"
                    >
                      {switchingEmployerId === em._id ? (
                        <><span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-sky-600 border-t-transparent" /></>
                      ) : (
                        <LogIn className="h-3.5 w-3.5" />
                      )}
                    </button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        <div className="mt-4">
          <PaginationControls page={page} totalPages={totalPages} total={total} limit={limit} onPageChange={setPage} onLimitChange={setLimit} />
        </div>
      </SuperAgentSection>

      <CrudModal
        open={onboardOpen}
        onClose={() => setOnboardOpen(false)}
        title="Onboard New Employer"
        fields={ONBOARD_FIELDS}
        onSubmit={handleOnboard}
      />

      <ReferralLinkDialog
        open={referralDialogOpen}
        onClose={() => setReferralDialogOpen(false)}
      />
    </div>
  );
}
