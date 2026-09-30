"use client";
import { useQueryFlag } from "@/hooks/useQueryFlag";

import { useState, useCallback, Fragment, useEffect, useId } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { endOfDay, parseISO } from "date-fns";
import { Input } from "@/components/ui/input";
import { PaginationControls } from "@/components/shared/PaginationControls";
import { usePagination } from "@/hooks/usePagination";
import { useConfirm } from "@/hooks/useConfirm";
import {
  useReferralLinks,
  useCreateReferralLink,
  useUpdateReferralLink,
  ReferralLinkItem,
  ReferralLinkStatus,
  ReferralCreatorRole,
  ReferralSortField,
  linkStatus,
} from "@/hooks/useReferralLinks";
import {
  SuperAgentPageIntro,
  SuperAgentSection,
} from "@/components/features/super-agent/WorkspacePage";
import {
  Calendar,
  Check,
  Copy,
  Link2,
  Loader2,
  Plus,
  Power,
  PowerOff,
  Sparkles,
  User,
  Users,
  X,
  Mail,
  MapPin,
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
import { InlineFilterBar, InlineFilterSearch, INLINE_FILTER_CONTROL } from "@/components/shared/InlineFilterBar";
import { RowActions } from "@/components/shared/RowActions";
import { RowExpandToggle, isRowToggleClick } from "@/components/shared/RowExpandToggle";
import { UserAvatar } from "@/components/shared/UserAvatar";
import { TableBodySkeleton } from "@/components/ui/loading";
import { EmptyState } from "@/components/shared/EmptyState";
import { ErrorState } from "@/components/shared/ErrorState";
import type { ExportColumn } from "@/lib/export";
import { formatDate } from "@/lib/ui/intlFormat";
import { ReferralAudienceChip } from "@/components/shared/ReferralAudienceChip";
import { referralUrlFor, type ReferralAudience } from "@/lib/referrals/url";
import { registrationDisplayName } from "@/lib/referrals/display";


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
  const searchParams = useSearchParams();
  const t = useTranslations("superAgentReferralLinks");
  const tc = useTranslations("common");
  const tt = useTranslations("table");
  const pagination = usePagination();
  const [search, setSearch] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  // Addressable as ?new=1 for the global Create menu.
  const [createOpen, setCreateOpen] = useQueryFlag("new");
  const [copyMap, setCopyMap] = useState<Record<string, boolean>>({});

  // Close create form and remove ?new from URL when form closes
  useEffect(() => {
    if (!createOpen) {
      const params = new URLSearchParams(searchParams?.toString());
      params.delete("new");
      const newUrl = params.toString() ? `?${params.toString()}` : "";
      window.history.replaceState(null, "", newUrl);
    }
  }, [createOpen, searchParams]);


  // Filter state
  const [statusFilter, setStatusFilter] = useState<ReferralLinkStatus | "">("");
  const [creatorRoleFilter, setCreatorRoleFilter] = useState<ReferralCreatorRole | "">("");
  const [audienceFilter, setAudienceFilter] = useState<ReferralAudience | "">("");
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
  const [newAudience, setNewAudience] = useState<ReferralAudience>("employer");

  const filters = {
    page: pagination.page,
    limit: pagination.limit,
    search: search || undefined,
    status: statusFilter || undefined,
    creatorRole: creatorRoleFilter || undefined,
    audience: audienceFilter || undefined,
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
    sortBy: sortBy || undefined,
    sortOrder: sortOrder || undefined,
  };

  const { data, isLoading, isError, refetch } = useReferralLinks(filters);
  const createMutation = useCreateReferralLink();
  const updateMutation = useUpdateReferralLink();
  const { confirm, ConfirmDialogNode } = useConfirm();
  const newLabelId = useId();
  const newMaxUsesId = useId();
  const newExpiryId = useId();
  const aiSearchId = useId();
  const statusFilterId = useId();
  const creatorFilterId = useId();
  const dateFromId = useId();
  const dateToId = useId();
  const audienceFilterId = useId();
  const sortByFilterId = useId();
  const sortOrderFilterId = useId();
  // Disabling breaks a link that may already be printed on material or shared
  // with candidates, and every later signup through it is lost. Enabling is
  // harmless and reversible, so only the disable edge asks.
  const handleToggleActive = useCallback(async (link: ReferralLinkItem) => {
    if (link.isActive) {
      const ok = await confirm({
        title: t("disableConfirmTitle"),
        message: t("disableConfirmMessage", { code: link.code }),
        confirmLabel: t("disableButton"),
        variant: "destructive",
      });
      if (!ok) return;
    }
    updateMutation.mutate({ id: link._id, isActive: !link.isActive });
  }, [confirm, t, updateMutation]);

  const links = data?.links ?? [];
  const total = data?.total ?? 0;
  const totalPages = data?.totalPages ?? 0;
  const stats = data?.stats ?? { totalLinks: 0, activeLinks: 0, totalRegistrations: 0, myLinks: 0, agentLinks: 0 };

  const handleCopy = useCallback((link: ReferralLinkItem) => {
    const code = link.code;
    navigator.clipboard.writeText(referralUrlFor(link, locale || "en", window.location.origin));
    setCopyMap((m) => ({ ...m, [code]: true }));
    setTimeout(() => setCopyMap((m) => ({ ...m, [code]: false })), 2000);
  }, [locale]);

  const handleCreate = async () => {
    await createMutation.mutateAsync({
      label: newLabel || undefined,
      maxUses: newMaxUses ? parseInt(newMaxUses) : undefined,
      // The picked day is the last day the link works. Sent bare, "2026-09-30"
      // parsed as UTC midnight: today was refused and every link died a day early.
      expiresAt: newExpiresAt ? endOfDay(parseISO(newExpiresAt)).toISOString() : undefined,
      audience: newAudience,
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
    setAudienceFilter("");
    setDateFrom("");
    setDateTo("");
    setSortBy("");
    setSortOrder("");
    setAiSummary("");
    pagination.resetPage();
  };

  const hasActiveFilters = !!(statusFilter || creatorRoleFilter || audienceFilter || dateFrom || dateTo || sortBy || search);

  const exportColumns: ExportColumn<Record<string, unknown>>[] = [
    { header: t("tableHeadCode"), key: "code" },
    { header: t("tableHeadCreator"), key: "createdBy", formatter: (_v, row) => creatorName(row as unknown as ReferralLinkItem) },
    { header: t("tableHeadLabel"), key: "label" },
    { header: t("exportColumnActive"), key: "isActive", formatter: (v) => v ? t("yesText") : t("noText") },
    { header: t("tableHeadUsed"), key: "usedCount" },
    { header: t("exportColumnMaxUses"), key: "maxUses" },
    { header: t("exportColumnCreated"), key: "createdAt", formatter: (v) => v ? formatDate(new Date(String(v)), { day: "2-digit", month: "short", year: "numeric" }) : "" },
    { header: t("tableHeadExpires"), key: "expiresAt", formatter: (v) => v ? formatDate(new Date(String(v)), { day: "2-digit", month: "short", year: "numeric" }) : "" },
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
      if (f.audience) setAudienceFilter(f.audience);
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
      {ConfirmDialogNode}
      {/* No eyebrow: "Referral Links" over "Referral Link Management" is the
          title twice, and it cost the header a whole row. */}
      <SuperAgentPageIntro
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
            <fieldset className="sm:col-span-3">
              <legend className="mb-1.5 block text-xs font-medium text-muted-foreground">{t("audienceLabel")}</legend>
              <div className="flex flex-wrap gap-2">
                {(["employer", "job_seeker"] as const).map((value) => (
                  <label
                    key={value}
                    className={`inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-xl border px-3 text-sm ${newAudience === value ? "border-primary bg-primary/5 text-foreground" : "border-border text-muted-foreground"}`}
                  >
                    <input
                      type="radio"
                      name="referral-audience"
                      value={value}
                      checked={newAudience === value}
                      onChange={() => setNewAudience(value)}
                      className="accent-primary"
                    />
                    {value === "job_seeker" ? t("audienceJobSeeker") : t("audienceEmployer")}
                  </label>
                ))}
              </div>
            </fieldset>
            <div>
              <label htmlFor={newLabelId} className="mb-1.5 block text-xs font-medium text-muted-foreground">{t("labelFieldLabel")}</label>
              <Input id={newLabelId} value={newLabel} onChange={(e) => setNewLabel(e.target.value)} placeholder={t("labelFieldPlaceholder")} className="h-10 rounded-xl" />
            </div>
            <div>
              <label htmlFor={newMaxUsesId} className="mb-1.5 block text-xs font-medium text-muted-foreground">{t("maxRegistrationsLabel")}</label>
              <Input id={newMaxUsesId} type="number" value={newMaxUses} onChange={(e) => setNewMaxUses(e.target.value)} placeholder="0" min={0} className="h-10 rounded-xl" />
            </div>
            <div>
              <label htmlFor={newExpiryId} className="mb-1.5 block text-xs font-medium text-muted-foreground">{t("expiryDateLabel")}</label>
              <DateTimePicker id={newExpiryId} mode="date" minDate={new Date()} value={newExpiresAt} onChange={setNewExpiresAt} className="h-10 rounded-xl" />
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

      {/* Filters: plain search + AI in plain sight, facets and sorts behind More */}
      <div className="mt-4 space-y-3">
          <InlineFilterBar
            onExportCsv={handleExportCsv}
            onExportExcel={handleExportExcel}
            onExportPdf={handleExportPdf}
            onClear={hasActiveFilters ? handleClearFilters : undefined}
            more={(
              <div className="flex min-w-0 flex-[1_1_100%] flex-wrap items-center gap-2">
                <div className="grid min-w-0 flex-[1_1_100%] gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div>
                  <label htmlFor={statusFilterId} className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{tc("status")}</label>
                  <Select value={statusFilter || "all"} onValueChange={(v) => { setStatusFilter(v === "all" ? "" : (v as ReferralLinkStatus)); pagination.resetPage(); }}>
                    <SelectTrigger id={statusFilterId} className="h-9 w-full text-sm">
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
                  <label htmlFor={creatorFilterId} className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{t("filterCreatorRole")}</label>
                  <Select value={creatorRoleFilter || "all"} onValueChange={(v) => { setCreatorRoleFilter(v === "all" ? "" : (v as ReferralCreatorRole)); pagination.resetPage(); }}>
                    <SelectTrigger id={creatorFilterId} className="h-9 w-full text-sm">
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
                  <label htmlFor={audienceFilterId} className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{t("audienceLabel")}</label>
                  <Select value={audienceFilter || "all"} onValueChange={(v) => { setAudienceFilter(v === "all" ? "" : (v as ReferralAudience)); pagination.resetPage(); }}>
                    <SelectTrigger id={audienceFilterId} className="h-9 w-full text-sm">
                      <SelectValue placeholder={t("filterAudienceAll")} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">{t("filterAudienceAll")}</SelectItem>
                      <SelectItem value="employer">{t("audienceEmployer")}</SelectItem>
                      <SelectItem value="job_seeker">{t("audienceJobSeeker")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label htmlFor={dateFromId} className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{t("filterDateFrom")}</label>
                  <DateTimePicker id={dateFromId} mode="date" value={dateFrom} onChange={(v) => { setDateFrom(v); pagination.resetPage(); }} />
                </div>
                <div>
                  <label htmlFor={dateToId} className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{t("filterDateTo")}</label>
                  <DateTimePicker id={dateToId} mode="date" value={dateTo} onChange={(v) => { setDateTo(v); pagination.resetPage(); }} />
                </div>
                <div>
                  <label htmlFor={sortByFilterId} className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{t("filterSortBy")}</label>
                  <Select value={sortBy || "newest"} onValueChange={(v) => { setSortBy(v === "newest" ? "" : (v as ReferralSortField)); pagination.resetPage(); }}>
                    <SelectTrigger id={sortByFilterId} className="h-9 w-full text-sm">
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
                  <label htmlFor={sortOrderFilterId} className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{t("filterSortOrder")}</label>
                  <Select value={sortOrder || "default"} onValueChange={(v) => { setSortOrder(v === "default" ? "" : (v as "asc" | "desc")); pagination.resetPage(); }}>
                    <SelectTrigger id={sortOrderFilterId} className="h-9 w-full text-sm">
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
              </div>
            )}
            moreActiveCount={[statusFilter, creatorRoleFilter, audienceFilter, dateFrom, dateTo, sortBy, sortOrder].filter(Boolean).length}
            footer={aiSummary ? (
              <div className="mt-2 flex items-start gap-2 rounded-xl bg-purple-50 px-4 py-2.5">
                <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-purple-500" />
                <p className="text-xs text-purple-700">{aiSummary}</p>
              </div>
            ) : null}
          >
            <InlineFilterSearch
              value={search}
              onChange={(v) => { setSearch(v); pagination.resetPage(); }}
              placeholder={t("tableSearchPlaceholder")}
            />
            {/* Natural-language box beside the plain search (was a second card
                stacked above the toolbar with the right half of the row empty). */}
            <div className="relative min-w-0 flex-[2_1_14rem]">
              <Sparkles className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-purple-500" />
              <Input
                aria-label={t("aiSearchPlaceholder")}
                value={aiQuery}
                onChange={(e) => setAiQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleAiSearch()}
                placeholder={t("aiSearchPlaceholder")}
                className="h-11 w-full rounded-lg border-border bg-secondary/65 pl-9 pr-14 text-sm shadow-none sm:h-9 sm:pr-28"
              />
              <button
                onClick={handleAiSearch}
                disabled={aiLoading || !aiQuery.trim()}
                aria-label={t("aiSearchButton")}
                className="absolute end-2 top-1/2 inline-flex h-8 w-8 -translate-y-1/2 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg bg-purple-600 text-[11px] font-semibold text-white transition-colors hover:bg-purple-700 disabled:opacity-50 sm:h-7 sm:w-auto sm:px-3"
              >
                {aiLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin sm:h-3 sm:w-3" /> : <Sparkles className="h-3.5 w-3.5 sm:h-3 sm:w-3" />}
                <span className="hidden sm:inline">{t("aiSearchButton")}</span>
              </button>
            </div>
          </InlineFilterBar>
      </div>

      {/* Links table */}
      <section className="workspace-panel-surface overflow-hidden rounded-2xl">
      {isLoading ? (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/30 hover:bg-muted/30">
                <TableHead>{t("tableHeadCode")}</TableHead>
                <TableHead>{tc("status")}</TableHead>
                <TableHead>{t("tableHeadCreator")}</TableHead>
                <TableHead>{t("tableHeadRole")}</TableHead>
                <TableHead>{t("tableHeadLabel")}</TableHead>
                <TableHead>{t("tableHeadUsed")}</TableHead>
                <TableHead>{t("tableHeadExpires")}</TableHead>
                <TableHead className="text-right">{tc("actions")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableBodySkeleton rows={5} cols={8} />
            </TableBody>
          </Table>
        </div>
      ) : isError ? (
        <ErrorState onRetry={() => refetch()} />
      ) : links.length === 0 ? (
        <EmptyState title={t("emptyStateTitle")} description={t("emptyStateDescription")} icon={Link2} />
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/30 hover:bg-muted/30">
                <TableHead>{t("tableHeadCode")}</TableHead>
                <TableHead>{tc("status")}</TableHead>
                <TableHead>{t("tableHeadCreator")}</TableHead>
                <TableHead>{t("tableHeadRole")}</TableHead>
                <TableHead>{t("tableHeadLabel")}</TableHead>
                <TableHead>{t("tableHeadUsed")}</TableHead>
                <TableHead>{t("tableHeadExpires")}</TableHead>
                <TableHead className="text-right">{tc("actions")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {links.map((link) => {
                const status = linkStatus(link);
                const isExpanded = expandedId === link._id;
                return (
                  <Fragment key={link._id}>
                    <TableRow
                      className="group cursor-pointer"
                      onClick={(event) => {
                        // Below 640px the shared table enhancer turns each row
                        // into a collapsible card and the row's own tap toggles
                        // it. Toggling the registrations drawer there would fire
                        // both, so the chevron stays the phone entry point.
                        const cardMode =
                          event.currentTarget.hasAttribute("data-mobile-collapsible") &&
                          (typeof window.matchMedia !== "function" || window.matchMedia("(max-width: 639px)").matches);
                        if (cardMode) return;
                        if (!isRowToggleClick(event)) return;
                        setExpandedId(isExpanded ? null : link._id);
                      }}
                    >
                      <TableCell className="font-mono text-sm font-medium">{link.code}</TableCell>
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
                      <TableCell className="text-sm">
                        <div className="flex min-w-0 items-center gap-2">
                          <UserAvatar name={creatorName(link)} className="h-8 w-8 shrink-0" colorful />
                          <span className="truncate">{creatorName(link)}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${link.creatorRole === "super_agent" ? "bg-purple-100 text-purple-700" : "bg-blue-100 text-blue-700"}`}>
                          {link.creatorRole === "super_agent" ? t("roleSuperAgent") : t("roleAgent")}
                        </span>
                        <ReferralAudienceChip audience={link.audience} namespace="superAgentReferralLinks" />
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{link.label || "—"}</TableCell>
                      <TableCell className="text-sm">{link.usedCount}{link.maxUses > 0 ? `/${link.maxUses}` : ""}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        <span className="inline-flex items-center gap-1">
                          <Calendar className="h-3 w-3 shrink-0" aria-hidden="true" />
                          {formatDate(link.expiresAt, { day: "2-digit", month: "short", year: "numeric" })}
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        {/* stopPropagation: the row toggles the registrations
                            drawer, so every action here must not bubble — the
                            toggle gets the same guard or it double-fires. */}
                        <div className="flex items-center justify-end gap-2" onClick={(e) => e.stopPropagation()}>
                          <RowActions
                            name={link.code}
                            quick={[
                              {
                                key: "copy",
                                label: copyMap[link.code] ? t("copiedButtonText") : t("copyButtonText"),
                                icon: copyMap[link.code] ? Check : Copy,
                                onSelect: () => handleCopy(link),
                              },
                            ]}
                            menu={[
                              {
                                key: "toggle",
                                label: link.isActive ? t("disableButton") : t("enableButton"),
                                icon: link.isActive ? PowerOff : Power,
                                destructive: link.isActive,
                                pending: updateMutation.isPending,
                                disabled: updateMutation.isPending,
                                onSelect: () => { void handleToggleActive(link); },
                              },
                            ]}
                          />
                          <RowExpandToggle
                            expanded={isExpanded}
                            onToggle={() => setExpandedId(isExpanded ? null : link._id)}
                          />
                        </div>
                      </TableCell>
                    </TableRow>
                    {isExpanded && (
                      <TableRow key={`${link._id}-detail`} className="hover:bg-transparent">
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
                                  <UserAvatar name={registrationDisplayName(reg)} className="h-8 w-8 shrink-0" colorful />
                                  <div className="min-w-0 flex-1">
                                    <p className="truncate text-sm font-medium text-foreground">{registrationDisplayName(reg)}</p>
                                    <p className="flex items-center gap-1 truncate text-xs text-muted-foreground">
                                      <Mail className="h-3 w-3 shrink-0" aria-hidden="true" />
                                      <span className="truncate">{reg.email}</span>
                                    </p>
                                  </div>
                                  <div className="shrink-0 text-right text-xs text-muted-foreground">
                                    {reg.country && (
                                      <p className="flex items-center justify-end gap-1">
                                        <MapPin className="h-3 w-3 shrink-0" aria-hidden="true" />
                                        {reg.city ? `${reg.city}, ` : ""}{reg.country}
                                      </p>
                                    )}
                                    <p>{formatDate(reg.registeredAt, { day: "2-digit", month: "short", year: "numeric" })}</p>
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
      </section>

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
