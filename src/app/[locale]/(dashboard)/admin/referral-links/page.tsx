"use client";

import React, { useState, useCallback, useId } from "react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { DashboardPageHeader, type DashboardHeaderMetric } from "@/components/shared/DashboardPageHeader";
import { PaginationControls } from "@/components/shared/PaginationControls";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { usePagination } from "@/hooks/usePagination";
import { useTableExport } from "@/hooks/useTableExport";
import { InlineFilterBar, InlineFilterSearch, INLINE_FILTER_CONTROL } from "@/components/shared/InlineFilterBar";
import { TableSortControl, SortableTableHeader } from "@/components/shared/TableSortControl";
import { useUrlFilter } from "@/hooks/useUrlFilter";
import { RowActions } from "@/components/shared/RowActions";
import { useConfirm } from "@/hooks/useConfirm";
import { toast } from "sonner";
import type { ExportColumn } from "@/lib/export";
import {
  useReferralLinks,
  useUpdateReferralLink,
  ReferralLinkItem,
  linkStatus,
  type ReferralSortField,
} from "@/hooks/useReferralLinks";
import {
  Building2, UserRound, Check, Copy, Link2, TrendingUp, Eye, EyeOff,
} from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ReferralAudienceChip } from "@/components/shared/ReferralAudienceChip";
import { referralUrlFor, type ReferralAudience } from "@/lib/referrals/url";
import { registrationDisplayName } from "@/lib/referrals/display";
import { formatDate as formatIntlDate } from "@/lib/ui/intlFormat";
import { RowExpandToggle, isRowToggleClick } from "@/components/shared/RowExpandToggle";

function formatDate(d: string | undefined): string {
  return d ? formatIntlDate(d, { day: "2-digit", month: "short", year: "numeric" }) : "—";
}


function getStatusLabelKey(s: ReturnType<typeof linkStatus>): string {
  switch (s) {
    case "active": return "statusActive";
    case "expired": return "statusExpired";
    case "maxed": return "statusMaxed";
    case "inactive": return "statusInactive";
  }
}

function creatorName(link: ReferralLinkItem): string {
  if (typeof link.createdBy === "object" && link.createdBy?.name) return link.createdBy.name;
  return "—";
}

function creatorEmail(link: ReferralLinkItem): string {
  if (typeof link.createdBy === "object" && link.createdBy?.email) return link.createdBy.email;
  return "";
}

export default function AdminReferralLinksPage() {
  const t = useTranslations("adminReferralLinks");
  const { locale } = useParams<{ locale: string }>();
  const { page, limit, setPage, setLimit, resetPage } = usePagination();
  const [search, setSearch] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [copyMap, setCopyMap] = useState<Record<string, boolean>>({});
  const [audienceFilter, setAudienceFilter] = useState<ReferralAudience | "">("");
  const audienceFilterId = useId();

  const [sortBy, setSortBy] = useUrlFilter("sortBy", "createdAt", { allow: ["createdAt", "usedCount", "code", "label"] });
  const [sortOrderParam, setSortOrder] = useUrlFilter("sortOrder", "desc", { allow: ["asc", "desc"] });
  const sortOrder: "asc" | "desc" = sortOrderParam === "asc" ? "asc" : "desc";
  const sortOptions = [
    { value: "createdAt", label: t("tableHeaderCreated") },
    { value: "usedCount", label: t("tableHeaderUsed") },
    { value: "code", label: t("tableHeaderCode") },
    { value: "label", label: t("tableHeaderLabel") },
  ];
  /** Same column flips the order; a new text column starts A–Z, a number or date newest/highest first. */
  const sortByColumn = (field: string) => {
    if (field === sortBy) setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    else {
      setSortBy(field);
      setSortOrder(field === "code" || field === "label" ? "asc" : "desc");
    }
    resetPage();
  };

  const filters = { page, limit, search, audience: audienceFilter || undefined, sortBy: sortBy as ReferralSortField, sortOrder };

  const { data, isLoading } = useReferralLinks(filters);
  const updateMutation = useUpdateReferralLink();
  const { confirm: confirmDialog, ConfirmDialogNode } = useConfirm();

  const links = data?.links ?? [];
  const serverTotal = data?.total ?? 0;
  const serverPages = data?.totalPages ?? 0;

  const handleCopy = useCallback((link: ReferralLinkItem) => {
    const code = link.code;
    navigator.clipboard.writeText(referralUrlFor(link, locale || "en", window.location.origin));
    setCopyMap((m) => ({ ...m, [code]: true }));
    setTimeout(() => setCopyMap((m) => ({ ...m, [code]: false })), 2000);
  }, [locale]);

  // Disabling stops new sign-ups being credited to the link's creator, so it
  // asks first. It also used to give no sign of progress or failure: a slow
  // PATCH looked like a click that did nothing.
  const handleToggleActive = async (link: ReferralLinkItem) => {
    if (link.isActive) {
      const ok = await confirmDialog({
        title: t("confirmDisableTitle", { code: link.code }),
        message: t("confirmDisableMessage"),
        confirmLabel: t("buttonDisable"),
        variant: "destructive",
      });
      if (!ok) return;
    }
    try {
      await updateMutation.mutateAsync({ id: link._id, isActive: !link.isActive });
      toast.success(link.isActive ? t("toastDisabled", { code: link.code }) : t("toastEnabled", { code: link.code }));
    } catch {
      toast.error(t("toastUpdateFailed"));
    }
  };

  // Use server-aggregated stats so values reflect all pages, not just the current one
  const activeLinks = data?.stats?.activeLinks ?? 0;
  const totalRegistrations = data?.stats?.totalRegistrations ?? 0;

  const headerMetrics: readonly DashboardHeaderMetric[] = [
    { label: t("totalLinks"), value: serverTotal, icon: Link2, iconSurfaceClassName: "bg-blue-50", iconClassName: "text-blue-600" },
    { label: t("activeLinks"), value: activeLinks, icon: Check, iconSurfaceClassName: "bg-emerald-50", iconClassName: "text-emerald-600" },
    { label: t("totalRegistrations"), value: totalRegistrations, icon: Building2, iconSurfaceClassName: "bg-indigo-50", iconClassName: "text-indigo-600" },
    { label: t("avgRegistrationsPerLink"), value: serverTotal > 0 ? (totalRegistrations / serverTotal).toFixed(1) : "0", icon: TrendingUp, iconSurfaceClassName: "bg-amber-50", iconClassName: "text-amber-600" },
  ];

  const exportColumns: ExportColumn<ReferralLinkItem>[] = [
    { header: t("tableHeaderCode"), key: "code" as keyof ReferralLinkItem },
    { header: t("tableHeaderCreator"), key: "createdBy" as keyof ReferralLinkItem, formatter: (_v, r) => creatorName(r as unknown as ReferralLinkItem) },
    { header: t("tableHeaderRole"), key: "creatorRole" as keyof ReferralLinkItem, formatter: (v) => v === "super_agent" ? t("roleSuperAgent") : t("roleAgent") },
    { header: t("tableHeaderAudience"), key: "audience" as keyof ReferralLinkItem, formatter: (v) => v === "job_seeker" ? t("audienceChipJobSeeker") : t("audienceChipEmployer") },
    { header: t("tableHeaderLabel"), key: "label" as keyof ReferralLinkItem, formatter: (v) => String(v || t("dashPlaceholder")) },
    { header: t("tableHeaderUsed"), key: "usedCount" as keyof ReferralLinkItem, formatter: (v, r) => { const l = r as unknown as ReferralLinkItem; return `${v}${l.maxUses > 0 ? ` / ${l.maxUses}` : ""}`; } },
    { header: t("tableHeaderStatus"), key: "isActive" as keyof ReferralLinkItem, formatter: (_v, r) => t(getStatusLabelKey(linkStatus(r as unknown as ReferralLinkItem))) },
    { header: t("tableHeaderExpires"), key: "expiresAt" as keyof ReferralLinkItem, formatter: (v) => formatDate(v as string) },
    { header: t("tableHeaderCreated"), key: "createdAt" as keyof ReferralLinkItem, formatter: (v) => formatDate(v as string) },
  ];
  const { handleExportCsv, handleExportExcel, handleExportPdf } = useTableExport({
    data: links as unknown as Record<string, unknown>[],
    columns: exportColumns as unknown as ExportColumn<Record<string, unknown>>[],
    filename: "referral-links",
    title: t("exportTitle"),
  });

  return (
    <div className="page-container">
      {ConfirmDialogNode}
      <DashboardPageHeader title={t("pageTitle")} description={t("pageDescription")} compact compactOnMobile metrics={headerMetrics} />

      <InlineFilterBar
        className="workspace-panel-surface rounded-2xl border-b-0"
        onExportCsv={handleExportCsv}
        onExportExcel={handleExportExcel}
        onExportPdf={handleExportPdf}
      >
        <InlineFilterSearch
          value={search}
          onChange={(v) => { setSearch(v); resetPage(); }}
          placeholder={t("searchPlaceholder")}
        />
        <Select value={audienceFilter || "all"} onValueChange={(v) => { setAudienceFilter(v === "all" ? "" : (v as ReferralAudience)); resetPage(); }}>
          <SelectTrigger id={audienceFilterId} className={`${INLINE_FILTER_CONTROL}`}>
            <SelectValue placeholder={t("filterAudienceAll")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("filterAudienceAll")}</SelectItem>
            <SelectItem value="employer">{t("filterAudienceEmployer")}</SelectItem>
            <SelectItem value="job_seeker">{t("filterAudienceJobSeeker")}</SelectItem>
          </SelectContent>
        </Select>
        <TableSortControl
          value={sortBy}
          onValueChange={(v) => { setSortBy(v); resetPage(); }}
          options={sortOptions}
          order={sortOrder}
          onOrderChange={(next) => { setSortOrder(next); resetPage(); }}
          compact
        />
      </InlineFilterBar>

      {/* Table */}
      {isLoading ? (
        <div className="workspace-panel-surface overflow-hidden rounded-2xl">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/30 hover:bg-muted/30">
                <TableHead>{t("tableHeaderCode")}</TableHead>
                <TableHead>{t("tableHeaderCreator")}</TableHead>
                <TableHead className="hidden 2xl:table-cell">{t("tableHeaderRole")}</TableHead>
                <TableHead>{t("tableHeaderAudience")}</TableHead>
                <TableHead>{t("tableHeaderLabel")}</TableHead>
                <TableHead>{t("tableHeaderUsed")}</TableHead>
                <TableHead className="hidden 2xl:table-cell">{t("tableHeaderExpires")}</TableHead>
                <TableHead>{t("tableHeaderCreated")}</TableHead>
                <TableHead>{t("tableHeaderStatus")}</TableHead>
                <TableHead className="text-right">{t("tableHeaderActions")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 10 }).map((_, j) => (
                    <TableCell key={j} className={j === 2 || j === 6 ? "hidden 2xl:table-cell" : undefined}>
                      <Skeleton className="h-4 w-full" />
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : links.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-16 text-center">
          <Link2 className="h-10 w-10 text-muted-foreground/40" />
          <p className="font-medium text-foreground">{t("emptyStateHeading")}</p>
          <p className="text-sm text-muted-foreground">{t("emptyStateDescription")}</p>
        </div>
      ) : (
        <div className="workspace-panel-surface overflow-hidden rounded-2xl">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/30 hover:bg-muted/30">
                <TableHead>
                  <SortableTableHeader
                    label={t("tableHeaderCode")}
                    active={sortBy === "code"}
                    order={sortOrder}
                    onClick={() => sortByColumn("code")}
                  />
                </TableHead>
                <TableHead>{t("tableHeaderCreator")}</TableHead>
                <TableHead className="hidden 2xl:table-cell">{t("tableHeaderRole")}</TableHead>
                <TableHead>{t("tableHeaderAudience")}</TableHead>
                <TableHead>
                  <SortableTableHeader
                    label={t("tableHeaderLabel")}
                    active={sortBy === "label"}
                    order={sortOrder}
                    onClick={() => sortByColumn("label")}
                  />
                </TableHead>
                <TableHead>
                  <SortableTableHeader
                    label={t("tableHeaderUsed")}
                    active={sortBy === "usedCount"}
                    order={sortOrder}
                    onClick={() => sortByColumn("usedCount")}
                  />
                </TableHead>
                <TableHead className="hidden 2xl:table-cell">{t("tableHeaderExpires")}</TableHead>
                <TableHead>
                  <SortableTableHeader
                    label={t("tableHeaderCreated")}
                    active={sortBy === "createdAt"}
                    order={sortOrder}
                    onClick={() => sortByColumn("createdAt")}
                  />
                </TableHead>
                <TableHead>{t("tableHeaderStatus")}</TableHead>
                <TableHead className="text-right">{t("tableHeaderActions")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {links.map((link) => {
                const status = linkStatus(link);
                const isExpanded = expandedId === link._id;
                return (
                  <React.Fragment key={link._id}>
                    <TableRow
                      className="cursor-pointer hover:bg-muted/40"
                      onClick={(e) => { if (isRowToggleClick(e)) setExpandedId(isExpanded ? null : link._id); }}
                    >
                      <TableCell className="font-mono text-sm font-medium">
                        <div className="flex items-center gap-1.5">
                          <RowExpandToggle expanded={isExpanded} onToggle={() => setExpandedId(isExpanded ? null : link._id)} />
                          <span>{link.code}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div>
                          <p className="text-sm font-medium">{creatorName(link)}</p>
                          <p className="text-xs text-muted-foreground">{creatorEmail(link)}</p>
                        </div>
                      </TableCell>
                      {/* Role and Expires give way below 2xl (1536px) so Actions stays on screen
                          with Copy + Disable labelled; the creator's email already says who made the link. */}
                      <TableCell className="hidden 2xl:table-cell">
                        <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${link.creatorRole === "super_agent" ? "bg-purple-100 text-purple-700" : "bg-blue-100 text-blue-700"}`}>
                          {link.creatorRole === "super_agent" ? t("roleSuperAgent") : t("roleAgent")}
                        </span>
                      </TableCell>
                      <TableCell>
                        <ReferralAudienceChip audience={link.audience} namespace="adminReferralLinks" />
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{link.label || t("dashPlaceholder")}</TableCell>
                      <TableCell className="text-sm font-medium">{link.usedCount}{link.maxUses > 0 ? ` / ${link.maxUses}` : ""}</TableCell>
                      <TableCell className="hidden 2xl:table-cell text-sm text-muted-foreground">{formatDate(link.expiresAt)}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{formatDate(link.createdAt)}</TableCell>
                      <TableCell><StatusBadge status={status === "active" ? "active" : "inactive"} /></TableCell>
                      <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                        <RowActions
                          name={link.code}
                          labelsFrom="wide"
                          quick={[{ key: "copy", label: copyMap[link.code] ? t("buttonCopied") : t("buttonCopy"), icon: copyMap[link.code] ? Check : Copy, onSelect: () => handleCopy(link) }]}
                          menu={[
                            { key: "toggle", label: link.isActive ? t("buttonDisable") : t("buttonEnable"), icon: link.isActive ? EyeOff : Eye, onSelect: () => void handleToggleActive(link), destructive: link.isActive, pending: updateMutation.isPending && updateMutation.variables?.id === link._id },
                          ]}
                        />
                      </TableCell>
                    </TableRow>
                    {isExpanded && (
                      <TableRow>
                        <TableCell colSpan={10} className="bg-muted/30 px-6 py-4">
                          <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                            {t("registrationsLabel")} ({link.registrations.length})
                          </p>
                          {link.registrations.length === 0 ? (
                            <p className="text-sm text-muted-foreground">{t("noRegistrationsYet")}</p>
                          ) : (
                            <div className="grid gap-2 sm:grid-cols-2">
                              {link.registrations.map((reg, i) => (
                                <div key={i} className="flex items-center gap-3 rounded-lg border border-border bg-card chip-pad">
                                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-blue-50 text-blue-600">
                                    {reg.kind === "job_seeker" ? <UserRound className="h-4 w-4" /> : <Building2 className="h-4 w-4" />}
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <p className="truncate text-sm font-medium text-foreground">{registrationDisplayName(reg)}</p>
                                    <p className="truncate text-xs text-muted-foreground">{reg.email}</p>
                                    {reg.country && (
                                      <p className="text-[11px] text-muted-foreground">{reg.city ? `${reg.city}, ` : ""}{reg.country}</p>
                                    )}
                                  </div>
                                  <p className="text-[11px] text-muted-foreground whitespace-nowrap">{formatDate(reg.registeredAt)}</p>
                                </div>
                              ))}
                            </div>
                          )}
                        </TableCell>
                      </TableRow>
                    )}
                  </React.Fragment>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      <PaginationControls
        page={page}
        totalPages={serverPages}
        total={serverTotal}
        limit={limit}
        onPageChange={setPage}
        onLimitChange={setLimit}
      />
    </div>
  );
}
