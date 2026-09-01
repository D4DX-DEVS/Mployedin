"use client";

import { useState, useCallback, Fragment } from "react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { PaginationControls } from "@/components/shared/PaginationControls";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { usePagination } from "@/hooks/usePagination";
import {
  useReferralLinks,
  useCreateReferralLink,
  useUpdateReferralLink,
  ReferralLinkItem,
  ReferralLinkStatus,
  ReferralCreatorRole,
  ReferralSortField,
} from "@/hooks/useReferralLinks";
import {
  SuperAgentPageIntro,
  SuperAgentSection,
} from "@/components/features/super-agent/WorkspacePage";
import {
  Building2,
  Calendar,
  Check,
  ChevronDown,
  ChevronUp,
  Copy,
  Hash,
  Link2,
  Loader2,
  Plus,
  Power,
  PowerOff,
  Sparkles,
  User,
  Users,
  X,
} from "lucide-react";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DateTimePicker } from "@/components/ui/date-time-picker";
import { useTableExport } from "@/hooks/useTableExport";
import { TableToolbar } from "@/components/shared/TableToolbar";
import type { ExportColumn } from "@/lib/export";
import { formatDate as formatIntlDate } from "@/lib/ui/intlFormat";

function formatDate(d: string | undefined): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function linkStatus(link: ReferralLinkItem): "active" | "expired" | "maxed" | "inactive" {
  if (!link.isActive) return "inactive";
  if (link.expiresAt && new Date(link.expiresAt) < new Date()) return "expired";
  if (link.maxUses > 0 && link.usedCount >= link.maxUses) return "maxed";
  return "active";
}

function statusLabel(s: ReturnType<typeof linkStatus>, t: ReturnType<typeof useTranslations<"superAgentReferralLinks">>): string {
  switch (s) {
    case "active": return t("statusActive");
    case "expired": return t("statusExpired");
    case "maxed": return t("statusLimitReached");
    case "inactive": return t("statusDisabled");
  }
}

function creatorName(link: ReferralLinkItem): string {
  if (typeof link.createdBy === "object" && link.createdBy?.name) return link.createdBy.name;
  return "—";
}

export default function SuperAgentReferralLinksPage() {
  const { locale } = useParams<{ locale: string }>();
  const t = useTranslations("superAgentReferralLinks");
  const tc = useTranslations("common");
  const tt = useTranslations("table");
  const pagination = usePagination();
  const [search, setSearch] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [copyMap, setCopyMap] = useState<Record<string, boolean>>({});


  // Filter state
  const [statusFilter, setStatusFilter] = useState<ReferralLinkStatus | "">("");
  const [creatorRoleFilter, setCreatorRoleFilter] = useState<ReferralCreatorRole | "">("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [sortBy, setSortBy] = useState<ReferralSortField | "">("");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc" | "">("");

  // AI search state
  const [aiQuery, setAiQuery] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiSummary, setAiSummary] = useState("");

  // Create form state
  const [newLabel, setNewLabel] = useState("");
  const [newMaxUses, setNewMaxUses] = useState("");
  const [newExpiresAt, setNewExpiresAt] = useState("");

  const filters = {
    page: pagination.page,
    limit: pagination.limit,
    search: search || undefined,
    status: statusFilter || undefined,
    creatorRole: creatorRoleFilter || undefined,
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
    sortBy: sortBy || undefined,
    sortOrder: sortOrder || undefined,
  };

  const { data, isLoading } = useReferralLinks(filters);
  const createMutation = useCreateReferralLink();
  const updateMutation = useUpdateReferralLink();

  const links = data?.links ?? [];
  const total = data?.total ?? 0;
  const totalPages = data?.totalPages ?? 0;
  const stats = data?.stats ?? { totalLinks: 0, activeLinks: 0, totalRegistrations: 0, myLinks: 0, agentLinks: 0 };

  const baseUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/${locale || "en"}/employer-register?ref=`
      : "";

  const handleCopy = useCallback((code: string) => {
    navigator.clipboard.writeText(`${baseUrl}${code}`);
    setCopyMap((m) => ({ ...m, [code]: true }));
    setTimeout(() => setCopyMap((m) => ({ ...m, [code]: false })), 2000);
  }, [baseUrl]);

  const handleCreate = async () => {
    await createMutation.mutateAsync({
      label: newLabel || undefined,
      maxUses: newMaxUses ? parseInt(newMaxUses) : undefined,
      expiresAt: newExpiresAt || undefined,
    });
    setCreateOpen(false);
    setNewLabel("");
    setNewMaxUses("");
    setNewExpiresAt("");
  };

  const handleClearFilters = () => {
    setSearch("");
    setStatusFilter("");
    setCreatorRoleFilter("");
    setDateFrom("");
    setDateTo("");
    setSortBy("");
    setSortOrder("");
    setAiSummary("");
    pagination.resetPage();
  };

  const hasActiveFilters = !!(statusFilter || creatorRoleFilter || dateFrom || dateTo || sortBy || search);

  const exportColumns: ExportColumn<Record<string, unknown>>[] = [
    { header: t("tableHeadCode"), key: "code" },
    { header: t("tableHeadCreator"), key: "createdBy", formatter: (_v, row) => creatorName(row as unknown as ReferralLinkItem) },
    { header: t("tableHeadLabel"), key: "label" },
    { header: t("exportColumnActive"), key: "isActive", formatter: (v) => v ? t("yesText") : t("noText") },
    { header: t("tableHeadUsed"), key: "usedCount" },
    { header: t("exportColumnMaxUses"), key: "maxUses" },
    { header: t("exportColumnCreated"), key: "createdAt", formatter: (v) => v ? formatIntlDate(new Date(String(v))) : "" },
    { header: t("tableHeadExpires"), key: "expiresAt", formatter: (v) => v ? formatIntlDate(new Date(String(v))) : "" },
  ];

  const { handleExportCsv, handleExportExcel, handleExportPdf } = useTableExport({
    data: links as unknown as Record<string, unknown>[],
    columns: exportColumns as unknown as ExportColumn<Record<string, unknown>>[],
    filename: "super-agent-referral-links",
    title: t("exportTitle"),
  });

  const handleAiSearch = async () => {
    if (!aiQuery.trim()) return;
    setAiLoading(true);
    setAiSummary("");
    try {
      const res = await fetch("/api/ai/referral-search-filters", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: aiQuery.trim() }),
      });
      if (!res.ok) throw new Error("AI search failed");
      const data = await res.json();
      const f = data.filters;

      // Apply AI-generated filters
      if (f.search) setSearch(f.search);
      if (f.status) setStatusFilter(f.status);
      if (f.creatorRole) setCreatorRoleFilter(f.creatorRole);
      if (f.dateFrom) setDateFrom(f.dateFrom);
      if (f.dateTo) setDateTo(f.dateTo);
      if (f.sortBy) setSortBy(f.sortBy);
      if (f.sortOrder) setSortOrder(f.sortOrder);
      if (f.summary) setAiSummary(f.summary);

      pagination.resetPage();
    } catch {
      setAiSummary(t("aiSearchError"));
    } finally {
      setAiLoading(false);
    }
  };

  return (
    <div className="page-container">
      <SuperAgentPageIntro
        eyebrow={t("eyebrow")}
        title={t("pageTitle")}
        description={t("pageDescription")}
        metrics={[
          { label: t("metricTotalLinks"), value: stats.totalLinks, icon: Link2 },
          { label: t("metricActiveLinks"), value: stats.activeLinks, icon: Check },
          { label: t("metricTotalRegistrations"), value: stats.totalRegistrations, icon: Users },
          { label: t("metricYourAgentLinks"), value: `${stats.myLinks} / ${stats.agentLinks}`, icon: User },
        ]}
        compact
      >
        <button
          onClick={() => setCreateOpen(!createOpen)}
          className="inline-flex h-9 items-center gap-2 rounded-xl bg-primary px-3 text-xs font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
        >
          {createOpen ? <X className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
          {createOpen ? tc("cancel") : t("newReferralLink")}
        </button>
      </SuperAgentPageIntro>

      {/* Create section - form only, no heading */}
      {createOpen && (
        <SuperAgentSection title="" className="mt-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">{t("labelFieldLabel")}</label>
              <Input value={newLabel} onChange={(e) => setNewLabel(e.target.value)} placeholder={t("labelFieldPlaceholder")} className="h-10 rounded-xl" />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">{t("maxRegistrationsLabel")}</label>
              <Input type="number" value={newMaxUses} onChange={(e) => setNewMaxUses(e.target.value)} placeholder="0" min={0} className="h-10 rounded-xl" />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">{t("expiryDateLabel")}</label>
              <DateTimePicker mode="date" value={newExpiresAt} onChange={setNewExpiresAt} className="h-10 rounded-xl" />
            </div>
            <div className="sm:col-span-3 flex justify-end">
              <button
                onClick={handleCreate}
                disabled={createMutation.isPending}
                className="inline-flex h-10 items-center gap-2 rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
              >
                {createMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                {t("createLinkButton")}
              </button>
            </div>
          </div>
        </SuperAgentSection>
      )}

      {/* AI Search + Filters */}
      <div className="max-sm:!border-0 max-sm:!bg-transparent max-sm:!p-0 max-sm:!shadow-none workspace-panel-surface rounded-3xl p-3 sm:p-4 lg:p-5">
        {/* AI Natural Language Search */}
        <div className="mt-4 space-y-3">
          <div className="flex items-center gap-2">
            <div className="relative flex-1 max-w-xl">
              <Sparkles className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-purple-500" />
              <Input
                value={aiQuery}
                onChange={(e) => setAiQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleAiSearch()}
                placeholder={t("aiSearchPlaceholder")}
                className="h-11 rounded-xl border-border bg-secondary/65 pl-9 pr-28 text-sm text-foreground shadow-none placeholder:text-muted-foreground"
              />
              <button
                onClick={handleAiSearch}
                disabled={aiLoading || !aiQuery.trim()}
                className="absolute right-2 top-1/2 -translate-y-1/2 inline-flex h-7 items-center gap-1.5 rounded-lg bg-purple-600 px-3 text-[11px] font-semibold text-white transition-colors hover:bg-purple-700 disabled:opacity-50"
              >
                {aiLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
                {t("aiSearchButton")}
              </button>
            </div>
          </div>

          {aiSummary && (
            <div className="flex items-start gap-2 rounded-xl bg-purple-50 px-4 py-2.5">
              <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-purple-500" />
              <p className="text-xs text-purple-700">{aiSummary}</p>
            </div>
          )}

          {/* Merged search + filters via TableToolbar */}
          <TableToolbar
            search={search}
            onSearchChange={(v) => { setSearch(v); pagination.resetPage(); }}
            searchPlaceholder={t("tableSearchPlaceholder")}
            onExportCsv={handleExportCsv}
            onExportExcel={handleExportExcel}
            onExportPdf={handleExportPdf}
            hasActiveFilters={hasActiveFilters}
            actions={
              hasActiveFilters ? (
                <button
                  onClick={handleClearFilters}
                  className="inline-flex h-9 items-center gap-1 rounded-xl border border-border px-3 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
                >
                  <X className="h-3 w-3" /> {t("clearAllFilters")}
                </button>
              ) : undefined
            }
            filterContent={
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div>
                  <label className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{tc("status")}</label>
                  <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v as ReferralLinkStatus | ""); pagination.resetPage(); }}>
                    <SelectTrigger className="h-9 w-full text-sm">
                      <SelectValue placeholder={t("filterAllStatuses")} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">{t("filterAllStatuses")}</SelectItem>
                      <SelectItem value="active">{t("statusActive")}</SelectItem>
                      <SelectItem value="expired">{t("statusExpired")}</SelectItem>
                      <SelectItem value="maxed">{t("statusLimitReached")}</SelectItem>
                      <SelectItem value="inactive">{t("statusDisabled")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{t("filterCreatorRole")}</label>
                  <Select value={creatorRoleFilter} onValueChange={(v) => { setCreatorRoleFilter(v as ReferralCreatorRole | ""); pagination.resetPage(); }}>
                    <SelectTrigger className="h-9 w-full text-sm">
                      <SelectValue placeholder={t("filterAllRoles")} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">{t("filterAllRoles")}</SelectItem>
                      <SelectItem value="super_agent">{t("roleSuperAgent")}</SelectItem>
                      <SelectItem value="agent">{t("roleAgent")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{t("filterDateFrom")}</label>
                  <DateTimePicker mode="date" value={dateFrom} onChange={(v) => { setDateFrom(v); pagination.resetPage(); }} />
                </div>
                <div>
                  <label className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{t("filterDateTo")}</label>
                  <DateTimePicker mode="date" value={dateTo} onChange={(v) => { setDateTo(v); pagination.resetPage(); }} />
                </div>
                <div>
                  <label className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{t("filterSortBy")}</label>
                  <Select value={sortBy || "newest"} onValueChange={(v) => { setSortBy(v === "newest" ? "" : (v as ReferralSortField)); pagination.resetPage(); }}>
                    <SelectTrigger className="h-9 w-full text-sm">
                      <SelectValue placeholder={t("sortNewestFirst")} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="newest">{t("sortNewestFirst")}</SelectItem>
                      <SelectItem value="usedCount">{t("sortMostUsed")}</SelectItem>
                      <SelectItem value="code">{t("sortCodeAZ")}</SelectItem>
                      <SelectItem value="label">{t("sortLabelAZ")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{t("filterSortOrder")}</label>
                  <Select value={sortOrder || "default"} onValueChange={(v) => { setSortOrder(v === "default" ? "" : (v as "asc" | "desc")); pagination.resetPage(); }}>
                    <SelectTrigger className="h-9 w-full text-sm">
                      <SelectValue placeholder={t("sortDefault")} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="default">{t("sortDefault")}</SelectItem>
                      <SelectItem value="desc">{t("sortDescending")}</SelectItem>
                      <SelectItem value="asc">{t("sortAscending")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            }
            className="mb-4"
          />
        </div>
      </div>

      {/* Links table */}
      {isLoading ? (
        <div className="mt-5 overflow-x-auto rounded-3xl border border-border/60">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("tableHeadCode")}</TableHead>
                <TableHead>{t("tableHeadCreator")}</TableHead>
                <TableHead>{t("tableHeadRole")}</TableHead>
                <TableHead>{t("tableHeadLabel")}</TableHead>
                <TableHead>{t("tableHeadUsed")}</TableHead>
                <TableHead>{t("tableHeadExpires")}</TableHead>
                <TableHead>{tc("status")}</TableHead>
                <TableHead className="text-right">{tc("actions")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i} className="hover:bg-transparent">
                  {Array.from({ length: 8 }).map((_, j) => (
                    <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : links.length === 0 ? (
        <div className="mt-5 overflow-x-auto rounded-3xl border border-border/60">
          <div className="flex flex-col items-center gap-3 py-16 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-3xl bg-sky-50 text-sky-600">
              <Link2 className="h-6 w-6" />
            </div>
            <div>
              <p className="text-base font-semibold text-foreground">{t("emptyStateTitle")}</p>
              <p className="mt-1 text-sm text-muted-foreground">{t("emptyStateDescription")}</p>
            </div>
          </div>
        </div>
      ) : (
        <div className="mt-5 overflow-x-auto rounded-3xl border border-border/60">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("tableHeadCode")}</TableHead>
                <TableHead>{t("tableHeadCreator")}</TableHead>
                <TableHead>{t("tableHeadRole")}</TableHead>
                <TableHead>{t("tableHeadLabel")}</TableHead>
                <TableHead>{t("tableHeadUsed")}</TableHead>
                <TableHead>{t("tableHeadExpires")}</TableHead>
                <TableHead>{tc("status")}</TableHead>
                <TableHead className="text-right">{tc("actions")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {links.map((link) => {
                const status = linkStatus(link);
                const isExpanded = expandedId === link._id;
                return (
                  <Fragment key={link._id}>
                    <TableRow className="cursor-pointer" onClick={() => setExpandedId(isExpanded ? null : link._id)}>
                      <TableCell className="font-mono text-sm font-medium">{link.code}</TableCell>
                      <TableCell className="text-sm">{creatorName(link)}</TableCell>
                      <TableCell>
                        <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${link.creatorRole === "super_agent" ? "bg-purple-100 text-purple-700" : "bg-blue-100 text-blue-700"}`}>
                          {link.creatorRole === "super_agent" ? t("roleSuperAgent") : t("roleAgent")}
                        </span>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{link.label || "—"}</TableCell>
                      <TableCell className="text-sm">{link.usedCount}{link.maxUses > 0 ? `/${link.maxUses}` : ""}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{formatDate(link.expiresAt)}</TableCell>
                      <TableCell>
                        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                          status === "active" ? "bg-emerald-100 text-emerald-700" :
                          status === "expired" ? "bg-amber-100 text-amber-700" :
                          status === "maxed" ? "bg-orange-100 text-orange-700" :
                          "bg-red-100 text-red-700"
                        }`}>
                          <span className={`h-1.5 w-1.5 rounded-full ${
                            status === "active" ? "bg-emerald-500" :
                            status === "expired" ? "bg-amber-500" :
                            status === "maxed" ? "bg-orange-500" :
                            "bg-red-500"
                          }`} />
                          {statusLabel(status, t)}
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex flex-wrap items-center justify-end gap-1.5">
                          <button
                            onClick={(e) => { e.stopPropagation(); handleCopy(link.code); }}
                            className="inline-flex max-sm:min-h-11 h-7 items-center gap-1 rounded-md border border-border px-2 text-[11px] font-medium text-muted-foreground hover:text-primary"
                            title={t("copyButtonTooltip")}
                            data-table-action=""
                          >
                            {copyMap[link.code] ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                            {copyMap[link.code] ? t("copiedButtonText") : t("copyButtonText")}
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              updateMutation.mutate({ id: link._id, isActive: !link.isActive });
                            }}
                            disabled={updateMutation.isPending}
                            className={`inline-flex max-sm:min-h-11 h-7 items-center gap-1 rounded-md border px-2 text-[11px] font-medium transition-colors ${link.isActive ? "border-amber-300 text-amber-600 hover:bg-amber-50" : "border-emerald-300 text-emerald-600 hover:bg-emerald-50"}`}
                            title={link.isActive ? t("toggleDisableTooltip") : t("toggleEnableTooltip")}
                            data-table-action=""
                          >
                            {link.isActive ? <PowerOff className="h-3 w-3" /> : <Power className="h-3 w-3" />}
                            {link.isActive ? t("disableButton") : t("enableButton")}
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); setExpandedId(isExpanded ? null : link._id); }}
                            className="inline-flex max-sm:min-h-11 h-7 items-center rounded-md border border-border px-1.5 text-muted-foreground hover:text-foreground"
                            title={t("expandButtonTooltip")}
                            aria-label={isExpanded ? t("collapseRegistrationsAriaLabel") : t("expandRegistrationsAriaLabel")}
                          >
                            {isExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                          </button>
                        </div>
                      </TableCell>
                    </TableRow>
                    {isExpanded && (
                      <TableRow key={`${link._id}-detail`}>
                        <TableCell colSpan={8} className="bg-secondary/30 px-6 py-4">
                          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                            {t("registrationsLabel", { count: link.registrations.length })}
                          </p>
                          {link.registrations.length === 0 ? (
                            <p className="text-sm text-muted-foreground">{t("noRegistrationsYet")}</p>
                          ) : (
                            <div className="space-y-2">
                              {link.registrations.map((reg, i) => (
                                <div key={i} className="flex items-center gap-3 rounded-xl bg-background/60 px-4 py-3">
                                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-sky-100 text-sky-600">
                                    <Building2 className="h-4 w-4" />
                                  </div>
                                  <div className="flex-1">
                                    <p className="text-sm font-medium text-foreground">{reg.companyName}</p>
                                    <p className="text-xs text-muted-foreground">{reg.email}</p>
                                  </div>
                                  <div className="text-right text-xs text-muted-foreground">
                                    {reg.country && <p>{reg.city ? `${reg.city}, ` : ""}{reg.country}</p>}
                                    <p>{formatDate(reg.registeredAt)}</p>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </TableCell>
                      </TableRow>
                    )}
                  </Fragment>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      <PaginationControls
        page={pagination.page}
        totalPages={totalPages}
        total={total}
        limit={pagination.limit}
        onPageChange={pagination.setPage}
        onLimitChange={pagination.setLimit}
      />
    </div>
  );
}
