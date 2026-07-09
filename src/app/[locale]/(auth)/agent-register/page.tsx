"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { User, MapPin, CheckCircle, ChevronRight, ChevronLeft, Loader2, Briefcase, Shield } from "lucide-react";
import { FormInput, FormSelect } from "@/components/shared/AppForm";

interface Step1Data {
  fullName: string;
  email: string;
  phone: string;
  password: string;
  confirmPassword: string;
}

interface Step2Data {
  country: string;
  city: string;
  experience: string;
  specialization: string;
  languages: string;
}

export default function AgentRegisterPage() {
  const t = useTranslations("agentRegister");

  const COUNTRIES = [
    { value: "AE", label: t("countryAE") },
    { value: "SA", label: t("countrySA") },
    { value: "QA", label: t("countryQA") },
    { value: "OM", label: t("countryOM") },
    { value: "BH", label: t("countryBH") },
    { value: "KW", label: t("countryKW") },
    { value: "IN", label: t("countryIN") },
    { value: "PK", label: t("countryPK") },
    { value: "PH", label: t("countryPH") },
    { value: "BD", label: t("countryBD") },
  ];

  const EXPERIENCE_OPTIONS = [
    { value: "0-1", label: t("expLessThan1") },
    { value: "1-3", label: t("exp1to3") },
    { value: "3-5", label: t("exp3to5") },
    { value: "5-10", label: t("exp5to10") },
    { value: "10+", label: t("exp10plus") },
  ];

  const SPECIALIZATION_OPTIONS = [
    { value: "general", label: t("specGeneral") },
    { value: "technology", label: t("specTechnology") },
    { value: "healthcare", label: t("specHealthcare") },
    { value: "construction", label: t("specConstruction") },
    { value: "hospitality", label: t("specHospitality") },
    { value: "finance", label: t("specFinance") },
    { value: "oil_gas", label: t("specOilGas") },
    { value: "retail", label: t("specRetail") },
    { value: "education", label: t("specEducation") },
    { value: "logistics", label: t("specLogistics") },
  ];

  const STEPS = [
    { icon: User, label: t("stepPersonalInfo") },
    { icon: MapPin, label: t("stepProfessionalDetails") },
    { icon: CheckCircle, label: t("stepComplete") },
  ];

  const router = useRouter();
  const searchParams = useSearchParams();
  const referralCode = searchParams.get("ref") ?? "";

  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [step1, setStep1] = useState<Step1Data>({
    fullName: "", email: "", phone: "", password: "", confirmPassword: "",
  });

  const [step2, setStep2] = useState<Step2Data>({
    country: "", city: "", experience: "", specialization: "general", languages: "",
  });

  const updateStep1 = (key: keyof Step1Data, value: string) =>
    setStep1((prev) => ({ ...prev, [key]: value }));

  const updateStep2 = (key: keyof Step2Data, value: string) =>
    setStep2((prev) => ({ ...prev, [key]: value }));

  const validateStep1 = (): boolean => {
    if (!step1.fullName || !step1.email || !step1.password) {
      setError(t("fillAllRequiredFields"));
      return false;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(step1.email)) {
      setError(t("invalidEmailAddress"));
      return false;
    }
    if (step1.password.length < 8) {
      setError(t("passwordMinLength"));
      return false;
    }
    if (step1.password !== step1.confirmPassword) {
      setError(t("passwordsDoNotMatch"));
      return false;
    }
    setError("");
    return true;
  };

  const validateStep2 = (): boolean => {
    if (!step2.country) {
      setError(t("selectYourCountry"));
      return false;
    }
    setError("");
    return true;
  };

  const handleNext = () => {
    if (step === 0 && !validateStep1()) return;
    if (step === 1 && !validateStep2()) return;
    setStep((s) => Math.min(s + 1, 2));
  };

  const handleSubmit = async () => {
    if (!validateStep2()) return;

    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/auth/agent-register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...step1,
          ...step2,
          referralCode,
        }),
      });

      const data = await res.json();

      if (res.ok) {
        setStep(2);
        setTimeout(() => {
          router.push(`/en/verify-email?email=${encodeURIComponent(step1.email)}`);
        }, 2000);
      } else {
        setError(data.error ?? t("registrationFailed"));
      }
    } catch {
      setError(t("networkError"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-background via-background to-primary/5 p-4">
      <div className="w-full max-w-lg">
        {/* Header */}
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10">
            <Shield className="h-7 w-7 text-primary" />
          </div>
          <h1 className="text-2xl font-bold text-foreground">{t("pageTitle")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("pageSubtitle")}</p>
        </div>

        {/* Step Indicator */}
        <div className="mb-8 flex items-center justify-center gap-2">
          {STEPS.map((s, i) => (
            <div key={i} className="flex items-center gap-2">
              <div className={`flex h-8 w-8 items-center justify-center rounded-full text-sm transition-colors ${
                step >= i ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
              }`}>
                {step > i ? <CheckCircle className="h-4 w-4" /> : i + 1}
              </div>
              <span className={`hidden text-xs sm:inline ${step >= i ? "font-medium text-foreground" : "text-muted-foreground"}`}>
                {s.label}
              </span>
              {i < STEPS.length - 1 && <ChevronRight className="h-4 w-4 text-muted-foreground" />}
            </div>
          ))}
        </div>

        {/* Form Card */}
        <div className="rounded-2xl border border-border bg-card p-6 shadow-lg">
          {error && (
            <div className="mb-4 p-3 bg-destructive/10 border border-destructive/20 rounded-lg">
              <p className="text-sm text-destructive text-center font-medium">{error}</p>
            </div>
          )}

          {/* Step 1 */}
          {step === 0 && (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold">{t("personalInformation")}</h2>
              <FormInput label={t("fullNameLabel")} value={step1.fullName} onChange={(e) => updateStep1("fullName", e.target.value)} placeholder={t("fullNamePlaceholder")} />
              <FormInput label={t("emailAddressLabel")} type="email" value={step1.email} onChange={(e) => updateStep1("email", e.target.value)} placeholder="agent@example.com" />
              <FormInput label={t("phoneNumberLabel")} value={step1.phone} onChange={(e) => updateStep1("phone", e.target.value)} placeholder="+971 50 000 0000" />
              <FormInput label={t("passwordLabel")} type="password" value={step1.password} onChange={(e) => updateStep1("password", e.target.value)} placeholder={t("passwordPlaceholder")} />
              <FormInput label={t("confirmPasswordLabel")} type="password" value={step1.confirmPassword} onChange={(e) => updateStep1("confirmPassword", e.target.value)} placeholder={t("confirmPasswordPlaceholder")} />
            </div>
          )}

          {/* Step 2 */}
          {step === 1 && (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold">{t("professionalDetails")}</h2>
              <FormSelect label={t("countryLabel")} value={step2.country} onChange={(v) => updateStep2("country", v)} options={COUNTRIES} placeholder={t("selectCountryPlaceholder")} />
              <FormInput label={t("cityLabel")} value={step2.city} onChange={(e) => updateStep2("city", e.target.value)} placeholder={t("cityPlaceholder")} />
              <FormSelect label={t("experienceLabel")} value={step2.experience} onChange={(v) => updateStep2("experience", v)} options={EXPERIENCE_OPTIONS} placeholder={t("selectExperiencePlaceholder")} />
              <FormSelect label={t("specializationLabel")} value={step2.specialization} onChange={(v) => updateStep2("specialization", v)} options={SPECIALIZATION_OPTIONS} placeholder={t("selectSpecializationPlaceholder")} />
              <FormInput label={t("languagesLabel")} value={step2.languages} onChange={(e) => updateStep2("languages", e.target.value)} placeholder="English, Arabic, Hindi" />
            </div>
          )}

          {/* Step 3: Success */}
          {step === 2 && (
            <div className="flex flex-col items-center py-8 text-center">
              <CheckCircle className="h-16 w-16 text-emerald-500" />
              <h2 className="mt-4 text-xl font-semibold text-foreground">{t("registrationCompleteTitle")}</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                {t("verificationEmailSentPrefix")} <strong>{step1.email}</strong>.
                {" "}{t("checkInboxToActivate")}
              </p>
              <p className="mt-4 text-xs text-muted-foreground">
                {t("adminReviewNote")}
              </p>
            </div>
          )}

          {/* Navigation */}
          {step < 2 && (
            <div className="mt-6 flex items-center justify-between">
              {step > 0 ? (
                <button
                  onClick={() => setStep((s) => s - 1)}
                  className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
                >
                  <ChevronLeft className="h-4 w-4" /> {t("back")}
                </button>
              ) : (
                <div />
              )}
              {step === 1 ? (
                <button
                  onClick={handleSubmit}
                  disabled={loading}
                  className="inline-flex items-center gap-2 rounded-xl bg-primary px-6 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                >
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle className="h-4 w-4" />}
                  {t("createAccount")}
                </button>
              ) : (
                <button
                  onClick={handleNext}
                  className="inline-flex items-center gap-2 rounded-xl bg-primary px-6 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
                >
                  {t("next")} <ChevronRight className="h-4 w-4" />
                </button>
              )}
            </div>
          )}
        </div>

        {/* Login link */}
        <p className="mt-4 text-center text-sm text-muted-foreground">
          {t("alreadyHaveAccount")}{" "}
          <a href="/en/login" className="font-medium text-primary hover:underline">{t("signIn")}</a>
        </p>
      </div>
    </div>
  );
}
