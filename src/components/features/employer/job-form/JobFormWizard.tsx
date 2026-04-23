"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm, FormProvider, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { AnimatePresence } from "framer-motion";
import { Copy, Sparkles, FileText, ChevronRight, X, Image as ImageIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { PageHeader } from "@/components/shared/PageHeader";

import { jobFormSchema, JOB_FORM_STEPS, type JobFormValues } from "./jobFormSchema";
import { useJobFormDraft, useDebounce } from "./useJobFormDraft";
import { StepIndicator } from "./StepIndicator";
import { Step1BasicInfo } from "./Step1BasicInfo";
import { Step2JobDetails } from "./Step2JobDetails";
import { Step3Requirements } from "./Step3Requirements";
import { Step4SalarySettings } from "./Step4SalarySettings";
import { Step5ScreeningQuestions } from "./Step5ScreeningQuestions";
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
  5: ["screeningQuestions"],
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
  useAiPrefill?: boolean;
}

const AI_PREFILL_STORAGE_KEY = "job-ai-prefill";

function getDraftStorageKey() {
  const userId =
    typeof window !== "undefined"
      ? (document.cookie.match(/session-user-id=([^;]+)/)?.[1] ?? "anon")
      : "anon";

  return `job-draft-${userId}`;
}

const DEFAULT_JOB_FORM_VALUES: JobFormValues = {
  title: "",
  category: "",
  location: { country: "", city: "", isRemote: false },
  description: "",
  requirements: { skills: [], preferredSkills: [], experienceMin: 0, experienceMax: 10 },
  salary: { min: 0, max: 0, currency: "USD", isNegotiable: false, period: "monthly" },
  employmentType: undefined,
  workMode: undefined,
  duration: undefined,
  responsibilities: [],
  qualifications: [],
  benefits: [],
  learningOutcomes: [],
  applicationMode: "manual",
  autoScreeningEnabled: false,
  minMatchScore: 70,
  visibility: "public",
  vacancies: undefined,
  maxApplicants: undefined,
  showSalary: true,
  tags: [],
  expiresAt: "",
  agentId: undefined,
  screeningQuestions: [],
};

function mergeJobFormValues(base: JobFormValues, incoming: Partial<JobFormValues>): JobFormValues {
  return {
    ...base,
    ...incoming,
    location: {
      ...base.location,
      ...incoming.location,
    },
    requirements: {
      ...base.requirements,
      ...incoming.requirements,
      skills: incoming.requirements?.skills ?? base.requirements.skills,
      preferredSkills: incoming.requirements?.preferredSkills ?? base.requirements.preferredSkills,
    },
    salary: {
      ...base.salary,
      ...incoming.salary,
    },
    tags: incoming.tags ?? base.tags,
    responsibilities: incoming.responsibilities ?? base.responsibilities,
    qualifications: incoming.qualifications ?? base.qualifications,
    benefits: incoming.benefits ?? base.benefits,
    learningOutcomes: incoming.learningOutcomes ?? base.learningOutcomes,
    screeningQuestions: incoming.screeningQuestions ?? base.screeningQuestions,
  };
}

export function JobFormWizard({ locale, useAiPrefill = false }: JobFormWizardProps) {
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
  const [templateLoadError, setTemplateLoadError] = useState("");
  const templateTriggerRef = useRef<HTMLButtonElement | null>(null);

  const methods = useForm<JobFormValues>({
    resolver: zodResolver(jobFormSchema) as Resolver<JobFormValues>,
    mode: "onChange",
    defaultValues: DEFAULT_JOB_FORM_VALUES,
  });

  const { watch, trigger, handleSubmit, reset } = methods;
  const formValues = watch();

  const { draftId, savedIndicator, saveDraft, loadDraft } = useJobFormDraft(locale);

  // Track whether AI prefill has been applied to prevent localStorage draft from overwriting it
  const aiPrefillApplied = useRef(false);

  // Restore draft from localStorage on mount
  useEffect(() => {
    // If AI prefill was already applied, skip any further resets from this effect
    if (aiPrefillApplied.current) return;

    if (useAiPrefill && typeof window !== "undefined") {
      const rawPrefill = sessionStorage.getItem(AI_PREFILL_STORAGE_KEY);
      if (rawPrefill) {
        try {
          const parsed = JSON.parse(rawPrefill) as Partial<JobFormValues>;
          reset(mergeJobFormValues(DEFAULT_JOB_FORM_VALUES, parsed));
          sessionStorage.removeItem(AI_PREFILL_STORAGE_KEY);
          aiPrefillApplied.current = true;
          return;
        } catch {
          sessionStorage.removeItem(AI_PREFILL_STORAGE_KEY);
        }
      }
    }

    const saved = loadDraft();
    if (saved) {
      reset(mergeJobFormValues(DEFAULT_JOB_FORM_VALUES, saved));
    }
  }, [loadDraft, reset, useAiPrefill]);

  // Debounced auto-save to localStorage (1500ms)
  const debouncedAutoSave = useDebounce(
    useCallback(
      (values: JobFormValues) => {
        // Only persists to localStorage — avoids API call on every keystroke
        try {
          localStorage.setItem(getDraftStorageKey(), JSON.stringify({ values, savedAt: Date.now() }));
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
    document.querySelector("main")?.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function handleNext() {
    await goToStep(currentStep + 1);
  }

  function handlePrev() {
    setCurrentStep((s) => Math.max(1, s - 1));
    document.querySelector("main")?.scrollTo({ top: 0, behavior: "smooth" });
  }

  // ─── Draft Save ───────────────────────────────────────────────────────────────

  async function handleSaveDraft() {
    setSavingDraft(true);
    const savedId = await saveDraft(methods.getValues());
    setSavingDraft(false);
    // Navigate to the saved draft or jobs list after saving
    if (savedId) {
      router.push(`/${locale}/employer/jobs/${savedId}`);
    } else {
      router.push(`/${locale}/employer/jobs`);
    }
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
          localStorage.removeItem(getDraftStorageKey());
        } catch { /* ignore */ }
        toast.success("Job posted successfully!", {
          description: "Share it as a poster on LinkedIn & social media.",
          action: {
            label: "Create Poster",
            onClick: () => {
              // Navigate with poster query param to auto-open dialog
              router.push(`/${locale}/employer/jobs/${jobId}?poster=1`);
            },
          },
          duration: 8000,
        });
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
    setTemplateLoadError("");
    try {
      const res = await fetch("/api/employers/job-templates");
      if (res.ok) {
        const data = (await res.json()) as { templates: JobTemplateData[] };
        setTemplates(data.templates);
      } else {
        setTemplateLoadError("Could not load templates right now. Please try again.");
      }
    } catch {
      setTemplateLoadError("Could not load templates right now. Please try again.");
    }
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
  const handleSuggestionsLoaded = useCallback((suggestions: Suggestions) => {
    setAiSuggestions(suggestions);
  }, []);

  const closeTemplateModal = useCallback(() => {
    setShowTemplateModal(false);
  }, []);

  return (
    <div className="flex h-full flex-col">
    <div className="flex-1 overflow-y-auto">
    <div className="page-container gap-4 sm:gap-5">
      <section className="rounded-2xl border border-border/70 bg-gradient-to-br from-background via-background to-primary/5 p-4 shadow-sm">
        <PageHeader
          title="Post a New Job"
          description="Create a job posting to attract qualified candidates"
          className="pb-0"
          actions={
            <div className="flex flex-wrap items-center gap-2">
              <span className="hidden rounded-full border border-border/70 bg-background/80 px-3 py-1 text-xs font-medium text-muted-foreground md:inline-flex">
                Auto-saves while you type
              </span>
              <Button
                ref={templateTriggerRef}
                type="button"
                variant="outline"
                size="sm"
                className="gap-2 bg-background/90"
                onClick={() => {
                  setShowTemplateModal(true);
                  if (templates.length === 0) loadTemplates();
                }}
              >
                <Copy className="w-4 h-4" />
                Load Template
              </Button>
            </div>
          }
        />

        <div className="mt-3 rounded-xl border border-border/70 bg-background/85 p-2.5 shadow-sm sm:p-3">
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
        </div>
      </section>

      <Dialog open={showTemplateModal} onOpenChange={setShowTemplateModal}>
        <DialogContent
          hideClose
          className="w-[calc(100vw-2rem)] max-w-lg overflow-hidden rounded-3xl border-white/20 p-0"
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            templateTriggerRef.current?.focus();
          }}
        >
          <div className="border-b border-border/70 bg-gradient-to-br from-background via-background to-primary/10 px-5 py-5 sm:px-6">
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-2">
                <div className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-background/85 px-3 py-1 text-xs font-medium text-muted-foreground">
                  <Sparkles className="h-3.5 w-3.5 text-primary" />
                  Reuse proven job formats
                </div>
                <div>
                  <DialogTitle className="text-lg font-semibold text-foreground">Select a Template</DialogTitle>
                  <DialogDescription className="mt-1 text-sm text-muted-foreground">
                    Start from a previous hiring format, then adjust only what changed.
                  </DialogDescription>
                </div>
              </div>
              <div className="flex items-start gap-2">
                {!loadingTemplates && templates.length > 0 && (
                  <div className="rounded-2xl border border-border/70 bg-background/85 px-3 py-2 text-right">
                    <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Available</p>
                    <p className="text-lg font-semibold text-foreground">{templates.length}</p>
                  </div>
                )}
                <DialogClose asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-9 w-9 rounded-full p-0"
                    aria-label="Close template modal"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </DialogClose>
              </div>
            </div>
          </div>

          <div className="space-y-4 px-5 py-5 sm:px-6">
            {loadingTemplates ? (
              <div className="space-y-3 py-1">
                {[1, 2, 3].map((item) => (
                  <div key={item} className="rounded-2xl border border-border/70 bg-muted/30 p-4">
                    <div className="h-3 w-32 animate-pulse rounded bg-muted" />
                    <div className="mt-3 h-2.5 w-48 animate-pulse rounded bg-muted" />
                    <div className="mt-2 h-2.5 w-24 animate-pulse rounded bg-muted" />
                  </div>
                ))}
              </div>
            ) : templateLoadError ? (
              <div className="rounded-2xl border border-destructive/20 bg-destructive/5 px-4 py-5 text-center">
                <p className="text-sm font-medium text-destructive">{templateLoadError}</p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={loadTemplates}
                  className="mt-3"
                >
                  Retry
                </Button>
              </div>
            ) : templates.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border bg-muted/20 px-4 py-6 text-center">
                <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                  <FileText className="h-5 w-5" />
                </div>
                <p className="text-sm font-medium text-foreground">No templates saved yet</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Create and save a few strong job posts first, then they will appear here.
                </p>
              </div>
            ) : (
              <div className="max-h-[min(26rem,calc(100dvh-14rem))] space-y-3 overflow-y-auto pr-1">
                {templates.map((tpl) => (
                  <button
                    key={tpl._id}
                    type="button"
                    onClick={() => applyTemplate(tpl)}
                    className="group w-full rounded-2xl border border-border/70 bg-background p-4 text-left transition-all hover:-translate-y-0.5 hover:border-primary/30 hover:bg-primary/[0.03] hover:shadow-sm"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="space-y-2">
                        <p className="text-sm font-semibold text-foreground">{tpl.name}</p>
                        {tpl.title && (
                          <p className="text-xs text-muted-foreground">{tpl.title}</p>
                        )}
                        <div className="flex flex-wrap gap-1.5">
                          {tpl.category && (
                            <span className="rounded-full border border-border/70 bg-muted/40 px-2.5 py-1 text-[11px] text-muted-foreground">
                              {tpl.category}
                            </span>
                          )}
                          {typeof tpl.vacancies === "number" && tpl.vacancies > 0 && (
                            <span className="rounded-full border border-border/70 bg-muted/40 px-2.5 py-1 text-[11px] text-muted-foreground">
                              {tpl.vacancies} openings
                            </span>
                          )}
                          {tpl.applicationMode && (
                            <span className="rounded-full border border-border/70 bg-muted/40 px-2.5 py-1 text-[11px] text-muted-foreground capitalize">
                              {tpl.applicationMode} review
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="inline-flex items-center gap-1 text-xs font-medium text-primary opacity-70 transition-opacity group-hover:opacity-100">
                        Use
                        <ChevronRight className="h-3.5 w-3.5" />
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}

            <div className="flex flex-col-reverse gap-2 border-t border-border/70 pt-4 sm:flex-row sm:justify-end">
              <DialogClose asChild>
                <Button
                  type="button"
                  variant="outline"
                  className="w-full sm:w-auto"
                >
                  Cancel
                </Button>
              </DialogClose>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <FormProvider {...methods}>
        <form onSubmit={onSubmit} noValidate>
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_18.5rem]">
            {/* Main content */}
            <div className="min-w-0">
              <div className="rounded-2xl border border-border bg-background p-4 shadow-sm sm:p-5">
                <AnimatePresence mode="wait">
                  {currentStep === 1 && (
                    <Step1BasicInfo
                      key="step1"
                      onSuggestionsLoaded={handleSuggestionsLoaded}
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
                  {currentStep === 5 && <Step5ScreeningQuestions key="step5" />}
                </AnimatePresence>
              </div>

              {/* Advanced settings only on step 4 */}
              {currentStep === 4 && (
                <div className="mt-3">
                  <AdvancedSettingsSection />
                </div>
              )}

              {submitError && (
                <div className="mt-3 rounded-xl border border-destructive/20 bg-destructive/10 p-4 text-sm text-destructive">
                  {submitError}
                </div>
              )}
            </div>

            {/* Right sidebar — smart panels */}
            <div className="w-full space-y-3 xl:sticky xl:top-4 xl:self-start">
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

    </div>
    </div>

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
