"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { DateTimePicker } from "@/components/ui/date-time-picker";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { csrfFetch } from "@/lib/security/csrf-client";
import { StepFormDialog } from "@/components/shared/StepFormDialog";
import { TaskRecordPicker, type PickedRecord } from "./TaskRecordPicker";
import { PeoplePicker, type PersonOption } from "./PeoplePicker";

export type AssignableAgentOption = PersonOption;

export async function errorFrom(res: Response, fallback: string): Promise<string> {
  const err = await res.json().catch(() => null);
  const detail = Array.isArray(err?.details) ? err.details[0]?.message : undefined;
  return detail ?? err?.error ?? fallback;
}

const EMPTY = { superAgentUserId: "", title: "", description: "", priority: "medium", dueDate: "" };

type Audience = "agent" | "super_agent";

interface AssignTaskDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  apiBase: string;
  agents: AssignableAgentOption[];
  /** Admin only: super agents can receive tasks, or have agent tasks go through them. */
  superAgents?: AssignableAgentOption[];
  onAssigned: () => void;
  /** Opened from one agent (their row or profile): start with them chosen. */
  presetAgentUserId?: string;
}

/**
 * "Give a task": who (one or many people), whether the giver checks the work,
 * then what and by when, then optional records. Each person gets their own
 * copy. Admin gives to super agents or agents (optionally through a super
 * agent); a super agent gives to their own agents.
 */
export function AssignTaskDialog({
  open, onOpenChange, apiBase, agents, superAgents, onAssigned, presetAgentUserId,
}: AssignTaskDialogProps) {
  const t = useTranslations("assignedTasks");
  const tl = useTranslations("agentTasks");
  const tc = useTranslations("common");
  const [form, setForm] = useState(EMPTY);
  const [audience, setAudience] = useState<Audience>("agent");
  const [people, setPeople] = useState<string[]>([]);
  const [reviewRequired, setReviewRequired] = useState(true);
  // The record(s) the task is about, searched as the one person who gets it.
  const [employer, setEmployer] = useState<PickedRecord | null>(null);
  const [job, setJob] = useState<PickedRecord | null>(null);
  const [candidate, setCandidate] = useState<PickedRecord | null>(null);
  const [saving, setSaving] = useState(false);
  const [container, setContainer] = useState<HTMLDivElement | null>(null);
  // Through a super agent: only their team can be picked (null while loading).
  const [teamAgents, setTeamAgents] = useState<AssignableAgentOption[] | null>(null);
  const canGiveToSuperAgents = Boolean(superAgents);
  const via = audience === "agent" ? form.superAgentUserId : "";

  useEffect(() => {
    if (!via) { setTeamAgents(null); return; }
    let alive = true;
    setTeamAgents(null);
    fetch(`${apiBase}?viaSuperAgent=${encodeURIComponent(via)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (alive) setTeamAgents(d?.agents ?? []); })
      .catch(() => { if (alive) setTeamAgents([]); });
    return () => { alive = false; };
  }, [apiBase, via]);

  const choices = audience === "super_agent" ? superAgents ?? [] : via ? teamAgents ?? [] : agents;
  const single = people.length === 1 ? people[0] : "";

  // A different person (or several) means different records they can open.
  useEffect(() => {
    setEmployer(null);
    setJob(null);
    setCandidate(null);
  }, [single, audience]);

  const pickJob = (picked: PickedRecord | null) => {
    setJob(picked);
    if (picked?.employerId) setEmployer({ id: picked.employerId, label: picked.employerName ?? "" });
  };
  const pickEmployer = (picked: PickedRecord | null) => {
    setEmployer(picked);
    if (job && job.employerId !== picked?.id) setJob(null);
  };

  useEffect(() => {
    if (open && presetAgentUserId) { setAudience("agent"); setPeople([presetAgentUserId]); }
  }, [open, presetAgentUserId]);

  const close = (next: boolean) => {
    if (!next) {
      setForm(EMPTY);
      setPeople([]);
      setAudience("agent");
      setReviewRequired(true);
    }
    onOpenChange(next);
  };

  const submit = async () => {
    if (people.length === 0) { toast.error(t("choosePeople")); return; }
    if (!form.title.trim()) { toast.error(t("titleRequired")); return; }
    setSaving(true);
    try {
      const res = await csrfFetch(apiBase, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          assigneeRole: audience,
          assigneeUserIds: people,
          superAgentUserId: via || undefined,
          title: form.title,
          priority: form.priority,
          reviewRequired,
          description: form.description.trim() || undefined,
          dueDate: form.dueDate ? new Date(form.dueDate).toISOString() : undefined,
          ...(single ? { candidateId: candidate?.id, jobId: job?.id, employerId: employer?.id } : {}),
        }),
      });
      if (!res.ok) { toast.error(await errorFrom(res, t("assignError"))); return; }
      toast.success(people.length > 1 ? t("assignSuccessMany", { count: people.length }) : t("assignSuccess"));
      close(false);
      onAssigned();
    } catch {
      toast.error(t("assignError"));
    } finally {
      setSaving(false);
    }
  };

  const whoStep = (
    <div className="space-y-4">
      {canGiveToSuperAgents && (
        <fieldset className="space-y-1.5">
          <legend className="mb-1.5 text-sm font-medium">{t("fieldWhoFor")}</legend>
          <div className="grid grid-cols-2 gap-2">
            {(["super_agent", "agent"] as const).map((a) => (
              <button
                key={a}
                type="button"
                aria-pressed={audience === a}
                onClick={() => { setAudience(a); setPeople([]); }}
                className={`min-h-11 rounded-lg border px-3 py-2 text-start text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${audience === a ? "border-primary bg-primary/10 font-semibold text-primary" : "hover:bg-muted/50"}`}
              >
                {a === "super_agent" ? t("whoSuperAgents") : t("whoAgents")}
              </button>
            ))}
          </div>
        </fieldset>
      )}
      {canGiveToSuperAgents && audience === "agent" && superAgents && superAgents.length > 0 && (
        <div className="space-y-1.5">
          <Label htmlFor="assign-via">{t("fieldViaSuperAgent")}</Label>
          <SearchableSelect
            id="assign-via"
            options={[
              { value: "direct", label: t("viaDirect") },
              ...superAgents.map((a) => ({ value: a.userId, label: a.name ? `${a.name} · ${a.email}` : a.email, triggerLabel: a.name || a.email })),
            ]}
            value={form.superAgentUserId || "direct"}
            // A new super agent means a new team: the picked agents may not be on it.
            onValueChange={(v) => { setForm((p) => ({ ...p, superAgentUserId: v === "direct" ? "" : v })); setPeople([]); }}
            placeholder={t("viaDirect")}
            container={container}
            modal
          />
          <p className="text-xs text-muted-foreground">{via ? t("viaHelpTeam") : t("viaHelpDirect")}</p>
        </div>
      )}
      <PeoplePicker
        people={choices}
        values={people}
        onChange={setPeople}
        label={audience === "super_agent" ? t("fieldSuperAgents") : t("fieldAgents")}
        loading={Boolean(via) && teamAgents === null}
        emptyMessage={via ? t("noTeamAgents") : audience === "super_agent" ? t("noSuperAgents") : t("noAgents")}
      />
      <div className="flex items-start justify-between gap-4 rounded-lg border p-3">
        <div className="min-w-0">
          <Label htmlFor="assign-review" className="text-sm font-medium">{t("reviewSwitchLabel")}</Label>
          <p className="text-xs text-muted-foreground">{reviewRequired ? t("reviewSwitchOn") : t("reviewSwitchOff")}</p>
        </div>
        <Switch id="assign-review" checked={reviewRequired} onCheckedChange={setReviewRequired} />
      </div>
    </div>
  );

  const taskStep = (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="assign-title">{t("fieldTitle")}</Label>
        <Input id="assign-title" value={form.title} maxLength={200} onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))} placeholder={t("titlePlaceholder")} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="assign-description">{t("fieldDescription")}</Label>
        <Textarea id="assign-description" value={form.description} maxLength={2000} rows={3} onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))} placeholder={t("descriptionPlaceholder")} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="assign-priority">{t("fieldPriority")}</Label>
          <SearchableSelect
            id="assign-priority"
            options={[
              { value: "high", label: t("priorityHigh") },
              { value: "medium", label: t("priorityMedium") },
              { value: "low", label: t("priorityLow") },
            ]}
            value={form.priority}
            onValueChange={(v) => setForm((p) => ({ ...p, priority: v }))}
            container={container}
            modal
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="assign-due">{t("fieldDue")}</Label>
          <DateTimePicker mode="date" minDate={new Date()} value={form.dueDate} onChange={(v) => setForm((p) => ({ ...p, dueDate: v }))} />
        </div>
      </div>
    </div>
  );

  const pickerCommon = {
    forAgentUserId: single,
    endpoint: `${apiBase}/link-options`,
    loadingMessage: tc("searching"),
    container,
    modal: true,
  };
  const linkStep = single ? (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">{t("linkHintAssign")}</p>
      <TaskRecordPicker type="employer" value={employer} onChange={pickEmployer} label={tl("linkEmployerLabel")} placeholder={tl("linkEmployerPlaceholder")} searchPlaceholder={tl("linkEmployerSearch")} emptyMessage={tl("linkEmployerEmpty")} clearLabel={tl("linkEmployerClear")} {...pickerCommon} />
      <TaskRecordPicker type="job" value={job} onChange={pickJob} employerId={employer?.id} hint={employer ? tl("linkJobHintEmployer") : undefined} label={tl("linkJobLabel")} placeholder={tl("linkJobPlaceholder")} searchPlaceholder={tl("linkJobSearch")} emptyMessage={tl("linkJobEmpty")} clearLabel={tl("linkJobClear")} {...pickerCommon} />
      <TaskRecordPicker type="candidate" value={candidate} onChange={setCandidate} jobId={job?.id} hint={job ? tl("linkCandidateHintJob") : undefined} label={tl("linkCandidateLabel")} placeholder={tl("linkCandidatePlaceholder")} searchPlaceholder={tl("linkCandidateSearch")} emptyMessage={tl("linkCandidateEmpty")} clearLabel={tl("linkCandidateClear")} {...pickerCommon} />
    </div>
  ) : (
    <p className="rounded-lg border bg-muted/30 p-3 text-sm text-muted-foreground">{t("linksOnlyOne")}</p>
  );

  return (
    <StepFormDialog
      open={open}
      onOpenChange={close}
      contentRef={setContainer}
      title={t("assignTitle")}
      description={t("assignDescription")}
      steps={[
        { label: t("stepWho"), content: whoStep, validate: () => (people.length === 0 ? t("choosePeople") : null) },
        { label: t("stepTask"), content: taskStep, validate: () => (!form.title.trim() ? t("titleRequired") : null) },
        { label: t("stepLinks"), content: linkStep },
      ]}
      submitLabel={people.length > 1 ? t("assignSubmitMany", { count: people.length }) : t("assignSubmit")}
      submittingLabel={t("assigning")}
      submitting={saving}
      onSubmit={() => void submit()}
    />
  );
}
