"use client";

import { useMemo, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { Building2, FileCheck, UserCircle, CheckCircle, ChevronRight, ChevronLeft, Loader2, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FormInput, FormSelect, FormFileDrop } from "@/components/shared/AppForm";

type VerificationLevel = "basic" | "standard" | "premium";

interface Step1Data {
  companyName: string;
  industry: string;
  size: string;
  website: string;
  country: string;
  city: string;
}

interface Step2Data {
  verificationLevel: VerificationLevel;
  tradeLicenseFile: File | null;
  mohCertFile: File | null;
}

interface Step3Data {
  contactName: string;
  contactTitle: string;
  contactEmail: string;
  contactPhone: string;
  password: string;
  confirmPassword: string;
}

type RegistrationField = keyof Step1Data | keyof Step2Data | keyof Step3Data | "terms";
type FieldErrors = Partial<Record<RegistrationField, string>>;

const INDUSTRY_VALUES = [
  "technology",
  "construction",
  "healthcare",
  "hospitality",
  "finance",
  "insurance",
  "retail",
  "ecommerce",
  "oil_gas",
  "renewable_energy",
  "logistics",
  "maritime",
  "education",
  "real_estate",
  "manufacturing",
  "telecommunications",
  "media",
  "gaming",
  "legal",
  "consulting",
  "marketing",
  "human_resources",
  "government",
  "nonprofit",
  "agriculture",
  "food_beverage",
  "fmcg",
  "automotive",
  "aviation",
  "pharmaceuticals",
  "fashion",
  "beauty_wellness",
  "sports_fitness",
  "arts_design",
  "architecture",
  "events",
  "security",
  "facilities",
  "mining",
  "chemicals",
  "environmental",
  "other",
] as const;

const SIZE_VALUES = ["1-10", "11-50", "51-200", "201-500", "501-1000", "1001-5000", "5000+"] as const;

const COUNTRY_CODES = [
  // Gulf / GCC
  "AE",
  "SA",
  "QA",
  "OM",
  "BH",
  "KW",
  // Middle East & North Africa
  "EG",
  "JO",
  "LB",
  "IQ",
  "MA",
  "TN",
  "DZ",
  "LY",
  "PS",
  "YE",
  "SD",
  "SY",
  // South Asia
  "IN",
  "PK",
  "BD",
  "LK",
  "NP",
  // Southeast Asia
  "PH",
  "ID",
  "MY",
  "SG",
  "TH",
  "VN",
  // East Asia
  "CN",
  "JP",
  "KR",
  // Africa
  "NG",
  "KE",
  "ET",
  "GH",
  "ZA",
  "TZ",
  "UG",
  // Europe
  "GB",
  "DE",
  "FR",
  "IT",
  "ES",
  "NL",
  "TR",
  "SE",
  "CH",
  "PL",
  // Americas
  "US",
  "CA",
  "BR",
  "MX",
  "AR",
  "CO",
  // Oceania
  "AU",
  "NZ",
] as const;

const VERIFICATION_LEVEL_VALUES: VerificationLevel[] = ["basic", "standard", "premium"];

const STEP_LABELS = [
  { icon: Building2, labelKey: "company" },
  { icon: FileCheck, labelKey: "verification" },
  { icon: UserCircle, labelKey: "contact" },
];

function getCountryOptions(locale: string) {
  const language = locale === "ar" ? "ar" : "en";
  const displayNames = new Intl.DisplayNames([language], { type: "region" });

  return COUNTRY_CODES.map((code) => ({
    value: code,
    label: displayNames.of(code) ?? code,
  }));
}

export default function EmployerRegisterPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const params = useParams<{ locale?: string }>();
  const locale = params?.locale ?? "en";
  const t = useTranslations("employerRegister");
  const referralCode = searchParams.get("ref") ?? "";
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [agreedToTerms, setAgreedToTerms] = useState(false);

  const [step1, setStep1] = useState<Step1Data>({
    companyName: "", industry: "", size: "", website: "", country: "AE", city: "",
  });
  const [step2, setStep2] = useState<Step2Data>({
    verificationLevel: "basic", tradeLicenseFile: null, mohCertFile: null,
  });
  const [step3, setStep3] = useState<Step3Data>({
    contactName: "", contactTitle: "", contactEmail: "", contactPhone: "", password: "", confirmPassword: "",
  });

  const industryOptions = useMemo(
    () => INDUSTRY_VALUES.map((value) => ({ value, label: t(`industries.${value}`) })),
    [t]
  );
  const sizeOptions = useMemo(
    () => SIZE_VALUES.map((value) => ({ value, label: t(`sizes.${value}`) })),
    [t]
  );
  const countryOptions = useMemo(() => getCountryOptions(locale), [locale]);
  const verificationLevels = useMemo(
    () =>
      VERIFICATION_LEVEL_VALUES.map((value) => ({
        value,
        label: t(`verificationLevels.${value}.label`),
        description: t(`verificationLevels.${value}.description`),
        badge: t(`verificationLevels.${value}.badge`),
      })),
    [t]
  );
  const BackIcon = locale === "ar" ? ChevronRight : ChevronLeft;
  const NextIcon = locale === "ar" ? ChevronLeft : ChevronRight;

  const clearFieldError = (field: RegistrationField) => {
    setFieldErrors((current) => {
      if (!current[field]) return current;
      const next = { ...current };
      delete next[field];
      return next;
    });
  };

  const showFieldErrors = (errors: FieldErrors) => {
    setFieldErrors(errors);
    setError("");
    const firstField = Object.keys(errors)[0];
    if (!firstField) return;
    requestAnimationFrame(() => {
      const container = document.querySelector<HTMLElement>(`[data-registration-field="${firstField}"]`);
      const focusTarget = container?.querySelector<HTMLElement>("input, button, [tabindex]");
      focusTarget?.focus();
      container?.scrollIntoView({ block: "center", behavior: "smooth" });
    });
  };

  const validateStep1 = () => {
    const errors: FieldErrors = {};
    if (!step1.companyName.trim()) errors.companyName = t("validation.companyNameRequired");
    if (!step1.industry) errors.industry = t("validation.industryRequired");
    if (!step1.size) errors.size = t("validation.sizeRequired");
    if (!step1.country) errors.country = t("validation.countryRequired");
    if (!step1.city.trim()) errors.city = t("validation.cityRequired");
    if (Object.keys(errors).length > 0) {
      showFieldErrors(errors);
      return false;
    }
    setFieldErrors({});
    setError("");
    return true;
  };

  const validateStep2 = () => {
    const errors: FieldErrors = {};
    if (step2.verificationLevel !== "basic" && !step2.tradeLicenseFile) {
      errors.tradeLicenseFile = t("validation.tradeLicenceRequired");
    }
    if (step2.verificationLevel === "premium" && !step2.mohCertFile) {
      errors.mohCertFile = t("validation.mohRequired");
    }
    if (Object.keys(errors).length > 0) {
      showFieldErrors(errors);
      return false;
    }
    setFieldErrors({});
    setError("");
    return true;
  };

  const validateStep3 = () => {
    const errors: FieldErrors = {};
    if (!step3.contactName.trim()) errors.contactName = t("validation.fullNameRequired");
    if (!step3.contactEmail.trim()) {
      errors.contactEmail = t("validation.workEmailRequired");
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(step3.contactEmail)) {
      errors.contactEmail = t("validation.validEmailRequired");
    }
    if (!step3.password) {
      errors.password = t("validation.passwordRequired");
    } else if (
      step3.password.length < 12 ||
      !/[a-z]/.test(step3.password) ||
      !/[A-Z]/.test(step3.password) ||
      !/[0-9]/.test(step3.password) ||
      !/[^A-Za-z0-9]/.test(step3.password)
    ) {
      errors.password = t("validation.passwordStrength");
    }
    if (step3.password !== step3.confirmPassword) {
      errors.confirmPassword = t("validation.passwordMismatch");
    }
    if (!agreedToTerms) errors.terms = t("validation.termsRequired");
    if (Object.keys(errors).length > 0) {
      showFieldErrors(errors);
      return false;
    }
    setFieldErrors({});
    setError("");
    return true;
  };

  const handleNext = () => {
    if (step === 1 && !validateStep1()) return;
    if (step === 2 && !validateStep2()) return;
    setFieldErrors({});
    setStep((s) => s + 1);
  };

  const handleSubmit = async () => {
    if (!validateStep3()) return;
    setLoading(true);
    setError("");
    try {
      const form = new FormData();
      Object.entries(step1).forEach(([k, v]) => form.append(k, v));
      form.append("verificationLevel", step2.verificationLevel);
      if (step2.tradeLicenseFile) form.append("tradeLicense", step2.tradeLicenseFile);
      if (step2.mohCertFile) form.append("mohCert", step2.mohCertFile);
      Object.entries(step3).forEach(([k, v]) => { if (k !== "confirmPassword") form.append(k, v); });
      if (referralCode) form.append("referralCode", referralCode);

      const res = await fetch("/api/auth/employer-register", { method: "POST", body: form });

      // Some failure paths (e.g. middleware-level rejections, reverse-proxy
      // errors) return non-JSON bodies (HTML error pages, empty 204, etc.).
      // Parsing those as JSON throws and would hide the real HTTP status.
      const contentType = res.headers.get("content-type") ?? "";
      if (!res.ok) {
        let serverMessage: string | undefined;
        if (contentType.includes("application/json")) {
          try {
            const data = await res.json();
            // Middleware (csrf.ts) uses { error }, route handler uses { message }.
            // Accept either so we never mask the real reason again.
            serverMessage = data?.message ?? data?.error;
          } catch {
            /* body wasn't valid JSON despite the header — fall through */
          }
        }
        // Status-specific fallbacks so the user at least knows the category
        // of failure even if the body was empty/unparseable.
        setError(
          serverMessage ??
            (res.status >= 500
              ? t("validation.serverError")
              : res.status === 429
                ? t("validation.tooManyRequests")
                : t("validation.registrationFailed"))
        );
        return;
      }

      let emailSendFailed = false;
      if (contentType.includes("application/json")) {
        try {
          const data = await res.json();
          emailSendFailed = data?.emailSendFailed === true;
        } catch {
          /* non-JSON success body — treat as delivered */
        }
      }
      const query = new URLSearchParams({ email: step3.contactEmail });
      query.set("role", "employer");
      if (emailSendFailed) query.set("emailFailed", "1");
      router.push(`/${locale}/verify-email?${query.toString()}`);
    } catch (err) {
      // Network-level failure: fetch rejected (offline, DNS, CORS, SW no-response,
      // aborted). Previously this had no catch at all → silent failure with the
      // button stuck on "Creating…". Now surface a meaningful message.
      console.error("[employer-register] Network/request error:", err);
      setError(t("validation.networkError"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full flex flex-col gap-6">
      {/* Mobile logo */}
      <div className="lg:hidden flex items-center gap-2">
        <div className="w-8 h-8 rounded-lg bg-primary text-primary-foreground flex items-center justify-center shadow-sm">
          <span className="font-bold text-base">M</span>
        </div>
        <span className="text-xl font-bold text-foreground tracking-tight">mployedin</span>
      </div>

      {/* Header */}
      <div className="text-center space-y-1.5">
        <h1 className="text-2xl font-bold text-foreground tracking-tight">{t("title")}</h1>
        <p className="text-sm text-muted-foreground">
          {t("subtitle")}
        </p>
        {referralCode && (
          <div className="inline-flex items-center gap-1.5 px-3 py-1 mt-1 rounded-full bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800">
            <ShieldCheck className="h-3.5 w-3.5 text-green-600" />
            <span className="text-xs font-medium text-green-700 dark:text-green-400">{t("referral", { code: referralCode })}</span>
          </div>
        )}
      </div>

      {/* Step Tracker */}
      <p className="text-center text-sm font-medium text-foreground sm:hidden" aria-live="polite">
        {t("stepProgress", {
          current: step,
          total: STEP_LABELS.length,
          label: t(`steps.${STEP_LABELS[step - 1]!.labelKey}`),
        })}
      </p>
      <div
        className="flex items-center justify-between px-1"
        role="list"
        aria-label={t("stepProgress", {
          current: step,
          total: STEP_LABELS.length,
          label: t(`steps.${STEP_LABELS[step - 1]!.labelKey}`),
        })}
      >
        {STEP_LABELS.map(({ icon: Icon, labelKey }, i) => {
          const s = i + 1;
          const label = t(`steps.${labelKey}`);
          const isActive = s === step;
          const isCompleted = s < step;
          return (
            <div key={label} className="flex items-center gap-1.5 flex-1" role="listitem" aria-current={isActive ? "step" : undefined}>
              <div className="flex items-center gap-1.5">
                <div className={`h-7 w-7 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
                  isCompleted
                    ? "bg-green-500 text-white"
                    : isActive
                      ? "bg-primary text-white shadow-sm shadow-primary/30"
                      : "bg-muted text-muted-foreground"
                }`}>
                  {isCompleted ? <CheckCircle className="h-3.5 w-3.5" /> : <Icon className="h-3.5 w-3.5" />}
                </div>
                <span className={`text-xs font-medium hidden sm:block ${
                  isActive ? "text-foreground" : "text-muted-foreground"
                }`}>
                  {label}
                </span>
              </div>
              {s < 3 && <div className={`h-0.5 flex-1 mx-1.5 rounded-full transition-colors ${
                isCompleted ? "bg-green-500" : "bg-border"
              }`} />}
            </div>
          );
        })}
      </div>

      {/* Form Content */}
      <div className="space-y-4">
        {/* Step 1: Company Details */}
        {step === 1 && (
          <div className="space-y-3.5">
            <h2 className="text-sm font-semibold flex items-center gap-2 text-foreground">
              <Building2 className="h-4 w-4 text-primary" /> {t("companyDetails")}
            </h2>
            <div data-registration-field="companyName">
              <FormInput label={t("companyName")} required value={step1.companyName}
                error={fieldErrors.companyName}
                placeholder={t("companyNamePlaceholder")}
                onChange={(e) => {
                  clearFieldError("companyName");
                  setStep1(p => ({ ...p, companyName: e.target.value }));
                }} />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div data-registration-field="industry">
                <FormSelect label={t("industry")} required value={step1.industry} options={industryOptions}
                  error={fieldErrors.industry}
                  placeholder={t("industryPlaceholder")}
                  onChange={(v) => {
                    clearFieldError("industry");
                    setStep1(p => ({ ...p, industry: v }));
                  }} />
              </div>
              <div data-registration-field="size">
                <FormSelect label={t("companySize")} required value={step1.size} options={sizeOptions}
                  error={fieldErrors.size}
                  placeholder={t("sizePlaceholder")}
                  onChange={(v) => {
                    clearFieldError("size");
                    setStep1(p => ({ ...p, size: v }));
                  }} />
              </div>
            </div>
            <FormInput label={t("website")} value={step1.website} placeholder="https://example.com"
              onChange={(e) => setStep1(p => ({ ...p, website: e.target.value }))} />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div data-registration-field="country">
                <FormSelect label={t("country")} required value={step1.country} options={countryOptions}
                  error={fieldErrors.country}
                  placeholder={t("countryPlaceholder")}
                  onChange={(v) => {
                    clearFieldError("country");
                    setStep1(p => ({ ...p, country: v }));
                  }} />
              </div>
              <div data-registration-field="city">
                <FormInput label={t("city")} required value={step1.city} placeholder={t("cityPlaceholder")}
                  error={fieldErrors.city}
                  onChange={(e) => {
                    clearFieldError("city");
                    setStep1(p => ({ ...p, city: e.target.value }));
                  }} />
              </div>
            </div>
          </div>
        )}

        {/* Step 2: Verification Level */}
        {step === 2 && (
          <div className="space-y-3.5">
            <h2 className="text-sm font-semibold flex items-center gap-2 text-foreground">
              <FileCheck className="h-4 w-4 text-primary" /> {t("verificationLevel")}
            </h2>
            <p className="text-xs text-muted-foreground">
              {t("verificationIntro")}
            </p>

            {/* Verification process info */}
            <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 space-y-1.5">
              <p className="text-xs font-semibold text-foreground">{t("verificationProcess.title")}</p>
              <ol className="text-[11px] text-muted-foreground space-y-1 list-decimal list-inside">
                <li>{t("verificationProcess.step1")}</li>
                <li>{t("verificationProcess.step2")}</li>
                <li>{t("verificationProcess.step3")}</li>
              </ol>
            </div>

            <div className="space-y-2">
              {verificationLevels.map((lvl) => (
                <label key={lvl.value} className={`relative flex items-start gap-3 p-3 rounded-xl border-2 cursor-pointer transition-all ${
                  step2.verificationLevel === lvl.value
                    ? "border-primary bg-primary/5 shadow-sm"
                    : "border-border hover:border-primary/40 hover:bg-muted/30"
                }`}>
                  <input type="radio" name="verLevel" value={lvl.value}
                    checked={step2.verificationLevel === lvl.value}
                    onChange={() => setStep2(p => ({ ...p, verificationLevel: lvl.value }))}
                    className="mt-0.5 accent-primary" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold">{lvl.label}</p>
                      <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${
                        lvl.value === "standard"
                          ? "bg-primary/10 text-primary"
                          : lvl.value === "premium"
                            ? "bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400"
                            : "bg-muted text-muted-foreground"
                      }`}>
                        {lvl.badge}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">{lvl.description}</p>
                  </div>
                  {step2.verificationLevel === lvl.value && (
                    <CheckCircle className="h-4 w-4 text-primary flex-shrink-0 mt-0.5" />
                  )}
                </label>
              ))}
            </div>
            {step2.verificationLevel !== "basic" && (
              <div data-registration-field="tradeLicenseFile">
                <FormFileDrop label={t("tradeLicence")} required accept=".pdf,.jpg,.jpeg,.png"
                  error={fieldErrors.tradeLicenseFile}
                  hint={t("uploadHint")}
                  value={step2.tradeLicenseFile}
                  onChange={(file: File | null) => {
                    clearFieldError("tradeLicenseFile");
                    setStep2(p => ({ ...p, tradeLicenseFile: file }));
                  }} />
              </div>
            )}
            {step2.verificationLevel === "premium" && (
              <div data-registration-field="mohCertFile">
                <FormFileDrop label={t("mohCertificate")} required accept=".pdf,.jpg,.jpeg,.png"
                  error={fieldErrors.mohCertFile}
                  hint={t("uploadHint")}
                  value={step2.mohCertFile}
                  onChange={(file: File | null) => {
                    clearFieldError("mohCertFile");
                    setStep2(p => ({ ...p, mohCertFile: file }));
                  }} />
              </div>
            )}
          </div>
        )}

        {/* Step 3: Contact Person */}
        {step === 3 && (
          <form
            className="space-y-3.5"
            onSubmit={(e) => { e.preventDefault(); handleSubmit(); }}
          >
            <h2 className="text-sm font-semibold flex items-center gap-2 text-foreground">
              <UserCircle className="h-4 w-4 text-primary" /> {t("contactPerson")}
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div data-registration-field="contactName">
                <FormInput label={t("fullName")} required value={step3.contactName}
                  error={fieldErrors.contactName}
                  placeholder={t("fullNamePlaceholder")}
                  onChange={(e) => {
                    clearFieldError("contactName");
                    setStep3(p => ({ ...p, contactName: e.target.value }));
                  }} />
              </div>
              <FormInput label={t("jobTitle")} value={step3.contactTitle}
                placeholder={t("jobTitlePlaceholder")}
                onChange={(e) => setStep3(p => ({ ...p, contactTitle: e.target.value }))} />
            </div>
            <div data-registration-field="contactEmail">
              <FormInput label={t("workEmail")} required type="email" value={step3.contactEmail}
                error={fieldErrors.contactEmail}
                placeholder={t("workEmailPlaceholder")}
                onChange={(e) => {
                  clearFieldError("contactEmail");
                  setStep3(p => ({ ...p, contactEmail: e.target.value }));
                }} />
            </div>
            <FormInput label={t("phone")} value={step3.contactPhone}
              placeholder={t("phonePlaceholder")}
              onChange={(e) => setStep3(p => ({ ...p, contactPhone: e.target.value }))} />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div data-registration-field="password">
                <FormInput label={t("password")} required type="password" value={step3.password}
                  error={fieldErrors.password}
                  placeholder={t("passwordPlaceholder")}
                  onChange={(e) => {
                    clearFieldError("password");
                    setStep3(p => ({ ...p, password: e.target.value }));
                  }} />
              </div>
              <div data-registration-field="confirmPassword">
                <FormInput label={t("confirmPassword")} required type="password" value={step3.confirmPassword}
                  error={fieldErrors.confirmPassword}
                  placeholder={t("confirmPasswordPlaceholder")}
                  onChange={(e) => {
                    clearFieldError("confirmPassword");
                    setStep3(p => ({ ...p, confirmPassword: e.target.value }));
                  }} />
              </div>
            </div>
            <div data-registration-field="terms">
              <div className="flex min-h-11 items-start gap-2.5">
              <input
                id="employer-terms"
                type="checkbox"
                checked={agreedToTerms}
                onChange={(e) => {
                  clearFieldError("terms");
                  setAgreedToTerms(e.target.checked);
                }}
                className="mt-0.5 h-5 w-5 rounded border-border text-primary focus:ring-primary/40"
              />
              <label htmlFor="employer-terms" className="text-xs text-muted-foreground leading-5">
                {t("agreePrefix")}{" "}
                <Link href={`/${locale}/terms`} className="text-primary hover:underline" target="_blank">
                  {t("termsOfService")}
                </Link>
                {" "}{t("and")}{" "}
                <Link href={`/${locale}/privacy`} className="text-primary hover:underline" target="_blank">
                  {t("privacyPolicy")}
                </Link>
              </label>
              </div>
              {fieldErrors.terms && <p className="mt-1 text-xs text-destructive">{fieldErrors.terms}</p>}
            </div>
          </form>
        )}

        {/* Error Display */}
        {Object.keys(fieldErrors).length > 0 && (
          <div role="alert" className="rounded-lg border border-destructive/20 bg-destructive/10 p-3">
            <p className="text-sm font-semibold text-destructive">{t("validation.fixFields")}</p>
            <ul className="mt-1 list-disc space-y-1 pl-5 text-xs text-destructive">
              {Object.values(fieldErrors).map((fieldError) => (
                <li key={fieldError}>{fieldError}</li>
              ))}
            </ul>
          </div>
        )}
        {error && (
          <div className="flex items-center gap-2 p-2.5 rounded-lg bg-destructive/10 border border-destructive/20">
            <span className="text-xs text-destructive font-medium">{error}</span>
          </div>
        )}

        {/* Navigation */}
        <div className="flex items-center justify-between pt-3 border-t border-border/60">
          <button
            onClick={() => { setError(""); setFieldErrors({}); setStep(s => s - 1); }}
            disabled={step === 1}
            className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            <BackIcon className="h-4 w-4" /> {t("back")}
          </button>

          {step < 3 ? (
            <Button
              onClick={handleNext}
              className="flex items-center gap-1.5 px-5 py-2.5 text-sm font-medium"
            >
              {t("next")} <NextIcon className="h-4 w-4" />
            </Button>
          ) : (
            <Button
              onClick={handleSubmit}
              disabled={loading}
              className="flex items-center gap-2 px-5 py-2.5 text-sm font-medium disabled:opacity-60"
            >
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              {loading ? t("creating") : t("completeRegistration")}
            </Button>
          )}
        </div>
      </div>

      {/* Footer */}
      <p className="text-center text-sm text-muted-foreground">
        {t("alreadyHaveAccount")}{" "}
        <Link href={`/${locale}/login`} className="text-primary font-medium hover:underline">{t("signIn")}</Link>
      </p>
    </div>
  );
}
