"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import {
  Scale, Plus, Trash2, Edit2, Save, X, Loader2, Shield,
  ChevronDown, ChevronUp,
} from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  useAdminMatchingWeightTemplates,
  useCreateAdminMatchingWeightTemplate,
  useUpdateAdminMatchingWeightTemplate,
  useDeleteAdminMatchingWeightTemplate,
  type MatchingWeightTemplateItem,
  type MatchingWeightTemplatePayload,
} from "@/hooks/useMatchingWeightTemplates";
import type { MatchingWeights } from "@/hooks/useMatchingWeights";

const DEFAULT_WEIGHTS: MatchingWeights = {
  skills: 40,
  experience: 30,
  education: 15,
  industryExperience: 10,
  preferredQualifications: 5,
};

interface TemplateFormState {
  name: string;
  description: string;
  weights: MatchingWeights;
  tags: string[];
  isDefault: boolean;
}

function emptyForm(): TemplateFormState {
  return {
    name: "",
    description: "",
    weights: { ...DEFAULT_WEIGHTS },
    tags: [],
    isDefault: false,
  };
}

function templateToForm(t: MatchingWeightTemplateItem): TemplateFormState {
  return {
    name: t.name,
    description: t.description ?? "",
    weights: t.weights,
    tags: t.tags ?? [],
    isDefault: t.isDefault,
  };
}

export default function AdminMatchingWeightTemplatesPage() {
  const tr = useTranslations("adminMatchingWeightTemplates");
  const { data: templates, isLoading } = useAdminMatchingWeightTemplates();
  const createMut = useCreateAdminMatchingWeightTemplate();
  const updateMut = useUpdateAdminMatchingWeightTemplate();
  const deleteMut = useDeleteAdminMatchingWeightTemplate();

  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<TemplateFormState>(emptyForm());
  const [tagInput, setTagInput] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const weightLabels: Record<keyof MatchingWeights, string> = {
    skills: tr("skillsMatchLabel"),
    experience: tr("experienceLabel"),
    education: tr("educationLabel"),
    industryExperience: tr("industryExperienceLabel"),
    preferredQualifications: tr("preferredQualificationsLabel"),
  };

  const total = Object.values(form.weights).reduce((a, b) => a + b, 0);
  const isTotalValid = total === 100;

  const openCreate = () => {
    setEditId(null);
    setForm(emptyForm());
    setShowForm(true);
  };

  const openEdit = (t: MatchingWeightTemplateItem) => {
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
    if (!isTotalValid) return;
    const payload: MatchingWeightTemplatePayload = {
      name: form.name,
      description: form.description || undefined,
      weights: form.weights,
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

  const updateWeight = (key: keyof MatchingWeights, value: number) => {
    setForm((f) => ({ ...f, weights: { ...f.weights, [key]: Math.max(0, Math.min(100, value)) } }));
  };

  const isSaving = createMut.isPending || updateMut.isPending;
  const weightKeys = Object.keys(DEFAULT_WEIGHTS) as Array<keyof MatchingWeights>;

  if (isLoading) {
    return (
      <div className="page-container">
        <PageHeader title={tr("pageTitle")} description={tr("pageDescription")} />
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-24 animate-pulse rounded-2xl border border-border bg-background/70" />
        ))}
      </div>
    );
  }

  return (
    <div className="page-container">
      <PageHeader
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
          <div className="flex items-start justify-between gap-3">
            <h3 className="text-base sm:text-lg font-semibold text-foreground">
              {editId ? tr("editFormTitle") : tr("createFormTitle")}
            </h3>
            <button onClick={closeForm} className="shrink-0 text-muted-foreground hover:text-foreground">
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
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
            <span className="text-sm text-foreground">{tr("markAsDefaultLabel")}</span>
          </div>

          {/* Weights */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-muted-foreground">{tr("weightDistributionLabel")}</p>
              <span className={`text-sm font-semibold ${isTotalValid ? "text-green-600" : "text-red-500"}`}>
                {tr("totalWeightLabel", { total })} {isTotalValid ? tr("weightDistributionValid") : tr("weightDistributionInvalid")}
              </span>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {weightKeys.map((key) => (
                <div key={key} className="flex items-center gap-3 rounded-xl border border-border bg-background/80 p-3">
                  <span className="min-w-[8rem] text-sm">{weightLabels[key]}</span>
                  <Input
                    type="number"
                    value={form.weights[key]}
                    onChange={(e) => updateWeight(key, Number(e.target.value))}
                    className="h-8 w-20 text-center"
                    min={0}
                    max={100}
                  />
                  <span className="text-xs text-muted-foreground">%</span>
                  {/* Visual bar */}
                  <div className="flex-1">
                    <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-sky-500 transition-all"
                        style={{ width: `${form.weights[key]}%` }}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Save / Cancel */}
          <div className="flex gap-3 pt-2">
            <Button
              onClick={handleSave}
              disabled={!form.name.trim() || !isTotalValid || isSaving}
              className="gap-2 rounded-xl"
            >
              {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {editId ? tr("updateButton") : tr("createButton")}
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
          <Scale className="mb-3 h-10 w-10 text-muted-foreground" />
          <p className="text-sm font-semibold text-foreground">{tr("emptyStateTitle")}</p>
          <p className="mb-4 mt-1 text-xs text-muted-foreground">
            {tr("emptyStateDescription")}
          </p>
          <Button onClick={openCreate} size="sm" className="gap-1.5 rounded-xl">
            <Plus className="h-3.5 w-3.5" /> {tr("createFirstButton")}
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {templates?.map((t) => {
            const isExpanded = expandedId === t._id;
            const topWeight = weightKeys.reduce((highest, key) =>
              t.weights[key] > t.weights[highest] ? key : highest, weightKeys[0]);
            return (
              <div
                key={t._id}
                className="rounded-2xl border border-border bg-background/80 p-5 transition-all hover:border-sky-500/25"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <Scale className="h-4 w-4 text-sky-600" />
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
                      {tr("topPriorityLabel", { weightLabel: weightLabels[topWeight], percentage: t.weights[topWeight] })}
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

                {/* Expanded: weight distribution */}
                {isExpanded && (
                  <div className="mt-4 rounded-xl border border-border bg-background/60 p-4">
                    <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      {tr("weightDistributionExpandedLabel")}
                    </p>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {weightKeys.map((key) => (
                        <div key={key} className="flex items-center gap-2">
                          <span className="min-w-[8rem] text-xs text-muted-foreground">{weightLabels[key]}</span>
                          <div className="flex-1">
                            <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                              <div
                                className="h-full rounded-full bg-sky-500 transition-all"
                                style={{ width: `${t.weights[key]}%` }}
                              />
                            </div>
                          </div>
                          <span className="min-w-[2.5rem] text-right text-xs font-semibold">{t.weights[key]}%</span>
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
