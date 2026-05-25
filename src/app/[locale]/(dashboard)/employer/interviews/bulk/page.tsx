"use client";

import { useState } from "react";
import { Calendar, Search, Users, Clock, Send, CheckCircle, Loader2, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { PageHeader } from "@/components/shared/PageHeader";
import { DateTimePicker } from "@/components/ui/date-time-picker";
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
      selected: selections[candidateId] ?? false,
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
    filteredCandidates.forEach(c => { updates[c._id] = !allSelected; });
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
        <div className="lg:col-span-2 card-base p-5 space-y-4">
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
            <div className="flex items-center justify-center py-8 gap-2 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span className="text-sm">{t("loading")}</span>
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
                  <label key={c._id} className={`flex items-center gap-3 p-2.5 rounded-lg border cursor-pointer transition-all ${
                    c.selected ? "border-primary bg-primary/5" : "border-border hover:border-primary/30"
                  }`}>
                    <input type="checkbox" checked={c.selected} onChange={() => toggleSelect(c._id)}
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
        <div className="card-base p-5 space-y-4">
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
                <select value={slot.duration} onChange={e => setSlot(s => ({ ...s, duration: parseInt(e.target.value) }))}
                  className="select-field w-full mt-1">
                  <option value={30}>{t("min30")}</option>
                  <option value={45}>{t("min45")}</option>
                  <option value={60}>{t("hour1")}</option>
                  <option value={90}>{t("hour1_5")}</option>
                </select>
              </div>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">{t("type")}</label>
              <select value={slot.type} onChange={e => setSlot(s => ({ ...s, type: e.target.value as InterviewSlot["type"] }))}
                className="select-field w-full mt-1">
                <option value="video">{t("videoCall")}</option>
                <option value="offline">{t("inPerson")}</option>
                <option value="hybrid">{t("hybrid")}</option>
              </select>
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
