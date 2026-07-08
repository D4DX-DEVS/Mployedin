"use client";

import { useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { useConfirm } from "@/hooks/useConfirm";
import { PageHero } from "@/components/shared/PageHero";
import {
  Mail,
  Loader2,
  Plus,
  Trash2,
  Play,
  Pause,
  Send,
  Eye,
  MousePointerClick,
} from "lucide-react";
import {
  useEmailSequences,
  useEmailSequence,
  useCreateSequence,
  useUpdateSequence,
  useAddRecipients,
  useDeleteSequence,
  type EmailSequence,
  type SequenceStatus,
  type SequenceStepInput,
} from "@/hooks/useEmailSequences";

const STATUS_STYLES: Record<SequenceStatus, string> = {
  draft: "bg-muted text-muted-foreground",
  active: "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300",
  paused: "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300",
  completed: "bg-sky-50 text-sky-700 dark:bg-sky-500/10 dark:text-sky-300",
};

function StatusBadge({ status }: { status: SequenceStatus }) {
  const t = useTranslations("emailSequences");
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full px-2.5 py-1 text-xs font-semibold ${STATUS_STYLES[status]}`}
    >
      {t(status)}
    </span>
  );
}

function Stat({ icon, label, value }: { icon: ReactNode; label: string; value: number }) {
  return (
    <div className="rounded-xl bg-muted/50 px-2 py-2 text-center">
      <div className="flex items-center justify-center text-muted-foreground">{icon}</div>
      <p className="mt-1 text-sm font-semibold text-foreground">{value}</p>
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
    </div>
  );
}

export default function EmployerCampaignsPage() {
  const t = useTranslations("emailSequences");
  const { data: sequences = [], isLoading, isError } = useEmailSequences();
  const [createOpen, setCreateOpen] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);

  const filteredSequences = sequences.filter((seq) => {
    if (search.trim()) {
      const q = search.toLowerCase();
      if (!seq.name.toLowerCase().includes(q) && !(seq.description?.toLowerCase().includes(q))) {
        return false;
      }
    }
    if (statusFilter && seq.status !== statusFilter) {
      return false;
    }
    return true;
  });

  const totalPages = Math.max(1, Math.ceil(filteredSequences.length / limit));
  const pagedSequences = filteredSequences.slice((page - 1) * limit, page * limit);

  return (
    <div className="page-container space-y-6">
      <PageHero
        icon={Mail}
        title={t("title")}
        description={t("subtitle")}
        actions={
          sequences.length > 0 ? (
            <Button onClick={() => setCreateOpen(true)} className="shrink-0">
              <Plus className="mr-2 h-4 w-4" />
              {t("create")}
            </Button>
          ) : undefined
        }
      />

      {sequences.length > 0 && (
        <div className="workspace-panel-surface rounded-[28px] p-4 sm:p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <Input
              placeholder={t("searchPlaceholder") || "Search campaigns..."}
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              className="h-10 rounded-xl border-border bg-background sm:flex-1"
            />
            <Select
              value={statusFilter || "all"}
              onValueChange={(v) => { setStatusFilter(v === "all" ? null : v); setPage(1); }}
            >
              <SelectTrigger className="h-10 rounded-xl border-border bg-background">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("allStatuses") || "All statuses"}</SelectItem>
                <SelectItem value="draft">{t("draft")}</SelectItem>
                <SelectItem value="active">{t("active")}</SelectItem>
                <SelectItem value="paused">{t("paused")}</SelectItem>
                <SelectItem value="completed">{t("completed")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-5">
              <div className="flex items-start justify-between gap-3">
                <Skeleton className="h-5 w-32" />
                <Skeleton className="h-5 w-16 rounded-full" />
              </div>
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-2/3" />
            </div>
          ))}
        </div>
      ) : isError ? (
        <div className="rounded-2xl border border-border bg-card p-10 text-center text-sm text-muted-foreground">
          {t("loadError")}
        </div>
      ) : filteredSequences.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-card p-12 text-center">
          <Mail className="mx-auto h-10 w-10 text-muted-foreground/60" />
          <p className="mt-4 text-sm text-muted-foreground">{search || statusFilter ? t("noResults") || "No campaigns match your filters." : t("noSequences")}</p>
          {!search && !statusFilter ? (
            <Button onClick={() => setCreateOpen(true)} className="mt-5">
              <Plus className="mr-2 h-4 w-4" />
              {t("create")}
            </Button>
          ) : null}
        </div>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {pagedSequences.map((seq) => (
              <SequenceCard key={seq._id} sequence={seq} onOpen={() => setActiveId(seq._id)} />
            ))}
          </div>
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 pt-4">
              <Button
                variant="outline"
                size="sm"
                disabled={page === 1}
                onClick={() => setPage(page - 1)}
                className="h-9 rounded-xl"
              >
                {t("previous")}
              </Button>
              <span className="text-sm text-muted-foreground">
                {t("pageInfo", { page, totalPages })}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={page === totalPages}
                onClick={() => setPage(page + 1)}
                className="h-9 rounded-xl"
              >
                {t("next")}
              </Button>
            </div>
          )}
        </>
      )}

      <CreateSequenceDialog open={createOpen} onOpenChange={setCreateOpen} />
      <SequenceDetailDialog sequenceId={activeId} onClose={() => setActiveId(null)} />
    </div>
  );
}

function SequenceCard({ sequence, onOpen }: { sequence: EmailSequence; onOpen: () => void }) {
  const t = useTranslations("emailSequences");
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex h-full flex-col gap-3 rounded-2xl border border-border bg-card p-5 text-left transition hover:border-sky-300 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
    >
      <div className="flex items-start justify-between gap-3">
        <h3 className="line-clamp-1 text-base font-semibold text-foreground">{sequence.name}</h3>
        <StatusBadge status={sequence.status} />
      </div>
      {sequence.description ? (
        <p className="line-clamp-2 text-sm text-muted-foreground">{sequence.description}</p>
      ) : null}
      <p className="text-xs text-muted-foreground">
        {t("stepCount", { count: sequence.steps?.length ?? 0 })}
      </p>
      <div className="mt-auto grid grid-cols-3 gap-2 pt-2">
        <Stat icon={<Send className="h-3.5 w-3.5" />} label={t("sent")} value={sequence.totalSent} />
        <Stat icon={<Eye className="h-3.5 w-3.5" />} label={t("opened")} value={sequence.totalOpened} />
        <Stat
          icon={<MousePointerClick className="h-3.5 w-3.5" />}
          label={t("clicked")}
          value={sequence.totalClicked}
        />
      </div>
    </button>
  );
}

interface DraftStep {
  subject: string;
  body: string;
  delayDays: number;
}

function CreateSequenceDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const t = useTranslations("emailSequences");
  const createSeq = useCreateSequence();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [fromName, setFromName] = useState("");
  const [fromEmail, setFromEmail] = useState("");
  const [steps, setSteps] = useState<DraftStep[]>([{ subject: "", body: "", delayDays: 1 }]);

  function reset() {
    setName("");
    setDescription("");
    setFromName("");
    setFromEmail("");
    setSteps([{ subject: "", body: "", delayDays: 1 }]);
  }

  function updateStep(i: number, patch: Partial<DraftStep>) {
    setSteps((prev) => prev.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));
  }
  function addStep() {
    setSteps((prev) => (prev.length >= 10 ? prev : [...prev, { subject: "", body: "", delayDays: 1 }]));
  }
  function removeStep(i: number) {
    setSteps((prev) => (prev.length <= 1 ? prev : prev.filter((_, idx) => idx !== i)));
  }

  async function handleCreate() {
    const trimmed = name.trim();
    if (!trimmed) {
      toast.error(t("nameRequired"));
      return;
    }
    const cleanSteps: SequenceStepInput[] = steps
      .filter((s) => s.subject.trim() && s.body.trim())
      .map((s) => ({
        subject: s.subject.trim(),
        body: s.body.trim(),
        delayDays: Math.min(Math.max(s.delayDays || 0, 0), 90),
      }));
    if (cleanSteps.length === 0) {
      toast.error(t("stepRequired"));
      return;
    }
    try {
      await createSeq.mutateAsync({
        name: trimmed,
        description: description.trim(),
        fromName: fromName.trim(),
        fromEmail: fromEmail.trim(),
        steps: cleanSteps,
      });
      toast.success(t("created"));
      reset();
      onOpenChange(false);
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) reset();
        onOpenChange(o);
      }}
    >
      <DialogContent className="max-h-[88vh] max-w-2xl overflow-hidden rounded-3xl p-0">
        <DialogHeader className="border-b border-border px-6 py-5">
          <DialogTitle>{t("create")}</DialogTitle>
          <DialogDescription>{t("subtitle")}</DialogDescription>
        </DialogHeader>

        <div className="max-h-[62vh] space-y-4 overflow-y-auto px-6 py-4">
          <div className="space-y-1.5">
            <Label htmlFor="seq-name">{t("name")}</Label>
            <Input
              id="seq-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("namePlaceholder")}
              maxLength={100}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="seq-description">{t("description")}</Label>
            <Textarea
              id="seq-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t("descriptionPlaceholder")}
              maxLength={500}
              rows={2}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="seq-from-name">{t("fromName")}</Label>
              <Input
                id="seq-from-name"
                value={fromName}
                onChange={(e) => setFromName(e.target.value)}
                placeholder={t("fromNamePlaceholder")}
                maxLength={100}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="seq-from-email">{t("fromEmail")}</Label>
              <Input
                id="seq-from-email"
                type="email"
                value={fromEmail}
                onChange={(e) => setFromEmail(e.target.value)}
                placeholder={t("fromEmailPlaceholder")}
                maxLength={200}
              />
            </div>
          </div>

          <div className="space-y-3 pt-2">
            <div className="flex items-center justify-between">
              <Label>{t("steps")}</Label>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={addStep}
                disabled={steps.length >= 10}
              >
                <Plus className="mr-2 h-4 w-4" />
                {t("addStep")}
              </Button>
            </div>
            {steps.map((step, i) => (
              <div key={i} className="space-y-2 rounded-2xl border border-border bg-background p-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-muted-foreground">
                    {t("stepLabel", { number: i + 1 })}
                  </span>
                  {steps.length > 1 ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => removeStep(i)}
                      className="h-7 px-2 text-red-600 hover:text-red-700"
                    >
                      <Trash2 className="mr-1 h-3.5 w-3.5" />
                      {t("removeStep")}
                    </Button>
                  ) : null}
                </div>
                <Input
                  value={step.subject}
                  onChange={(e) => updateStep(i, { subject: e.target.value })}
                  placeholder={t("subjectPlaceholder")}
                  maxLength={200}
                />
                <Textarea
                  value={step.body}
                  onChange={(e) => updateStep(i, { body: e.target.value })}
                  placeholder={t("bodyPlaceholder")}
                  maxLength={10000}
                  rows={3}
                />
                <p className="text-[11px] text-muted-foreground">
                  {t("bodyHint")}{" "}
                  <code className="rounded bg-muted px-1 py-0.5 text-[10px]">{"{{name}}"}</code>{" "}
                  <code className="rounded bg-muted px-1 py-0.5 text-[10px]">{"{{firstName}}"}</code>
                </p>
                <div className="flex items-center gap-3">
                  <Label htmlFor={`step-delay-${i}`} className="text-xs text-muted-foreground">
                    {t("delayDays")}
                  </Label>
                  <Input
                    id={`step-delay-${i}`}
                    type="number"
                    min={0}
                    max={90}
                    value={step.delayDays}
                    onChange={(e) => updateStep(i, { delayDays: Number(e.target.value) })}
                    className="h-9 w-24"
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        <DialogFooter className="border-t border-border px-6 py-4">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={createSeq.isPending}>
            {t("cancel")}
          </Button>
          <Button onClick={handleCreate} disabled={createSeq.isPending}>
            {createSeq.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            {t("create")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SequenceDetailDialog({ sequenceId, onClose }: { sequenceId: string | null; onClose: () => void }) {
  const t = useTranslations("emailSequences");
  const { data: sequence, isLoading } = useEmailSequence(sequenceId);
  const updateSeq = useUpdateSequence();
  const addRecipients = useAddRecipients();
  const deleteSeq = useDeleteSequence();
  const { confirm, ConfirmDialogNode } = useConfirm();
  const [recEmail, setRecEmail] = useState("");
  const [recName, setRecName] = useState("");

  async function handleToggle() {
    if (!sequence) return;
    if (sequence.status === "active") {
      try {
        await updateSeq.mutateAsync({ id: sequence._id, status: "paused" });
        toast.success(t("pausedToast"));
      } catch (err) {
        toast.error((err as Error).message);
      }
    } else {
      if (!sequence.steps?.length) {
        toast.error(t("activateNeedsSteps"));
        return;
      }
      try {
        await updateSeq.mutateAsync({ id: sequence._id, status: "active" });
        toast.success(t("activatedToast"));
      } catch (err) {
        toast.error((err as Error).message);
      }
    }
  }

  async function handleAddRecipient() {
    if (!sequence) return;
    const email = recEmail.trim();
    const recipientName = recName.trim();
    if (!email || !recipientName || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      toast.error(t("emailInvalid"));
      return;
    }
    try {
      await addRecipients.mutateAsync({ id: sequence._id, recipients: [{ email, name: recipientName }] });
      toast.success(t("recipientAdded"));
      setRecEmail("");
      setRecName("");
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  async function handleDelete() {
    if (!sequence) return;
    const ok = await confirm({
      message: t("deleteConfirm"),
      variant: "destructive",
      confirmLabel: t("delete"),
    });
    if (!ok) return;
    try {
      await deleteSeq.mutateAsync(sequence._id);
      toast.success(t("deleted"));
      onClose();
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  return (
    <>
      {ConfirmDialogNode}
      <Dialog open={Boolean(sequenceId)} onOpenChange={(o) => !o && onClose()}>
        <DialogContent className="max-h-[88vh] max-w-2xl overflow-hidden rounded-3xl p-0">
          {isLoading || !sequence ? (
            <div className="flex justify-center py-16">
              <DialogTitle className="sr-only">{t("title")}</DialogTitle>
              <DialogDescription className="sr-only">{t("subtitle")}</DialogDescription>
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="flex max-h-[88vh] flex-col">
              <DialogHeader className="border-b border-border px-6 py-5">
                <div className="flex items-center justify-between gap-3">
                  <DialogTitle className="flex items-center gap-2">
                    <Mail className="h-5 w-5" /> {sequence.name}
                  </DialogTitle>
                  <StatusBadge status={sequence.status} />
                </div>
                {sequence.description ? (
                  <DialogDescription>{sequence.description}</DialogDescription>
                ) : (
                  <DialogDescription className="sr-only">{sequence.name}</DialogDescription>
                )}
              </DialogHeader>

              <div className="flex-1 space-y-6 overflow-y-auto px-6 py-4">
                <div className="flex flex-wrap gap-2">
                  {sequence.status !== "completed" ? (
                    <Button
                      size="sm"
                      variant={sequence.status === "active" ? "outline" : "default"}
                      onClick={handleToggle}
                      disabled={updateSeq.isPending}
                    >
                      {sequence.status === "active" ? (
                        <Pause className="mr-2 h-4 w-4" />
                      ) : (
                        <Play className="mr-2 h-4 w-4" />
                      )}
                      {sequence.status === "active" ? t("pause") : t("activate")}
                    </Button>
                  ) : null}
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleDelete}
                    disabled={deleteSeq.isPending}
                    className="text-red-600 hover:text-red-700"
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    {t("delete")}
                  </Button>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <Stat icon={<Send className="h-3.5 w-3.5" />} label={t("sent")} value={sequence.totalSent} />
                  <Stat icon={<Eye className="h-3.5 w-3.5" />} label={t("opened")} value={sequence.totalOpened} />
                  <Stat
                    icon={<MousePointerClick className="h-3.5 w-3.5" />}
                    label={t("clicked")}
                    value={sequence.totalClicked}
                  />
                </div>

                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {t("steps")}
                  </p>
                  <ol className="space-y-2">
                    {sequence.steps.map((s, i) => (
                      <li key={s._id ?? i} className="rounded-2xl border border-border bg-background p-4">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-semibold text-muted-foreground">
                            {t("stepLabel", { number: i + 1 })}
                          </span>
                          <span className="text-[11px] text-muted-foreground">
                            {t("delayDays")}: {s.delayDays}
                          </span>
                        </div>
                        <p className="mt-1 text-sm font-semibold text-foreground">{s.subject || "—"}</p>
                        <p className="mt-1 line-clamp-3 whitespace-pre-wrap text-xs text-muted-foreground">
                          {s.body}
                        </p>
                      </li>
                    ))}
                  </ol>
                </div>

                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {t("recipientCount", { count: sequence.recipients?.length ?? 0 })}
                  </p>
                  <div className="flex flex-col gap-2 rounded-2xl border border-border bg-background p-3 sm:flex-row">
                    <Input
                      value={recName}
                      onChange={(e) => setRecName(e.target.value)}
                      placeholder={t("recipientNamePlaceholder")}
                      className="sm:flex-1"
                      maxLength={120}
                    />
                    <Input
                      type="email"
                      value={recEmail}
                      onChange={(e) => setRecEmail(e.target.value)}
                      placeholder={t("recipientEmailPlaceholder")}
                      className="sm:flex-1"
                      maxLength={200}
                    />
                    <Button
                      size="sm"
                      onClick={handleAddRecipient}
                      disabled={addRecipients.isPending}
                      className="shrink-0"
                    >
                      {addRecipients.isPending ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <Plus className="mr-2 h-4 w-4" />
                      )}
                      {t("addRecipient")}
                    </Button>
                  </div>
                  {sequence.recipients?.length ? (
                    <ul className="mt-3 space-y-2">
                      {sequence.recipients.map((r, i) => (
                        <li
                          key={r._id ?? i}
                          className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-background p-3"
                        >
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-foreground">{r.name}</p>
                            <p className="truncate text-xs text-muted-foreground">{r.email}</p>
                          </div>
                          <Badge variant="secondary" className="shrink-0 text-[11px]">
                            {t(`recipientStatus_${r.status}`)}
                          </Badge>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-3 text-sm text-muted-foreground">{t("noRecipients")}</p>
                  )}
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
