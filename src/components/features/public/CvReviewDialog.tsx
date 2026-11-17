"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Check, FileText, Loader2, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PhoneInput } from "@/components/shared/PhoneInput";
import { SeekerAreaField, type SeekerAreaValue } from "@/components/features/job-seeker/SeekerAreaField";
import type { SeekerProfileData } from "@/app/[locale]/(dashboard)/job-seeker/cv/built-cv";
import { CvReviewEditor } from "./CvReviewEditor";
import { CvReviewAssistant } from "./CvReviewAssistant";

/**
 * After a new seeker's CV is read on a shared job link: the CV as employers
 * will see it (the Mployedin CV, made from what was read) beside the few
 * details to check, the job preferences the CV gave, and what a CV never says
 * (salary, notice). One window, so nothing is asked again on the next page.
 * Loaded only when it opens (EasyApply imports it lazily): it carries the CV
 * templates.
 */

export interface CvReadSummary {
  skills: string[];
  roles: string[];
  educationCount: number;
  languageCount: number;
  certificationCount: number;
  projectCount: number;
}

export interface CvReviewValues {
  name: string;
  phone: string;
  headline: string;
  roles: string;
  countries: string;
  area: SeekerAreaValue;
  salary: string;
  currency: string;
  noticeDays: string;
  /** Let employers find them. Off until they tick it: it is consent. */
  discoverable: boolean;
}

interface CvReviewDialogProps {
  open: boolean;
  fileName?: string;
  email?: string;
  /** The profile as stored after the read, with the seeker's edits; null while it loads or if it failed. */
  profile: SeekerProfileData | null;
  /** Edits to the CV's content (summary, skills, jobs, education). */
  onProfileChange: (next: SeekerProfileData) => void;
  /** The CV is still being read: the window is open, the CV parts are not ready. */
  reading: boolean;
  /** The Mployedin CV's design, and choosing another one. */
  templateId: string;
  onTemplateChange: (templateId: string) => void;
  summary: CvReadSummary | null;
  extractionFailed: boolean;
  completeness: number | null;
  values: CvReviewValues;
  onChange: (next: Partial<CvReviewValues>) => void;
  headlineMax: number;
  error: string;
  saving: boolean;
  /** Shown after an e-mail code sign-in: where the confirmation went. */
  emailNote?: string;
  onConfirm: () => void;
}

export const SALARY_CURRENCIES = ["INR", "AED", "SAR", "QAR", "KWD", "OMR", "BHD", "GBP", "EUR", "USD"];
const NOTICE_OPTIONS = ["0", "15", "30", "60", "90"];

export default function CvReviewDialog(props: CvReviewDialogProps) {
  const { open, fileName, profile, onProfileChange, reading, extractionFailed, completeness, values, onChange, headlineMax, error, saving, emailNote, onConfirm } = props;
  const t = useTranslations("easyApply");
  // Phones show one side at a time: the details to fill, or the CV itself.
  // Details first (left from lg); what was read from the CV beside them.
  const [phoneTab, setPhoneTab] = useState<"details" | "cv">("details");
  return (
    // Not dismissible: closing it would leave a half-made account. The one way
    // on is the button, which saves; every field can be changed later.
    <Dialog open={open} onOpenChange={() => undefined}>
      <DialogContent
        hideClose
        data-cv-review=""
        mobileSheet={false}
        className="flex max-h-[92vh] w-[calc(100vw-2rem)] max-w-6xl flex-col gap-0 overflow-hidden p-0"
      >
        <DialogHeader className="border-b border-border/70 px-4 py-4 text-start sm:px-6">
          <DialogTitle>{extractionFailed ? t("errors.couldNotExtract") : t("reviewTitle")}</DialogTitle>
          <DialogDescription className="flex flex-wrap items-center gap-x-2 gap-y-1">
            {fileName && (
              <span className="inline-flex items-center gap-1">
                <FileText className="size-4" aria-hidden="true" />
                <bdi>{fileName}</bdi>
              </span>
            )}
            {reading ? (
              <span className="inline-flex items-center gap-1">
                · <Loader2 className="size-3.5 animate-spin" aria-hidden="true" /> {t("reviewReading")}
              </span>
            ) : !extractionFailed && completeness ? <span>· {t("profileComplete", { percent: Math.round(completeness) })}</span> : null}
          </DialogDescription>
        </DialogHeader>

        <div role="group" aria-label={t("reviewTitle")} className="grid grid-cols-2 gap-1 border-b border-border/70 bg-muted/40 p-1.5 lg:hidden">
          {(["details", "cv"] as const).map((tab) => (
            <button key={tab} type="button" aria-pressed={phoneTab === tab} onClick={() => setPhoneTab(tab)}
              className={`inline-flex min-h-11 items-center justify-center gap-1.5 rounded-lg px-3 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${phoneTab === tab ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"}`}>
              {tab === "cv" ? <FileText className="size-4" aria-hidden="true" /> : <Pencil className="size-4" aria-hidden="true" />}
              {tab === "cv" ? t("reviewTabCv") : t("reviewTabDetails")}
            </button>
          ))}
        </div>

        {/* One column on phones (min-w-0 keeps wide chips and textareas inside it); two from lg. */}
        <div className="grid min-h-0 flex-1 grid-cols-1 overflow-y-auto overflow-x-hidden lg:grid-cols-[420px_minmax(0,1fr)] lg:overflow-hidden">
          {/* The CV, as employers will see it */}
          <section aria-labelledby="cv-review-preview" className={`${phoneTab === "cv" ? "block" : "hidden"} min-h-0 min-w-0 border-border/70 bg-muted/40 lg:order-2 lg:block lg:overflow-y-auto lg:border-s`}>
            <div className="space-y-3 p-4 sm:p-6">
              <h3 id="cv-review-preview" className="hidden text-sm font-semibold text-foreground lg:block">{t("reviewCvHeading")}</h3>
              <p className="text-xs text-muted-foreground">{t("reviewCvHint")}</p>
              {reading ? (
                <CvReadingProgress />
              ) : profile ? (
                // Their own CV stays the one they send: no Mployedin CV preview
                // here, only what was read, as fields to confirm or fix.
                <>
                  <CvReviewAssistant profile={profile} onChange={onProfileChange} />
                  <CvReviewEditor profile={profile} onChange={onProfileChange} />
                </>
              ) : (
                <div className="flex h-64 items-center justify-center rounded-xl bg-background">
                  <Loader2 className="size-5 animate-spin text-muted-foreground" aria-hidden="true" />
                </div>
              )}
            </div>
          </section>

          {/* What to check, and what the CV didn't say */}
          <div className={`${phoneTab === "details" ? "block" : "hidden"} min-h-0 min-w-0 space-y-6 px-4 py-5 sm:px-6 lg:order-1 lg:block lg:overflow-y-auto`}>
            {emailNote && (
              <p className="rounded-xl border border-blue-200 bg-blue-50 p-3 text-xs text-blue-900">{emailNote}</p>
            )}

            <fieldset className="space-y-4">
              <legend className="mb-3 text-sm font-semibold text-foreground">{t("reviewDetailsHeading")}</legend>
              <div className="field">
                <Label htmlFor="confirm-name" className="text-xs font-medium text-foreground">{t("name")}</Label>
                <Input id="confirm-name" type="text" value={values.name} onChange={(e) => onChange({ name: e.target.value })}
                  placeholder={t("enterName")} className="rounded-xl" maxLength={200} />
              </div>
              <PhoneInput id="confirm-phone" label={t("phone")} value={values.phone} onChange={(phone) => onChange({ phone })} placeholder={t("enterPhone")} />
              <div className="field">
                <Label htmlFor="confirm-headline" className="text-xs font-medium text-foreground">{t("headline")}</Label>
                <Input id="confirm-headline" type="text" value={values.headline} onChange={(e) => onChange({ headline: e.target.value })}
                  placeholder={t("enterHeadline")} className="rounded-xl" maxLength={headlineMax} />
              </div>
              <SeekerAreaField value={values.area} onChange={(area) => onChange({ area })} showHint={false} />
            </fieldset>

            <fieldset className="space-y-4 border-t border-border/70 pt-5">
              <legend className="sr-only">{t("reviewPrefsHeading")}</legend>
              <div>
                <p aria-hidden="true" className="text-sm font-semibold text-foreground">{t("reviewPrefsHeading")}</p>
                <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                  <Check className="size-3.5 shrink-0 text-primary" aria-hidden="true" />
                  {t("reviewPrefsHint")}
                </p>
              </div>
              <div className="field">
                <Label htmlFor="confirm-roles" className="text-xs font-medium text-foreground">{t("wantedRoles")}</Label>
                <Input id="confirm-roles" type="text" value={values.roles} onChange={(e) => onChange({ roles: e.target.value })}
                  placeholder={t("wantedRolesPlaceholder")} className="rounded-xl" maxLength={300} />
              </div>
              <div className="field">
                <Label htmlFor="confirm-countries" className="text-xs font-medium text-foreground">{t("wantedCountries")}</Label>
                <Input id="confirm-countries" type="text" value={values.countries} onChange={(e) => onChange({ countries: e.target.value })}
                  placeholder={t("wantedCountriesPlaceholder")} className="rounded-xl" maxLength={300} />
              </div>
            </fieldset>

            <fieldset className="space-y-4 border-t border-border/70 pt-5">
              <legend className="sr-only">{t("reviewMissingHeading")}</legend>
              <div>
                <p aria-hidden="true" className="text-sm font-semibold text-foreground">{t("reviewMissingHeading")}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">{t("reviewMissingHint")}</p>
              </div>
              <div className="field">
                <Label htmlFor="confirm-salary" className="text-xs font-medium text-foreground">{t("expectedSalary")}</Label>
                <div className="flex gap-2">
                  <Select value={values.currency} onValueChange={(currency) => onChange({ currency })}>
                    <SelectTrigger className="w-28 shrink-0 rounded-xl" aria-label={t("currency")}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {SALARY_CURRENCIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Input id="confirm-salary" type="number" inputMode="numeric" min={0} value={values.salary}
                    onChange={(e) => onChange({ salary: e.target.value })} placeholder={t("expectedSalaryPlaceholder")} className="rounded-xl" />
                </div>
              </div>
              <div className="field">
                <Label htmlFor="confirm-notice" className="text-xs font-medium text-foreground">{t("noticePeriod")}</Label>
                <Select value={values.noticeDays} onValueChange={(noticeDays) => onChange({ noticeDays })}>
                  <SelectTrigger id="confirm-notice" className="rounded-xl">
                    <SelectValue placeholder={t("noticePeriodPlaceholder")} />
                  </SelectTrigger>
                  <SelectContent>
                    {NOTICE_OPTIONS.map((d) => (
                      <SelectItem key={d} value={d}>{d === "0" ? t("noticeImmediate") : t("noticeDays", { count: Number(d) })}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-start gap-3 rounded-xl border border-border/70 p-3">
                <Checkbox
                  id="confirm-discoverable"
                  checked={values.discoverable}
                  onCheckedChange={(v) => onChange({ discoverable: v === true })}
                  className="mt-0.5"
                />
                <div className="space-y-1">
                  <Label htmlFor="confirm-discoverable" className="text-sm font-medium text-foreground">{t("reviewDiscoverable")}</Label>
                  <p className="text-xs text-muted-foreground">{t("reviewDiscoverableHint")}</p>
                </div>
              </div>
            </fieldset>
          </div>
        </div>

        <div className="space-y-2 border-t border-border/70 px-4 py-3 sm:px-6">
          {error && <p className="text-center text-xs text-destructive" role="alert">{error}</p>}
          <div className="flex flex-col-reverse items-stretch gap-2 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-muted-foreground">{reading ? t("reviewSaveAfterReading") : t("reviewEditLater")}</p>
            <Button size="lg" onClick={onConfirm} disabled={saving || reading} className="gap-2 rounded-xl sm:min-w-56">
              {saving ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Check className="size-4" aria-hidden="true" />}
              {t("reviewSave")}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

const READING_STEPS = ["reviewStepFile", "reviewStepSkills", "reviewStepJobs", "reviewStepCv"] as const;
/** About how long a read takes; the bar slows near the end rather than finishing early. */
const READING_STEP_MS = 6000;

/**
 * While the CV is read: the steps it goes through, a bar that keeps moving,
 * and the outline of a CV page filling in. Paced to a typical read, so the
 * wait shows progress instead of one spinner. Still under reduced motion.
 */
function CvReadingProgress() {
  const t = useTranslations("easyApply");
  const [step, setStep] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setStep((s) => Math.min(s + 1, READING_STEPS.length - 1)), READING_STEP_MS);
    return () => clearInterval(timer);
  }, []);
  // 18% at the start, +24% a step, holding at 92% until the read ends.
  const percent = Math.min(92, 18 + step * 24);

  return (
    <div role="status" aria-live="polite" className="space-y-5 rounded-xl bg-background p-5">
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-semibold text-foreground">{t("reviewReadingTitle")}</p>
          <span className="text-xs tabular-nums text-muted-foreground">{percent}%</span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden="true">
          <div className="h-full rounded-full bg-primary transition-[width] duration-[1500ms] ease-out motion-reduce:transition-none" style={{ width: `${percent}%` }} />
        </div>
        <p className="text-xs text-muted-foreground">{t("reviewReadingHint")}</p>
      </div>

      <ol className="space-y-2">
        {READING_STEPS.map((key, i) => (
          <li key={key} className={`flex items-center gap-2 text-sm ${i <= step ? "text-foreground" : "text-muted-foreground/60"}`}>
            {i < step ? (
              <Check className="size-4 shrink-0 text-primary" aria-hidden="true" />
            ) : i === step ? (
              <Loader2 className="size-4 shrink-0 animate-spin text-primary motion-reduce:animate-none" aria-hidden="true" />
            ) : (
              <span className="size-4 shrink-0 rounded-full border border-border" aria-hidden="true" />
            )}
            {t(key)}
          </li>
        ))}
      </ol>

      {/* A CV page drawing itself in: lines appear as the steps go by. */}
      <div aria-hidden="true" className="space-y-2.5 rounded-lg border border-border/70 p-4">
        <div className="h-4 w-1/2 animate-pulse rounded bg-muted motion-reduce:animate-none" />
        <div className="h-2 w-3/4 animate-pulse rounded bg-muted motion-reduce:animate-none" />
        <div className="h-0.5 w-full bg-primary/40" />
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i}
            className={`h-2 rounded bg-muted transition-opacity duration-700 ${i < (step + 1) * 2 ? "animate-pulse opacity-100 motion-reduce:animate-none" : "opacity-0"}`}
            style={{ width: `${[92, 80, 88, 70, 85, 60][i]}%` }} />
        ))}
      </div>
    </div>
  );
}
