"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { DateTimePicker } from "@/components/ui/date-time-picker";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { StepFormDialog } from "@/components/shared/StepFormDialog";
import { TaskRecordPicker, type PickedRecord } from "@/components/features/tasks/TaskRecordPicker";
import { csrfFetch } from "@/lib/security/csrf-client";

interface NewTaskDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  categoryOptions: { value: string; label: string }[];
  priorityOptions: { value: string; label: string }[];
  onCreated: () => void;
}

const EMPTY = { title: "", description: "", priority: "medium", category: "follow_up", dueDate: "" };

/**
 * The agent's New task dialog, on the shared StepFormDialog frame: step 1 is
 * what the task says, step 2 the candidate, job and/or employer it is about
 * (picked from the records the agent works with; the task row then links
 * straight to them). Two short steps instead of one form that scrolled.
 * Closing it discards the draft.
 */
export function NewTaskDialog({ open, onOpenChange, categoryOptions, priorityOptions, onCreated }: NewTaskDialogProps) {
  const t = useTranslations("agentTasks");
  const tc = useTranslations("common");
  const [form, setForm] = useState(EMPTY);
  const [candidate, setCandidate] = useState<PickedRecord | null>(null);
  const [job, setJob] = useState<PickedRecord | null>(null);
  const [employer, setEmployer] = useState<PickedRecord | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // BUG-13: a cancelled draft must not reappear on reopen.
  const close = (next: boolean) => {
    if (!next) {
      setForm(EMPTY);
      setCandidate(null);
      setJob(null);
      setEmployer(null);
      setError("");
    }
    onOpenChange(next);
  };

  // A job belongs to one employer: picking it fills the employer in, and
  // changing or clearing the employer drops a job that was theirs.
  const pickJob = (picked: PickedRecord | null) => {
    setJob(picked);
    if (picked?.employerId) setEmployer({ id: picked.employerId, label: picked.employerName ?? "" });
  };
  const pickEmployer = (picked: PickedRecord | null) => {
    setEmployer(picked);
    if (job && job.employerId !== picked?.id) setJob(null);
  };

  // Portalled to the body (modal, so it still scrolls and takes clicks inside
  // the dialog): rendered inside the step frame, a list near the foot was
  // clipped by the frame's overflow.
  const pickerProps = { loadingMessage: tc("searching"), modal: true };

  // BUG-12: name the field failure instead of a generic "Validation failed".
  const validateTask = () =>
    !form.title.trim() ? t("taskTitleRequired") : form.title.trim().length > 200 ? t("taskTitleMax") : null;

  const submit = async () => {
    setError("");
    setSaving(true);
    try {
      const res = await csrfFetch("/api/agent/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          description: form.description.trim() || undefined,
          dueDate: form.dueDate ? new Date(form.dueDate).toISOString() : undefined,
          candidateId: candidate?.id,
          jobId: job?.id,
          employerId: employer?.id,
        }),
      });
      if (res.ok) {
        toast.success(t("taskCreatedSuccess"));
        close(false);
        onCreated();
      } else {
        const err = await res.json().catch(() => null);
        // Prefer the field-level detail when the API provides it.
        const detail = Array.isArray(err?.details) ? err.details[0]?.message : undefined;
        setError(detail ?? err?.error ?? t("createTaskFailed"));
      }
    } catch {
      setError(t("createTaskFailed"));
    } finally {
      setSaving(false);
    }
  };

  const taskStep = (
    <>
      <div className="space-y-1.5">
        <Label htmlFor="new-task-title">{t("fieldTitle")}</Label>
        <Input
          id="new-task-title"
          value={form.title}
          maxLength={200}
          onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))}
          placeholder={t("titlePlaceholder")}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="new-task-description">{t("fieldDescription")}</Label>
        <Textarea
          id="new-task-description"
          value={form.description}
          maxLength={2000}
          rows={3}
          onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
          placeholder={t("descriptionPlaceholder")}
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="new-task-category">{t("categoryPlaceholder")}</Label>
          <SearchableSelect
            id="new-task-category"
            options={categoryOptions}
            value={form.category}
            onValueChange={(v) => setForm((p) => ({ ...p, category: v }))}
            modal
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="new-task-priority">{t("priorityPlaceholder")}</Label>
          <SearchableSelect
            id="new-task-priority"
            options={priorityOptions}
            value={form.priority}
            onValueChange={(v) => setForm((p) => ({ ...p, priority: v }))}
            modal
          />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="new-task-due">{t("columnDueDate")}</Label>
        <DateTimePicker mode="date" value={form.dueDate} onChange={(v) => setForm((p) => ({ ...p, dueDate: v }))} />
      </div>
    </>
  );

  const linksStep = (
    <fieldset className="space-y-4">
      <legend className="sr-only">{t("linkSectionTitle")}</legend>
      <p className="text-sm text-muted-foreground">{t("linkSectionHint")}</p>
      <TaskRecordPicker
        type="employer"
        value={employer}
        onChange={pickEmployer}
        label={t("linkEmployerLabel")}
        placeholder={t("linkEmployerPlaceholder")}
        searchPlaceholder={t("linkEmployerSearch")}
        emptyMessage={t("linkEmployerEmpty")}
        clearLabel={t("linkEmployerClear")}
        {...pickerProps}
      />
      <TaskRecordPicker
        type="job"
        value={job}
        onChange={pickJob}
        employerId={employer?.id}
        hint={employer ? t("linkJobHintEmployer") : undefined}
        label={t("linkJobLabel")}
        placeholder={t("linkJobPlaceholder")}
        searchPlaceholder={t("linkJobSearch")}
        emptyMessage={t("linkJobEmpty")}
        clearLabel={t("linkJobClear")}
        {...pickerProps}
      />
      <TaskRecordPicker
        type="candidate"
        value={candidate}
        onChange={setCandidate}
        jobId={job?.id}
        hint={job ? t("linkCandidateHintJob") : undefined}
        label={t("linkCandidateLabel")}
        placeholder={t("linkCandidatePlaceholder")}
        searchPlaceholder={t("linkCandidateSearch")}
        emptyMessage={t("linkCandidateEmpty")}
        clearLabel={t("linkCandidateClear")}
        {...pickerProps}
      />
    </fieldset>
  );

  return (
    <StepFormDialog
      open={open}
      onOpenChange={close}
      title={t("createTaskHeading")}
      description={t("createTaskDescription")}
      steps={[
        { label: t("fieldTitle"), content: taskStep, validate: validateTask },
        { label: t("linkSectionTitle"), content: linksStep },
      ]}
      error={error || undefined}
      onErrorDismiss={() => setError("")}
      submitLabel={tc("create")}
      submittingLabel={t("creatingTask")}
      submitting={saving}
      onSubmit={() => void submit()}
    />
  );
}
