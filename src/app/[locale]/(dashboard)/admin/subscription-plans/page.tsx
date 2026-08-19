"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import {
  Plus, Trash2, Edit2, X, Loader2, Crown, ChevronDown, ChevronUp,
  Check, Copy, Users, Briefcase, Sparkles, BarChart3, FileText, ShieldCheck, AlertTriangle,
} from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  useSubscriptionPlans,
  useCreateSubscriptionPlan,
  useUpdateSubscriptionPlan,
  useDeleteSubscriptionPlan,
  type SubscriptionPlanItem,
  type SubscriptionPlanPayload,
  type IEmployerFeatureLimits,
  type IJobSeekerFeatureLimits,
  type IAIFeatureLimit,
} from "@/hooks/useSubscriptionPlans";
import { AI_FEATURE_KEYS, type AIFeatureKey } from "@/types/subscription-plan";
import { convertAndFormat } from "@/lib/currency";
import { csrfFetch } from "@/lib/security/csrf-client";

// ── Constants ──────────────────────────────────────────────────────
const AI_FEATURE_LABELS: Record<AIFeatureKey, string> = {
  ai_chat: "AI Chat",
  ai_daily_insights: "Daily Insights",
  ai_job_matching: "Job Matching",
  ai_cv_extraction: "CV Extraction",
  ai_interview_questions: "Interview Questions",
  ai_skills_gap: "Skills Gap Analysis",
  ai_candidate_screening: "Candidate Screening",
  ai_salary_benchmark: "Salary Benchmark",
  ai_job_description: "Job Description Gen",
  ai_hiring_reports: "Hiring Reports",
  ai_voice_input: "Voice Input",
  ai_skills_suggest: "Skills Suggest",
  ai_profile_fill: "Profile Fill",
  ai_enhance_text: "Enhance Text",
  ai_generate_summary: "Generate Summary",
};

const TIER_COLORS: Record<number, string> = {
  0: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
  1: "bg-slate-200 text-foreground dark:bg-slate-700 dark:text-slate-200",
  2: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  3: "bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300",
};

function defaultEmployerLimits(): IEmployerFeatureLimits {
  return {
    maxActiveJobs: 2,
    maxApplicationsViewPerMonth: 20,
    maxTeamMembers: 1,
    aiFeatures: AI_FEATURE_KEYS.map((f) => ({ feature: f, enabled: false, monthlyLimit: 0 })),
    analyticsLevel: "none",
    dataExport: false,
    commTemplates: false,
    scorecardEvaluations: false,
    matchingWeightCustomization: false,
    workflowCustomization: false,
    prioritySupport: false,
    featuredJobListings: 0,
    brandedCompanyPage: false,
  };
}

function defaultJobSeekerLimits(): IJobSeekerFeatureLimits {
  return {
    maxApplicationsPerMonth: 10,
    aiFeatures: AI_FEATURE_KEYS.map((f) => ({ feature: f, enabled: false, monthlyLimit: 0 })),
    profileVisibilityBoost: false,
    salaryInsights: false,
    priorityApplicationReview: false,
    resumeBuilderAccess: false,
  };
}

// ── Form State ─────────────────────────────────────────────────────
interface PlanFormState {
  name: string;
  targetRole: "employer" | "job_seeker";
  tier: number;
  description: string;
  price: number;
  currency: string;
  billingCycle: "monthly" | "quarterly" | "yearly";
  employerLimits: IEmployerFeatureLimits;
  jobSeekerLimits: IJobSeekerFeatureLimits;
  isActive: boolean;
  isDefault: boolean;
  sortOrder: number;
}

function emptyForm(targetRole: "employer" | "job_seeker" = "employer"): PlanFormState {
  return {
    name: "",
    targetRole,
    tier: 0,
    description: "",
    price: 0,
    currency: "AED",
    billingCycle: "monthly",
    employerLimits: defaultEmployerLimits(),
    jobSeekerLimits: defaultJobSeekerLimits(),
    isActive: true,
    isDefault: false,
    sortOrder: 0,
  };
}

function planToForm(p: SubscriptionPlanItem): PlanFormState {
  return {
    name: p.name,
    targetRole: p.targetRole,
    tier: p.tier,
    description: p.description ?? "",
    price: p.price,
    currency: p.currency,
    billingCycle: p.billingCycle,
    employerLimits: p.employerLimits ?? defaultEmployerLimits(),
    jobSeekerLimits: p.jobSeekerLimits ?? defaultJobSeekerLimits(),
    isActive: p.isActive,
    isDefault: p.isDefault,
    sortOrder: p.sortOrder,
  };
}

// ── Subscription Enforcement Toggle ────────────────────────────────
function EnforcementToggleCard() {
  const t = useTranslations("adminSubscriptionPlans");
  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await fetch("/api/admin/settings");
        if (!res.ok) throw new Error("Failed to load settings");
        const data = await res.json();
        if (active) setEnabled(Boolean(data?.settings?.subscriptionEnforcementEnabled));
      } catch {
        if (active) setError(t("enforcementLoadError"));
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, []);

  const handleToggle = async (next: boolean) => {
    setSaving(true);
    setError(null);
    const previous = enabled;
    setEnabled(next); // optimistic
    try {
      const res = await csrfFetch("/api/admin/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subscriptionEnforcementEnabled: next }),
      });
      if (!res.ok) throw new Error("Failed to save");
    } catch {
      setEnabled(previous); // rollback
      setError(t("enforcementSaveError"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-2xl border border-border bg-background/70 p-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${enabled ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>
            <ShieldCheck className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-foreground">{t("subscriptionEnforcement")}</h3>
            <p className="mt-0.5 max-w-xl text-sm text-muted-foreground">
              {enabled
                ? t("enforcementEnabledDescription")
                : t("enforcementDisabledDescription")}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3 self-start sm:self-center">
          {(loading || saving) && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
          <span className={`text-xs font-medium ${enabled ? "text-emerald-700" : "text-muted-foreground"}`}>
            {enabled ? t("enforcementOn") : t("enforcementOff")}
          </span>
          <Switch
            checked={enabled}
            disabled={loading || saving}
            onCheckedChange={handleToggle}
            aria-label={t("enforcementToggleLabel")}
          />
        </div>
      </div>

      {enabled && (
        <div className="mt-4 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{t("enforcementWarning")}</span>
        </div>
      )}

      {error && (
        <p className="mt-3 text-xs text-red-600">{error}</p>
      )}
    </div>
  );
}

// ── Page Component ─────────────────────────────────────────────────
export default function AdminSubscriptionPlansPage() {
  const t = useTranslations("adminSubscriptionPlans");
  const [activeTab, setActiveTab] = useState<"employer" | "job_seeker">("employer");
  const { data: plans, isLoading } = useSubscriptionPlans({ targetRole: activeTab });
  const createMut = useCreateSubscriptionPlan();
  const updateMut = useUpdateSubscriptionPlan();
  const deleteMut = useDeleteSubscriptionPlan();

  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<PlanFormState>(emptyForm());
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [activeSection, setActiveSection] = useState<"basic" | "limits" | "ai">("basic");
  const [systemCurrency, setSystemCurrency] = useState<string>("AED");

  // Fetch system default currency from admin settings
  useEffect(() => {
    fetch("/api/settings/public")
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (data?.settings?.defaultCurrency) {
          setSystemCurrency(data.settings.defaultCurrency);
        }
      })
      .catch(() => {});
  }, []);

  const openCreate = () => {
    setEditId(null);
    setForm({ ...emptyForm(activeTab), currency: systemCurrency });
    setShowForm(true);
    setActiveSection("basic");
  };

  const openEdit = (p: SubscriptionPlanItem) => {
    setEditId(p._id);
    setForm(planToForm(p));
    setShowForm(true);
    setActiveSection("basic");
  };

  const handleDuplicate = (p: SubscriptionPlanItem) => {
    setEditId(null);
    const f = planToForm(p);
    f.name = `${f.name} (Copy)`;
    f.isDefault = false;
    setForm(f);
    setShowForm(true);
    setActiveSection("basic");
  };

  const closeForm = () => {
    setShowForm(false);
    setEditId(null);
    setForm(emptyForm(activeTab));
  };

  const handleSave = async () => {
    const payload: SubscriptionPlanPayload = {
      name: form.name,
      targetRole: form.targetRole,
      tier: form.tier,
      description: form.description || undefined,
      price: form.price,
      currency: form.currency,
      billingCycle: form.billingCycle,
      isActive: form.isActive,
      isDefault: form.isDefault,
      sortOrder: form.sortOrder,
      ...(form.targetRole === "employer"
        ? { employerLimits: form.employerLimits }
        : { jobSeekerLimits: form.jobSeekerLimits }),
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

  const updateAIFeature = (idx: number, key: keyof IAIFeatureLimit, value: unknown) => {
    setForm((f) => {
      const limitsKey = f.targetRole === "employer" ? "employerLimits" : "jobSeekerLimits";
      const limits = { ...f[limitsKey] };
      const features = [...limits.aiFeatures];
      features[idx] = { ...features[idx], [key]: value };
      return { ...f, [limitsKey]: { ...limits, aiFeatures: features } };
    });
  };

  const isSaving = createMut.isPending || updateMut.isPending;

  if (isLoading) {
    return (
      <div className="page-container">
        <PageHeader title={t("pageTitle")} description={t("pageDescription")} />
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-28 animate-pulse rounded-2xl border border-border bg-background/70" />
        ))}
      </div>
    );
  }

  return (
    <div className="page-container">
      <PageHeader
        title={t("pageTitle")}
        description={t("pageDescription")}
        actions={
          <Button onClick={openCreate} className="gap-2 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90" size="sm">
            <Plus className="h-4 w-4" /> {t("newPlanButton")}
          </Button>
        }
      />

      {/* ─── Subscription Enforcement Toggle ─── */}
      <EnforcementToggleCard />

      {/* ─── Tab Switcher ─── */}
      <div className="flex gap-2">
        <button
          onClick={() => { setActiveTab("employer"); setShowForm(false); }}
          className={`flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition-colors ${
            activeTab === "employer"
              ? "bg-primary text-primary-foreground"
              : "bg-muted text-muted-foreground hover:bg-muted/80"
          }`}
        >
          <Briefcase className="h-4 w-4" /> {t("employerPlansTab")}
        </button>
        <button
          onClick={() => { setActiveTab("job_seeker"); setShowForm(false); }}
          className={`flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition-colors ${
            activeTab === "job_seeker"
              ? "bg-primary text-primary-foreground"
              : "bg-muted text-muted-foreground hover:bg-muted/80"
          }`}
        >
          <Users className="h-4 w-4" /> {t("jobSeekerPlansTab")}
        </button>
      </div>

      {/* ─── Create / Edit Form ─── */}
      {showForm && (
        <section className="rounded-2xl border border-sky-500/30 bg-sky-500/5 p-6 space-y-5">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-foreground">
              {editId ? t("editPlanTitle") : t("createNewPlanTitle")}
            </h3>
            <button onClick={closeForm} className="text-muted-foreground hover:text-foreground">
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Section tabs */}
          <div className="flex gap-2 border-b border-border pb-2">
            {(["basic", "limits", "ai"] as const).map((s) => (
              <button
                key={s}
                onClick={() => setActiveSection(s)}
                className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                  activeSection === s
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-muted"
                }`}
              >
                {s === "basic" ? t("basicInfoTab") : s === "limits" ? t("featureLimitsTab") : t("aiFeaturesTab")}
              </button>
            ))}
          </div>

          {/* ── Basic Info ── */}
          {activeSection === "basic" && (
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm font-medium">{t("planNameLabel")}</label>
                <Input
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder={t("planNamePlaceholder")}
                  className="rounded-xl"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">{t("tierLevelLabel")}</label>
                <Input
                  type="number"
                  value={form.tier}
                  onChange={(e) => setForm((f) => ({ ...f, tier: Number(e.target.value) }))}
                  min={0}
                  max={10}
                  className="rounded-xl"
                />
                <p className="mt-1 text-xs text-muted-foreground">{t("tierLevelHelper")}</p>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">{t("priceLabel")}</label>
                <Input
                  type="text"
                  inputMode="decimal"
                  value={form.price === 0 ? "0" : String(form.price)}
                  onChange={(e) => {
                    const raw = e.target.value.replace(/[^0-9.]/g, "").replace(/^0+(?=\d)/, "");
                    setForm((f) => ({ ...f, price: raw === "" ? 0 : Number(raw) }));
                  }}
                  className="rounded-xl"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">{t("currencyLabel")}</label>
                <Input
                  value={form.currency}
                  onChange={(e) => setForm((f) => ({ ...f, currency: e.target.value.toUpperCase() }))}
                  maxLength={3}
                  placeholder={t("currencyPlaceholder")}
                  className="rounded-xl"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">{t("billingCycleLabel")}</label>
                <Select
                  value={form.billingCycle}
                  onValueChange={(v) => setForm((f) => ({ ...f, billingCycle: v as PlanFormState["billingCycle"] }))}
                >
                  <SelectTrigger className="w-full rounded-xl">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="monthly">{t("billingCycleMonthly")}</SelectItem>
                    <SelectItem value="quarterly">{t("billingCycleQuarterly")}</SelectItem>
                    <SelectItem value="yearly">{t("billingCycleYearly")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">{t("sortOrderLabel")}</label>
                <Input
                  type="number"
                  value={form.sortOrder}
                  onChange={(e) => setForm((f) => ({ ...f, sortOrder: Number(e.target.value) }))}
                  min={0}
                  className="rounded-xl"
                />
              </div>
              <div className="md:col-span-2">
                <label className="mb-1 block text-sm font-medium">{t("descriptionLabel")}</label>
                <Input
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  placeholder={t("descriptionPlaceholder")}
                  className="rounded-xl"
                />
              </div>
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <Switch
                    checked={form.isActive}
                    onCheckedChange={(v) => setForm((f) => ({ ...f, isActive: v }))}
                  />
                  <span className="text-sm">{t("activeToggleLabel")}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    checked={form.isDefault}
                    onCheckedChange={(v) => setForm((f) => ({ ...f, isDefault: v }))}
                  />
                  <span className="text-sm">{t("defaultPlanToggleLabel")}</span>
                </div>
              </div>
            </div>
          )}

          {/* ── Feature Limits ── */}
          {activeSection === "limits" && form.targetRole === "employer" && (
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm font-medium">{t("maxActiveJobsLabel")}</label>
                <Input
                  type="number"
                  value={form.employerLimits.maxActiveJobs}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      employerLimits: { ...f.employerLimits, maxActiveJobs: Number(e.target.value) },
                    }))
                  }
                  min={-1}
                  className="rounded-xl"
                />
                <p className="mt-1 text-xs text-muted-foreground">{t("maxActiveJobsHelper")}</p>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">{t("maxApplicationsViewLabel")}</label>
                <Input
                  type="number"
                  value={form.employerLimits.maxApplicationsViewPerMonth}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      employerLimits: { ...f.employerLimits, maxApplicationsViewPerMonth: Number(e.target.value) },
                    }))
                  }
                  min={-1}
                  className="rounded-xl"
                />
                <p className="mt-1 text-xs text-muted-foreground">{t("maxApplicationsViewHelper")}</p>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">{t("maxTeamMembersLabel")}</label>
                <Input
                  type="number"
                  value={form.employerLimits.maxTeamMembers}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      employerLimits: { ...f.employerLimits, maxTeamMembers: Number(e.target.value) },
                    }))
                  }
                  min={-1}
                  className="rounded-xl"
                />
                <p className="mt-1 text-xs text-muted-foreground">{t("maxTeamMembersHelper")}</p>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">{t("featuredJobListingsLabel")}</label>
                <Input
                  type="number"
                  value={form.employerLimits.featuredJobListings}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      employerLimits: { ...f.employerLimits, featuredJobListings: Number(e.target.value) },
                    }))
                  }
                  min={-1}
                  className="rounded-xl"
                />
                <p className="mt-1 text-xs text-muted-foreground">{t("featuredJobListingsHelper")}</p>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">{t("analyticsLevelLabel")}</label>
                <Select
                  value={form.employerLimits.analyticsLevel}
                  onValueChange={(v) =>
                    setForm((f) => ({
                      ...f,
                      employerLimits: {
                        ...f.employerLimits,
                        analyticsLevel: v as "none" | "basic" | "advanced",
                      },
                    }))
                  }
                >
                  <SelectTrigger className="w-full rounded-xl">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">{t("analyticsLevelNone")}</SelectItem>
                    <SelectItem value="basic">{t("analyticsLevelBasic")}</SelectItem>
                    <SelectItem value="advanced">{t("analyticsLevelAdvanced")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-3">
                {([
                  ["dataExport", "dataExportLabel"],
                  ["commTemplates", "commTemplatesLabel"],
                  ["scorecardEvaluations", "scorecardEvaluationsLabel"],
                  ["matchingWeightCustomization", "matchingWeightCustomizationLabel"],
                  ["workflowCustomization", "workflowCustomizationLabel"],
                  ["prioritySupport", "prioritySupportLabel"],
                  ["brandedCompanyPage", "brandedCompanyPageLabel"],
                ] as [keyof IEmployerFeatureLimits, string][]).map(([key, labelKey]) => (
                  <div key={key} className="flex items-center gap-2">
                    <Switch
                      checked={form.employerLimits[key] as boolean}
                      onCheckedChange={(v) =>
                        setForm((f) => ({
                          ...f,
                          employerLimits: { ...f.employerLimits, [key]: v },
                        }))
                      }
                    />
                    <span className="text-sm">{t(labelKey)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeSection === "limits" && form.targetRole === "job_seeker" && (
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm font-medium">{t("maxApplicationsJobSeekerLabel")}</label>
                <Input
                  type="number"
                  value={form.jobSeekerLimits.maxApplicationsPerMonth}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      jobSeekerLimits: { ...f.jobSeekerLimits, maxApplicationsPerMonth: Number(e.target.value) },
                    }))
                  }
                  min={-1}
                  className="rounded-xl"
                />
                <p className="mt-1 text-xs text-muted-foreground">{t("maxApplicationsJobSeekerHelper")}</p>
              </div>
              <div className="space-y-3">
                {([
                  ["profileVisibilityBoost", "profileVisibilityBoostLabel"],
                  ["salaryInsights", "salaryInsightsLabel"],
                  ["priorityApplicationReview", "priorityApplicationReviewLabel"],
                  ["resumeBuilderAccess", "resumeBuilderAccessLabel"],
                ] as [keyof IJobSeekerFeatureLimits, string][]).map(([key, labelKey]) => (
                  <div key={key} className="flex items-center gap-2">
                    <Switch
                      checked={form.jobSeekerLimits[key] as boolean}
                      onCheckedChange={(v) =>
                        setForm((f) => ({
                          ...f,
                          jobSeekerLimits: { ...f.jobSeekerLimits, [key]: v },
                        }))
                      }
                    />
                    <span className="text-sm">{t(labelKey)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── AI Features ── */}
          {activeSection === "ai" && (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                {t("aiFeatureDescription")}
              </p>
              <div className="grid gap-3 md:grid-cols-2">
                {(form.targetRole === "employer"
                  ? form.employerLimits.aiFeatures
                  : form.jobSeekerLimits.aiFeatures
                ).map((af, idx) => (
                  <div
                    key={af.feature}
                    className={`flex items-center gap-3 rounded-xl border p-3 transition-colors ${
                      af.enabled ? "border-sky-500/30 bg-sky-500/5" : "border-border"
                    }`}
                  >
                    <Switch
                      checked={af.enabled}
                      onCheckedChange={(v) => updateAIFeature(idx, "enabled", v)}
                    />
                    <div className="flex-1">
                      <span className="text-sm font-medium">
                        {AI_FEATURE_LABELS[af.feature] ?? af.feature}
                      </span>
                    </div>
                    {af.enabled && (
                      <Input
                        type="number"
                        value={af.monthlyLimit}
                        onChange={(e) => updateAIFeature(idx, "monthlyLimit", Number(e.target.value))}
                        min={0}
                        className="w-20 rounded-lg text-sm"
                        placeholder={t("aiFeaturePlaceholder")}
                      />
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Save buttons */}
          <div className="flex items-center gap-3 pt-2">
            <Button
              onClick={handleSave}
              disabled={!form.name || isSaving}
              className="gap-2 rounded-xl"
            >
              {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              {editId ? t("updatePlanButton") : t("createPlanButton")}
            </Button>
            <Button variant="ghost" onClick={closeForm} className="rounded-xl">
              {t("cancelButton")}
            </Button>
          </div>
        </section>
      )}

      {/* ─── Plans List ─── */}
      {!plans?.length ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border py-16 text-center">
          <Crown className="mb-4 h-12 w-12 text-muted-foreground/40" />
          <h3 className="text-lg font-semibold text-foreground">{t("noPlanEmptyState")}</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("noPlanEmptyDescription", {
              role: activeTab === "employer" ? t("noPlanEmptyDescriptionEmployer") : t("noPlanEmptyDescriptionJobSeeker")
            })}
          </p>
          <Button onClick={openCreate} className="mt-4 gap-2 rounded-xl" size="sm">
            <Plus className="h-4 w-4" /> {t("createPlanButtonEmpty")}
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {plans.map((p) => {
            const isExpanded = expandedId === p._id;
            const limits = p.employerLimits ?? p.jobSeekerLimits;
            const enabledAI = limits?.aiFeatures?.filter((a) => a.enabled).length ?? 0;

            return (
              <div
                key={p._id}
                className={`rounded-2xl border transition-colors ${
                  p.isActive
                    ? "border-border bg-card"
                    : "border-border/50 bg-muted/30 opacity-60"
                }`}
              >
                {/* Header row */}
                <div className="flex items-center gap-4 p-5">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h4 className="text-base font-semibold text-foreground">{p.name}</h4>
                      <Badge className={`text-xs ${TIER_COLORS[p.tier] ?? TIER_COLORS[0]}`}>
                        {t("tierBadge", { tier: p.tier })}
                      </Badge>
                      {p.isDefault && (
                        <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300 text-xs">
                          {t("defaultBadge")}
                        </Badge>
                      )}
                      {!p.isActive && (
                        <Badge variant="outline" className="text-xs text-muted-foreground">
                          {t("inactiveBadge")}
                        </Badge>
                      )}
                    </div>
                    <div className="mt-1 flex items-center gap-4 text-sm text-muted-foreground">
                      <span>
                        {p.currency === systemCurrency
                          ? `${p.price} ${p.currency}`
                          : convertAndFormat(p.price, p.currency, systemCurrency)}
                        {" / "}{p.billingCycle}
                      </span>
                      <span>·</span>
                      <span className="flex items-center gap-1">
                        <Sparkles className="h-3.5 w-3.5" /> {t("aiFeatureCount", { count: enabledAI })}
                      </span>
                      {p.targetRole === "employer" && p.employerLimits && (
                        <>
                          <span>·</span>
                          <span className="flex items-center gap-1">
                            <Briefcase className="h-3.5 w-3.5" />
                            {t("jobsLimitDisplay", { jobs: p.employerLimits.maxActiveJobs === -1 ? t("unlimitedSymbol") : p.employerLimits.maxActiveJobs })}
                          </span>
                          <span>·</span>
                          <span className="flex items-center gap-1">
                            <Users className="h-3.5 w-3.5" />
                            {t("seatsLimitDisplay", { seats: p.employerLimits.maxTeamMembers === -1 ? t("unlimitedSymbol") : p.employerLimits.maxTeamMembers })}
                          </span>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDuplicate(p)}
                      className="h-8 w-8 p-0 rounded-lg"
                      title={t("duplicateTooltip")}
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => openEdit(p)}
                      className="h-8 w-8 p-0 rounded-lg"
                      title={t("editTooltip")}
                    >
                      <Edit2 className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDelete(p._id)}
                      disabled={deleteMut.isPending}
                      className="h-8 w-8 p-0 rounded-lg text-destructive hover:text-destructive"
                      title={t("deactivateTooltip")}
                    >
                      {deleteMut.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Trash2 className="h-4 w-4" />
                      )}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setExpandedId(isExpanded ? null : p._id)}
                      className="h-8 w-8 p-0 rounded-lg"
                    >
                      {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    </Button>
                  </div>
                </div>

                {/* Expanded detail */}
                {isExpanded && (
                  <div className="border-t border-border px-5 py-4 space-y-4 bg-muted/20">
                    {p.description && (
                      <p className="text-sm text-muted-foreground">{p.description}</p>
                    )}

                    {/* Numeric limits */}
                    {p.targetRole === "employer" && p.employerLimits && (
                      <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-4">
                        {([
                          ["maxActiveJobsDetail", p.employerLimits.maxActiveJobs],
                          ["appViewsPerMonthDetail", p.employerLimits.maxApplicationsViewPerMonth],
                          ["teamSeatsDetail", p.employerLimits.maxTeamMembers],
                          ["featuredJobsDetail", p.employerLimits.featuredJobListings],
                        ] as [string, number][]).map(([labelKey, val]) => (
                          <div key={labelKey} className="rounded-xl border border-border bg-background p-3">
                            <p className="text-xs text-muted-foreground">{t(labelKey)}</p>
                            <p className="text-lg font-semibold">{val === -1 ? t("unlimitedValue") : val}</p>
                          </div>
                        ))}
                      </div>
                    )}

                    {p.targetRole === "job_seeker" && p.jobSeekerLimits && (
                      <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-4">
                        <div className="rounded-xl border border-border bg-background p-3">
                          <p className="text-xs text-muted-foreground">{t("maxApplicationsJobSeekerLabel")}</p>
                          <p className="text-lg font-semibold">
                            {p.jobSeekerLimits.maxApplicationsPerMonth === -1
                              ? t("unlimitedValue")
                              : p.jobSeekerLimits.maxApplicationsPerMonth}
                          </p>
                        </div>
                      </div>
                    )}

                    {/* Boolean features */}
                    <div>
                      <h5 className="mb-2 text-sm font-medium text-foreground">{t("featuresHeading")}</h5>
                      <div className="flex flex-wrap gap-2">
                        {p.targetRole === "employer" && p.employerLimits && (
                          <>
                            <FeatureBadge t={t} labelKey="analyticsFeatureLabel" value={p.employerLimits.analyticsLevel !== "none"} detail={p.employerLimits.analyticsLevel} />
                            <FeatureBadge t={t} labelKey="dataExportFeatureLabel" value={p.employerLimits.dataExport} />
                            <FeatureBadge t={t} labelKey="commTemplatesFeatureLabel" value={p.employerLimits.commTemplates} />
                            <FeatureBadge t={t} labelKey="scorecardsFeatureLabel" value={p.employerLimits.scorecardEvaluations} />
                            <FeatureBadge t={t} labelKey="matchingWeightsFeatureLabel" value={p.employerLimits.matchingWeightCustomization} />
                            <FeatureBadge t={t} labelKey="workflowFeatureLabel" value={p.employerLimits.workflowCustomization} />
                            <FeatureBadge t={t} labelKey="prioritySupportFeatureLabel" value={p.employerLimits.prioritySupport} />
                            <FeatureBadge t={t} labelKey="brandedPageFeatureLabel" value={p.employerLimits.brandedCompanyPage} />
                          </>
                        )}
                        {p.targetRole === "job_seeker" && p.jobSeekerLimits && (
                          <>
                            <FeatureBadge t={t} labelKey="visibilityBoostFeatureLabel" value={p.jobSeekerLimits.profileVisibilityBoost} />
                            <FeatureBadge t={t} labelKey="salaryInsightsFeatureLabel" value={p.jobSeekerLimits.salaryInsights} />
                            <FeatureBadge t={t} labelKey="priorityReviewFeatureLabel" value={p.jobSeekerLimits.priorityApplicationReview} />
                            <FeatureBadge t={t} labelKey="resumeBuilderFeatureLabel" value={p.jobSeekerLimits.resumeBuilderAccess} />
                          </>
                        )}
                      </div>
                    </div>

                    {/* AI features */}
                    {limits?.aiFeatures && limits.aiFeatures.some((a) => a.enabled) && (
                      <div>
                        <h5 className="mb-2 text-sm font-medium text-foreground flex items-center gap-1.5">
                          <Sparkles className="h-4 w-4 text-sky-500" /> {t("aiFeatureHeading")}
                        </h5>
                        <div className="grid gap-2 sm:grid-cols-2 md:grid-cols-3">
                          {limits.aiFeatures
                            .filter((a) => a.enabled)
                            .map((a) => (
                              <div
                                key={a.feature}
                                className="flex items-center justify-between rounded-lg border border-sky-500/20 bg-sky-500/5 px-3 py-2"
                              >
                                <span className="text-sm">{AI_FEATURE_LABELS[a.feature] ?? a.feature}</span>
                                <span className="text-xs font-medium text-muted-foreground">
                                  {a.monthlyLimit === 0 ? t("unlimitedValue") : t("monthlyLimitFormat", { limit: a.monthlyLimit })}
                                </span>
                              </div>
                            ))}
                        </div>
                      </div>
                    )}
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

// ── Helper Components ──────────────────────────────────────────────
function FeatureBadge({
  t,
  labelKey,
  value,
  detail,
}: {
  t: (key: string) => string;
  labelKey: string;
  value: boolean;
  detail?: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ${
        value
          ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300"
          : "bg-muted text-muted-foreground line-through"
      }`}
    >
      {value ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
      {t(labelKey)}
      {detail && value && <span className="opacity-60">({detail})</span>}
    </span>
  );
}
