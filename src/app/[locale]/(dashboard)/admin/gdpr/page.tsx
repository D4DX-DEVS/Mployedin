"use client";

import { useState, useEffect, useCallback, type ReactNode } from "react";
import { useLocale, useTranslations } from "next-intl";
import { DashboardPageHeader } from "@/components/shared/DashboardPageHeader";
import { toast } from "sonner";
import { PaginationControls } from "@/components/shared/PaginationControls";
import { InlineFilterBar, InlineFilterSearch, INLINE_FILTER_CONTROL } from "@/components/shared/InlineFilterBar";
import { TableSortControl, SortableTableHeader } from "@/components/shared/TableSortControl";
import { UserAvatar } from "@/components/shared/UserAvatar";
import { ErrorState } from "@/components/shared/ErrorState";
import { RowActions, type RowAction } from "@/components/shared/RowActions";
import { usePagination } from "@/hooks/usePagination";
import { useUrlFilter } from "@/hooks/useUrlFilter";
import { useMediaQuery, PHONE_QUERY } from "@/hooks/useMediaQuery";
import { Skeleton } from "@/components/ui/skeleton";
import { SearchableSelect } from "@/components/ui/searchable-select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Shield, Eye, FileText, UserCheck, Clock, Timer, CheckCircle2, XCircle, ShieldCheck,
} from "lucide-react";
import { formatListDate } from "@/lib/ui/intlFormat";
import type { GdprOutcomeFields } from "@/lib/gdpr/requestOutcome";
import { GdprRequestDetailsDialog } from "./_components/GdprRequestDetailsDialog";
import { GdprDecisionDialog, type GdprDecision } from "./_components/GdprDecisionDialog";
import { GdprRequestCards, GdprRequestCardsSkeleton } from "./_components/GdprRequestCards";
import { PhoneFilterRow } from "./_components/PhoneFilterRow";
import { RequestStatusBadge } from "./_components/RequestStatusBadge";
import { RequestTypeLabel } from "./_components/RequestTypeLabel";
import { ConsentLogsTab } from "./_components/ConsentLogsTab";
import { useGdprLabels } from "./_components/useGdprLabels";
import type { GdprRequestRow } from "./_components/types";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

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


/** The server's codes for a decision that could not be saved, each with its own message. */
const DECISION_ERROR_KEYS: Record<string, "cannotEraseAdmin" | "decisionStale" | "decisionErasureFailed" | "decisionErasureStarted"> = {
  ADMIN_ACCOUNT: "cannotEraseAdmin",
  STALE: "decisionStale",
  ERASURE_FAILED: "decisionErasureFailed",
  ERASURE_STARTED: "decisionErasureStarted",
};

/** Mirrors GDPR_REQUEST_STATUSES; the model file cannot be imported client-side. */
const GDPR_STATUS_VALUES = ["pending", "in_progress", "completed", "rejected", "cancelled"] as const;

// No "Retention policies" tab: it rendered six hardcoded rows claiming
// auto-delete for applications, CVs and messages that no job performs, with a
// "last reviewed" date of whenever the page was opened.

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function AdminGdprPage() {
  const t = useTranslations("adminGdpr");
  const locale = useLocale();
  const { typeLabel, responseTime } = useGdprLabels();
  // Phones get purpose-built cards instead of the generic table-to-card CSS.
  // Only for the rows, which arrive after hydration: everything on screen
  // before then (skeletons, the filter row, the panel) is switched by CSS, so a
  // phone's first paint (and a page without scripts) is already the phone layout.
  const isPhone = useMediaQuery(PHONE_QUERY);
  const [activeTab, setActiveTab] = useState<"requests" | "consent">("requests");
  const [requests, setRequests] = useState<GdprRequestRow[]>([]);
  // The request in the details dialog. Kept after closing so the dialog keeps
  // its content while it animates out; `viewOpen` is what opens and closes it.
  const [viewing, setViewing] = useState<GdprRequestRow | null>(null);
  const [viewOpen, setViewOpen] = useState(false);
  // The request in the Complete / Reject form; kept after closing like `viewing`.
  const [deciding, setDeciding] = useState<{ request: GdprRequestRow; decision: GdprDecision; onSaved?: () => void } | null>(null);
  const [decidingOpen, setDecidingOpen] = useState(false);
  const [stats, setStats] = useState<GdprStats>({
    totalRequests: 0, pendingRequests: 0, completedRequests: 0,
    avgResponseMs: null, dataSubjects: 0, activeConsents: 0,
  });
  // The figures stay skeletons until the first answer: a real 0 means "none", not "not loaded yet".
  const [statsStatus, setStatsStatus] = useState<"loading" | "ready" | "error">("loading");
  const [loading, setLoading] = useState(true);
  // A list that could not be loaded says so (with Retry): "No data requests" would read as nothing to answer.
  const [requestsFailed, setRequestsFailed] = useState(false);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  // In the URL so the dashboard's "pending GDPR requests" row lands filtered.
  const [statusFilter, setStatusFilter] = useUrlFilter("status", "all", { allow: GDPR_STATUS_VALUES });
  const pagination = usePagination();
  // Requests sort by submitted or completed date. (The Consent Logs tab keeps its own filters.)
  const [sortBy, setSortBy] = useUrlFilter("sortBy", "createdAt", { allow: ["createdAt", "completedAt"] });
  const [sortOrderParam, setSortOrder] = useUrlFilter("sortOrder", "desc", { allow: ["asc", "desc"] });
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
      params.set("sortBy", sortBy);
      params.set("sortOrder", sortOrder);

      const res = await fetch(`/api/admin/gdpr?${params}`);
      setRequestsFailed(!res.ok);
      if (res.ok) {
        const data = await res.json();
        setRequests(data.items ?? []);
        pagination.updateTotal(data.total ?? 0);
        if (data.stats) {
          setStats(data.stats);
          setStatsStatus("ready");
        } else {
          setStatsStatus((s) => (s === "loading" ? "error" : s));
        }
      } else {
        setStatsStatus((s) => (s === "loading" ? "error" : s));
      }
    } catch {
      setRequestsFailed(true);
      setStatsStatus((s) => (s === "loading" ? "error" : s));
      toast.error(t("failedLoadGdprData"));
    } finally {
      setLoading(false);
    }
  }, [search, typeFilter, statusFilter, sortBy, sortOrder, pagination.page, pagination.limit, t]);

  // The Consent Logs tab (ConsentLogsTab) loads its own data.
  useEffect(() => {
    if (activeTab === "requests") fetchRequests();
  }, [activeTab, fetchRequests]);

  /* ---- Actions ---- */
  /**
   * Resolves true once the change is stored. `onSaved` runs then — not on a
   * cancelled form or a failed save. Completed and rejected are terminal
   * (GDPR_REQUEST_TRANSITIONS), so they go through GdprDecisionDialog, which
   * says so and records what was done; only "start" is sent directly.
   */
  const handleUpdateStatus = async (id: string, body: { status: "in_progress" | GdprDecision } & GdprOutcomeFields, onSaved?: () => void): Promise<boolean> => {
    try {
      const res = await fetch(`/api/admin/gdpr/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        toast.success(t("statusUpdatedSuccess"));
        fetchRequests();
        onSaved?.();
        return true;
      }
      const error = (await res.json().catch(() => ({}))) as { code?: string };
      toast.error(DECISION_ERROR_KEYS[error.code ?? ""] ? t(DECISION_ERROR_KEYS[error.code ?? ""]) : t("failedUpdateStatus"));
    } catch {
      toast.error(t("errorUpdatingRequest"));
    }
    return false;
  };

  const decide = (request: GdprRequestRow, decision: GdprDecision, onSaved?: () => void) => {
    setDeciding({ request, decision, onSaved });
    setDecidingOpen(true);
  };

  /** The moves still open to a request — shared by its row menu and its details dialog. */
  const statusActionsFor = (r: GdprRequestRow, onSaved?: () => void): RowAction[] => {
    const items: RowAction[] = [];
    if (r.status === "pending") {
      items.push({ key: "start", label: t("startButton"), icon: Clock, onSelect: () => handleUpdateStatus(r._id, { status: "in_progress" }, onSaved) });
      items.push({ key: "reject", label: t("rejectButton"), icon: XCircle, onSelect: () => decide(r, "rejected", onSaved), destructive: true });
    }
    if (r.status === "in_progress") {
      items.push({ key: "complete", label: t("completeButton"), icon: CheckCircle2, onSelect: () => decide(r, "completed", onSaved) });
      // A started request can still be refused (an exemption or an unverifiable identity found while checking it):
      // without this a deletion's only way out was Complete, which erases the account (UK GDPR Art 12(4)).
      items.push({ key: "reject", label: t("rejectButton"), icon: XCircle, onSelect: () => decide(r, "rejected", onSaved), destructive: true });
    }
    return items;
  };

  /** A figure of the header strip: a skeleton until the first answer, a dash if there never was one. */
  const stat = (value: ReactNode): ReactNode =>
    statsStatus === "loading" ? (
      <Skeleton data-stat-skeleton="" className="h-5 w-8 sm:h-6 sm:w-10" />
    ) : statsStatus === "error" ? "—" : value;

  const TABS = [
    { key: "requests" as const, label: t("dataRequestsTab"), icon: <FileText className="h-4 w-4" /> },
    { key: "consent" as const, label: t("consentLogsTab"), icon: <UserCheck className="h-4 w-4" /> },
  ];

  return (
    <div className="page-container">
      <GdprDecisionDialog
        request={deciding?.request ?? null}
        decision={deciding?.decision ?? "completed"}
        open={decidingOpen}
        onOpenChange={setDecidingOpen}
        onSubmit={(payload) => (deciding ? handleUpdateStatus(deciding.request._id, payload, deciding.onSaved) : Promise.resolve(false))}
      />
      <GdprRequestDetailsDialog
        request={viewing}
        open={viewOpen}
        onClose={() => setViewOpen(false)}
        actions={viewing ? statusActionsFor(viewing, () => setViewOpen(false)) : []}
      />
      <DashboardPageHeader
        compactOnMobile
        icon={Shield}
        title={t("pageTitle")}
        description={t("pageDescription")}
        // Four tiles go two by two on a phone (a single row squeezed the labels); a rule between the rows.
        metricsClassName="max-md:[&>*:nth-child(-n+2)]:border-b max-sm:[&_[data-header-metric-value]>div]:text-lg"
        // The Consent Logs tab shows its own cookie-choice cards instead.
        metrics={activeTab === "consent" ? undefined : [
          {
            label: t("totalRequestsLabel"),
            value: stat(stats.totalRequests),
            icon: FileText,
            iconClassName: "text-sky-600",
            iconSurfaceClassName: "bg-sky-50",
          },
          {
            label: t("pendingLabel"),
            value: stat(stats.pendingRequests),
            icon: Clock,
            iconClassName: "text-amber-600",
            iconSurfaceClassName: "bg-amber-50",
          },
          {
            label: t("completedLabel"),
            value: stat(stats.completedRequests),
            icon: CheckCircle2,
            iconClassName: "text-emerald-600",
            iconSurfaceClassName: "bg-emerald-50",
          },
          {
            label: t("avgResponseTimeLabel"),
            value: stat(responseTime(stats.avgResponseMs)),
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

      {activeTab === "consent" && <ConsentLogsTab />}

      {/* Data requests: filters, list, pagination */}
      {activeTab === "requests" && (
        <>
          <InlineFilterBar
            // Phones: no box or padding around the filters (CSS, so the first paint has it too).
            className="workspace-panel-surface rounded-2xl border-b-0 max-sm:!border-0 max-sm:!bg-transparent max-sm:!p-0 max-sm:!shadow-none"
            onClear={search.trim() || typeFilter !== "all" || statusFilter !== "all" ? () => { setSearch(""); setTypeFilter("all"); setStatusFilter("all"); pagination.resetPage(); } : undefined}
            clearLabel={t("resetButton")}
            phoneRow={
              <PhoneFilterRow
                filters={[
                  { key: "status", label: t("statusLabel"), value: statusFilter, options: STATUS_OPTIONS, onChange: (v) => { setStatusFilter(v); pagination.resetPage(); } },
                  { key: "type", label: t("phoneFilterType"), value: typeFilter, options: REQUEST_TYPE_OPTIONS, onChange: (v) => { setTypeFilter(v); pagination.resetPage(); } },
                ]}
                sort={{
                  field: sortBy,
                  fields: [
                    { value: "createdAt", label: t("submittedColumnHeader") },
                    { value: "completedAt", label: t("completedColumnHeader") },
                  ],
                  onFieldChange: (v) => { setSortBy(v); pagination.resetPage(); },
                  order: sortOrder,
                  onOrderChange: (next) => { setSortOrder(next); pagination.resetPage(); },
                }}
              />
            }
          >
            <InlineFilterSearch
              value={search}
              onChange={(v) => { setSearch(v); pagination.resetPage(); }}
              placeholder={t("searchPlaceholder")}
            />
            {/* `contents`: from sm up these sit in the bar exactly as before; phones use phoneRow instead. */}
            <div className="contents max-sm:hidden">
              <SearchableSelect
                options={STATUS_OPTIONS}
                value={statusFilter}
                onValueChange={(v) => { setStatusFilter(v); pagination.resetPage(); }}
                placeholder={t("statusLabel")}
                className={INLINE_FILTER_CONTROL}
              />
              <SearchableSelect
                options={REQUEST_TYPE_OPTIONS}
                value={typeFilter}
                onValueChange={(v) => { setTypeFilter(v); pagination.resetPage(); }}
                placeholder={t("requestTypeLabel")}
                className={INLINE_FILTER_CONTROL}
              />
              <TableSortControl
                value={sortBy}
                onValueChange={(v) => { setSortBy(v); pagination.resetPage(); }}
                options={[
                  { value: "createdAt", label: t("submittedColumnHeader") },
                  { value: "completedAt", label: t("completedColumnHeader") },
                ]}
                order={sortOrder}
                onOrderChange={(next) => { setSortOrder(next); pagination.resetPage(); }}
                compact
              />
            </div>
          </InlineFilterBar>

          {/* On a phone the cards sit straight on the page: a bordered panel around bordered cards doubled the border and the padding. */}
          <section className="workspace-panel-surface rounded-2xl panel-body max-sm:!border-0 max-sm:!bg-transparent max-sm:!p-0 max-sm:!shadow-none">
            {loading ? (
              <>
              {/* Both skeletons, switched by CSS: `isPhone` is false until hydration, so a phone first painted the desktop table. */}
              <div className="sm:hidden" data-testid="requests-cards-skeleton"><GdprRequestCardsSkeleton /></div>
              <div className="overflow-x-auto max-sm:hidden" data-testid="requests-table-skeleton">
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
              </>
            ) : requestsFailed ? (
              <ErrorState title={t("failedLoadGdprData")} retryLabel={t("cookieChoiceRetry")} onRetry={() => void fetchRequests()} />
            ) : requests.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <ShieldCheck className="h-12 w-12 text-muted-foreground/40" />
                <p className="mt-4 text-sm font-medium text-muted-foreground">{t("noDataRequestsMessage")}</p>
                <p className="mt-1 text-xs text-muted-foreground/70">{t("noDataRequestsSubtext")}</p>
              </div>
            ) : isPhone ? (
              <GdprRequestCards
                requests={requests}
                onView={(r) => { setViewing(r); setViewOpen(true); }}
                actionsFor={(r) => statusActionsFor(r)}
              />
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
                          <RequestTypeLabel type={r.requestType} />
                        </TableCell>
                        <TableCell><RequestStatusBadge status={r.status} /></TableCell>
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
          </section>

          <PaginationControls
            page={pagination.page}
            totalPages={pagination.totalPages}
            limit={pagination.limit}
            total={pagination.total}
            onPageChange={pagination.setPage}
            onLimitChange={pagination.setLimit}
            // "0–0 / 0" before the first answer would read as an empty list.
            summary={statsStatus === "loading" ? <Skeleton data-pagination-skeleton="" className="inline-block h-4 w-16 align-middle" /> : undefined}
          />
        </>
      )}
    </div>
  );
}
