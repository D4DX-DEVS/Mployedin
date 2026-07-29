"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { AnimatePresence, motion } from "framer-motion";
import { FileText, MapPin, Calendar, Clock, ChevronRight, ChevronDown, Star, LogOut, Loader2, X, AlertTriangle, Search, SlidersHorizontal, Building2, Video, DollarSign, Briefcase, ExternalLink, ClipboardList } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { PaginationControls } from "@/components/shared/PaginationControls";
import { PageHeader } from "@/components/shared/PageHeader";
import { EmptyState } from "@/components/shared/EmptyState";
import { ListSkeleton } from "@/components/shared/ListSkeleton";
import { scoreTier } from "@/lib/ui/statusColors";
import { usePagination } from "@/hooks/usePagination";
import { useDebounce } from "@/hooks/useDebounce";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Textarea } from "@/components/ui/textarea";
import { DateTimePicker } from "@/components/ui/date-time-picker";
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { formatLocalizedLocation } from "@/lib/i18n/locations";

interface ApplicationJob {
  _id: string;
  title: string;
  location: string | { isRemote?: boolean; city?: string; country?: string };
  salary?: { min: number; max: number; currency: string };
  employerId?: string | { _id: string; companyName?: string; logo?: string };
}

interface LatestInterview {
  _id: string;
  type: "video" | "offline" | "hybrid";
  scheduledAt: string;
  duration: number;
  location?: string;
  meetLink?: string;
  status: string;
  candidateResponse?: string;
  outcome?: string;
  instructions?: string;
}

interface LatestOffer {
  _id: string;
  salary?: { amount: number; currency: string; period: string };
  startDate?: string;
  benefits?: string;
  status: string;
  expiresAt?: string;
}

interface PlacementInfo {
  _id: string;
  placedAt?: string;
  startDate?: string;
  salary?: number;
  currency?: string;
}

interface Application {
  _id: string;
  jobId: ApplicationJob;
  status: string;
  aiMatchScore?: number;
  appliedAt: string;
  coverLetter?: string;
  statusHistory: Array<{ status: string; changedAt: string; note?: string }>;
  latestInterview?: LatestInterview;
  latestOffer?: LatestOffer;
  placement?: PlacementInfo;
}

const STATUS_TABS = [
  "all",
  "applied",
  "shortlisted",
  "interview_scheduled",
  "selected",
  "offer",
  "hired",
  "rejected",
] as const;

function formatApplicationSalary(salary: ApplicationJob["salary"] | undefined, numberLocale: string) {
  if (!salary?.min || !salary?.max || !salary.currency) return null;

  try {
    const formatter = new Intl.NumberFormat(numberLocale, {
      style: "currency",
      currency: salary.currency,
      notation: "compact",
      maximumFractionDigits: 1,
    });

    return `${formatter.format(salary.min)} - ${formatter.format(salary.max)}`;
  } catch {
    return `${salary.min.toLocaleString(numberLocale)} - ${salary.max.toLocaleString(numberLocale)} ${salary.currency}`;
  }
}

export default function ApplicationsPage() {
  const { locale } = useParams<{ locale: string }>();
  const t = useTranslations("jobSeekerApplications");
  const router = useRouter();
  const [applications, setApplications] = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("all");
  const [overallTotal, setOverallTotal] = useState(0);
  const [searchTerm, setSearchTerm] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const debouncedSearch = useDebounce(searchTerm, 400);
  const pagination = usePagination();
  const { paginationParams, updateTotal, resetPage } = pagination;
  const numberLocale = locale === "ar" ? "ar-SA" : "en-US";
  const formatNumber = (value: number) => value.toLocaleString(numberLocale);

  useEffect(() => {
    document.title = t("documentTitle");
  }, [t]);

  const fetchApplications = useCallback(async () => {
    setLoading(true);
    try {
      const params = paginationParams();
      if (activeTab !== "all") params.set("status", activeTab);
      if (debouncedSearch) params.set("search", debouncedSearch);
      if (dateFrom) params.set("dateFrom", dateFrom);
      if (dateTo) params.set("dateTo", dateTo);

      const res = await fetch(`/api/applications?${params}`);
      if (res.ok) {
        const data = await res.json();
        setApplications(data.applications);
        updateTotal(data.pagination?.total ?? 0);
        if (activeTab === "all" && !debouncedSearch && !dateFrom && !dateTo) {
          setOverallTotal(data.pagination?.total ?? 0);
        }
      } else {
        // 4xx/5xx previously fell through silently — stale list, no feedback.
        setApplications([]);
        toast.error(t("loadFailed"));
      }
    } catch {
      // Network failure previously surfaced as an unhandled rejection with an
      // unexplained empty screen.
      setApplications([]);
      toast.error(t("loadFailed"));
    } finally {
      setLoading(false);
    }
  }, [activeTab, debouncedSearch, dateFrom, dateTo, paginationParams, updateTotal]);

  useEffect(() => {
    fetchApplications();
  }, [fetchApplications]);

  function handleTabChange(val: string) {
    setActiveTab(val);
    resetPage();
  }

  function clearFilters() {
    setSearchTerm("");
    setDateFrom("");
    setDateTo("");
    resetPage();
  }

  const hasActiveFilters = !!debouncedSearch || !!dateFrom || !!dateTo;


  const activeStatus = STATUS_TABS.includes(activeTab as (typeof STATUS_TABS)[number]) ? activeTab : STATUS_TABS[0];
  const activeStatusLabel = t(`status.${activeStatus}`);
  const pageSummary = pagination.totalPages > 0
    ? `${formatNumber(pagination.page)}/${formatNumber(pagination.totalPages)}`
    : formatNumber(pagination.page);
  const activeApplicationsCount = applications.filter((application) => !TERMINAL_STATUSES.includes(application.status)).length;

  return (
    /* max-sm:px-0 — the job-seeker layout already pads 16px; page-container's own
       24px stacked on top of it and left rows only 304px wide on a 390px screen. */
    <div className="page-container max-w-[1240px] gap-2 pt-3 max-sm:px-0 md:gap-3 md:pt-4 lg:gap-3 lg:pt-4">
      {/* Flattened below sm — the outer shell around a list of cards read as a
          box-in-box on phones and ate horizontal room from every row. */}
      <section className="card-base overflow-hidden rounded-[24px] border border-border/70 p-0 shadow-[0_8px_24px_rgba(15,23,42,0.05)] max-sm:rounded-none max-sm:border-0 max-sm:bg-transparent max-sm:shadow-none">
        <div className="border-b border-border/60 px-3.5 py-3 max-sm:px-0 sm:px-4 sm:py-3.5 lg:px-5 lg:py-4">
          <div className="flex flex-col gap-2.5">
            <div className="flex flex-col gap-1.5 lg:flex-row lg:items-center lg:justify-between">
              <PageHeader
                title={t("title")}
              />

              {/* Counters are reference info, not navigation — kept off phones
                  where they pushed the actual list below the fold. */}
              <div className="hidden flex-wrap items-center gap-x-3 gap-y-1 text-xs font-medium text-muted-foreground sm:flex sm:text-sm">
                <span><span className="text-foreground">{t("summary.total")}</span> {formatNumber(overallTotal)}</span>
                <span aria-hidden="true" className="hidden text-muted-foreground/60 sm:inline">|</span>
                <span><span className="text-foreground">{t("summary.active")}</span> {formatNumber(activeApplicationsCount)}</span>
                <span aria-hidden="true" className="hidden text-muted-foreground/60 sm:inline">|</span>
                <span><span className="text-foreground">{t("summary.progress")}</span> {pageSummary}</span>
                <span aria-hidden="true" className="hidden text-muted-foreground/60 sm:inline">|</span>
                <span><span className="text-foreground">{t("summary.view")}</span> {activeStatusLabel}</span>
              </div>
            </div>

            {/* Search + Filters share one row on phones instead of stacking. */}
            <div className="flex flex-row flex-wrap items-center gap-2 lg:gap-2.5">
              <div className="relative min-w-0 flex-1 lg:max-w-[420px] xl:max-w-[520px]">
                <label htmlFor="applications-search" className="sr-only">{t("searchLabel")}</label>
                <Search className="absolute start-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="applications-search"
                  type="text"
                  placeholder={t("searchPlaceholder")}
                  value={searchTerm}
                  onChange={(e) => { setSearchTerm(e.target.value); resetPage(); }}
                  className="h-9 rounded-full border-border/70 bg-background/95 ps-8 pe-8 text-sm shadow-sm"
                />
                {searchTerm && (
                  <button
                    type="button"
                    onClick={() => { setSearchTerm(""); resetPage(); }}
                    className="absolute end-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>

              <Button
                variant="outline"
                size="sm"
                className={cn(
                  "h-9 shrink-0 gap-1.5 rounded-full px-3.5 text-sm",
                  hasActiveFilters && "border-primary/40 bg-primary/5 text-primary"
                )}
                onClick={() => setShowFilters(!showFilters)}
              >
                <SlidersHorizontal className="h-3.5 w-3.5" />
                {t("filters")}
                {hasActiveFilters && (
                  <span aria-hidden="true" className="ms-0.5 flex h-4.5 min-w-4.5 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground">
                    {formatNumber([searchTerm, dateFrom, dateTo].filter(Boolean).length)}
                  </span>
                )}
              </Button>

              <div className="w-full overflow-x-auto scrollbar-none lg:w-auto lg:flex-1">
                <div
                  role="tablist"
                  aria-label={t("statusFiltersLabel")}
                  className="inline-flex min-w-full items-center gap-1 rounded-full border border-border/70 bg-muted/20 p-1 lg:min-w-0"
                >
                  {STATUS_TABS.map((tab) => {
                    const isActive = tab === activeTab;

                    return (
                      <button
                        key={tab}
                        id={`applications-tab-${tab}`}
                        type="button"
                        role="tab"
                        aria-selected={isActive}
                        aria-controls={`applications-panel-${tab}`}
                        onClick={() => handleTabChange(tab)}
                        className={cn(
                          "relative shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition-colors duration-200 sm:px-3.5 sm:text-sm",
                          isActive
                            ? "text-primary-foreground"
                            : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                        )}
                      >
                        {isActive && (
                          <motion.span
                            layoutId="applications-status-pill"
                            className="absolute inset-0 rounded-full bg-primary shadow-[0_10px_22px_rgba(37,99,235,0.24)]"
                            transition={{ type: "spring", stiffness: 420, damping: 34 }}
                          />
                        )}
                        <span className="relative z-10">{t(`status.${tab}`)}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

          {/* Date Filters Panel */}
          {showFilters && (
            <div className="mt-2.5 flex flex-col gap-2 rounded-2xl border border-border/60 bg-background p-3 shadow-sm sm:flex-row sm:items-end">
              <div className="flex-1 space-y-1.5">
                <label htmlFor="applications-date-from" className="text-xs font-medium text-muted-foreground">{t("appliedFrom")}</label>
                <DateTimePicker
                  mode="date"
                  value={dateFrom}
                  onChange={(val) => { setDateFrom(val); resetPage(); }}
                  className="h-[34px]"
                />
              </div>
              <div className="flex-1 space-y-1.5">
                <label htmlFor="applications-date-to" className="text-xs font-medium text-muted-foreground">{t("appliedTo")}</label>
                <DateTimePicker
                  mode="date"
                  value={dateTo}
                  onChange={(val) => { setDateTo(val); resetPage(); }}
                  className="h-[34px]"
                />
              </div>
              {hasActiveFilters && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-[34px] shrink-0 gap-1 rounded-lg px-2.5 text-xs text-muted-foreground hover:text-foreground"
                  onClick={clearFilters}
                >
                  <X className="h-3.5 w-3.5" /> {t("clearAll")}
                </Button>
              )}
            </div>
          )}
        </div>

        <div className="px-3.5 py-3 max-sm:px-0 max-sm:pt-2 sm:px-4 sm:py-3.5 lg:px-5 lg:py-4">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={activeTab}
              id={`applications-panel-${activeTab}`}
              role="tabpanel"
              aria-labelledby={`applications-tab-${activeTab}`}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.22, ease: "easeOut" }}
            >
              {loading ? (
                <ListSkeleton count={5} layout="list" itemClassName="h-20" className="space-y-2.5" />
              ) : applications.length === 0 ? (
                <EmptyState
                  icon={FileText}
                  title={t("emptyTitle")}
                  description={
                    activeTab === "all"
                      ? t("emptyAll")
                      : t("emptyStatus", { status: activeStatusLabel.toLowerCase() })
                  }
                  action={
                    <Button size="sm" onClick={() => router.push(`/${locale}/job-seeker/jobs`)}>
                      {t("browseJobs")}
                    </Button>
                  }
                />
              ) : (
                <div className="space-y-2.5">
                  {applications.map((app) => (
                    <ApplicationCard key={app._id} app={app} locale={locale} onWithdrawn={fetchApplications} />
                  ))}
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </div>

        <div className="border-t border-border/60 bg-muted/10 px-3.5 py-3 max-sm:bg-transparent max-sm:px-0 sm:px-4 sm:py-3.5 lg:px-5">
          <PaginationControls
            page={pagination.page}
            totalPages={pagination.totalPages}
            total={pagination.total}
            limit={pagination.limit}
            onPageChange={pagination.setPage}
            onLimitChange={pagination.setLimit}
          />
        </div>
      </section>
    </div>
  );
}

const TERMINAL_STATUSES = ["hired", "rejected", "withdrawn"];

const WITHDRAWAL_REASONS = [
  { value: "accepted_elsewhere", label: "Accepted offer elsewhere" },
  { value: "salary_too_low", label: "Salary expectation not met" },
  { value: "bad_experience", label: "Poor application experience" },
  { value: "too_slow_process", label: "Process too slow" },
  { value: "changed_mind", label: "Changed my mind" },
  { value: "personal_reasons", label: "Personal reasons" },
  { value: "other", label: "Other" },
];

function ApplicationCard({
  app,
  locale,
  onWithdrawn,
}: {
  app: Application;
  locale: string;
  onWithdrawn: () => void;
}) {
  const t = useTranslations("jobSeekerApplications");
  const numberLocale = locale === "ar" ? "ar-SA" : "en-US";
  const job = app.jobId;
  const employer = typeof job?.employerId === "object" ? job.employerId : null;
  const companyName = employer?.companyName;
  const companyLogo = employer?.logo;
  const appliedDate = new Date(app.appliedAt).toLocaleDateString(numberLocale, {
    month: "short", day: "numeric",
  });
  const locationLabel = formatLocalizedLocation(job?.location, locale, {
    remoteLabel: t("remote"),
    fallback: t("locationFlexible"),
  });
  const salaryLabel = formatApplicationSalary(job?.salary, numberLocale);
  const latestStatusEntry = app.statusHistory?.[app.statusHistory.length - 1];
  const recentStatuses = app.statusHistory?.slice(-3) ?? [];
  const hasExpandableDetails = recentStatuses.length > 0 || !!latestStatusEntry?.note || !!app.coverLetter || !!app.latestInterview || !!app.latestOffer || !!app.placement;
  const withdrawalReasonOptions = WITHDRAWAL_REASONS.map((reason) => ({
    value: reason.value,
    label: t(`withdrawal.reasons.${reason.value}`),
  }));
  const formatDetailDate = (value: string) => new Date(value).toLocaleDateString(numberLocale, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  const formatDetailTime = (value: string) => new Date(value).toLocaleTimeString(numberLocale, {
    hour: "2-digit",
    minute: "2-digit",
  });
  const formatCurrency = (amount: number, currency: string) => new Intl.NumberFormat(numberLocale, {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(amount);

  const [showWithdraw, setShowWithdraw] = useState(false);
  const [withdrawReason, setWithdrawReason] = useState("");
  const [withdrawNote, setWithdrawNote] = useState("");
  const [withdrawing, setWithdrawing] = useState(false);
  const [withdrawError, setWithdrawError] = useState("");
  const [showDetails, setShowDetails] = useState(false);

  // Close the withdrawal dialog on Escape for keyboard accessibility.
  useEffect(() => {
    if (!showWithdraw) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setShowWithdraw(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [showWithdraw]);

  async function handleWithdraw() {
    if (!withdrawReason) return;
    setWithdrawing(true);
    setWithdrawError("");
    try {
      const res = await fetch(`/api/applications/${app._id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: "withdrawn",
          withdrawalReason: withdrawReason,
          withdrawalNote: withdrawNote.trim() || undefined,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? t("withdraw"));
      }
      setShowWithdraw(false);
      onWithdrawn();
    } catch (e) {
      setWithdrawError(e instanceof Error ? e.message : t("withdraw"));
    } finally {
      setWithdrawing(false);
    }
  }

  const isActive = !TERMINAL_STATUSES.includes(app.status);
  const jobTitle = job?.title ?? t("jobFallback");
  const cardLabel = showDetails
    ? t("hideDetails", { job: jobTitle })
    : t("viewDetails", { job: jobTitle });

  return (
    <>
      <div className="card-base rounded-[18px] border border-border/70 px-3 py-2.5 transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/25 hover:shadow-[0_12px_26px_rgba(15,23,42,0.06)] sm:px-3.5 sm:py-3">
        <button
          type="button"
          className="group flex w-full items-center gap-2.5 text-left"
          aria-expanded={showDetails}
          aria-controls={`application-details-${app._id}`}
          aria-label={cardLabel}
          onClick={() => setShowDetails((current) => !current)}
        >
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-border/60 bg-background/90 shadow-sm sm:h-10 sm:w-10">
            {companyLogo ? (
              <img src={companyLogo} alt={companyName ?? t("companyFallback")} className="h-7 w-7 rounded-lg object-contain sm:h-8 sm:w-8" />
            ) : (
              <Building2 className="h-4 w-4 text-muted-foreground sm:h-[18px] sm:w-[18px]" />
            )}
          </div>

          <div className="flex min-w-0 flex-1 items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <div className="flex min-w-0 items-start gap-2">
                <h3 className="truncate text-[15px] font-semibold leading-5 text-foreground transition-colors group-hover:text-primary sm:text-base">
                  {jobTitle}
                </h3>
              </div>

              <div className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[12px] leading-4 text-muted-foreground sm:flex-nowrap sm:gap-x-2">
                <span className="truncate font-medium text-muted-foreground">{companyName ?? t("companyFallback")}</span>

                {/* Location and salary drop off phones so the row stays 2 lines;
                    both are still shown in the expanded details. */}
                {locationLabel && (
                  <>
                    <span aria-hidden="true" className="hidden text-muted-foreground/60 sm:inline">•</span>
                    <span className="hidden min-w-0 items-center gap-1 truncate sm:inline-flex">
                      <MapPin className="h-3 w-3 shrink-0" />
                      <span className="truncate">{locationLabel}</span>
                    </span>
                  </>
                )}

                {salaryLabel && (
                  <>
                    <span aria-hidden="true" className="hidden text-muted-foreground/60 sm:inline">•</span>
                    <span className="hidden truncate sm:inline">{salaryLabel}</span>
                  </>
                )}

                <>
                  <span aria-hidden="true" className="text-muted-foreground/60">•</span>
                  <span className="inline-flex items-center gap-1 whitespace-nowrap">
                    <Calendar className="h-3 w-3 shrink-0" />
                    {t("appliedDate", { date: appliedDate })}
                  </span>
                </>

                <StatusBadge status={app.status} size="sm" className="shrink-0" />
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-1.5">
              {app.aiMatchScore != null && app.aiMatchScore > 0 && (
                <span
                  className={cn(
                    "inline-flex items-center rounded-full border px-2 py-1 text-[11px] font-semibold leading-none shadow-sm",
                    scoreTier(app.aiMatchScore)
                  )}
                >
                  {t("match", { score: app.aiMatchScore.toLocaleString(numberLocale) })}
                </span>
              )}
              <ChevronDown
                className={cn(
                  "h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:text-foreground",
                  showDetails && "rotate-180"
                )}
              />
            </div>
          </div>
        </button>

        {(isActive || TERMINAL_STATUSES.includes(app.status)) && (
          <div className="mt-0.5 flex items-center justify-end gap-3 sm:mt-1.5">
            {TERMINAL_STATUSES.includes(app.status) && (
              <Button variant="ghost" size="sm" className="h-6 gap-1 px-0 text-[12px] text-amber-600 hover:text-amber-700" asChild>
                <Link href={`/${locale}/job-seeker/applications/${app._id}/feedback`}>
                  <Star className="h-3.5 w-3.5" /> {t("rateExperience")}
                </Link>
              </Button>
            )}

            {isActive && (
              <Button
                variant="ghost"
                size="sm"
                className="h-6 gap-1 px-0 text-[12px] text-destructive hover:text-destructive"
                onClick={() => setShowWithdraw(true)}
              >
                <LogOut className="h-3.5 w-3.5" /> {t("withdraw")}
              </Button>
            )}
          </div>
        )}

        {showDetails && hasExpandableDetails && (
          <div
            id={`application-details-${app._id}`}
            className="mt-2 space-y-2 rounded-[16px] border border-border/60 bg-muted/10 p-2.5"
          >
            {recentStatuses.length > 0 && (
              <div className="flex flex-wrap items-center gap-2">
                {recentStatuses.map((historyItem, index) => (
                  <span key={`${historyItem.status}-${historyItem.changedAt}`} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    {index > 0 && <ChevronRight className="h-3 w-3" />}
                    <StatusBadge status={historyItem.status} size="sm" />
                  </span>
                ))}
              </div>
            )}

            {latestStatusEntry?.note && (
              <div className="flex items-center gap-1.5 rounded-[18px] border border-border/60 bg-background/80 px-3 py-2 text-xs text-muted-foreground">
                <Clock className="h-3.5 w-3.5 flex-shrink-0" />
                {latestStatusEntry.note}
              </div>
            )}

            {/* Interview Details */}
            {app.latestInterview && (
              <div className="rounded-[14px] border border-primary/20 bg-primary/5 px-3 py-2.5 space-y-1.5">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-primary">
                  <Video className="h-3.5 w-3.5" />
                  {t("details.interview")}
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Calendar className="h-3 w-3 shrink-0" />
                    {new Date(app.latestInterview.scheduledAt).toLocaleDateString(numberLocale, { weekday: "short", month: "short", day: "numeric", year: "numeric" })}
                  </span>
                  <span className="flex items-center gap-1">
                    <Clock className="h-3 w-3 shrink-0" />
                    {formatDetailTime(app.latestInterview.scheduledAt)} · {t("details.minutesShort", { count: app.latestInterview.duration.toLocaleString(numberLocale) })}
                  </span>
                  <span className="inline-flex items-center gap-1 capitalize rounded-full border border-border/60 px-2 py-0.5 text-[11px] font-medium">
                    {app.latestInterview.type === "video" ? <Video className="h-3 w-3" /> : <MapPin className="h-3 w-3" />}
                    {app.latestInterview.type}
                  </span>
                </div>
                {(app.latestInterview.location || app.latestInterview.meetLink) && (
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <MapPin className="h-3 w-3 shrink-0" />
                    {app.latestInterview.type !== "offline" && app.latestInterview.meetLink ? (
                      <a href={app.latestInterview.meetLink} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline inline-flex items-center gap-1">
                        {t("details.joinMeeting")} <ExternalLink className="h-3 w-3" />
                      </a>
                    ) : (
                      <span>{app.latestInterview.location}</span>
                    )}
                    {app.latestInterview.type === "hybrid" && app.latestInterview.location && app.latestInterview.meetLink && (
                      <>
                        <span className="text-muted-foreground/60">|</span>
                        <span>{app.latestInterview.location}</span>
                      </>
                    )}
                  </div>
                )}
                {app.latestInterview.instructions && (
                  <p className="text-xs text-muted-foreground italic">{app.latestInterview.instructions}</p>
                )}
                {app.latestInterview.candidateResponse && app.latestInterview.candidateResponse !== "pending" && (
                  <div className={cn(
                    "text-xs font-medium",
                    app.latestInterview.candidateResponse === "confirmed" && "text-emerald-600",
                    app.latestInterview.candidateResponse === "declined" && "text-red-600",
                    app.latestInterview.candidateResponse === "reschedule_requested" && "text-amber-600"
                  )}>
                    {t("details.yourResponse", { response: t(`response.${app.latestInterview.candidateResponse}`) })}
                  </div>
                )}
                {app.latestInterview.outcome && (
                  <div className="text-xs text-muted-foreground">
                    {t("details.outcome")} <span className="capitalize font-medium">{app.latestInterview.outcome}</span>
                  </div>
                )}
              </div>
            )}

            {/* Offer Details */}
            {app.latestOffer && (
              <div className="rounded-[14px] border border-emerald-200 bg-emerald-50/50 px-3 py-2.5 space-y-1.5">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-700">
                  <DollarSign className="h-3.5 w-3.5" />
                  {t("details.offer")}
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  {app.latestOffer.salary && (
                    <span className="font-medium text-foreground">
                      {formatCurrency(app.latestOffer.salary.amount, app.latestOffer.salary.currency)} / {app.latestOffer.salary.period}
                    </span>
                  )}
                  {app.latestOffer.startDate && (
                    <span className="flex items-center gap-1">
                      <Calendar className="h-3 w-3 shrink-0" />
                      {t("details.start", { date: formatDetailDate(app.latestOffer.startDate) })}
                    </span>
                  )}
                  <span className={cn(
                    "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium border",
                    app.latestOffer.status === "pending" && "border-amber-200 bg-amber-50 text-amber-700",
                    app.latestOffer.status === "accepted" && "border-emerald-200 bg-emerald-50 text-emerald-700",
                    app.latestOffer.status === "declined" && "border-red-200 bg-red-50 text-red-700",
                    app.latestOffer.status === "expired" && "border-gray-200 bg-gray-50 text-gray-600",
                  )}>
                    {app.latestOffer.status.charAt(0).toUpperCase() + app.latestOffer.status.slice(1)}
                  </span>
                </div>
                {app.latestOffer.benefits && (
                  <p className="text-xs text-muted-foreground">{app.latestOffer.benefits}</p>
                )}
                {app.latestOffer.expiresAt && app.latestOffer.status === "pending" && (
                  <p className="text-[11px] text-amber-600">
                    {t("details.expires", { date: formatDetailDate(app.latestOffer.expiresAt) })}
                  </p>
                )}
              </div>
            )}

            {/* Placement Details */}
            {app.placement && (
              <div className="rounded-[14px] border border-blue-200 bg-blue-50/50 px-3 py-2.5 space-y-1.5">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-blue-700">
                  <Briefcase className="h-3.5 w-3.5" />
                  {t("details.placement")}
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  {app.placement.startDate && (
                    <span className="flex items-center gap-1">
                      <Calendar className="h-3 w-3 shrink-0" />
                      {t("details.start", { date: formatDetailDate(app.placement.startDate) })}
                    </span>
                  )}
                  {app.placement.salary && (
                    <span className="font-medium text-foreground">
                      {t("details.perMonth", { amount: formatCurrency(app.placement.salary, app.placement.currency ?? "AED") })}
                    </span>
                  )}
                </div>
                <Link
                  href={`/${locale}/job-seeker/onboarding`}
                  className="inline-flex w-fit items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-blue-700"
                >
                  <ClipboardList className="h-3.5 w-3.5" />
                  {t("details.onboardingCta")}
                </Link>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Withdrawal Modal */}
      {showWithdraw && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
          onClick={(e) => { if (e.target === e.currentTarget) setShowWithdraw(false); }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby={`withdraw-title-${app._id}`}
            aria-describedby={`withdraw-desc-${app._id}`}
            className="bg-background rounded-2xl shadow-2xl w-full max-w-md p-4 sm:p-6 space-y-4 max-h-[90vh] overflow-y-auto"
          >
            <div className="flex items-center justify-between">
              <h2 id={`withdraw-title-${app._id}`} className="font-semibold">{t("withdrawal.title")}</h2>
              <button
                type="button"
                onClick={() => setShowWithdraw(false)}
                aria-label={t("withdrawal.cancel")}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <p id={`withdraw-desc-${app._id}`} className="text-sm text-muted-foreground">
              {t("withdrawal.description", { job: jobTitle })}
            </p>

            <div className="space-y-1.5">
              <label className="text-sm font-medium">{t("withdrawal.reason")} <span className="text-destructive">{t("withdrawal.required")}</span></label>
              <SearchableSelect
                options={withdrawalReasonOptions}
                value={withdrawReason}
                onValueChange={setWithdrawReason}
                placeholder={t("withdrawal.selectReason")}
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium">
                {t("withdrawal.comments")} <span className="text-muted-foreground font-normal">({t("withdrawal.optional")})</span>
              </label>
              <Textarea
                placeholder={t("withdrawal.commentsPlaceholder")}
                value={withdrawNote}
                onChange={(e) => setWithdrawNote(e.target.value)}
                maxLength={500}
                rows={3}
                className="resize-none"
              />
            </div>

            {withdrawError && (
              <div className="flex items-center gap-2 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                {withdrawError}
              </div>
            )}

            <div className="flex gap-2 pt-2">
              <Button
                variant="destructive"
                className="flex-1 gap-2"
                onClick={handleWithdraw}
                disabled={!withdrawReason || withdrawing}
              >
                {withdrawing && <Loader2 className="w-4 h-4 animate-spin" />}
                {t("withdrawal.confirm")}
              </Button>
              <Button variant="outline" onClick={() => setShowWithdraw(false)} disabled={withdrawing}>
                {t("withdrawal.cancel")}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
