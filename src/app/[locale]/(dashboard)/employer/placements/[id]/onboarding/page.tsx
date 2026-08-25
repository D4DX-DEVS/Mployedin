"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useTranslations } from "next-intl";
import {
  ArrowLeft, ClipboardList, Plus, Trash2, FileText, CheckCircle2, Circle,
  CalendarClock, ShieldCheck, PenLine, Send, BadgeCheck, StickyNote,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
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
import { formatDate } from "@/lib/ui/intlFormat";

type OnboardingStatus = "not_started" | "in_progress" | "completed";
type DocStatus = "requested" | "submitted" | "signed" | "approved";
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

interface DocSignature {
  fullName: string;
  signedAt: string;
}

interface OnboardingDoc {
  name: string;
  url?: string;
  uploadedAt?: string;
  requestedFromCandidate?: boolean;
  requiresSignature?: boolean;
  status?: DocStatus;
  uploadedBy?: string;
  dueDate?: string;
  signature?: DocSignature;
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

const DOC_STATUS_STYLES: Record<DocStatus, string> = {
  requested: "bg-amber-100 text-amber-700 border-amber-300",
  submitted: "bg-sky-100 text-sky-700 border-sky-300",
  signed: "bg-emerald-100 text-emerald-700 border-emerald-300",
  approved: "bg-emerald-100 text-emerald-700 border-emerald-300",
};

function fmtDate(value?: string): string {
  if (!value) return "";
  try {
    return formatDate(new Date(value), { year: "numeric", month: "short", day: "numeric" });
  } catch {
    return "";
  }
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

  // Add-document form
  const [newDocName, setNewDocName] = useState("");
  const [newDocUrl, setNewDocUrl] = useState("");
  const [requestFromCandidate, setRequestFromCandidate] = useState(false);
  const [requiresSignature, setRequiresSignature] = useState(false);
  const [newDocDue, setNewDocDue] = useState("");

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

  function addDocument() {
    if (newDocName.trim().length < 1) return;
    if (requestFromCandidate) {
      const docBody: Record<string, unknown> = {
        name: newDocName.trim(),
        requestedFromCandidate: true,
        requiresSignature,
      };
      if (newDocDue) docBody.dueDate = toIso(newDocDue);
      patch({ addDocument: docBody }, t("documentRequested"));
    } else {
      patch({ addDocument: { name: newDocName.trim(), url: newDocUrl.trim() || undefined } });
    }
    setNewDocName("");
    setNewDocUrl("");
    setNewDocDue("");
    setRequestFromCandidate(false);
    setRequiresSignature(false);
  }

  function approveDoc(index: number) {
    patch({ document: { index, status: "approved" } }, t("documentApproved"));
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

  const tasks = onboarding?.tasks ?? [];
  const doneCount = tasks.filter((task) => task.completed).length;
  const progress = tasks.length > 0 ? Math.round((doneCount / tasks.length) * 100) : 0;

  const statusColor = (s: OnboardingStatus) =>
    s === "completed" ? "bg-emerald-100 text-emerald-700 border-emerald-300"
      : s === "in_progress" ? "bg-blue-100 text-blue-700 border-blue-300"
      : "bg-amber-100 text-amber-700 border-amber-300";

  return (
    <div className="page-container max-w-5xl">
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
        <div className="space-y-3 sm:space-y-4">
          <div className="rounded-2xl border border-border/60 bg-card p-5 space-y-3">
            <div className="flex items-center justify-between">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-4 w-16" />
            </div>
            <Skeleton className="h-2 w-full rounded-full" />
          </div>
          <div className="rounded-2xl border border-border/60 bg-card p-5 space-y-3">
            <Skeleton className="h-5 w-28" />
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 rounded-xl border border-border/50 px-3 py-2.5">
                <Skeleton className="h-4 w-4 rounded" />
                <Skeleton className="h-4 w-48" />
              </div>
            ))}
          </div>
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

            {/* Add task */}
            <div className="mt-4 grid gap-2 sm:grid-cols-[1fr_auto_auto_auto]">
              <Input
                value={newTask}
                onChange={(e) => setNewTask(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") addTask(); }}
                placeholder={t("addTaskPlaceholder")}
              />
              <Select
                value={newTaskAssignee || NONE}
                onValueChange={(v) => setNewTaskAssignee(v === NONE ? "" : v)}
              >
                <SelectTrigger className="min-w-[150px]">
                  <SelectValue placeholder={t("assignee")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>{t("unassigned")}</SelectItem>
                  {team.map((member) => (
                    <SelectItem key={member.userId} value={member.userId}>{member.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <DateTimePicker
                mode="date"
                value={newTaskDue}
                onChange={setNewTaskDue}
                placeholder={t("dueDate")}
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
                  <li key={i} className="flex flex-col gap-2 rounded-xl border border-border/50 px-3 py-2.5 sm:flex-row sm:items-center">
                    <FileText className="hidden h-4 w-4 shrink-0 text-muted-foreground sm:block" />
                    <div className="flex-1 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        {doc.url ? (
                          <a href={doc.url} target="_blank" rel="noopener noreferrer" className="text-sm text-primary hover:underline">
                            {doc.name}
                          </a>
                        ) : (
                          <span className="text-sm text-foreground">{doc.name}</span>
                        )}
                        {doc.status && (
                          <Badge variant="outline" className={DOC_STATUS_STYLES[doc.status]}>
                            {t(`docStatus.${doc.status}`)}
                          </Badge>
                        )}
                        {doc.requestedFromCandidate && (
                          <Badge variant="outline" className="border-indigo-300 bg-indigo-100 text-indigo-700">
                            <Send className="mr-1 h-3 w-3" />
                            {t("requestedFromCandidate")}
                          </Badge>
                        )}
                        {doc.requiresSignature && (
                          <Badge variant="outline" className="border-purple-300 bg-purple-100 text-purple-700">
                            <PenLine className="mr-1 h-3 w-3" />
                            {t("requiresSignature")}
                          </Badge>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                        {doc.dueDate && (
                          <span className="inline-flex items-center gap-1">
                            <CalendarClock className="h-3 w-3" />
                            {t("due", { date: fmtDate(doc.dueDate) })}
                          </span>
                        )}
                        {doc.signature && (
                          <span className="inline-flex items-center gap-1 text-emerald-600">
                            <PenLine className="h-3 w-3" />
                            {t("signedBy", { name: doc.signature.fullName, date: fmtDate(doc.signature.signedAt) })}
                          </span>
                        )}
                      </div>
                    </div>
                    {doc.status === "submitted" && (
                      <Button size="sm" variant="outline" className="rounded-xl" onClick={() => approveDoc(i)} disabled={busy}>
                        <BadgeCheck className="mr-2 h-4 w-4" />
                        {t("approve")}
                      </Button>
                    )}
                    <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => patch({ removeDocumentIndex: i })} disabled={busy} aria-label={t("removeDocumentLabel", { document: doc.name })}>
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                    </Button>
                  </li>
                ))}
              </ul>
            )}

            {/* Add document */}
            <div className="mt-4 space-y-3 rounded-xl border border-dashed border-border/70 p-4">
              <label className="flex items-center gap-2 text-sm font-medium text-foreground">
                <Checkbox
                  checked={requestFromCandidate}
                  onCheckedChange={(c) => setRequestFromCandidate(Boolean(c))}
                />
                {t("requestFromCandidate")}
              </label>
              <p className="text-xs text-muted-foreground">
                {requestFromCandidate ? t("requestHint") : t("referenceHint")}
              </p>
              <div className="grid gap-2 sm:grid-cols-2">
                <Input value={newDocName} onChange={(e) => setNewDocName(e.target.value)} placeholder={t("docNamePlaceholder")} />
                {requestFromCandidate ? (
                  <DateTimePicker
                    mode="date"
                    value={newDocDue}
                    onChange={setNewDocDue}
                    placeholder={t("dueDate")}
                  />
                ) : (
                  <Input value={newDocUrl} onChange={(e) => setNewDocUrl(e.target.value)} placeholder={t("docUrlPlaceholder")} />
                )}
              </div>
              {requestFromCandidate && (
                <label className="flex items-center gap-2 text-sm text-foreground">
                  <Checkbox
                    checked={requiresSignature}
                    onCheckedChange={(c) => setRequiresSignature(Boolean(c))}
                  />
                  {t("requiresSignatureLabel")}
                </label>
              )}
              <Button onClick={addDocument} disabled={busy || newDocName.trim().length < 1} className="rounded-xl">
                {requestFromCandidate ? <Send className="mr-2 h-4 w-4" /> : <Plus className="mr-2 h-4 w-4" />}
                {requestFromCandidate ? t("sendRequest") : t("addDocument")}
              </Button>
            </div>
          </div>

          {/* Probation */}
          <div className="rounded-2xl border border-border/60 bg-card p-5">
            <h2 className="flex items-center gap-2 text-lg font-semibold text-foreground">
              <ShieldCheck className="h-5 w-5 text-primary" />
              {t("probation")}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">{t("probationHint")}</p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="prob-end">{t("probationEndDate")}</Label>
                <DateTimePicker
                  mode="date"
                  value={probEnd}
                  onChange={setProbEnd}
                  placeholder={t("probationEndDate")}
                />
              </div>
              <div className="space-y-1.5">
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
            <div className="mt-3 space-y-1.5">
              <Label htmlFor="prob-notes">{t("probationNotes")}</Label>
              <Textarea
                id="prob-notes"
                value={probNotes}
                onChange={(e) => setProbNotes(e.target.value)}
                placeholder={t("probationNotesPlaceholder")}
                rows={2}
              />
            </div>
            <Button onClick={saveProbation} disabled={busy} className="mt-3 rounded-xl">
              {t("saveProbation")}
            </Button>
          </div>

          {/* Notes */}
          <div className="rounded-2xl border border-border/60 bg-card p-5">
            <h2 className="flex items-center gap-2 text-lg font-semibold text-foreground">
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
            <Button onClick={saveNotes} disabled={busy} className="mt-3 rounded-xl">
              {t("saveNotes")}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
