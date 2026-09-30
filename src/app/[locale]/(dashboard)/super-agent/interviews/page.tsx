"use client";

import { useState, useEffect, useCallback } from "react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { PaginationControls } from "@/components/shared/PaginationControls";
import { usePagination } from "@/hooks/usePagination";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { DateTimePicker } from "@/components/ui/date-time-picker";
import {
  SuperAgentPageIntro, SuperAgentSection,
} from "@/components/features/super-agent/WorkspacePage";
import {
  Calendar, Video, MapPin, Phone, Clock, BriefcaseBusiness, Mail,
  CheckCircle2, XCircle,
} from "lucide-react";
import { formatDate, formatTime } from "@/lib/ui/intlFormat";
import { InlineFilterBar, InlineFilterSearch, INLINE_FILTER_CONTROL } from "@/components/shared/InlineFilterBar";
import { UserAvatar } from "@/components/shared/UserAvatar";
import { TableBodySkeleton } from "@/components/ui/loading";
import { EmptyState } from "@/components/shared/EmptyState";
import { ErrorState } from "@/components/shared/ErrorState";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface InterviewItem {
  _id: string;
  candidateName: string;
  candidateEmail?: string;
  jobTitle: string;
  companyName?: string;
  agentName?: string;
  type: "video" | "offline" | "hybrid";
  status: string;
  scheduledAt: string;
  duration?: number;
  meetLink?: string;
  location?: string;
  createdAt: string;
}

interface Filters {
  search: string;
  status: string;
  type: string;
  dateFrom: string;
  dateTo: string;
}

const INITIAL_FILTERS: Filters = { search: "", status: "all", type: "all", dateFrom: "", dateTo: "" };

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function SuperAgentInterviewsPage() {
  const t = useTranslations("superAgentInterviews");
  const tc = useTranslations("common");
  const tt = useTranslations("table");
  const locale = useLocale();
  const [interviews, setInterviews] = useState<InterviewItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [filters, setFilters] = useState<Filters>(INITIAL_FILTERS);
  const [stats, setStats] = useState({ total: 0, scheduled: 0, completed: 0, cancelRate: 0 });
  const pagination = usePagination();

  const fetchInterviews = useCallback(async () => {
    setLoading(true);
    setLoadFailed(false);
    try {
      const params = pagination.paginationParams();
      if (filters.search) params.set("search", filters.search);
      if (filters.status !== "all") params.set("status", filters.status);
      if (filters.type !== "all") params.set("type", filters.type);
      if (filters.dateFrom) params.set("dateFrom", filters.dateFrom);
      if (filters.dateTo) params.set("dateTo", filters.dateTo);

      const res = await fetch(`/api/super-agent/interviews?${params}`);
      if (res.ok) {
        const data = await res.json();
        setInterviews(data.items ?? []);
        pagination.updateTotal(data.total ?? 0);
        if (data.stats) setStats(data.stats);
      } else {
        setLoadFailed(true);
      }
    } catch {
      toast.error(t("failedToLoadInterviews"));
      setLoadFailed(true);
    } finally {
      setLoading(false);
    }
  }, [filters, pagination.page, pagination.limit]);

  useEffect(() => { fetchInterviews(); }, [fetchInterviews]);

  const updateFilter = (key: keyof Filters, value: string) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
    pagination.resetPage();
  };

  const STATUS_OPTIONS = [
    { value: "all", label: t("allStatuses") },
    { value: "scheduled", label: t("statusScheduled") },
    { value: "completed", label: t("statusCompleted") },
    { value: "cancelled", label: t("statusCancelled") },
    { value: "no_show", label: t("statusNoShow") },
    { value: "rescheduled", label: t("statusRescheduled") },
  ];

  const TYPE_OPTIONS = [
    { value: "all", label: t("allTypes") },
    { value: "video", label: t("typeVideo") },
    { value: "offline", label: t("typeInPerson") },
    { value: "hybrid", label: t("typeHybrid") },
  ];

  const metricsArray = [
    { label: t("totalInterviews"), value: stats.total, icon: Calendar },
    { label: t("scheduled"), value: stats.scheduled, icon: Clock },
    { label: t("completed"), value: stats.completed, icon: CheckCircle2 },
    { label: t("cancelRate"), value: `${stats.cancelRate}%`, icon: XCircle },
  ];

  const typeIcon = (type: string) => {
    switch (type) {
      case "video": return <Video className="h-3.5 w-3.5 text-sky-500" />;
      case "offline": return <MapPin className="h-3.5 w-3.5 text-emerald-500" />;
      case "hybrid": return <Phone className="h-3.5 w-3.5 text-violet-500" />;
      default: return <Calendar className="h-3.5 w-3.5" />;
    }
  };

  return (
    <div className="page-container">
      <SuperAgentPageIntro
        title={t("pageTitle")}
        description={t("pageDescription")}
        metrics={metricsArray}
        compact
      />

      <InlineFilterBar
        className="workspace-panel-surface rounded-2xl border-b-0"
        onClear={(filters.search || filters.status !== "all" || filters.type !== "all" || filters.dateFrom || filters.dateTo) ? () => { setFilters(INITIAL_FILTERS); pagination.resetPage(); } : undefined}
        more={(
          <div className="flex min-w-0 flex-[1_1_100%] flex-wrap items-center gap-2">
            <div className="min-w-0 flex-1 basis-40">
              <DateTimePicker
                mode="date"
                value={filters.dateFrom}
                onChange={(v) => updateFilter("dateFrom", v)}
              />
            </div>
            <div className="min-w-0 flex-1 basis-40">
              <DateTimePicker
                mode="date"
                value={filters.dateTo}
                onChange={(v) => updateFilter("dateTo", v)}
              />
            </div>
          </div>
        )}
        moreActiveCount={[filters.dateFrom, filters.dateTo].filter(Boolean).length}
      >
        <InlineFilterSearch
          value={filters.search}
          onChange={(v) => updateFilter("search", v)}
          placeholder={t("searchPlaceholder")}
        />
        <SearchableSelect
          options={STATUS_OPTIONS}
          value={filters.status}
          onValueChange={(v) => updateFilter("status", v)}
          placeholder={t("allStatuses")}
          className={INLINE_FILTER_CONTROL}
        />
        <SearchableSelect
          options={TYPE_OPTIONS}
          value={filters.type}
          onValueChange={(v) => updateFilter("type", v)}
          placeholder={t("allTypes")}
          className={INLINE_FILTER_CONTROL}
        />
      </InlineFilterBar>

      {/* No section heading: it repeated the page title directly under the header. */}
      <SuperAgentSection>
        {loadFailed && !loading ? (
          <ErrorState onRetry={() => fetchInterviews()} />
        ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/30 hover:bg-muted/30">
                <TableHead className="min-w-[180px]">{t("columnCandidate")}</TableHead>
                <TableHead className="min-w-[180px]">{t("columnJob")}</TableHead>
                <TableHead>{t("columnType")}</TableHead>
                <TableHead>{t("columnScheduled")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableBodySkeleton rows={5} cols={4} />
              ) : interviews.length === 0 ? (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={4} className="py-12">
                    <EmptyState title={t("emptyStateTitle")} description={t("emptyStateDescription")} icon={Calendar} />
                  </TableCell>
                </TableRow>
              ) : interviews.map((i) => (
                <TableRow key={i._id} className="group">
                  <TableCell>
                    <div className="flex min-w-0 items-center gap-3">
                      <UserAvatar name={i.candidateName} email={i.candidateEmail} className="h-9 w-9 shrink-0" colorful />
                      <div className="min-w-0 space-y-1">
                        <p className="truncate font-medium text-foreground">{i.candidateName}</p>
                        {i.candidateEmail && (
                          <p className="flex items-center gap-1 truncate text-xs text-muted-foreground">
                            <Mail className="h-3 w-3 shrink-0" aria-hidden="true" />
                            <span className="truncate">{i.candidateEmail}</span>
                          </p>
                        )}
                        <StatusBadge status={i.status} />
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="grid w-full min-w-0 gap-0.5">
                      <p className="flex min-w-0 items-center gap-1.5 text-sm font-medium text-foreground">
                        <BriefcaseBusiness className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                        <span className="truncate">{i.jobTitle}</span>
                      </p>
                      {i.companyName && <p className="text-xs text-muted-foreground truncate">{i.companyName}</p>}
                      {i.agentName && <p className="text-xs text-muted-foreground truncate">{i.agentName}</p>}
                    </div>
                  </TableCell>
                  <TableCell>
                    <span className="inline-flex items-center gap-1 text-sm capitalize">
                      {typeIcon(i.type)} {i.type}
                    </span>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {formatDate(new Date(i.scheduledAt), { day: "2-digit", month: "short", year: "numeric" }, locale)}{" "}
                    <span className="text-xs">{formatTime(new Date(i.scheduledAt), { hour: "2-digit", minute: "2-digit" }, locale)}</span>
                    <span className="mt-1 block text-xs">{i.duration ? t("durationMinutes", { duration: i.duration }) : "—"}</span>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        )}

        <PaginationControls
          page={pagination.page}
          totalPages={pagination.totalPages}
          limit={pagination.limit}
          total={pagination.total}
          onPageChange={pagination.setPage}
          onLimitChange={pagination.setLimit}
        />
      </SuperAgentSection>
    </div>
  );
}
