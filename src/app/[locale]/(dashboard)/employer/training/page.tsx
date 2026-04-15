"use client";

import { useState } from "react";
import {
  ArrowRight,
  CheckCircle,
  Clock,
  ExternalLink,
  GraduationCap,
  Loader2,
  Plus,
  Sparkles,
  X,
} from "lucide-react";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { useTraining, useCreateTraining, useUpdateTrainingStatus, type TrainingItem } from "@/hooks/useTraining";

const SUGGESTED_TRAININGS = [
  { title: "Gulf Labour Law Essentials", provider: "MPLOYEDIN Academy", url: "#" },
  { title: "Professional HR Certificate (Gulf)", provider: "CIPD", url: "https://cipd.org" },
  { title: "Advanced Excel for HR", provider: "LinkedIn Learning", url: "https://linkedin.com/learning" },
  { title: "Interviewing Skills Masterclass", provider: "Coursera", url: "https://coursera.org" },
  { title: "Corporate Communication in Arabic", provider: "AUB Online", url: "#" },
];

export default function EmployerTrainingTrackerPage() {
  const { data: items = [], isLoading: loading } = useTraining();
  const createTraining = useCreateTraining();
  const updateStatus = useUpdateTrainingStatus();

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<Omit<TrainingItem, "_id">>({
    title: "",
    provider: "",
    url: "",
    targetRole: "",
    status: "not_started",
    dueDate: "",
    notes: "",
  });

  const handleSave = async () => {
    if (!form.title || !form.provider) return;
    await createTraining.mutateAsync(form);
    setForm({
      title: "",
      provider: "",
      url: "",
      targetRole: "",
      status: "not_started",
      dueDate: "",
      notes: "",
    });
    setShowForm(false);
  };

  const handleUpdateStatus = (id: string | undefined, status: TrainingItem["status"]) => {
    if (!id) return;
    updateStatus.mutate({ id, status });
  };

  const completed = items.filter((item) => item.status === "completed").length;
  const inProgress = items.filter((item) => item.status === "in_progress").length;
  const notStarted = items.filter((item) => item.status === "not_started").length;

  return (
    <div className="page-container space-y-5 sm:space-y-6">
      <section className="overflow-hidden rounded-[28px] border border-sky-200 bg-[radial-gradient(circle_at_top_left,_rgba(14,165,233,0.18),_transparent_40%),linear-gradient(135deg,_rgba(255,255,255,0.98),_rgba(239,246,255,0.94))] p-5 shadow-[0_24px_60px_-36px_rgba(2,132,199,0.35)] sm:p-6">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-sky-100 bg-white/70 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-sky-700 backdrop-blur">
              <Sparkles className="h-3.5 w-3.5" />
              Employer learning
            </div>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950 sm:text-[2rem]">
              Training Tracker
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
              Keep recruiter upskilling visible, move active learning forward, and turn recommended training into action without leaving the employer workspace.
            </p>
          </div>

          <button
            onClick={() => setShowForm((current) => !current)}
            data-testid="training-form-toggle"
            className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-sky-600 px-4 text-sm font-semibold text-white transition hover:bg-sky-700"
          >
            <Plus className="h-4 w-4" />
            {showForm ? "Hide Form" : "Add Training"}
          </button>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          <div className="rounded-2xl border border-white/80 bg-white/80 p-4 backdrop-blur">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Completed</p>
            <p className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">{completed}</p>
            <p className="mt-1 text-xs text-slate-500">Training items already finished by the team.</p>
          </div>
          <div className="rounded-2xl border border-white/80 bg-white/80 p-4 backdrop-blur">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">In progress</p>
            <p className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">{inProgress}</p>
            <p className="mt-1 text-xs text-slate-500">Courses currently being worked through.</p>
          </div>
          <div className="rounded-2xl border border-white/80 bg-white/80 p-4 backdrop-blur">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Not started</p>
            <p className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">{notStarted}</p>
            <p className="mt-1 text-xs text-slate-500">Planned learning items waiting for kickoff.</p>
          </div>
        </div>
      </section>

      {showForm && (
        <section className="rounded-[28px] border border-slate-200 bg-[linear-gradient(180deg,_rgba(255,255,255,0.98),_rgba(248,250,252,0.96))] p-5 shadow-[0_24px_60px_-46px_rgba(15,23,42,0.35)] sm:p-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">New training</p>
              <h2 className="mt-2 text-xl font-semibold tracking-tight text-slate-950">Add Training Item</h2>
            </div>
            <button
              onClick={() => setShowForm(false)}
              className="rounded-xl border border-slate-200 p-2 text-slate-500 transition hover:bg-slate-50"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="text-xs font-medium text-slate-500">Course Title *</label>
              <input
                value={form.title}
                onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
                className="input-field mt-1 w-full"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-500">Provider *</label>
              <input
                value={form.provider}
                onChange={(event) => setForm((current) => ({ ...current, provider: event.target.value }))}
                className="input-field mt-1 w-full"
              />
            </div>
          </div>

          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="text-xs font-medium text-slate-500">URL</label>
              <input
                value={form.url}
                onChange={(event) => setForm((current) => ({ ...current, url: event.target.value }))}
                placeholder="https://..."
                className="input-field mt-1 w-full"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-500">Target Role</label>
              <input
                value={form.targetRole}
                onChange={(event) => setForm((current) => ({ ...current, targetRole: event.target.value }))}
                placeholder="e.g. HR Manager"
                className="input-field mt-1 w-full"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-500">Due Date</label>
              <input
                type="date"
                value={form.dueDate}
                onChange={(event) => setForm((current) => ({ ...current, dueDate: event.target.value }))}
                className="input-field mt-1 w-full"
              />
            </div>
          </div>

          <div className="mt-5 flex justify-end gap-2">
            <button
              onClick={() => setShowForm(false)}
              className="inline-flex h-10 items-center justify-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={createTraining.isPending || !form.title}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-sky-600 px-4 text-sm font-semibold text-white transition hover:bg-sky-700 disabled:opacity-60"
            >
              {createTraining.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Add
            </button>
          </div>
        </section>
      )}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1.45fr)_minmax(320px,0.95fr)] xl:grid-cols-[minmax(0,1.55fr)_360px]">
        <section className="overflow-hidden rounded-[28px] border border-slate-200 bg-[linear-gradient(180deg,_rgba(255,255,255,0.98),_rgba(248,250,252,0.96))] shadow-[0_24px_60px_-46px_rgba(15,23,42,0.35)]">
          <div className="border-b border-slate-200/80 px-5 py-5 sm:px-6">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Learning queue</p>
            <h2 className="mt-2 text-xl font-semibold tracking-tight text-slate-950 sm:text-2xl">Track progress across every employer training item.</h2>
            <p className="mt-1.5 text-sm leading-6 text-slate-600">
              Use this list to keep training momentum visible and move each item from planned to completed.
            </p>
          </div>

          <div className="space-y-2.5 px-4 py-4 sm:px-5 sm:py-5">
            {loading ? (
              <div className="flex items-center gap-2 py-8 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span className="text-sm">Loading...</span>
              </div>
            ) : null}

            {!loading && items.length === 0 ? (
              <div className="rounded-[24px] border border-slate-200 bg-white/90 px-5 py-10 text-center text-slate-500">
                <GraduationCap className="mx-auto mb-3 h-10 w-10 opacity-50" />
                <p className="text-sm font-medium text-slate-700">No training items yet.</p>
                <p className="mt-1 text-sm">Add one manually or start from the recommended list.</p>
              </div>
            ) : null}

            {items.map((item, index) => (
              <div
                key={item._id ?? index}
                className="rounded-[24px] border border-slate-200 bg-[linear-gradient(135deg,_rgba(255,255,255,0.98),_rgba(248,250,252,0.96))] p-4 shadow-[0_20px_50px_-42px_rgba(15,23,42,0.42)] transition-all hover:-translate-y-0.5 hover:border-sky-200 sm:p-5"
              >
                <div className="flex items-start gap-3">
                  <div className="pt-0.5">
                    {item.status === "completed" ? (
                      <CheckCircle className="h-5 w-5 text-emerald-500" />
                    ) : item.status === "in_progress" ? (
                      <Clock className="h-5 w-5 text-amber-500" />
                    ) : (
                      <div className="h-5 w-5 rounded-full border-2 border-muted-foreground" />
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-semibold text-slate-900">{item.title}</p>
                        <p className="text-xs text-muted-foreground">{item.provider}</p>
                      </div>

                      <div className="flex shrink-0 items-center gap-2">
                        <StatusBadge status={item.status.replace("_", " ")} />
                        {item.url ? (
                          <a
                            href={item.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="rounded p-1 text-primary hover:bg-primary/10"
                          >
                            <ExternalLink className="h-3.5 w-3.5" />
                          </a>
                        ) : null}
                      </div>
                    </div>

                    <div className="mt-3 flex flex-wrap gap-2">
                      {item.status !== "in_progress" ? (
                        <button
                          onClick={() => handleUpdateStatus(item._id, "in_progress")}
                          disabled={!item._id}
                          className="rounded-full bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-700 transition-colors hover:bg-amber-100"
                        >
                          Start
                        </button>
                      ) : null}

                      {item.status !== "completed" ? (
                        <button
                          onClick={() => handleUpdateStatus(item._id, "completed")}
                          disabled={!item._id}
                          className="rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-700 transition-colors hover:bg-emerald-100"
                        >
                          Complete
                        </button>
                      ) : null}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        <aside className="rounded-[28px] border border-slate-200 bg-[linear-gradient(180deg,_rgba(255,255,255,0.98),_rgba(248,250,252,0.96))] p-5 shadow-[0_24px_60px_-46px_rgba(15,23,42,0.35)] sm:p-6">
          <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
            <GraduationCap className="h-3.5 w-3.5 text-sky-600" />
            Recommended training
          </div>
          <h3 className="mt-2 text-xl font-semibold tracking-tight text-slate-950">Start from practical recruiter upskilling suggestions.</h3>
          <p className="mt-1.5 text-sm leading-6 text-slate-600">
            Pick a recommended course to prefill the training form and add it to the employer learning queue.
          </p>

          <div className="mt-4 space-y-2.5">
            {SUGGESTED_TRAININGS.map((training, index) => (
              <div
                key={`${training.title}-${index}`}
                className="rounded-[22px] border border-slate-200 bg-white/90 p-3.5 transition-all hover:-translate-y-0.5 hover:border-sky-200"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-900">{training.title}</p>
                    <p className="mt-1 text-xs text-slate-500">{training.provider}</p>
                  </div>
                  <ArrowRight className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                </div>

                <button
                  onClick={() => {
                    setForm({
                      title: training.title,
                      provider: training.provider,
                      url: training.url,
                      targetRole: "",
                      status: "not_started",
                      dueDate: "",
                      notes: "",
                    });
                    setShowForm(true);
                  }}
                  className="mt-3 inline-flex h-9 items-center justify-center rounded-xl bg-sky-50 px-3 text-xs font-semibold text-sky-700 transition hover:bg-sky-100"
                >
                  Add to tracker
                </button>
              </div>
            ))}
          </div>
        </aside>
      </div>
    </div>
  );
}
