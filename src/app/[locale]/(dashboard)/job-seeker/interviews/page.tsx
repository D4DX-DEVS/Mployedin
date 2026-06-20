"use client";

import { useEffect, useState, useCallback } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Video, MapPin, Calendar, Clock, ExternalLink, CheckCircle, AlertCircle, Check, X, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/shared/PageHeader";
import { PaginationControls } from "@/components/shared/PaginationControls";
import { usePagination } from "@/hooks/usePagination";
import { useTableExport } from "@/hooks/useTableExport";
import { TableToolbar } from "@/components/shared/TableToolbar";
import { useDebounce } from "@/hooks/useDebounce";
import type { ExportColumn } from "@/lib/export";

interface Interview {
  _id: string;
  applicationId: string;
  jobTitle?: string;
  companyName?: string;
  type: "video" | "offline" | "hybrid";
  scheduledAt: string;
  duration: 15 | 30 | 45 | 60;
  meetLink?: string;
  location?: string;
  notes?: string;
  status: string;
  outcome?: string;
  rescheduleCount: number;
  candidateResponse?: "pending" | "confirmed" | "declined" | "reschedule_requested";
  candidateResponseAt?: string;
  candidateRescheduleNote?: string;
}

export default function InterviewsPage() {
  const t = useTranslations("jobSeekerInterviews");
  const locale = useLocale();
  const numberLocale = locale === "ar" ? "ar-SA" : "en-US";
  const [interviews, setInterviews] = useState<Interview[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const debouncedSearch = useDebounce(searchTerm, 400);
  const pagination = usePagination();

  useEffect(() => {
    document.title = t("documentTitle");
  }, [t]);

  const fetchInterviews = useCallback(async () => {
    setLoading(true);
    try {
      const params = pagination.paginationParams();
      if (debouncedSearch) params.set("search", debouncedSearch);
      const res = await fetch(`/api/interviews?${params}`);
      if (res.ok) {
        const data = await res.json();
        const items = data.interviews ?? data.items ?? [];
        setInterviews(items);
        pagination.updateTotal(data.total ?? items.length);
      }
    } finally {
      setLoading(false);
    }
  }, [pagination.page, pagination.limit, debouncedSearch]);

  useEffect(() => { fetchInterviews(); }, [fetchInterviews]);

  // Filter out legacy "rescheduled" rows (superseded by in-place updates)
  const activeInterviews = interviews.filter((i) => i.status !== "rescheduled");

  const now = new Date();
  const upcoming = activeInterviews.filter((i) => new Date(i.scheduledAt) >= now && i.status !== "cancelled");
  const past = activeInterviews.filter((i) => new Date(i.scheduledAt) < now || i.status === "cancelled");

  const exportData = interviews.map((iv) => ({
    jobTitle: iv.jobTitle ?? "",
    company: iv.companyName ?? "",
    type: t(`type.${iv.type}`),
    scheduledAt: new Date(iv.scheduledAt).toLocaleString(numberLocale),
    duration: t("minutesShort", { count: iv.duration.toLocaleString(numberLocale) }),
    status: iv.status,
    outcome: iv.outcome ?? "",
    response: iv.candidateResponse && iv.candidateResponse !== "pending" ? t(`response.${iv.candidateResponse}`) : "",
  }));

  const exportColumns = [
    { header: t("export.jobTitle"), key: "jobTitle" },
    { header: t("export.company"), key: "company" },
    { header: t("export.type"), key: "type" },
    { header: t("export.scheduledAt"), key: "scheduledAt" },
    { header: t("export.duration"), key: "duration" },
    { header: t("export.status"), key: "status" },
    { header: t("export.outcome"), key: "outcome" },
    { header: t("export.response"), key: "response" },
  ];

  const { handleExportCsv, handleExportExcel, handleExportPdf } = useTableExport({
    data: exportData as unknown as Record<string, unknown>[],
    columns: exportColumns as unknown as ExportColumn<Record<string, unknown>>[],
    filename: "my-interviews",
    title: t("export.title"),
  });

  return (
    <div className="page-container">
      <PageHeader
        title={t("title")}
        description={t("summary", { upcoming: upcoming.length.toLocaleString(numberLocale), past: past.length.toLocaleString(numberLocale) })}
      />

      <TableToolbar
        search={searchTerm}
        onSearchChange={(v) => { setSearchTerm(v); pagination.resetPage(); }}
        searchPlaceholder={t("searchPlaceholder")}
        onExportCsv={handleExportCsv}
        onExportExcel={handleExportExcel}
        onExportPdf={handleExportPdf}
        className="mb-4"
      />

      {loading ? (
        <div className="space-y-3 sm:space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="card-base animate-pulse h-24 sm:h-28" />
          ))}
        </div>
      ) : interviews.length === 0 ? (
        <div className="card-base text-center py-10 sm:py-16">
          <Video className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
          <h3 className="font-semibold mb-1">{t("emptyTitle")}</h3>
          <p className="text-sm text-muted-foreground">
            {t("emptyDescription")}
          </p>
        </div>
      ) : (
        <>
          {upcoming.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-sm font-semibold text-foreground">{t("upcoming")}</h2>
              {upcoming.map((iv) => <InterviewCard key={iv._id} interview={iv} upcoming onRefresh={fetchInterviews} />)}
            </section>
          )}
          {past.length > 0 && (
            <section className="space-y-3 mt-6">
              <h2 className="text-sm font-semibold text-muted-foreground">{t("past")}</h2>
              {past.map((iv) => <InterviewCard key={iv._id} interview={iv} upcoming={false} onRefresh={fetchInterviews} />)}
            </section>
          )}
        </>
      )}

      <PaginationControls
        page={pagination.page}
        totalPages={pagination.totalPages}
        total={pagination.total}
        limit={pagination.limit}
        onPageChange={pagination.setPage}
        onLimitChange={pagination.setLimit}
      />
    </div>
  );
}

function InterviewCard({ interview: iv, upcoming, onRefresh }: { interview: Interview; upcoming: boolean; onRefresh: () => void }) {
  const t = useTranslations("jobSeekerInterviews");
  const locale = useLocale();
  const numberLocale = locale === "ar" ? "ar-SA" : "en-US";
  const [responding, setResponding] = useState(false);
  const [showReschedule, setShowReschedule] = useState(false);
  const [rescheduleNote, setRescheduleNote] = useState("");

  const dt = new Date(iv.scheduledAt);
  const dateStr = dt.toLocaleDateString(numberLocale, { weekday: "short", month: "short", day: "numeric", year: "numeric" });
  const timeStr = dt.toLocaleTimeString(numberLocale, { hour: "2-digit", minute: "2-digit" });

  const typeIcon = iv.type === "video" ? Video : MapPin;
  const TypeIcon = typeIcon;

  const isToday = new Date().toDateString() === dt.toDateString();
  const minutesUntil = Math.floor((dt.getTime() - Date.now()) / 60000);

  const canRespond = upcoming && (!iv.candidateResponse || iv.candidateResponse === "pending") &&
    ["scheduled", "rescheduled"].includes(iv.status);

  async function handleRespond(response: "confirmed" | "declined" | "reschedule_requested") {
    setResponding(true);
    try {
      const res = await fetch(`/api/interviews/${iv._id}/respond`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          response,
          ...(response === "reschedule_requested" && { rescheduleNote: rescheduleNote.trim() }),
        }),
      });
      if (res.ok) {
        setShowReschedule(false);
        setRescheduleNote("");
        onRefresh();
      }
    } finally {
      setResponding(false);
    }
  }

  const responseLabel = iv.candidateResponse && iv.candidateResponse !== "pending" ? t(`response.${iv.candidateResponse}`) : null;

  const responseColor = iv.candidateResponse === "confirmed" ? "text-emerald-600" :
    iv.candidateResponse === "declined" ? "text-red-600" :
    iv.candidateResponse === "reschedule_requested" ? "text-amber-600" : "";

  return (
    <div className={`card-base ${upcoming ? "border-primary/30 bg-primary/5" : "opacity-80"}`}>
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <h3 className="font-semibold">{iv.jobTitle ?? t("interviewFallback")}</h3>
            {iv.companyName && (
              <span className="text-sm text-muted-foreground">{t("companyAt", { company: iv.companyName })}</span>
            )}
            <Badge variant={iv.type === "video" ? "secondary" : "outline"} className="text-xs capitalize">
              <TypeIcon className="w-3 h-3 me-1" /> {t(`type.${iv.type}`)}
            </Badge>
            {responseLabel && (
              <Badge variant="outline" className={`text-xs ${responseColor}`}>
                {responseLabel}
              </Badge>
            )}
          </div>

          <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <Calendar className="w-3 h-3" />
              {isToday ? <strong className="text-primary">{t("today")}</strong> : dateStr}
            </span>
            <span className="flex items-center gap-1">
              <Clock className="w-3 h-3" /> {timeStr} · {t("minutesShort", { count: iv.duration.toLocaleString(numberLocale) })}
            </span>
          </div>

          {/* Location for in-person / hybrid */}
          {iv.location && (iv.type === "offline" || iv.type === "hybrid") && (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-1.5">
              <MapPin className="w-3 h-3 shrink-0 text-primary/70" />
              <span>{iv.location}</span>
            </div>
          )}

          {/* Meet link for video / hybrid */}
          {iv.meetLink && (iv.type === "video" || iv.type === "hybrid") && (
            <div className="flex items-center gap-1.5 text-xs mt-1.5">
              <Video className="w-3 h-3 shrink-0 text-primary/70" />
              <a href={iv.meetLink} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline inline-flex items-center gap-1">
                {t("meetingLink")} <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          )}

          {/* Countdown for today */}
          {upcoming && isToday && minutesUntil > 0 && minutesUntil < 60 && (
            <div className="mt-2 flex items-center gap-1.5 text-xs text-amber-600 font-medium">
              <AlertCircle className="w-3.5 h-3.5" />
              {t("startingIn", { count: minutesUntil.toLocaleString(numberLocale) })}
            </div>
          )}

          {iv.notes && (
            <p className="text-xs text-muted-foreground mt-2">{iv.notes}</p>
          )}

          {!upcoming && iv.outcome && (
            <div className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
              <CheckCircle className="w-3.5 h-3.5 text-emerald-500" />
              {t("outcome")} <span className="capitalize">{iv.outcome}</span>
            </div>
          )}

          {/* Candidate response actions */}
          {canRespond && !showReschedule && (
            <div className="flex flex-col sm:flex-row gap-2 mt-3 pt-3 border-t border-border">
              <Button size="sm" onClick={() => handleRespond("confirmed")} disabled={responding} className="flex-1 sm:flex-none">
                <Check className="w-3.5 h-3.5 me-1" /> {t("confirm")}
              </Button>
              <Button size="sm" variant="outline" onClick={() => setShowReschedule(true)} disabled={responding} className="flex-1 sm:flex-none">
                <RotateCcw className="w-3.5 h-3.5 me-1" /> {t("reschedule")}
              </Button>
              <Button size="sm" variant="ghost" className="text-destructive hover:bg-destructive/10 flex-1 sm:flex-none"
                onClick={() => handleRespond("declined")} disabled={responding}>
                <X className="w-3.5 h-3.5 me-1" /> {t("decline")}
              </Button>
            </div>
          )}

          {/* Reschedule form */}
          {canRespond && showReschedule && (
            <div className="mt-3 pt-3 border-t border-border space-y-2">
              <label className="text-xs font-medium">{t("rescheduleReasonLabel")}</label>
              <textarea
                className="w-full h-16 px-3 py-2 text-sm border border-border rounded-lg bg-background focus:outline-none focus:ring-1 focus:ring-primary/40 resize-none"
                placeholder={t("reschedulePlaceholder")}
                value={rescheduleNote}
                onChange={(e) => setRescheduleNote(e.target.value)}
                maxLength={500}
              />
              <div className="flex gap-2">
                <Button size="sm" onClick={() => handleRespond("reschedule_requested")}
                  disabled={responding || !rescheduleNote.trim()}>
                  {responding ? t("sending") : t("requestReschedule")}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => { setShowReschedule(false); setRescheduleNote(""); }}>
                  {t("cancel")}
                </Button>
              </div>
            </div>
          )}

          {iv.candidateRescheduleNote && (
            <div className="mt-2 bg-amber-50 text-amber-800 text-xs p-2 rounded">
              {t("rescheduleReason", { reason: iv.candidateRescheduleNote })}
            </div>
          )}
        </div>

        {upcoming && iv.type !== "offline" && iv.meetLink && (
          <a href={iv.meetLink} target="_blank" rel="noopener noreferrer">
            <Button size="sm" className="shrink-0">
              <Video className="w-4 h-4 me-1.5" /> {t("join")}
              <ExternalLink className="w-3 h-3 ms-1.5" />
            </Button>
          </a>
        )}
      </div>
    </div>
  );
}
