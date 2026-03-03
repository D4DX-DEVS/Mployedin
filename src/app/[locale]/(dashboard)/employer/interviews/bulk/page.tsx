"use client";

import { useState, useEffect, useCallback } from "react";
import { Calendar, Search, Users, Clock, Send, CheckCircle, Loader2, X } from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";

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
  type: "video" | "phone" | "in_person";
  location?: string;
  meetLink?: string;
}

export default function EmployerBulkInterviewPage() {
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [slot, setSlot] = useState<InterviewSlot>({
    date: "", time: "10:00", duration: 45, type: "video", meetLink: "", location: "",
  });
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ sent: number; failed: number } | null>(null);
  const [jobId, setJobId] = useState("");

  const loadCandidates = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ status: "shortlisted", limit: "100" });
      if (jobId) params.set("jobId", jobId);
      const res = await fetch(`/api/applications?${params}`);
      if (res.ok) {
        const data = await res.json();
        const apps = data.applications ?? [];
        setCandidates(apps.map((app: { _id: string; jobSeeker?: { _id: string; name: string; email: string }; jobId?: { title: string } }) => ({
          _id: app.jobSeeker?._id ?? app._id,
          name: app.jobSeeker?.name ?? "Unknown",
          email: app.jobSeeker?.email ?? "",
          jobTitle: (app.jobId as { title?: string } | undefined)?.title,
          applicationId: app._id,
          selected: false,
        })));
      }
    } finally {
      setLoading(false);
    }
  }, [jobId]);

  useEffect(() => { loadCandidates(); }, [loadCandidates]);

  const filteredCandidates = candidates.filter(c =>
    !search || c.name.toLowerCase().includes(search.toLowerCase()) || c.email.toLowerCase().includes(search.toLowerCase())
  );

  const selectedCount = candidates.filter(c => c.selected).length;

  const toggleSelect = (id: string) =>
    setCandidates(cs => cs.map(c => c._id === id ? { ...c, selected: !c.selected } : c));

  const toggleAll = () => {
    const allSelected = filteredCandidates.every(c => c.selected);
    setCandidates(cs => cs.map(c => filteredCandidates.find(f => f._id === c._id) ? { ...c, selected: !allSelected } : c));
  };

  const handleSend = async () => {
    const selected = candidates.filter(c => c.selected);
    if (!selected.length || !slot.date || !slot.time) return;
    setSending(true);
    try {
      const scheduledAt = new Date(`${slot.date}T${slot.time}:00`).toISOString();
      const res = await fetch("/api/interviews/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          candidates: selected.map(c => ({ jobSeekerId: c._id, applicationId: c.applicationId })),
          scheduledAt,
          duration: slot.duration,
          type: slot.type,
          location: slot.location,
          meetLink: slot.meetLink,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setResult({ sent: data.created ?? selected.length, failed: data.failed ?? 0 });
        setCandidates(cs => cs.map(c => ({ ...c, selected: false })));
      }
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="page-container">
      <PageHeader
        title="Bulk Interview Scheduling"
        description="Select multiple candidates and schedule interviews simultaneously"
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Candidates Selection */}
        <div className="lg:col-span-2 card-base space-y-4">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 flex-1">
              <Search className="h-4 w-4 text-muted-foreground shrink-0" />
              <input value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Search candidates…" className="input-field flex-1" />
            </div>
            <span className="text-sm text-muted-foreground whitespace-nowrap">
              {selectedCount} selected
            </span>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-8 gap-2 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span className="text-sm">Loading candidates…</span>
            </div>
          ) : filteredCandidates.length === 0 ? (
            <p className="text-center py-8 text-sm text-muted-foreground">
              No shortlisted candidates found. Shortlist candidates from your applications first.
            </p>
          ) : (
            <>
              <div className="flex items-center gap-2 pb-1 border-b">
                <input type="checkbox"
                  checked={filteredCandidates.length > 0 && filteredCandidates.every(c => c.selected)}
                  onChange={toggleAll} className="accent-primary" />
                <span className="text-xs text-muted-foreground">Select all ({filteredCandidates.length})</span>
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
        <div className="card-base space-y-4">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <Calendar className="h-4 w-4 text-primary" /> Interview Details
          </h3>

          <div className="space-y-3">
            <div>
              <label className="text-xs text-muted-foreground">Date *</label>
              <input type="date" value={slot.date} onChange={e => setSlot(s => ({ ...s, date: e.target.value }))}
                className="input-field w-full mt-1" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-muted-foreground">Time *</label>
                <input type="time" value={slot.time} onChange={e => setSlot(s => ({ ...s, time: e.target.value }))}
                  className="input-field w-full mt-1" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Duration (min)</label>
                <select value={slot.duration} onChange={e => setSlot(s => ({ ...s, duration: parseInt(e.target.value) }))}
                  className="select-field w-full mt-1">
                  <option value={30}>30 min</option>
                  <option value={45}>45 min</option>
                  <option value={60}>1 hour</option>
                  <option value={90}>1.5 hours</option>
                </select>
              </div>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Type</label>
              <select value={slot.type} onChange={e => setSlot(s => ({ ...s, type: e.target.value as InterviewSlot["type"] }))}
                className="select-field w-full mt-1">
                <option value="video">Video Call</option>
                <option value="phone">Phone</option>
                <option value="in_person">In Person</option>
              </select>
            </div>
            {slot.type === "video" && (
              <div>
                <label className="text-xs text-muted-foreground">Meeting Link</label>
                <input value={slot.meetLink} onChange={e => setSlot(s => ({ ...s, meetLink: e.target.value }))}
                  placeholder="https://meet.google.com/…" className="input-field w-full mt-1" />
              </div>
            )}
            {slot.type === "in_person" && (
              <div>
                <label className="text-xs text-muted-foreground">Location</label>
                <input value={slot.location} onChange={e => setSlot(s => ({ ...s, location: e.target.value }))}
                  placeholder="Office address…" className="input-field w-full mt-1" />
              </div>
            )}
          </div>

          {result && (
            <div className="flex items-start gap-2 p-2.5 rounded-lg bg-emerald-50 text-emerald-700 text-xs">
              <CheckCircle className="h-4 w-4 shrink-0 mt-0.5" />
              Scheduled for {result.sent} candidate{result.sent !== 1 ? "s" : ""}.
              {result.failed > 0 && ` ${result.failed} failed.`}
            </div>
          )}

          <button onClick={handleSend}
            disabled={sending || selectedCount === 0 || !slot.date || !slot.time}
            className="btn-primary w-full flex items-center justify-center gap-2 disabled:opacity-60">
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            {sending ? "Scheduling…" : `Schedule for ${selectedCount} Candidate${selectedCount !== 1 ? "s" : ""}`}
          </button>

          <div className="flex items-center gap-2 pt-2 border-t text-xs text-muted-foreground">
            <Clock className="h-3.5 w-3.5" />
            Candidates will receive automatic notifications with all details.
          </div>
        </div>
      </div>
    </div>
  );
}
