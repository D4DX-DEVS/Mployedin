"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useTranslations } from "next-intl";
import {
  ArrowLeft, ClipboardList, Plus, Trash2, FileText, Loader2, CheckCircle2, Circle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import { csrfFetch } from "@/lib/security/csrf-client";

type OnboardingStatus = "not_started" | "in_progress" | "completed";

interface OnboardingTask {
  title: string;
  assignee?: string;
  dueDate?: string;
  completed: boolean;
  completedAt?: string;
}

interface OnboardingDoc {
  name: string;
  url?: string;
  uploadedAt?: string;
}

interface Onboarding {
  _id: string;
  status: OnboardingStatus;
  tasks: OnboardingTask[];
  documents: OnboardingDoc[];
  notes?: string;
  startDate?: string;
}

interface PlacementLite {
  _id: string;
  jobId?: { title?: string };
  jobSeekerId?: { fullName?: string; userId?: { name?: string } };
}

export default function PlacementOnboardingPage() {
  const { locale, id } = useParams<{ locale: string; id: string }>();
  const t = useTranslations("employerOnboarding");

  const [onboarding, setOnboarding] = useState<Onboarding | null>(null);
  const [placement, setPlacement] = useState<PlacementLite | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [newTask, setNewTask] = useState("");
  const [newDocName, setNewDocName] = useState("");
  const [newDocUrl, setNewDocUrl] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/placements/${id}/onboarding`);
      if (!res.ok) throw new Error("failed");
      const data = await res.json();
      setOnboarding(data.onboarding);
      setPlacement(data.placement ?? null);
    } catch {
      toast.error(t("errors.fetchFailed"));
    } finally {
      setLoading(false);
    }
  }, [id, t]);

  useEffect(() => {
    document.title = `${t("title")} · MPLOYEDIN`;
  }, [t]);

  useEffect(() => {
    load();
  }, [load]);

  const candidateName =
    placement?.jobSeekerId?.fullName || placement?.jobSeekerId?.userId?.name || t("candidateFallback");

  async function patch(body: Record<string, unknown>) {
    setBusy(true);
    try {
      const res = await csrfFetch(`/api/placements/${id}/onboarding`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error("failed");
      const data = await res.json();
      setOnboarding(data.onboarding);
    } catch {
      toast.error(t("errors.updateFailed"));
    } finally {
      setBusy(false);
    }
  }

  async function seedDefaults() {
    setBusy(true);
    try {
      const res = await csrfFetch(`/api/placements/${id}/onboarding`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!res.ok) throw new Error("failed");
      const data = await res.json();
      setOnboarding(data.onboarding);
      toast.success(t("seeded"));
    } catch {
      toast.error(t("errors.updateFailed"));
    } finally {
      setBusy(false);
    }
  }

  function toggleTask(index: number, completed: boolean) {
    patch({ task: { index, completed } });
  }

  function removeTask(index: number) {
    patch({ task: { index, remove: true } });
  }

  function addTask() {
    if (newTask.trim().length < 2) return;
    patch({ addTask: { title: newTask.trim() } });
    setNewTask("");
  }

  function addDocument() {
    if (newDocName.trim().length < 1) return;
    patch({ addDocument: { name: newDocName.trim(), url: newDocUrl.trim() || undefined } });
    setNewDocName("");
    setNewDocUrl("");
  }

  const tasks = onboarding?.tasks ?? [];
  const doneCount = tasks.filter((task) => task.completed).length;
  const progress = tasks.length > 0 ? Math.round((doneCount / tasks.length) * 100) : 0;

  const statusColor = (s: OnboardingStatus) =>
    s === "completed" ? "bg-emerald-100 text-emerald-700 border-emerald-300"
      : s === "in_progress" ? "bg-blue-100 text-blue-700 border-blue-300"
      : "bg-amber-100 text-amber-700 border-amber-300";

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2">
        <Link
          href={`/${locale}/employer/placements`}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          {t("backToPlacements")}
        </Link>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight text-foreground">
              <ClipboardList className="h-6 w-6 text-primary" />
              {t("title")}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {candidateName}{placement?.jobId?.title ? ` · ${placement.jobId.title}` : ""}
            </p>
          </div>
          {onboarding && (
            <Badge variant="outline" className={statusColor(onboarding.status)}>
              {t(`status.${onboarding.status}`)}
            </Badge>
          )}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" />
          {t("loading")}
        </div>
      ) : (
        <>
          {/* Progress */}
          <div className="rounded-2xl border border-border/60 bg-card p-5">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-foreground">{t("progress")}</p>
              <p className="text-sm text-muted-foreground">{t("tasksDone", { done: doneCount, total: tasks.length })}</p>
            </div>
            <Progress value={progress} className="mt-3 h-2" />
          </div>

          {/* Tasks */}
          <div className="rounded-2xl border border-border/60 bg-card p-5">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-foreground">{t("tasks")}</h2>
              {tasks.length === 0 && (
                <Button size="sm" variant="outline" className="rounded-xl" onClick={seedDefaults} disabled={busy}>
                  <Plus className="mr-2 h-4 w-4" />
                  {t("useTemplate")}
                </Button>
              )}
            </div>

            {tasks.length === 0 ? (
              <p className="mt-4 text-sm text-muted-foreground">{t("noTasks")}</p>
            ) : (
              <ul className="mt-4 space-y-2">
                {tasks.map((task, i) => (
                  <li key={i} className="flex items-center gap-3 rounded-xl border border-border/50 px-3 py-2.5">
                    <Checkbox
                      checked={task.completed}
                      onCheckedChange={(c) => toggleTask(i, Boolean(c))}
                      disabled={busy}
                      aria-label={task.title}
                    />
                    <div className="flex-1">
                      <p className={`text-sm ${task.completed ? "text-muted-foreground line-through" : "text-foreground"}`}>
                        {task.title}
                      </p>
                      {task.assignee && <p className="text-xs text-muted-foreground">{task.assignee}</p>}
                    </div>
                    {task.completed ? (
                      <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                    ) : (
                      <Circle className="h-4 w-4 text-muted-foreground/40" />
                    )}
                    <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => removeTask(i)} disabled={busy}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </li>
                ))}
              </ul>
            )}

            <div className="mt-4 flex gap-2">
              <Input
                value={newTask}
                onChange={(e) => setNewTask(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") addTask(); }}
                placeholder={t("addTaskPlaceholder")}
              />
              <Button onClick={addTask} disabled={busy || newTask.trim().length < 2} className="rounded-xl">
                <Plus className="mr-2 h-4 w-4" />
                {t("addTask")}
              </Button>
            </div>
          </div>

          {/* Documents */}
          <div className="rounded-2xl border border-border/60 bg-card p-5">
            <h2 className="text-lg font-semibold text-foreground">{t("documents")}</h2>
            {(onboarding?.documents.length ?? 0) === 0 ? (
              <p className="mt-4 text-sm text-muted-foreground">{t("noDocuments")}</p>
            ) : (
              <ul className="mt-4 space-y-2">
                {onboarding?.documents.map((doc, i) => (
                  <li key={i} className="flex items-center gap-3 rounded-xl border border-border/50 px-3 py-2.5">
                    <FileText className="h-4 w-4 text-muted-foreground" />
                    <div className="flex-1">
                      {doc.url ? (
                        <a href={doc.url} target="_blank" rel="noopener noreferrer" className="text-sm text-primary hover:underline">
                          {doc.name}
                        </a>
                      ) : (
                        <span className="text-sm text-foreground">{doc.name}</span>
                      )}
                    </div>
                    <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => patch({ removeDocumentIndex: i })} disabled={busy}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </li>
                ))}
              </ul>
            )}

            <div className="mt-4 grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
              <Input value={newDocName} onChange={(e) => setNewDocName(e.target.value)} placeholder={t("docNamePlaceholder")} />
              <Input value={newDocUrl} onChange={(e) => setNewDocUrl(e.target.value)} placeholder={t("docUrlPlaceholder")} />
              <Button onClick={addDocument} disabled={busy || newDocName.trim().length < 1} className="rounded-xl">
                <Plus className="mr-2 h-4 w-4" />
                {t("addDocument")}
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
