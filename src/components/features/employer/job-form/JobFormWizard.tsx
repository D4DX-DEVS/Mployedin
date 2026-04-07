"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm, FormProvider, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { AnimatePresence } from "framer-motion";
import { Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/shared/PageHeader";

import { jobFormSchema, JOB_FORM_STEPS, type JobFormValues } from "./jobFormSchema";
import { useJobFormDraft, useDebounce } from "./useJobFormDraft";
import { StepIndicator } from "./StepIndicator";
import { Step1BasicInfo } from "./Step1BasicInfo";
import { Step2JobDetails } from "./Step2JobDetails";
import { Step3Requirements } from "./Step3Requirements";
import { Step4SalarySettings } from "./Step4SalarySettings";
import { AdvancedSettingsSection } from "./AdvancedSettingsSection";
import { JobQualityScore } from "./JobQualityScore";
import { MatchPreviewPanel } from "./MatchPreviewPanel";
import { StickyActionBar } from "./StickyActionBar";

interface Suggestions {
  titles: string[];
  skills: string[];
  salary: { min: number; max: number; currency: string; period: string };
  experience: { min: number; max: number };
}

// Per-step fields used for partial validation
const STEP_FIELDS: Record<number, (keyof JobFormValues)[]> = {
  1: ["title", "location"],
  2: ["description"],
  3: ["requirements"],
  4: ["salary"],
};

interface JobTemplateData {
  _id: string;
  name: string;
  title?: string;
  description?: string;
  category?: string;
  requirements?: JobFormValues["requirements"];
  salary?: JobFormValues["salary"];
  location?: { country?: string; city?: string; isRemote?: boolean };
  tags?: string[];
  vacancies?: number;
  applicationMode?: "auto" | "manual";
}

interface JobFormWizardProps {
  locale: string;
}

export function JobFormWizard({ locale }: JobFormWizardProps) {
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState(1);
  const [completedSteps, setCompletedSteps] = useState<Set<number>>(new Set());
  const [submitting, setSubmitting] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [aiSuggestions, setAiSuggestions] = useState<Suggestions | null>(null);

  // Templates state
  const [templates, setTemplates] = useState<JobTemplateData[]>([]);
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [loadingTemplates, setLoadingTemplates] = useState(false);

  const methods = useForm<JobFormValues>({
    resolver: zodResolver(jobFormSchema) as Resolver<JobFormValues>,
    mode: "onChange",
    defaultValues: {
      title: "",
      category: "",
      location: { country: "", city: "", isRemote: false },
      description: "",
      requirements: { skills: [], experienceMin: 0, experienceMax: 10 },
      salary: { min: 0, max: 0, currency: "USD", isNegotiable: false, period: "monthly" },
      applicationMode: "manual",
      autoScreeningEnabled: false,
      minMatchScore: 70,
      visibility: "public",
      vacancies: 1,
      tags: [],
      expiresAt: "",
    },
  });

  const { watch, trigger, handleSubmit, reset } = methods;
  const formValues = watch();

  const { draftId, savedIndicator, saveDraft, loadDraft } = useJobFormDraft(locale);

  // Restore draft from localStorage on mount
  useEffect(() => {
    const saved = loadDraft();
    if (saved) {
      reset(saved);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Debounced auto-save to localStorage (1500ms)
  const debouncedAutoSave = useDebounce(
    useCallback(
      (values: JobFormValues) => {
        // Only persists to localStorage — avoids API call on every keystroke
        try {
          const userId =
            typeof window !== "undefined"
              ? (document.cookie.match(/session-user-id=([^;]+)/)?.[1] ?? "anon")
              : "anon";
          localStorage.setItem(
            `job-draft-${userId}`,
            JSON.stringify({ values, savedAt: Date.now() })
          );
        } catch {
          // ignore storage errors
        }
      },
      []
    ),
    1500
  );

  useEffect(() => {
    debouncedAutoSave(formValues);
  }, [formValues, debouncedAutoSave]);

  // ─── Navigation ──────────────────────────────────────────────────────────────

  async function goToStep(step: number) {
    if (step > currentStep) {
      // Validate current step fields before advancing
      const fields = STEP_FIELDS[currentStep] ?? [];
      const isValid = await trigger(fields);
      if (!isValid) return;
      setCompletedSteps((prev) => new Set([...prev, currentStep]));
    }
    setCurrentStep(step);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function handleNext() {
    await goToStep(currentStep + 1);
  }

  function handlePrev() {
    setCurrentStep((s) => Math.max(1, s - 1));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  // ─── Draft Save ───────────────────────────────────────────────────────────────

  async function handleSaveDraft() {
    setSavingDraft(true);
    await saveDraft(methods.getValues());
    setSavingDraft(false);
  }

  // ─── Submit ───────────────────────────────────────────────────────────────────

  const onSubmit = handleSubmit(async (values) => {
    setSubmitting(true);
    setSubmitError("");
    try {
      const payload = {
        ...values,
        status: "active",
        expiresAt: values.expiresAt
          ? new Date(values.expiresAt).toISOString()
          : undefined,
      };

      const url = draftId ? `/api/jobs/${draftId}` : "/api/jobs";
      const method = draftId ? "PATCH" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        const data = (await res.json()) as { job: { _id: string } };
        const jobId = draftId ?? String(data.job._id);
        // Clear draft
        try {
          const userId =
            typeof window !== "undefined"
              ? (document.cookie.match(/session-user-id=([^;]+)/)?.[1] ?? "anon")
              : "anon";
          localStorage.removeItem(`job-draft-${userId}`);
        } catch { /* ignore */ }
        router.push(`/${locale}/employer/jobs/${jobId}`);
      } else {
        const err = (await res.json()) as { error?: string };
        setSubmitError(err.error ?? "Failed to post job. Please try again.");
      }
    } catch {
      setSubmitError("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  });

  // ─── Templates ───────────────────────────────────────────────────────────────

  async function loadTemplates() {
    setLoadingTemplates(true);
    try {
      const res = await fetch("/api/employers/job-templates");
      if (res.ok) {
        const data = (await res.json()) as { templates: JobTemplateData[] };
        setTemplates(data.templates);
      }
    } catch { /* ignore */ }
    finally { setLoadingTemplates(false); }
  }

  function applyTemplate(tpl: JobTemplateData) {
    const current = methods.getValues();
    reset({
      ...current,
      title: tpl.title ?? current.title,
      description: tpl.description ?? current.description,
      category: tpl.category ?? current.category,
      location: tpl.location
        ? {
            country: tpl.location.country ?? current.location.country,
            city: tpl.location.city ?? current.location.city,
            isRemote: tpl.location.isRemote ?? current.location.isRemote,
          }
        : current.location,
      requirements: tpl.requirements ?? current.requirements,
      salary: tpl.salary ?? current.salary,
      applicationMode: tpl.applicationMode ?? current.applicationMode,
      vacancies: tpl.vacancies ?? current.vacancies,
      tags: tpl.tags ?? current.tags,
    });
    setShowTemplateModal(false);
  }

  // Derived data for smart panels
  const skills = formValues.requirements?.skills ?? [];
  const country = formValues.location?.country ?? "";
  const expMin = formValues.requirements?.experienceMin ?? 0;
  const expMax = formValues.requirements?.experienceMax ?? 10;
  const isLastStep = currentStep === JOB_FORM_STEPS.length;

  return (
    <div className="page-container pb-24">
      <PageHeader
        title="Post a New Job"
        description="Create a job posting to attract qualified candidates"
      />

      {/* Load Template */}
      <div className="mb-6">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="gap-2"
          onClick={() => {
            setShowTemplateModal(true);
            if (templates.length === 0) loadTemplates();
          }}
        >
          <Copy className="w-4 h-4" />
          Load Template
        </Button>
      </div>

      {/* Template Modal */}
      {showTemplateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-background rounded-xl max-w-md w-full p-6 space-y-4 shadow-xl">
            <h2 className="text-lg font-semibold">Select a Template</h2>
            {loadingTemplates ? (
              <p className="text-sm text-muted-foreground py-4 text-center">Loading templates…</p>
            ) : templates.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">No templates saved yet.</p>
            ) : (
              <div className="space-y-2 max-h-80 overflow-y-auto">
                {templates.map((tpl) => (
                  <button
                    key={tpl._id}
                    type="button"
                    onClick={() => applyTemplate(tpl)}
                    className="w-full text-left p-3 rounded-lg border border-border hover:bg-accent transition-colors"
                  >
                    <p className="font-medium text-sm">{tpl.name}</p>
                    {tpl.title && (
                      <p className="text-xs text-muted-foreground">{tpl.title}</p>
                    )}
                  </button>
                ))}
              </div>
            )}
            <Button
              type="button"
              variant="outline"
              onClick={() => setShowTemplateModal(false)}
              className="w-full"
            >
              Cancel
            </Button>
          </div>
        </div>
      )}

      {/* Progress indicator */}
      <StepIndicator
        steps={JOB_FORM_STEPS}
        currentStep={currentStep}
        completedSteps={completedSteps}
        onStepClick={async (step) => {
          if (step < currentStep) {
            setCurrentStep(step);
          } else {
            await goToStep(step);
          }
        }}
      />

      <FormProvider {...methods}>
        <form onSubmit={onSubmit} noValidate>
          <div className="flex flex-col lg:flex-row gap-6">
            {/* Main content */}
            <div className="flex-1 min-w-0">
              <div className="rounded-xl border border-border bg-background p-5 sm:p-6">
                <AnimatePresence mode="wait">
                  {currentStep === 1 && (
                    <Step1BasicInfo
                      key="step1"
                      onSuggestionsLoaded={setAiSuggestions}
                    />
                  )}
                  {currentStep === 2 && <Step2JobDetails key="step2" />}
                  {currentStep === 3 && (
                    <Step3Requirements
                      key="step3"
                      suggestedSkills={aiSuggestions?.skills ?? []}
                    />
                  )}
                  {currentStep === 4 && <Step4SalarySettings key="step4" />}
                </AnimatePresence>
              </div>

              {/* Advanced settings only on last step */}
              {currentStep === 4 && (
                <div className="mt-4">
                  <AdvancedSettingsSection />
                </div>
              )}

              {submitError && (
                <div className="mt-4 p-4 rounded-lg bg-destructive/10 border border-destructive/20 text-sm text-destructive">
                  {submitError}
                </div>
              )}
            </div>

            {/* Right sidebar — smart panels */}
            <div className="w-full lg:w-72 shrink-0 space-y-4 lg:sticky lg:top-4 lg:self-start">
              <JobQualityScore values={formValues} />
              <MatchPreviewPanel
                skills={skills}
                country={country}
                experienceMin={expMin}
                experienceMax={expMax}
              />
            </div>
          </div>
        </form>
      </FormProvider>

      {/* Sticky action bar */}
      <StickyActionBar
        currentStep={currentStep}
        totalSteps={JOB_FORM_STEPS.length}
        onPrev={handlePrev}
        onNext={handleNext}
        onSaveDraft={handleSaveDraft}
        onSubmit={onSubmit}
        savingDraft={savingDraft}
        submitting={submitting}
        savedIndicator={savedIndicator}
        isLastStep={isLastStep}
        canSubmit={!submitting}
      />
    </div>
  );
}
