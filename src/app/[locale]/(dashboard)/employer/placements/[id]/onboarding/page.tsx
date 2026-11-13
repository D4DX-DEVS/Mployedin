"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useTranslations } from "next-intl";
import {
  ArrowLeft, ClipboardList, Plus, Trash2,
  CalendarClock, ShieldCheck, BadgeCheck, StickyNote, Check,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { WorkspaceHeader } from "@/components/shared/WorkspaceHeader";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from "@/components/ui/select";
import { DateTimePicker } from "@/components/ui/date-time-picker";
import { toast } from "sonner";
import { csrfFetch } from "@/lib/security/csrf-client";
import { OnboardingDocumentsCard, fmtDate, type OnboardingDoc } from "./_components/OnboardingDocumentsCard";

type OnboardingStatus = "not_started" | "in_progress" | "completed";
type ProbationStatus = "pending" | "passed" | "failed" | "extended";

const NONE = "__none__";

interface OnboardingTask {
  title: string;
  assignee?: string;
  assigneeUserId?: string;
  dueDate?: string;
  completed: boolean;
  completedAt?: string;
}

interface Probation {
  endDate?: string;
  status?: ProbationStatus;
  notes?: string;
}

interface Onboarding {
  _id: string;
  status: OnboardingStatus;
  tasks: OnboardingTask[];
  documents: OnboardingDoc[];
  probation?: Probation;
  notes?: string;
  startDate?: string;
}

interface PlacementLite {
  _id: string;
  jobId?: { title?: string };
  jobSeekerId?: { fullName?: string; userId?: { name?: string } };
}

interface TeamMember {
  userId: string;
  name: string;
}

function toIso(dateValue: string): string {
  return new Date(dateValue).toISOString();
}

export default function PlacementOnboardingPage() {
  const { locale, id } = useParams<{ locale: string; id: string }>();
  const t = useTranslations("employerOnboarding");

  const [onboarding, setOnboarding] = useState<Onboarding | null>(null);
  const [placement, setPlacement] = useState<PlacementLite | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [team, setTeam] = useState<TeamMember[]>([]);

  // Add-task form
  const [newTask, setNewTask] = useState("");
  const [newTaskAssignee, setNewTaskAssignee] = useState("");
  const [newTaskDue, setNewTaskDue] = useState("");

  // Notes + probation
  const [notesDraft, setNotesDraft] = useState("");
  const [probEnd, setProbEnd] = useState("");
  const [probStatus, setProbStatus] = useState<ProbationStatus>("pending");
  const [probNotes, setProbNotes] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/placements/${id}/onboarding`);
      if (!res.ok) throw new Error("failed");
      const data = await res.json();
      const ob: Onboarding | null = data.onboarding ?? null;
      setOnboarding(ob);
      setPlacement(data.placement ?? null);
      setNotesDraft(ob?.notes ?? "");
      setProbEnd(ob?.probation?.endDate ? ob.probation.endDate.slice(0, 10) : "");
      setProbStatus(ob?.probation?.status ?? "pending");
      setProbNotes(ob?.probation?.notes ?? "");
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

  // Team members for the assignee picker (degrades gracefully on 403).
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/employers/team");
        if (!res.ok) return;
        const data = await res.json();
        const members: TeamMember[] = (data.members ?? [])
          .filter((m: { status?: string; user?: unknown }) => m.status === "active" && m.user)
          .map((m: { userId: string; user?: { name?: string; email?: string } }) => ({
            userId: String(m.userId),
            name: m.user?.name ?? m.user?.email ?? "Member",
          }));
        setTeam(members);
      } catch {
        /* non-blocking */
      }
    })();
  }, []);

  const candidateName =
    placement?.jobSeekerId?.fullName || placement?.jobSeekerId?.userId?.name || t("candidateFallback");

  async function patch(body: Record<string, unknown>, successMsg?: string) {
    setBusy(true);
    try {
      const res = await csrfFetch(`/api/placements/${id}/onboarding`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error("failed");
      const data = await res.json();
      const ob: Onboarding = data.onboarding;
      setOnboarding(ob);
      setNotesDraft(ob?.notes ?? "");
      setProbEnd(ob?.probation?.endDate ? ob.probation.endDate.slice(0, 10) : "");
      setProbStatus(ob?.probation?.status ?? "pending");
      setProbNotes(ob?.probation?.notes ?? "");
      if (successMsg) toast.success(successMsg);
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
    const addTaskBody: Record<string, unknown> = { title: newTask.trim() };
    if (newTaskAssignee) {
      addTaskBody.assigneeUserId = newTaskAssignee;
      const member = team.find((m) => m.userId === newTaskAssignee);
      if (member) addTaskBody.assignee = member.name;
    }
    if (newTaskDue) addTaskBody.dueDate = toIso(newTaskDue);
    patch({ addTask: addTaskBody });
    setNewTask("");
    setNewTaskAssignee("");
    setNewTaskDue("");
  }

  function saveNotes() {
    patch({ notes: notesDraft }, t("notesSaved"));
  }

  function saveProbation() {
    patch(
      {
        probation: {
          endDate: probEnd ? toIso(probEnd) : "",
          status: probStatus,
          notes: probNotes,
        },
      },
      t("probationSaved"),
    );
  }

  // Due dates and a probation end are always ahead: earlier days are greyed out.
  const today = useMemo(() => new Date(), []);

  // A Save button is live only while its form differs from what is stored.
  // Once saved it reads "Saved", so the page stops asking for a save it has.
  const savedProbation = onboarding?.probation;
  const probationDirty =
    probEnd !== (savedProbation?.endDate ? savedProbation.endDate.slice(0, 10) : "")
    || probStatus !== (savedProbation?.status ?? "pending")
    || probNotes.trim() !== (savedProbation?.notes ?? "");
  const notesDirty = notesDraft.trim() !== (onboarding?.notes ?? "");

  const tasks = onboarding?.tasks ?? [];
  const doneCount = tasks.filter((task) => task.completed).length;
  const progress = tasks.length > 0 ? Math.round((doneCount / tasks.length) * 100) : 0;

  const statusColor = (s: OnboardingStatus) =>
    s === "completed" ? "bg-emerald-100 text-emerald-700 border-emerald-300"
      : s === "in_progress" ? "bg-blue-100 text-blue-700 border-blue-300"
      : "bg-amber-100 text-amber-700 border-amber-300";

  return (
    // Standard page width and header, like every other screen: it was a
    // narrower column with its own heading, and on phones the status badge
    // stretched across the page like a banner.
    <div className="page-container">
      <Link
        href={`/${locale}/employer/placements`}
        className="tap-target-row inline-flex items-center gap-1.5 self-start text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4 rtl:rotate-180" aria-hidden="true" />
        {t("backToPlacements")}
      </Link>
      <WorkspaceHeader
        icon={ClipboardList}
        title={t("title")}
        context={`${candidateName}${placement?.jobId?.title ? ` · ${placement.jobId.title}` : ""}`}
        actions={onboarding ? (
          // The span takes the action row's 44px height so the badge keeps its own.
          <span className="inline-flex items-center">
            <Badge variant="outline" className={statusColor(onboarding.status)}>
              {t(`status.${onboarding.status}`)}
            </Badge>
          </span>
        ) : undefined}
      />

      {loading ? (
        <div className="space-y-3 sm:space-y-4">
          <div className="rounded-2xl border border-border/60 bg-card space-y-3 panel-body">
            <div className="flex items-center justify-between">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-4 w-16" />
            </div>
            <Skeleton className="h-2 w-full rounded-full" />
          </div>
          <div className="rounded-2xl border border-border/60 bg-card space-y-3 panel-body">
            <Skeleton className="h-5 w-28" />
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 rounded-xl border border-border/50 chip-pad">
                <Skeleton className="h-4 w-4 rounded" />
                <Skeleton className="h-4 w-48" />
              </div>
            ))}
          </div>
        </div>
      ) : (
        <>
          {/* Tasks, with their progress in the same card: one place to read
              "how far along" and act on it. */}
          <div className="rounded-2xl border border-border/60 bg-card panel-body">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="heading-section font-semibold text-foreground">{t("tasks")}</h2>
                <p className="mt-0.5 text-xs text-muted-foreground">{t("tasksHint")}</p>
              </div>
              {tasks.length === 0 ? (
                <Button size="sm" variant="outline" className="rounded-xl" onClick={seedDefaults} disabled={busy}>
                  <Plus className="mr-2 h-4 w-4" />
                  {t("useTemplate")}
                </Button>
              ) : (
                <p className="shrink-0 text-sm text-muted-foreground">{t("tasksDone", { done: doneCount, total: tasks.length })}</p>
              )}
            </div>
            {tasks.length > 0 && <Progress value={progress} className="mt-3 h-2" aria-label={t("progress")} />}

            {tasks.length === 0 ? (
              <p className="mt-4 text-sm text-muted-foreground">{t("noTasks")}</p>
            ) : (
              <ul className="mt-3 divide-y divide-border/60">
                {tasks.map((task, i) => (
                  <li key={i} className="flex items-center gap-3 py-2.5">
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
                      <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                        {task.assignee && (
                          <span className="inline-flex items-center gap-1">
                            <BadgeCheck className="h-3 w-3" />
                            {task.assignee}
                          </span>
                        )}
                        {task.dueDate && (
                          <span className="inline-flex items-center gap-1">
                            <CalendarClock className="h-3 w-3" />
                            {t("due", { date: fmtDate(task.dueDate) })}
                          </span>
                        )}
                      </div>
                    </div>
                    <Button size="iconDense" variant="ghost" onClick={() => removeTask(i)} disabled={busy} aria-label={t("removeDocumentLabel", { document: task.title })}>
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                    </Button>
                  </li>
                ))}
              </ul>
            )}

            {/* Add task */}
            <div className={`grid gap-2 ${tasks.length > 0 ? "mt-1 border-t border-border/60 pt-4" : "mt-4"} ${team.length > 0 ? "sm:grid-cols-[1fr_auto_auto_auto]" : "sm:grid-cols-[1fr_auto_auto]"}`}>
              <Input
                value={newTask}
                onChange={(e) => setNewTask(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") addTask(); }}
                placeholder={t("addTaskPlaceholder")}
                aria-label={t("addTaskPlaceholder")}
              />
              {/* With no colleagues there is no one to assign to. */}
              {team.length > 0 && <Select
                value={newTaskAssignee || NONE}
                onValueChange={(v) => setNewTaskAssignee(v === NONE ? "" : v)}
              >
                <SelectTrigger className="min-w-[150px]" aria-label={t("assignee")}>
                  <SelectValue placeholder={t("assignee")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>{t("unassigned")}</SelectItem>
                  {team.map((member) => (
                    <SelectItem key={member.userId} value={member.userId}>{member.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>}
              <DateTimePicker
                mode="date"
                value={newTaskDue}
                onChange={setNewTaskDue}
                placeholder={t("dueDate")}
                minDate={today}
              />
              <Button onClick={addTask} disabled={busy || newTask.trim().length < 2} className="rounded-xl">
                <Plus className="mr-2 h-4 w-4" />
                {t("addTask")}
              </Button>
            </div>
          </div>

          <OnboardingDocumentsCard
            documents={onboarding?.documents ?? []}
            busy={busy}
            today={today}
            onPatch={patch}
          />

          {/* Probation and notes sit side by side on wide screens: two short
              forms, not two more full-width bands to scroll past. */}
          <div className="grid gap-3 sm:gap-4 lg:grid-cols-2 lg:items-start">
          <div className="rounded-2xl border border-border/60 bg-card panel-body">
            <h2 className="heading-section flex items-center gap-2 font-semibold text-foreground">
              <ShieldCheck className="h-5 w-5 text-primary" />
              {t("probation")}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">{t("probationHint")}</p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className="field">
                <Label htmlFor="prob-end">{t("probationEndDate")}</Label>
                <DateTimePicker
                  mode="date"
                  value={probEnd}
                  onChange={setProbEnd}
                  placeholder={t("probationEndDate")}
                  minDate={today}
                />
              </div>
              <div className="field">
                <Label htmlFor="prob-status">{t("probationStatus")}</Label>
                <Select value={probStatus} onValueChange={(v) => setProbStatus(v as ProbationStatus)}>
                  <SelectTrigger id="prob-status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pending">{t("probationStatus_pending")}</SelectItem>
                    <SelectItem value="passed">{t("probationStatus_passed")}</SelectItem>
                    <SelectItem value="failed">{t("probationStatus_failed")}</SelectItem>
                    <SelectItem value="extended">{t("probationStatus_extended")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="mt-3 field">
              <Label htmlFor="prob-notes">{t("probationNotes")}</Label>
              <Textarea
                id="prob-notes"
                value={probNotes}
                onChange={(e) => setProbNotes(e.target.value)}
                placeholder={t("probationNotesPlaceholder")}
                rows={2}
              />
            </div>
            <Button onClick={saveProbation} disabled={busy || !probationDirty} className="mt-3 rounded-xl">
              {!probationDirty && savedProbation ? (
                <><Check className="mr-2 h-4 w-4" aria-hidden="true" />{t("saved")}</>
              ) : t("saveProbation")}
            </Button>
          </div>

          {/* Notes */}
          <div className="rounded-2xl border border-border/60 bg-card panel-body">
            <h2 className="heading-section flex items-center gap-2 font-semibold text-foreground">
              <StickyNote className="h-5 w-5 text-primary" />
              {t("notes")}
            </h2>
            <Textarea
              value={notesDraft}
              onChange={(e) => setNotesDraft(e.target.value)}
              placeholder={t("notesPlaceholder")}
              rows={3}
              className="mt-3"
            />
            <Button onClick={saveNotes} disabled={busy || !notesDirty} className="mt-3 rounded-xl">
              {!notesDirty && onboarding?.notes ? (
                <><Check className="mr-2 h-4 w-4" aria-hidden="true" />{t("saved")}</>
              ) : t("saveNotes")}
            </Button>
          </div>
          </div>
        </>
      )}
    </div>
  );
}
