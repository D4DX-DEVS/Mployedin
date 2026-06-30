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
import { useTranslations } from "next-intl";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Skeleton } from "@/components/ui/skeleton";
import { useTraining, useCreateTraining, useUpdateTrainingStatus, type TrainingItem } from "@/hooks/useTraining";

const SUGGESTED_TRAININGS = [
  { titleKey: "suggestGulfLaborTitle", provider: "MPLOYEDIN Academy", url: "" },
  { titleKey: "suggestHrCertTitle", provider: "CIPD", url: "https://cipd.org" },
  { titleKey: "suggestExcelTitle", provider: "LinkedIn Learning", url: "https://linkedin.com/learning" },
  { titleKey: "suggestInterviewTitle", provider: "Coursera", url: "https://coursera.org" },
  { titleKey: "suggestArabicCommTitle", provider: "AUB Online", url: "" },
];

export default function EmployerTrainingTrackerPage() {
  const t = useTranslations("employerTraining");
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
    <div className="page-container employer-legacy-surface space-y-5 sm:space-y-6">
      <section className="workspace-hero-surface overflow-hidden rounded-[28px] p-5 sm:p-6">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <div className="max-w-3xl">
            <div className="workspace-glass-panel inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-sky-700 dark:text-sky-300">
              <Sparkles className="h-3.5 w-3.5" />
              {t("badge")}
            </div>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight text-foreground sm:text-[2rem]">
              {t("title")}
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
              {t("description")}
            </p>
          </div>

          <button
            onClick={() => setShowForm((current) => !current)}
            data-testid="training-form-toggle"
            className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-sky-600 px-4 text-sm font-semibold text-white transition hover:bg-sky-700"
          >
            <Plus className="h-4 w-4" />
            {showForm ? t("hideForm") : t("addTraining")}
          </button>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          <div className="workspace-glass-panel rounded-2xl p-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{t("completed")}</p>
            <p className="mt-3 text-3xl font-semibold tracking-tight text-foreground">{completed}</p>
            <p className="mt-1 text-xs text-muted-foreground">{t("completedDesc")}</p>
          </div>
          <div className="workspace-glass-panel rounded-2xl p-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{t("inProgress")}</p>
            <p className="mt-3 text-3xl font-semibold tracking-tight text-foreground">{inProgress}</p>
            <p className="mt-1 text-xs text-muted-foreground">{t("inProgressDesc")}</p>
          </div>
          <div className="workspace-glass-panel rounded-2xl p-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{t("notStarted")}</p>
            <p className="mt-3 text-3xl font-semibold tracking-tight text-foreground">{notStarted}</p>
            <p className="mt-1 text-xs text-muted-foreground">{t("notStartedDesc")}</p>
          </div>
        </div>
      </section>

      {showForm && (
        <section className="workspace-panel-surface rounded-[28px] p-5 sm:p-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{t("newTraining")}</p>
              <h2 className="mt-2 text-xl font-semibold tracking-tight text-foreground">{t("addTrainingItem")}</h2>
            </div>
            <button
              onClick={() => setShowForm(false)}
              className="rounded-xl border border-border p-2 text-muted-foreground transition hover:bg-background"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="text-xs font-medium text-muted-foreground">{t("courseTitle")} *</label>
              <input
                value={form.title}
                onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
                className="input-field mt-1 w-full"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">{t("provider")} *</label>
              <input
                value={form.provider}
                onChange={(event) => setForm((current) => ({ ...current, provider: event.target.value }))}
                className="input-field mt-1 w-full"
              />
            </div>
          </div>

          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="text-xs font-medium text-muted-foreground">{t("url")}</label>
              <input
                value={form.url}
                onChange={(event) => setForm((current) => ({ ...current, url: event.target.value }))}
                placeholder={t("urlPlaceholder")}
                className="input-field mt-1 w-full"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">{t("targetRole")}</label>
              <input
                value={form.targetRole}
                onChange={(event) => setForm((current) => ({ ...current, targetRole: event.target.value }))}
                placeholder={t("rolePlaceholder")}
                className="input-field mt-1 w-full"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">{t("dueDate")}</label>
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
              className="inline-flex h-10 items-center justify-center rounded-xl border border-border bg-background/80 px-4 text-sm font-semibold text-foreground transition hover:bg-background"
            >
              {t("cancel")}
            </button>
            <button
              onClick={handleSave}
              disabled={createTraining.isPending || !form.title}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-sky-600 px-4 text-sm font-semibold text-white transition hover:bg-sky-700 disabled:opacity-60"
            >
              {createTraining.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {t("add")}
            </button>
          </div>
        </section>
      )}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1.45fr)_minmax(320px,0.95fr)] xl:grid-cols-[minmax(0,1.55fr)_360px]">
        <section className="workspace-panel-surface overflow-hidden rounded-[28px]">
          <div className="border-b border-border/60 px-5 py-5 sm:px-6">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{t("queueTitle")}</p>
            <h2 className="mt-2 text-xl font-semibold tracking-tight text-foreground sm:text-2xl">{t("queueDesc")}</h2>
            <p className="mt-1.5 text-sm leading-6 text-muted-foreground">
              {t("queueHint")}
            </p>
          </div>

          <div className="space-y-2.5 px-4 py-4 sm:px-5 sm:py-5">
            {loading ? (
              <div className="space-y-2.5">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="rounded-[24px] border border-border bg-background/80 p-4 sm:p-5">
                    <div className="flex items-start gap-3">
                      <Skeleton className="h-5 w-5 rounded-full" />
                      <div className="flex-1 space-y-2">
                        <Skeleton className="h-4 w-40" />
                        <Skeleton className="h-3 w-28" />
                      </div>
                      <Skeleton className="h-6 w-20 rounded-full" />
                    </div>
                  </div>
                ))}
              </div>
            ) : null}

            {!loading && items.length === 0 ? (
              <div className="rounded-[24px] border border-border bg-background/80 px-5 py-10 text-center text-muted-foreground">
                <GraduationCap className="mx-auto mb-3 h-10 w-10 opacity-50" />
                <p className="text-sm font-medium text-foreground/85">{t("emptyState")}</p>
                <p className="mt-1 text-sm">{t("emptyStateHint")}</p>
              </div>
            ) : null}

            {items.map((item, index) => (
              <div
                key={item._id ?? index}
                className="rounded-[24px] border border-border bg-background/80 p-4 shadow-[0_20px_50px_-42px_rgba(15,23,42,0.42)] transition-all hover:-translate-y-0.5 hover:border-sky-500/25 sm:p-5"
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
                        <p className="text-sm font-semibold text-foreground">{item.title}</p>
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
                          {t("start")}
                        </button>
                      ) : null}

                      {item.status !== "completed" ? (
                        <button
                          onClick={() => handleUpdateStatus(item._id, "completed")}
                          disabled={!item._id}
                          className="rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-700 transition-colors hover:bg-emerald-100"
                        >
                          {t("complete")}
                        </button>
                      ) : null}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        <aside className="workspace-panel-surface rounded-[28px] p-5 sm:p-6">
          <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            <GraduationCap className="h-3.5 w-3.5 text-sky-600" />
            {t("recommended")}
          </div>
          <h3 className="mt-2 text-xl font-semibold tracking-tight text-foreground">{t("recommendedDesc")}</h3>
          <p className="mt-1.5 text-sm leading-6 text-muted-foreground">
            {t("recommendedHint")}
          </p>

          <div className="mt-4 space-y-2.5">
            {SUGGESTED_TRAININGS.map((training, index) => (
              <div
                key={`${training.titleKey}-${index}`}
                className="rounded-[22px] border border-border bg-background/80 p-3.5 transition-all hover:-translate-y-0.5 hover:border-sky-500/25"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-foreground">{t(training.titleKey)}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{training.provider}</p>
                  </div>
                  <ArrowRight className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                </div>

                <button
                  onClick={() => {
                    setForm({
                      title: t(training.titleKey),
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
                  {t("addTraining")}
                </button>
              </div>
            ))}
          </div>
        </aside>
      </div>
    </div>
  );
}
