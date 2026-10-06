"use client";

import { useState, useEffect, useCallback } from "react";
import { useLocale, useTranslations } from "next-intl";
import { DashboardPageHeader } from "@/components/shared/DashboardPageHeader";
import { toast } from "sonner";
import { PaginationControls } from "@/components/shared/PaginationControls";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { InlineFilterBar, InlineFilterSearch, INLINE_FILTER_CONTROL } from "@/components/shared/InlineFilterBar";
import { TableSortControl, SortableTableHeader } from "@/components/shared/TableSortControl";
import { UserAvatar } from "@/components/shared/UserAvatar";
import { RowActions, type RowAction } from "@/components/shared/RowActions";
import { usePagination } from "@/hooks/usePagination";
import { useUrlFilter } from "@/hooks/useUrlFilter";
import { useConfirm } from "@/hooks/useConfirm";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { SearchableSelect } from "@/components/ui/searchable-select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Shield, Download, Trash2, Eye, FileText, UserCheck, Clock, Timer, CheckCircle2, XCircle, ShieldCheck,
} from "lucide-react";
import { formatDateTime, formatListDate } from "@/lib/ui/intlFormat";
import { GdprRequestDetailsDialog } from "./_components/GdprRequestDetailsDialog";
import { useGdprLabels } from "./_components/useGdprLabels";
import type { GdprRequestRow } from "./_components/types";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface ConsentLog {
  _id: string;
  userId: string;
  userName: string;
  userEmail?: string | null;
  consentType: string;
  granted: boolean;
  timestamp: string;
  ipAddress?: string;
  source?: string | null;
  /** The Terms/Privacy version a terms_and_privacy row accepted. */
  policyVersion?: string | null;
}

interface TermsSummary {
  version: string;
  isBaseline: boolean;
  acceptedUsers: number;
  totalUsers: number;
}

interface GdprStats {
  totalRequests: number;
  pendingRequests: number;
  completedRequests: number;
  /** Over requests an admin completed; null while there are none. */
  avgResponseMs: number | null;
  dataSubjects: number;
  activeConsents: number;
}

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */


/** Mirrors GDPR_REQUEST_STATUSES; the model file cannot be imported client-side. */
const GDPR_STATUS_VALUES = ["pending", "in_progress", "completed", "rejected", "cancelled"] as const;

/** Mirrors CONSENT_TYPES in lib/gdpr/consent.ts (a server module). */
const CONSENT_TYPE_VALUES = ["terms_and_privacy", "cookies", "marketing"] as const;

// No "Retention policies" tab: it rendered six hardcoded rows claiming
// auto-delete for applications, CVs and messages that no job performs, with a
// "last reviewed" date of whenever the page was opened.

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function AdminGdprPage() {
  const t = useTranslations("adminGdpr");
  const locale = useLocale();
  const { confirm, ConfirmDialogNode } = useConfirm();
  const { typeLabel, responseTime } = useGdprLabels();
  const [activeTab, setActiveTab] = useState<"requests" | "consent">("requests");
  const [requests, setRequests] = useState<GdprRequestRow[]>([]);
  // The request in the details dialog. Kept after closing so the dialog keeps
  // its content while it animates out; `viewOpen` is what opens and closes it.
  const [viewing, setViewing] = useState<GdprRequestRow | null>(null);
  const [viewOpen, setViewOpen] = useState(false);
  const [consentLogs, setConsentLogs] = useState<ConsentLog[]>([]);
  const [stats, setStats] = useState<GdprStats>({
    totalRequests: 0, pendingRequests: 0, completedRequests: 0,
    avgResponseMs: null, dataSubjects: 0, activeConsents: 0,
  });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [consentTypeFilter, setConsentTypeFilter] = useUrlFilter("consentType", "all", { allow: CONSENT_TYPE_VALUES });
  const [termsSummary, setTermsSummary] = useState<TermsSummary | null>(null);
  const [startingTermsVersion, setStartingTermsVersion] = useState(false);
  // In the URL so the dashboard's "pending GDPR requests" row lands filtered.
  const [statusFilter, setStatusFilter] = useUrlFilter("status", "all", { allow: GDPR_STATUS_VALUES });
  const pagination = usePagination();
  // Requests sort by submitted or completed date; consent logs only by time.
  const [sortByParam, setSortBy] = useUrlFilter("sortBy", "createdAt", { allow: ["createdAt", "completedAt"] });
  const [sortOrderParam, setSortOrder] = useUrlFilter("sortOrder", "desc", { allow: ["asc", "desc"] });
  const sortBy = activeTab === "consent" ? "createdAt" : sortByParam;
  const sortOrder: "asc" | "desc" = sortOrderParam === "asc" ? "asc" : "desc";
  const sortByColumn = (field: string) => {
    if (field === sortBy) setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    else { setSortBy(field); setSortOrder("desc"); }
    pagination.resetPage();
  };

  // Only the types a user can actually file: a JSON download (export) and an
  // account deletion. Rectification and restriction stay in the model and
  // still get a label in the table, but no form creates them, so as filters
  // they could only ever come back empty.
  const REQUEST_TYPE_OPTIONS = [
    { value: "all", label: t("allTypesLabel") },
    { value: "export", label: typeLabel("export") },
    { value: "delete", label: typeLabel("delete") },
  ];

  const STATUS_OPTIONS = [
    { value: "all", label: t("allStatusesLabel") },
    { value: "pending", label: t("pendingStatusLabel") },
    { value: "in_progress", label: t("inProgressStatusLabel") },
    { value: "completed", label: t("completedStatusLabel") },
    { value: "rejected", label: t("rejectedStatusLabel") },
    { value: "cancelled", label: t("cancelledStatusLabel") },
  ];

  /* ---- Fetch data requests ---- */
  const fetchRequests = useCallback(async () => {
    setLoading(true);
    try {
      const params = pagination.paginationParams();
      if (search) params.set("search", search);
      if (typeFilter !== "all") params.set("type", typeFilter);
      if (statusFilter !== "all") params.set("status", statusFilter);
      params.set("sortBy", sortByParam);
      params.set("sortOrder", sortOrder);

      const res = await fetch(`/api/admin/gdpr?${params}`);
      if (res.ok) {
        const data = await res.json();
        setRequests(data.items ?? []);
        pagination.updateTotal(data.total ?? 0);
        if (data.stats) setStats(data.stats);
      }
    } catch {
      toast.error(t("failedLoadGdprData"));
    } finally {
      setLoading(false);
    }
  }, [search, typeFilter, statusFilter, sortByParam, sortOrder, pagination.page, pagination.limit, t]);

  /* ---- Fetch consent logs ---- */
  const fetchConsentLogs = useCallback(async () => {
    try {
      const params = pagination.paginationParams();
      if (search) params.set("search", search);
      if (consentTypeFilter !== "all") params.set("type", consentTypeFilter);
      params.set("sortOrder", sortOrder);
      const res = await fetch(`/api/admin/gdpr/consent?${params}`);
      if (res.ok) {
        const data = await res.json();
        setConsentLogs(data.items ?? []);
        pagination.updateTotal(data.total ?? 0);
      }
    } catch {
      toast.error(t("failedLoadConsentLogs"));
    }
  }, [search, consentTypeFilter, sortOrder, pagination.page, pagination.limit, t]);

  /* ---- Terms version (consent tab) ---- */
  const fetchTermsSummary = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/gdpr/terms");
      if (res.ok) setTermsSummary(await res.json());
    } catch {
      // The card simply stays hidden; the log below still loads.
    }
  }, []);

  useEffect(() => {
    if (activeTab === "requests") fetchRequests();
    else if (activeTab === "consent") fetchConsentLogs();
    else setLoading(false);
  }, [activeTab, fetchRequests, fetchConsentLogs]);

  useEffect(() => {
    if (activeTab === "consent") fetchTermsSummary();
  }, [activeTab, fetchTermsSummary]);

  const handleStartTermsVersion = async () => {
    const confirmed = await confirm({
      title: t("termsNewVersionConfirmTitle"),
      message: t("termsNewVersionConfirmMessage"),
      confirmLabel: t("termsNewVersionConfirmButton"),
      variant: "destructive",
    });
    if (!confirmed) return;
    setStartingTermsVersion(true);
    try {
      const res = await fetch("/api/admin/gdpr/terms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm: true }),
      });
      if (res.ok) {
        setTermsSummary(await res.json());
        toast.success(t("termsNewVersionSuccess"));
      } else {
        toast.error(t("termsNewVersionError"));
      }
    } catch {
      toast.error(t("termsNewVersionError"));
    } finally {
      setStartingTermsVersion(false);
    }
  };

  /* ---- Actions ---- */
  /** `onSaved` runs only once the change is stored — not on a cancelled confirm or a failed save. */
  const handleUpdateStatus = async (id: string, status: string, subject: string, requestType?: string, onSaved?: () => void) => {
    // Completed and rejected are terminal (GDPR_REQUEST_TRANSITIONS): once
    // either is saved the request can never move again, so ask first.
    if (status === "completed" || status === "rejected") {
      let dialogMessage = status === "rejected"
        ? t("confirmRejectMessage", { name: subject })
        : t("confirmCompleteMessage", { name: subject });
      let dialogVariant: "default" | "destructive" = status === "rejected" ? "destructive" : "default";

      // For delete requests being completed, show the destructive warning
      if (status === "completed" && requestType === "delete") {
        dialogMessage = t("confirmCompleteDeleteMessage", { name: subject });
        dialogVariant = "destructive";
      }

      const confirmed = await confirm({
        title: status === "rejected" ? t("confirmRejectTitle") : t("confirmCompleteTitle"),
        message: dialogMessage,
        confirmLabel: status === "rejected" ? t("rejectButton") : t("completeButton"),
        variant: dialogVariant,
      });
      if (!confirmed) return;
    }
    try {
      const res = await fetch(`/api/admin/gdpr/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (res.ok) {
        toast.success(t("statusUpdatedSuccess"));
        fetchRequests();
        onSaved?.();
      } else {
        const error = (await res.json().catch(() => ({}))) as { code?: string };
        toast.error(error.code === "ADMIN_ACCOUNT" ? t("cannotEraseAdmin") : t("failedUpdateStatus"));
      }
    } catch {
      toast.error(t("errorUpdatingRequest"));
    }
  };

  /** The moves still open to a request — shared by its row menu and its details dialog. */
  const statusActionsFor = (r: GdprRequestRow, onSaved?: () => void): RowAction[] => {
    const items: RowAction[] = [];
    if (r.status === "pending") {
      items.push({ key: "start", label: t("startButton"), icon: Clock, onSelect: () => handleUpdateStatus(r._id, "in_progress", r.userName, r.requestType, onSaved) });
      items.push({ key: "reject", label: t("rejectButton"), icon: XCircle, onSelect: () => handleUpdateStatus(r._id, "rejected", r.userName, r.requestType, onSaved), destructive: true });
    }
    if (r.status === "in_progress") {
      items.push({ key: "complete", label: t("completeButton"), icon: CheckCircle2, onSelect: () => handleUpdateStatus(r._id, "completed", r.userName, r.requestType, onSaved) });
    }
    return items;
  };

  // A static map, not t(`consentType_${type}`): an unknown stored type must
  // fall back to its raw name instead of throwing a missing-message error.
  const CONSENT_TYPE_LABELS: Record<string, string> = {
    terms_and_privacy: t("consentTypeTermsAndPrivacy"),
    cookies: t("consentTypeCookies"),
    marketing: t("consentTypeMarketing"),
  };

  const CONSENT_TYPE_OPTIONS = [
    { value: "all", label: t("allConsentTypesLabel") },
    ...CONSENT_TYPE_VALUES.map((value) => ({ value, label: CONSENT_TYPE_LABELS[value] })),
  ];

  // Where a row was recorded. Static for the same reason as the type labels;
  // an unknown source shows as stored.
  const CONSENT_SOURCE_LABELS: Record<string, string> = {
    registration: t("consentSourceRegistration"),
    "registration:google": t("consentSourceRegistrationGoogle"),
    "registration:email_code": t("consentSourceRegistrationEmailCode"),
    "registration:linkedin": t("consentSourceRegistrationLinkedIn"),
    "registration:apple": t("consentSourceRegistrationApple"),
    first_sign_in: t("consentSourceFirstSignIn"),
    terms_update: t("consentSourceTermsUpdate"),
    cookie_banner: t("consentSourceCookieBanner"),
    privacy_settings: t("consentSourcePrivacySettings"),
    profile: t("consentSourceProfile"),
  };

  const TABS = [
    { key: "requests" as const, label: t("dataRequestsTab"), icon: <FileText className="h-4 w-4" /> },
    { key: "consent" as const, label: t("consentLogsTab"), icon: <UserCheck className="h-4 w-4" /> },
  ];

  return (
    <div className="page-container">
      {ConfirmDialogNode}
      <GdprRequestDetailsDialog
        request={viewing}
        open={viewOpen}
        onClose={() => setViewOpen(false)}
        actions={viewing ? statusActionsFor(viewing, () => setViewOpen(false)) : []}
      />
      <DashboardPageHeader
        compact
        compactOnMobile
        icon={Shield}
        title={t("pageTitle")}
        description={t("pageDescription")}
        metrics={[
          {
            label: t("totalRequestsLabel"),
            value: stats.totalRequests,
            icon: FileText,
            iconClassName: "text-sky-600",
            iconSurfaceClassName: "bg-sky-50",
          },
          {
            label: t("pendingLabel"),
            value: stats.pendingRequests,
            icon: Clock,
            iconClassName: "text-amber-600",
            iconSurfaceClassName: "bg-amber-50",
          },
          {
            label: t("completedLabel"),
            value: stats.completedRequests,
            icon: CheckCircle2,
            iconClassName: "text-emerald-600",
            iconSurfaceClassName: "bg-emerald-50",
          },
          {
            label: t("avgResponseTimeLabel"),
            value: responseTime(stats.avgResponseMs),
            icon: Timer,
            iconClassName: "text-violet-600",
            iconSurfaceClassName: "bg-violet-50",
          },
        ]}
      />

      {/* Tabs */}
      <div className="flex gap-2 overflow-x-auto pb-1 -mb-1">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => { setActiveTab(tab.key); pagination.resetPage(); }}
            className={`inline-flex shrink-0 items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === tab.key
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:bg-muted/80"
            }`}
          >
            {tab.icon} {tab.label}
          </button>
        ))}
      </div>

      {/* Terms version: who still owes an acceptance, and starting a new one */}
      {activeTab === "consent" && termsSummary && (
        <section className="workspace-panel-surface flex flex-col gap-3 rounded-2xl panel-body sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0 space-y-1">
            <p className="text-sm font-semibold text-foreground">{t("termsVersionTitle")}</p>
            <p className="text-sm text-muted-foreground">
              {t("termsVersionSummary", {
                date: formatListDate(new Date(termsSummary.version), locale),
                accepted: termsSummary.acceptedUsers,
                total: termsSummary.totalUsers,
              })}
            </p>
            <p className="text-xs text-muted-foreground">{t("termsVersionHelp")}</p>
          </div>
          <Button
            variant="outline"
            className="min-h-11 shrink-0"
            onClick={handleStartTermsVersion}
            disabled={startingTermsVersion}
          >
            {t("termsNewVersionButton")}
          </Button>
        </section>
      )}

      {/* Filters */}
      <InlineFilterBar
        className="workspace-panel-surface rounded-2xl border-b-0"
        onClear={search.trim() || typeFilter !== "all" || statusFilter !== "all" || consentTypeFilter !== "all" ? () => { setSearch(""); setTypeFilter("all"); setStatusFilter("all"); setConsentTypeFilter("all"); pagination.resetPage(); } : undefined}
        clearLabel={t("resetButton")}
      >
        <InlineFilterSearch
          value={search}
          onChange={(v) => { setSearch(v); pagination.resetPage(); }}
          placeholder={t("searchPlaceholder")}
        />
        {activeTab === "requests" && (
          <SearchableSelect
            options={STATUS_OPTIONS}
            value={statusFilter}
            onValueChange={(v) => { setStatusFilter(v); pagination.resetPage(); }}
            placeholder={t("statusLabel")}
            className={INLINE_FILTER_CONTROL}
          />
        )}
        {activeTab === "consent" && (
          <SearchableSelect
            options={CONSENT_TYPE_OPTIONS}
            value={consentTypeFilter}
            onValueChange={(v) => { setConsentTypeFilter(v); pagination.resetPage(); }}
            placeholder={t("consentTypeColumnHeader")}
            className={INLINE_FILTER_CONTROL}
          />
        )}
        {activeTab === "requests" && (
          <SearchableSelect
            options={REQUEST_TYPE_OPTIONS}
            value={typeFilter}
            onValueChange={(v) => { setTypeFilter(v); pagination.resetPage(); }}
            placeholder={t("requestTypeLabel")}
            className={INLINE_FILTER_CONTROL}
          />
        )}
        <TableSortControl
          value={sortBy}
          onValueChange={(v) => { setSortBy(v); pagination.resetPage(); }}
          options={activeTab === "consent"
            ? [{ value: "createdAt", label: t("timestampColumnHeader") }]
            : [
                { value: "createdAt", label: t("submittedColumnHeader") },
                { value: "completedAt", label: t("completedColumnHeader") },
              ]}
          order={sortOrder}
          onOrderChange={(next) => { setSortOrder(next); pagination.resetPage(); }}
          compact
        />
      </InlineFilterBar>

      {/* Content */}
      <section className="workspace-panel-surface rounded-2xl panel-body">
        {activeTab === "requests" && (
          <>
            {loading ? (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/30 hover:bg-muted/30">
                      <TableHead>{t("userColumnHeader")}</TableHead>
                      <TableHead>{t("requestTypeColumnHeader")}</TableHead>
                      <TableHead>{t("statusColumnHeader")}</TableHead>
                      <TableHead>{t("submittedColumnHeader")}</TableHead>
                      <TableHead>{t("completedColumnHeader")}</TableHead>
                      <TableHead className="text-right">{t("actionsColumnHeader")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {Array.from({ length: 5 }).map((_, i) => (
                      <TableRow key={i}>
                        {Array.from({ length: 6 }).map((_, j) => (
                          <TableCell key={j}>
                            <Skeleton className="h-4 w-full" />
                          </TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : requests.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <ShieldCheck className="h-12 w-12 text-muted-foreground/40" />
                <p className="mt-4 text-sm font-medium text-muted-foreground">{t("noDataRequestsMessage")}</p>
                <p className="mt-1 text-xs text-muted-foreground/70">{t("noDataRequestsSubtext")}</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/30 hover:bg-muted/30">
                      <TableHead>{t("userColumnHeader")}</TableHead>
                      <TableHead>{t("requestTypeColumnHeader")}</TableHead>
                      <TableHead>{t("statusColumnHeader")}</TableHead>
                      <TableHead>
                        <SortableTableHeader label={t("submittedColumnHeader")} active={sortBy === "createdAt"} order={sortOrder} onClick={() => sortByColumn("createdAt")} />
                      </TableHead>
                      <TableHead>
                        <SortableTableHeader label={t("completedColumnHeader")} active={sortBy === "completedAt"} order={sortOrder} onClick={() => sortByColumn("completedAt")} />
                      </TableHead>
                      <TableHead className="text-right">{t("actionsColumnHeader")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {requests.map((r) => (
                      <TableRow key={r._id}>
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <UserAvatar name={r.userName} email={r.userEmail} className="h-9 w-9 shrink-0" colorful />
                            <div className="min-w-0">
                              <p className="font-medium text-foreground">{r.userName}</p>
                              <p className="text-xs text-muted-foreground">{r.userEmail}</p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <span className="inline-flex items-center gap-1.5 text-sm">
                            {r.requestType === "export" && <Download className="h-3.5 w-3.5" aria-hidden="true" />}
                            {r.requestType === "delete" && <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />}
                            {r.requestType === "rectification" && <FileText className="h-3.5 w-3.5" aria-hidden="true" />}
                            {r.requestType === "restrict" && <XCircle className="h-3.5 w-3.5" aria-hidden="true" />}
                            {typeLabel(r.requestType)}
                          </span>
                        </TableCell>
                        <TableCell><StatusBadge status={r.status} /></TableCell>
                        <TableCell className="text-sm text-muted-foreground">{formatListDate(new Date(r.createdAt), locale)}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{r.completedAt ? formatListDate(new Date(r.completedAt), locale) : "—"}</TableCell>
                        <TableCell className="text-right">
                          <RowActions
                            name={r.userName}
                            quick={[{ key: "view", label: t("viewButton"), icon: Eye, onSelect: () => { setViewing(r); setViewOpen(true); } }]}
                            menu={statusActionsFor(r)}
                          />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </>
        )}

        {activeTab === "consent" && (
          <>
            {consentLogs.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <UserCheck className="h-12 w-12 text-muted-foreground/40" />
                <p className="mt-4 text-sm font-medium text-muted-foreground">{t("noConsentLogsMessage")}</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/30 hover:bg-muted/30">
                      <TableHead>{t("consentUserColumnHeader")}</TableHead>
                      <TableHead>{t("consentTypeColumnHeader")}</TableHead>
                      <TableHead>{t("grantedColumnHeader")}</TableHead>
                      <TableHead>{t("consentSourceColumnHeader")}</TableHead>
                      <TableHead>
                        <SortableTableHeader label={t("timestampColumnHeader")} active={sortBy === "createdAt"} order={sortOrder} onClick={() => sortByColumn("createdAt")} />
                      </TableHead>
                      <TableHead>{t("ipAddressColumnHeader")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {consentLogs.map((c) => (
                      <TableRow key={c._id}>
                        <TableCell>
                          <div className="min-w-0">
                            <p className="font-medium text-foreground">{c.userName}</p>
                            {c.userEmail ? <p className="text-xs text-muted-foreground">{c.userEmail}</p> : null}
                          </div>
                        </TableCell>
                        <TableCell>
                          <p>{CONSENT_TYPE_LABELS[c.consentType] ?? c.consentType.replace(/_/g, " ")}</p>
                          {c.policyVersion ? (
                            <p className="text-xs text-muted-foreground">
                              {t("consentPolicyVersion", { date: formatListDate(new Date(c.policyVersion), locale) })}
                            </p>
                          ) : null}
                        </TableCell>
                        <TableCell>
                          {c.granted ? (
                            <span className="inline-flex items-center gap-1 text-sm text-emerald-600"><CheckCircle2 className="h-3.5 w-3.5" /> {t("consentYesLabel")}</span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-sm text-red-600"><XCircle className="h-3.5 w-3.5" /> {t("consentNoLabel")}</span>
                          )}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {c.source ? (CONSENT_SOURCE_LABELS[c.source] ?? c.source) : "—"}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">{formatDateTime(new Date(c.timestamp))}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{c.ipAddress ?? "—"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </>
        )}
      </section>

      {/* Pagination */}
      <PaginationControls
        page={pagination.page}
        totalPages={pagination.totalPages}
        limit={pagination.limit}
        total={pagination.total}
        onPageChange={pagination.setPage}
        onLimitChange={pagination.setLimit}
      />
    </div>
  );
}
