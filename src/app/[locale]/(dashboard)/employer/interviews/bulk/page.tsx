"use client";

import { useState } from "react";
import { Calendar, Search, Users, Clock, Send, CheckCircle, Loader2, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { PageHeader } from "@/components/shared/PageHeader";
import { DateTimePicker } from "@/components/ui/date-time-picker";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from "@/components/ui/select";
import { useShortlistedCandidates, useBulkScheduleInterviews } from "@/hooks/useInterviews";

interface Candidate {
  _id: string;
  name: string;
  email: string;
  jobTitle?: string;
  applicationId?: string;
  selected: boolean;
}

interface InterviewSlot {
  date: string;
  time: string;
  duration: number;
  type: "video" | "offline" | "hybrid";
  location?: string;
  meetLink?: string;
}

export default function EmployerBulkInterviewPage() {
  const t = useTranslations("employerInterviewsBulk");
  const [search, setSearch] = useState("");
  const [slot, setSlot] = useState<InterviewSlot>({
    date: "", time: "10:00", duration: 45, type: "video", meetLink: "", location: "",
  });
  const [result, setResult] = useState<{ sent: number; failed: number } | null>(null);
  const [jobId, setJobId] = useState("");

  const { data: rawApps = [], isLoading: loading } = useShortlistedCandidates(jobId);
  const bulkSchedule = useBulkScheduleInterviews();

  const [selections, setSelections] = useState<Record<string, boolean>>({});

  const candidates: Candidate[] = rawApps.map((app: {
    _id: string;
    jobSeekerId?: { _id?: string; userId?: { name?: string; email?: string } | string };
    jobId?: { title?: string };
  }) => {
    const user = typeof app.jobSeekerId?.userId === "object" ? app.jobSeekerId.userId : undefined;
    const candidateId = app.jobSeekerId?._id ?? app._id;

    return {
      _id: candidateId,
      name: user?.name ?? "Candidate",
      email: user?.email ?? "",
      jobTitle: (app.jobId as { title?: string } | undefined)?.title,
      applicationId: app._id,
      // Selection is keyed by the unique applicationId — a candidate can appear
      // once per job they applied to, so the candidate id is not unique here.
      selected: selections[app._id] ?? false,
    };
  });

  const filteredCandidates = candidates.filter(c =>
    !search || c.name.toLowerCase().includes(search.toLowerCase()) || c.email.toLowerCase().includes(search.toLowerCase())
  );

  const selectedCount = candidates.filter(c => c.selected).length;

  const toggleSelect = (id: string) =>
    setSelections(prev => ({ ...prev, [id]: !prev[id] }));

  const toggleAll = () => {
    const allSelected = filteredCandidates.every(c => c.selected);
    const updates: Record<string, boolean> = {};
    filteredCandidates.forEach(c => { updates[c.applicationId ?? c._id] = !allSelected; });
    setSelections(prev => ({ ...prev, ...updates }));
  };

  const handleSend = async () => {
    const selected = candidates.filter(c => c.selected);
    if (!selected.length || !slot.date || !slot.time) return;
    const scheduledAt = new Date(`${slot.date}T${slot.time}:00`).toISOString();
    try {
      const data = await bulkSchedule.mutateAsync({
        candidates: selected.map(c => ({ jobSeekerId: c._id, applicationId: c.applicationId! })),
        scheduledAt,
        duration: slot.duration,
        type: slot.type,
        location: slot.location,
        meetLink: slot.meetLink,
      });
      setResult({ sent: data.created ?? selected.length, failed: data.failed ?? 0 });
      setSelections({});
    } catch {
      // error handled by React Query
    }
  };

  return (
    <div className="page-container">
      <PageHeader
        title={t("title")}
        description={t("description")}
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Candidates Selection */}
        <div className="lg:col-span-2 card-base space-y-3 sm:space-y-4 panel-body">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 flex-1">
              <Search className="h-4 w-4 text-muted-foreground shrink-0" />
              <input value={search} onChange={e => setSearch(e.target.value)}
                placeholder={t("searchCandidates")} className="input-field flex-1" />
            </div>
            <span className="text-sm text-muted-foreground whitespace-nowrap">
              {t("selected", { count: selectedCount })}
            </span>
          </div>

          {loading ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3 p-2.5 rounded-lg border border-border">
                  <Skeleton className="h-4 w-4 rounded" />
                  <div className="flex-1 space-y-1.5">
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-3 w-48" />
                  </div>
                </div>
              ))}
            </div>
          ) : filteredCandidates.length === 0 ? (
            <p className="text-center py-8 text-sm text-muted-foreground">
              {t("noCandidates")}
            </p>
          ) : (
            <>
              <div className="flex items-center gap-2 pb-1 border-b">
                <input type="checkbox"
                  checked={filteredCandidates.length > 0 && filteredCandidates.every(c => c.selected)}
                  onChange={toggleAll} className="accent-primary" />
                <span className="text-xs text-muted-foreground">{t("selectAll", { count: filteredCandidates.length })}</span>
              </div>
              <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                {filteredCandidates.map(c => (
                  <label key={c.applicationId ?? c._id} className={`flex items-center gap-3 p-2.5 rounded-lg border cursor-pointer transition-all ${
                    c.selected ? "border-primary bg-primary/5" : "border-border hover:border-primary/30"
                  }`}>
                    <input type="checkbox" checked={c.selected} onChange={() => toggleSelect(c.applicationId ?? c._id)}
                      className="accent-primary shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{c.name}</p>
                      <p className="text-xs text-muted-foreground truncate">{c.email}</p>
                    </div>
                    {c.jobTitle && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground shrink-0 hidden sm:inline">
                        {c.jobTitle}
                      </span>
                    )}
                  </label>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Slot Configuration */}
        <div className="card-base space-y-3 sm:space-y-4 panel-body">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <Calendar className="h-4 w-4 text-primary" /> {t("interviewDetails")}
          </h3>

          <div className="space-y-3">
            <DateTimePicker
              label={t("date")}
              required
              mode="date"
              value={slot.date}
              onChange={(v) => setSlot(s => ({ ...s, date: v }))}
              minDate={new Date()}
              placeholder={t("pickDate")}
            />
            <div className="grid grid-cols-2 gap-2">
              <DateTimePicker
                label={t("time")}
                required
                mode="time"
                value={slot.time}
                onChange={(v) => setSlot(s => ({ ...s, time: v }))}
                placeholder={t("pickTime")}
              />
              <div>
                <label className="text-xs text-muted-foreground">{t("duration")}</label>
                <Select value={String(slot.duration)} onValueChange={v => setSlot(s => ({ ...s, duration: parseInt(v) }))}>
                  <SelectTrigger className="mt-1 w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="30">{t("min30")}</SelectItem>
                    <SelectItem value="45">{t("min45")}</SelectItem>
                    <SelectItem value="60">{t("hour1")}</SelectItem>
                    <SelectItem value="90">{t("hour1_5")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">{t("type")}</label>
              <Select value={slot.type} onValueChange={v => setSlot(s => ({ ...s, type: v as InterviewSlot["type"] }))}>
                <SelectTrigger className="mt-1 w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="video">{t("videoCall")}</SelectItem>
                  <SelectItem value="offline">{t("inPerson")}</SelectItem>
                  <SelectItem value="hybrid">{t("hybrid")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {slot.type !== "offline" && (
              <div>
                <label className="text-xs text-muted-foreground">{t("meetingLink")}</label>
                <input value={slot.meetLink} onChange={e => setSlot(s => ({ ...s, meetLink: e.target.value }))}
                  placeholder={t("meetingPlaceholder")} className="input-field w-full mt-1" />
              </div>
            )}
            {slot.type !== "video" && (
              <div>
                <label className="text-xs text-muted-foreground">{t("location")}</label>
                <input value={slot.location} onChange={e => setSlot(s => ({ ...s, location: e.target.value }))}
                  placeholder={t("locationPlaceholder")} className="input-field w-full mt-1" />
              </div>
            )}
            {slot.type === "hybrid" && (
              <p className="text-[11px] text-muted-foreground">{t("hybridHint")}</p>
            )}
          </div>

          {result && (
            <div className="flex items-start gap-2 p-2.5 rounded-lg bg-emerald-50 text-emerald-700 text-xs">
              <CheckCircle className="h-4 w-4 shrink-0 mt-0.5" />
              {t("scheduledSuccess", { success: result.sent, failed: result.failed })}
            </div>
          )}

          <button onClick={handleSend}
            disabled={bulkSchedule.isPending || selectedCount === 0 || !slot.date || !slot.time}
            className="btn-primary w-full flex items-center justify-center gap-2 disabled:opacity-60">
            {bulkSchedule.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            {bulkSchedule.isPending ? t("scheduling") : t("scheduleFor", { count: selectedCount })}
          </button>

          <div className="flex items-center gap-2 pt-2 border-t text-xs text-muted-foreground">
            <Clock className="h-3.5 w-3.5" />
            {t("notification")}
          </div>
        </div>
      </div>
    </div>
  );
}
