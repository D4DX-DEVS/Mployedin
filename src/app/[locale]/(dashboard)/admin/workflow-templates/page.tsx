"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import {
  GitBranch, Plus, Trash2, Edit2, Save, X, Loader2, CheckCircle,
  ArrowRight, ChevronDown, ChevronUp, Sparkles, Shield,
} from "lucide-react";
import { PageHero } from "@/components/shared/PageHero";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  useAdminWorkflowTemplates,
  useCreateAdminWorkflowTemplate,
  useUpdateAdminWorkflowTemplate,
  useDeleteAdminWorkflowTemplate,
  type WorkflowTemplateItem,
  type WorkflowTemplatePayload,
} from "@/hooks/useWorkflowTemplates";
import type { WorkflowStage, WorkflowSettings } from "@/hooks/useWorkflow";

const DEFAULT_STAGES: WorkflowStage[] = [
  { id: "new", label: "New Application", enabled: true, autoProgress: false, order: 1 },
  { id: "screening", label: "AI Screening", enabled: true, autoProgress: true, order: 2 },
  { id: "shortlisted", label: "Shortlisted", enabled: true, autoProgress: false, order: 3 },
  { id: "interview_scheduled", label: "Interview Scheduled", enabled: true, autoProgress: true, order: 4 },
  { id: "interview_completed", label: "Interview Completed", enabled: true, autoProgress: false, order: 5 },
  { id: "offer_extended", label: "Offer Extended", enabled: true, autoProgress: false, order: 6 },
  { id: "accepted", label: "Offer Accepted", enabled: true, autoProgress: false, order: 7 },
  { id: "rejected", label: "Rejected", enabled: true, autoProgress: false, order: 8 },
];

const DEFAULT_SETTINGS: WorkflowSettings = {
  aiAutoScreen: true,
  notifyOnStageChange: true,
  autoRejectBelow: 40,
};

interface TemplateFormState {
  name: string;
  description: string;
  stages: WorkflowStage[];
  settings: WorkflowSettings;
  tags: string[];
  isDefault: boolean;
}

function emptyForm(): TemplateFormState {
  return {
    name: "",
    description: "",
    stages: [...DEFAULT_STAGES],
    settings: { ...DEFAULT_SETTINGS },
    tags: [],
    isDefault: false,
  };
}

function templateToForm(t: WorkflowTemplateItem): TemplateFormState {
  return {
    name: t.name,
    description: t.description ?? "",
    stages: t.stages,
    settings: t.settings,
    tags: t.tags ?? [],
    isDefault: t.isDefault,
  };
}

export default function AdminWorkflowTemplatesPage() {
  const tr = useTranslations("adminWorkflowTemplates");
  const { data: templates, isLoading } = useAdminWorkflowTemplates();
  const createMut = useCreateAdminWorkflowTemplate();
  const updateMut = useUpdateAdminWorkflowTemplate();
  const deleteMut = useDeleteAdminWorkflowTemplate();

  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<TemplateFormState>(emptyForm());
  const [tagInput, setTagInput] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const openCreate = () => {
    setEditId(null);
    setForm(emptyForm());
    setShowForm(true);
  };

  const openEdit = (t: WorkflowTemplateItem) => {
    setEditId(t._id);
    setForm(templateToForm(t));
    setShowForm(true);
  };

  const closeForm = () => {
    setShowForm(false);
    setEditId(null);
    setForm(emptyForm());
  };

  const handleSave = async () => {
    const payload: WorkflowTemplatePayload = {
      name: form.name,
      description: form.description || undefined,
      stages: form.stages,
      settings: form.settings,
      tags: form.tags.length > 0 ? form.tags : undefined,
      isDefault: form.isDefault,
    };
    if (editId) {
      await updateMut.mutateAsync({ id: editId, ...payload });
    } else {
      await createMut.mutateAsync(payload);
    }
    closeForm();
  };

  const handleDelete = async (id: string) => {
    await deleteMut.mutateAsync(id);
  };

  const addTag = () => {
    const tag = tagInput.trim();
    if (tag && !form.tags.includes(tag)) {
      setForm((f) => ({ ...f, tags: [...f.tags, tag] }));
      setTagInput("");
    }
  };

  const removeTag = (tag: string) => {
    setForm((f) => ({ ...f, tags: f.tags.filter((t) => t !== tag) }));
  };

  const toggleStage = (stageId: string, key: "enabled" | "autoProgress") => {
    setForm((f) => ({
      ...f,
      stages: f.stages.map((s) => (s.id === stageId ? { ...s, [key]: !s[key] } : s)),
    }));
  };

  const moveStage = (index: number, direction: "up" | "down") => {
    const sorted = [...form.stages].sort((a, b) => a.order - b.order);
    const swap = direction === "up" ? index - 1 : index + 1;
    if (swap < 0 || swap >= sorted.length) return;
    [sorted[index], sorted[swap]] = [sorted[swap], sorted[index]];
    sorted.forEach((s, i) => { s.order = i + 1; });
    setForm((f) => ({ ...f, stages: sorted }));
  };

  const isSaving = createMut.isPending || updateMut.isPending;

  if (isLoading) {
    return (
      <div className="page-container space-y-4">
        <PageHero
          icon={GitBranch}
          eyebrow={tr("adminWorkspaceLabel")}
          title={tr("pageTitle")}
          description={tr("pageDescription")}
        />
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-24 animate-pulse rounded-2xl border border-border bg-background/70" />
        ))}
      </div>
    );
  }

  return (
    <div className="page-container space-y-6">
      <PageHero
        icon={GitBranch}
        eyebrow={tr("adminWorkspaceLabel")}
        title={tr("pageTitle")}
        description={tr("pageDescription")}
        actions={
          <Button onClick={openCreate} className="gap-2 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90" size="sm">
            <Plus className="h-4 w-4" /> {tr("newTemplateButton")}
          </Button>
        }
      />

      {/* ─── Create / Edit Form ─── */}
      {showForm && (
        <section className="rounded-2xl border border-sky-500/30 bg-sky-500/5 p-4 sm:p-6 space-y-5">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-foreground">
              {editId ? tr("editTemplateHeading") : tr("createNewTemplateHeading")}
            </h3>
            <button onClick={closeForm} className="text-muted-foreground hover:text-foreground">
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-1">
              <label className="text-sm font-medium text-muted-foreground">{tr("nameLabel")}</label>
              <Input
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder={tr("namePlaceholder")}
                maxLength={100}
              />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium text-muted-foreground">{tr("descriptionLabel")}</label>
              <Input
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                placeholder={tr("descriptionPlaceholder")}
                maxLength={500}
              />
            </div>
          </div>

          {/* Tags */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-muted-foreground">{tr("tagsLabel")}</label>
            <div className="flex flex-wrap gap-2">
              {form.tags.map((tag) => (
                <Badge key={tag} variant="secondary" className="gap-1">
                  {tag}
                  <button onClick={() => removeTag(tag)} className="ml-1 text-muted-foreground hover:text-foreground">
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
              <div className="flex gap-1">
                <Input
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addTag())}
                  placeholder={tr("tagPlaceholder")}
                  className="h-8 w-32"
                  maxLength={50}
                />
                <Button size="sm" variant="ghost" onClick={addTag} className="h-8">
                  <Plus className="h-3 w-3" />
                </Button>
              </div>
            </div>
          </div>

          {/* Default switch */}
          <div className="flex items-center gap-3">
            <Switch checked={form.isDefault} onCheckedChange={(v) => setForm((f) => ({ ...f, isDefault: v }))} />
            <span className="text-sm text-foreground">{tr("markAsDefaultCheckbox")}</span>
          </div>

          {/* Settings */}
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="flex items-center gap-3 rounded-xl border border-border bg-background/80 p-3">
              <Switch
                checked={form.settings.aiAutoScreen}
                onCheckedChange={(v) => setForm((f) => ({ ...f, settings: { ...f.settings, aiAutoScreen: v } }))}
              />
              <span className="text-sm">{tr("aiAutoScreenLabel")}</span>
            </div>
            <div className="flex items-center gap-3 rounded-xl border border-border bg-background/80 p-3">
              <Switch
                checked={form.settings.notifyOnStageChange}
                onCheckedChange={(v) => setForm((f) => ({ ...f, settings: { ...f.settings, notifyOnStageChange: v } }))}
              />
              <span className="text-sm">{tr("stageNotificationsLabel")}</span>
            </div>
            <div className="rounded-xl border border-border bg-background/80 p-3">
              <label className="text-xs text-muted-foreground">{tr("autoRejectBelowLabel")}</label>
              <Input
                type="number"
                value={form.settings.autoRejectBelow}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    settings: { ...f.settings, autoRejectBelow: Math.max(0, Math.min(100, Number(e.target.value))) },
                  }))
                }
                className="mt-1 h-8"
                min={0}
                max={100}
              />
            </div>
          </div>

          {/* Stages */}
          <div className="space-y-3">
            <p className="text-sm font-medium text-muted-foreground">{tr("pipelineStagesLabel")}</p>
            {[...form.stages].sort((a, b) => a.order - b.order).map((stage, i) => (
              <div key={stage.id} className="flex items-center gap-3 rounded-xl border border-border bg-background/80 p-3">
                <div className="flex flex-col gap-0.5 text-muted-foreground">
                  <button onClick={() => moveStage(i, "up")} disabled={i === 0}>
                    <ChevronUp className="h-3.5 w-3.5" />
                  </button>
                  <button onClick={() => moveStage(i, "down")} disabled={i === form.stages.length - 1}>
                    <ChevronDown className="h-3.5 w-3.5" />
                  </button>
                </div>
                <span className="min-w-[6rem] text-sm font-medium">{stage.label}</span>
                <div className="ml-auto flex items-center gap-4">
                  <label className="flex items-center gap-1.5 text-xs">
                    <Switch
                      checked={stage.enabled}
                      onCheckedChange={() => toggleStage(stage.id, "enabled")}
                    />
                    {tr("enabledLabel")}
                  </label>
                  <label className="flex items-center gap-1.5 text-xs">
                    <Switch
                      checked={stage.autoProgress}
                      onCheckedChange={() => toggleStage(stage.id, "autoProgress")}
                    />
                    {tr("autoLabel")}
                  </label>
                </div>
              </div>
            ))}
          </div>

          {/* Save / Cancel */}
          <div className="flex gap-3 pt-2">
            <Button
              onClick={handleSave}
              disabled={!form.name.trim() || isSaving}
              className="gap-2 rounded-xl"
            >
              {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {editId ? tr("updateTemplateButton") : tr("createTemplateButton")}
            </Button>
            <Button variant="ghost" onClick={closeForm} className="rounded-xl">
              {tr("cancelButton")}
            </Button>
          </div>
        </section>
      )}

      {/* ─── Template List ─── */}
      {!templates?.length && !showForm ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-background/60 py-16 text-center">
          <GitBranch className="mb-3 h-10 w-10 text-muted-foreground" />
          <p className="text-sm font-semibold text-foreground">{tr("noTemplatesEmptyStateTitle")}</p>
          <p className="mb-4 mt-1 text-xs text-muted-foreground">
            {tr("noTemplatesEmptyStateDescription")}
          </p>
          <Button onClick={openCreate} size="sm" className="gap-1.5 rounded-xl">
            <Plus className="h-3.5 w-3.5" /> {tr("createFirstTemplateButton")}
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {templates?.map((t) => {
            const activeStages = t.stages.filter((s) => s.enabled);
            const isExpanded = expandedId === t._id;
            return (
              <div
                key={t._id}
                className="rounded-2xl border border-border bg-background/80 p-5 transition-all hover:border-sky-500/25"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <GitBranch className="h-4 w-4 text-sky-600" />
                      <h4 className="text-sm font-semibold text-foreground">{t.name}</h4>
                      {t.isDefault && (
                        <Badge variant="secondary" className="gap-1 text-[10px]">
                          <Shield className="h-3 w-3" /> {tr("defaultBadge")}
                        </Badge>
                      )}
                      <Badge variant="outline" className="text-[10px]">{tr("systemBadge")}</Badge>
                    </div>
                    {t.description && (
                      <p className="mt-1 text-xs text-muted-foreground">{t.description}</p>
                    )}
                    {t.tags && t.tags.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {t.tags.map((tag) => (
                          <Badge key={tag} variant="secondary" className="text-[10px]">
                            {tag}
                          </Badge>
                        ))}
                      </div>
                    )}
                    <div className="mt-2 text-xs text-muted-foreground">
                      {tr("stagesSummary", { count: activeStages.length })} · {tr("aiScreenStatus", { status: t.settings.aiAutoScreen ? "On" : "Off" })} · {tr("rejectBelowSummary", { percentage: t.settings.autoRejectBelow })}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setExpandedId(isExpanded ? null : t._id)}
                      className="h-8 w-8 rounded-lg p-0"
                    >
                      {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => openEdit(t)}
                      className="h-8 w-8 rounded-lg p-0 text-muted-foreground hover:text-sky-600"
                    >
                      <Edit2 className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDelete(t._id)}
                      disabled={deleteMut.isPending}
                      className="h-8 w-8 rounded-lg p-0 text-muted-foreground hover:text-red-500"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                {/* Expanded: show pipeline preview */}
                {isExpanded && (
                  <div className="mt-4 rounded-xl border border-border bg-background/60 p-4">
                    <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      {tr("pipelinePreviewHeading")}
                    </p>
                    <div className="flex flex-wrap items-center gap-1.5">
                      {activeStages.map((stage, idx) => (
                        <div key={stage.id} className="flex items-center gap-1.5">
                          <div className="flex items-center gap-1.5 rounded-full border border-border bg-background/70 px-3 py-1.5 text-xs font-medium">
                            <span className="h-2 w-2 rounded-full bg-sky-500" />
                            {stage.label}
                            {stage.autoProgress && (
                              <Sparkles className="h-3 w-3 text-amber-500" />
                            )}
                          </div>
                          {idx < activeStages.length - 1 && (
                            <ArrowRight className="h-3 w-3 text-muted-foreground" />
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
