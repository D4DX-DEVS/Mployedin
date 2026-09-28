"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  Plus, X, Loader2, Crown, Check, Users, Briefcase, ShieldCheck, AlertTriangle,
} from "lucide-react";
import { DashboardPageHeader } from "@/components/shared/DashboardPageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { AI_FEATURE_KEYS } from "@/types/subscription-plan";
import { csrfFetch } from "@/lib/security/csrf-client";
import { useConfirm } from "@/hooks/useConfirm";
import { AI_FEATURE_LABEL_KEYS } from "./_components/planLabels";
import { PlansList, PlansListSkeleton } from "./_components/PlansList";

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
  /** Rewrite the frozen planSnapshot on live subscriptions of this plan. */
  applyToExisting: boolean;
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
  applyToExisting: false,
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
    applyToExisting: false,
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
    <div className="rounded-2xl border border-border bg-background/70 panel-body">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${enabled ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>
            <ShieldCheck className="h-5 w-5" />
          </div>
          <div>
            <h2 className="heading-label font-semibold text-foreground">{t("subscriptionEnforcement")}</h2>
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
        <div className="mt-4 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 text-xs text-amber-800 chip-pad">
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
  const ta = useTranslations("a11y");
  const { confirm: confirmDialog, ConfirmDialogNode } = useConfirm();
  const [activeTab, setActiveTab] = useState<"employer" | "job_seeker">("employer");
  const { data: plans, isLoading } = useSubscriptionPlans({ targetRole: activeTab });
  const createMut = useCreateSubscriptionPlan();
  const updateMut = useUpdateSubscriptionPlan();
  const deleteMut = useDeleteSubscriptionPlan();

  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<PlanFormState>(emptyForm());
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
      applyToExisting: form.applyToExisting,
      ...(form.targetRole === "employer"
        ? { employerLimits: form.employerLimits }
        : { jobSeekerLimits: form.jobSeekerLimits }),
    };
    // The mutation hooks already report failures with a toast in `onError`.
    // Without this catch the rejected `mutateAsync` promise is also unhandled,
    // which trips the Next dev error overlay on top of the toast — an expected
    // 409 ("this plan still has subscriptions") looked like a crash.
    try {
      if (editId) {
        const result = await updateMut.mutateAsync({ id: editId, ...payload });
        // Live subscribers keep billing on the snapshot they were created with,
        // so an edit here does not reach them unless it was asked to. Say which
        // it was, rather than leaving the admin to guess.
        const drift = result?.snapshotDrift;
        if (drift?.resynced > 0) {
          toast.success(t("snapshotResynced", { count: drift.resynced }));
        } else if (drift?.count > 0) {
          toast.warning(t("snapshotDriftWarning", { count: drift.count }));
        }
      } else {
        await createMut.mutateAsync(payload);
      }
    } catch {
      return; // keep the form open so the values can be corrected
    }
    closeForm();
  };

  const handleDeactivate = async (p: SubscriptionPlanItem) => {
    const ok = await confirmDialog({
      title: t("deactivateConfirmTitle"),
      message: t("deactivateConfirmMessage", { name: p.name }),
      confirmLabel: t("deactivateConfirmAction"),
      variant: "destructive",
    });
    if (!ok) return;
    try {
      await deleteMut.mutateAsync({ id: p._id });
    } catch {
      // Reported by the hook’s onError toast.
    }
  };

  /**
   * Reactivating was only ever possible by opening Edit, finding the "Active"
   * switch at the bottom of the Basic tab and saving — so in practice a
   * deactivated plan was a dead end. It is the same PATCH, given its own action.
   */
  const handleReactivate = async (p: SubscriptionPlanItem) => {
    const ok = await confirmDialog({
      title: t("reactivateConfirmTitle"),
      message: t("reactivateConfirmMessage", { name: p.name }),
      confirmLabel: t("reactivateConfirmAction"),
    });
    if (!ok) return;
    try {
      await updateMut.mutateAsync({ id: p._id, isActive: true });
    } catch {
      // Reported by the hook’s onError toast.
    }
  };

  /** Destroys the row. Offered only on an already-inactive plan; the API
   *  refuses if it is the default or any subscription still references it. */
  const handleDestroy = async (p: SubscriptionPlanItem) => {
    const ok = await confirmDialog({
      title: t("deleteConfirmTitle"),
      message: t("deleteConfirmMessage", { name: p.name }),
      confirmLabel: t("deleteConfirmAction"),
      variant: "destructive",
    });
    if (!ok) return;
    try {
      await deleteMut.mutateAsync({ id: p._id, hard: true });
    } catch {
      // Reported by the hook’s onError toast.
    }
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
  // The row a deactivate / reactivate / delete is running for (saving the
  // form also runs updateMut, but it carries no row to dim).
  const deleting = deleteMut.variables;
  const pendingId = deleteMut.isPending
    ? (typeof deleting === "string" ? deleting : deleting?.id) ?? null
    : updateMut.isPending && !showForm
      ? updateMut.variables?.id ?? null
      : null;

  return (
    <div className="page-container">
      {ConfirmDialogNode}
      <DashboardPageHeader
        compact
        title={t("pageTitle")}
        description={t("pageDescription")}
        actions={
          <Button onClick={openCreate} className="gap-2 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90" size="sm">
            <Plus className="h-4 w-4" /> {t("newPlanButton")}
          </Button>
        }
        compactOnMobile
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
        <section className="workspace-panel-surface rounded-3xl panel-body space-y-5">
          <div className="flex items-center justify-between">
            <h2 className="heading-subsection font-semibold text-foreground">
              {editId ? t("editPlanTitle") : t("createNewPlanTitle")}
            </h2>
            <button aria-label={ta("close")} onClick={closeForm} className="text-muted-foreground hover:text-foreground">
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Section tabs */}
          <div className="flex gap-1 border-b border-border pb-2">
            {(["basic", "limits", "ai"] as const).map((s) => (
              <button
                key={s}
                onClick={() => setActiveSection(s)}
                className={`px-3 py-1.5 text-xs sm:text-sm font-medium rounded-lg transition-colors ${
                  activeSection === s
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/60"
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
                <Input aria-label={t("planNameLabel")}
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder={t("planNamePlaceholder")}
                  className="rounded-xl"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">{t("tierLevelLabel")}</label>
                <Input aria-label={t("tierLevelLabel")}
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
                <Input aria-label={t("priceLabel")}
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
                <Input aria-label={t("currencyLabel")}
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
                <Input aria-label={t("sortOrderLabel")}
                  type="number"
                  value={form.sortOrder}
                  onChange={(e) => setForm((f) => ({ ...f, sortOrder: Number(e.target.value) }))}
                  min={0}
                  className="rounded-xl"
                />
              </div>
              <div className="md:col-span-2">
                <label className="mb-1 block text-sm font-medium">{t("descriptionLabel")}</label>
                <Input aria-label={t("descriptionLabel")}
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  placeholder={t("descriptionPlaceholder")}
                  className="rounded-xl"
                />
              </div>
              {/* `htmlFor` + `id`, not an adjacent span: a Radix Switch is a
                  button, so a bare label beside it names nothing and the label
                  is not a click target either. */}
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <Switch
                    id="plan-active"
                    checked={form.isActive}
                    onCheckedChange={(v) => setForm((f) => ({ ...f, isActive: v }))}
                  />
                  <label htmlFor="plan-active" className="text-sm">{t("activeToggleLabel")}</label>
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    id="plan-default"
                    checked={form.isDefault}
                    onCheckedChange={(v) => setForm((f) => ({ ...f, isDefault: v }))}
                  />
                  <label htmlFor="plan-default" className="text-sm">{t("defaultPlanToggleLabel")}</label>
                </div>
              </div>

              {/* Editing only: a subscription froze this plan when it was
                  created and every renewal invoice is written from that frozen
                  copy, so a price or currency change here never reaches
                  existing subscribers on its own. Opt in deliberately — it
                  re-prices live customers. */}
              {editId && (
                <div className="rounded-xl border border-border/70 bg-secondary/20 p-3">
                  <div className="flex items-center gap-2">
                    <Switch
                      id="plan-apply-existing"
                      checked={form.applyToExisting}
                      onCheckedChange={(v) => setForm((f) => ({ ...f, applyToExisting: v }))}
                    />
                    <label htmlFor="plan-apply-existing" className="text-sm font-medium">
                      {t("applyToExistingLabel")}
                    </label>
                  </div>
                  <p className="mt-1.5 text-xs text-muted-foreground">{t("applyToExistingHelp")}</p>
                </div>
              )}
            </div>
          )}

          {/* ── Feature Limits ── */}
          {activeSection === "limits" && form.targetRole === "employer" && (
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm font-medium">{t("maxActiveJobsLabel")}</label>
                <Input aria-label={t("maxActiveJobsLabel")}
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
                <Input aria-label={t("maxApplicationsViewLabel")}
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
                <Input aria-label={t("maxTeamMembersLabel")}
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
                <Input aria-label={t("featuredJobListingsLabel")}
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
                <Input aria-label={t("maxApplicationsJobSeekerLabel")}
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
                    className={`flex items-center gap-3 rounded-xl border transition-colors ${ af.enabled ? "border-sky-500/30 bg-sky-500/5" : "border-border" } chip-pad`}
                  >
                    <Switch
                      checked={af.enabled}
                      onCheckedChange={(v) => updateAIFeature(idx, "enabled", v)}
                    />
                    <div className="flex-1">
                      <span className="text-sm font-medium">
                        {t(AI_FEATURE_LABEL_KEYS[af.feature] ?? af.feature)}
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
      {isLoading ? (
        <PlansListSkeleton />
      ) : !plans?.length ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border py-16 text-center">
          <Crown className="mb-4 h-12 w-12 text-muted-foreground/40" />
          <h2 className="heading-subsection font-semibold text-foreground">{t("noPlanEmptyState")}</h2>
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
        <PlansList
          plans={plans}
          systemCurrency={systemCurrency}
          pendingId={pendingId}
          onEdit={openEdit}
          onDuplicate={handleDuplicate}
          onDeactivate={(p) => void handleDeactivate(p)}
          onReactivate={(p) => void handleReactivate(p)}
          onDestroy={(p) => void handleDestroy(p)}
        />
      )}
    </div>
  );
}
