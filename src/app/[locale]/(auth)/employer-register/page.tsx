"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Building2, FileCheck, CheckCircle, ChevronRight, ChevronLeft, Loader2 } from "lucide-react";
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

const INDUSTRIES = [
  { value: "technology", label: "Technology" },
  { value: "construction", label: "Construction" },
  { value: "healthcare", label: "Healthcare" },
  { value: "hospitality", label: "Hospitality & Tourism" },
  { value: "finance", label: "Finance & Banking" },
  { value: "retail", label: "Retail & E-commerce" },
  { value: "oil_gas", label: "Oil & Gas" },
  { value: "logistics", label: "Logistics & Supply Chain" },
  { value: "education", label: "Education" },
  { value: "other", label: "Other" },
];

const SIZES = [
  { value: "1-10", label: "1–10 employees" },
  { value: "11-50", label: "11–50 employees" },
  { value: "51-200", label: "51–200 employees" },
  { value: "201-500", label: "201–500 employees" },
  { value: "500+", label: "500+ employees" },
];

const COUNTRIES = [
  { value: "AE", label: "United Arab Emirates" },
  { value: "SA", label: "Saudi Arabia" },
  { value: "QA", label: "Qatar" },
  { value: "OM", label: "Oman" },
  { value: "BH", label: "Bahrain" },
  { value: "KW", label: "Kuwait" },
];

const VERIFICATION_LEVELS: { value: VerificationLevel; label: string; description: string }[] = [
  { value: "basic", label: "Basic (Email verification)", description: "Quick setup — email only" },
  { value: "standard", label: "Standard (Trade License)", description: "Upload trade licence for full access" },
  { value: "premium", label: "Premium (MoH / Free Zone)", description: "Government-approved status badge" },
];

export default function EmployerRegisterPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const referralCode = searchParams.get("ref") ?? "";
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [step1, setStep1] = useState<Step1Data>({
    companyName: "", industry: "", size: "", website: "", country: "AE", city: "",
  });
  const [step2, setStep2] = useState<Step2Data>({
    verificationLevel: "basic", tradeLicenseFile: null, mohCertFile: null,
  });
  const [step3, setStep3] = useState<Step3Data>({
    contactName: "", contactTitle: "", contactEmail: "", contactPhone: "", password: "", confirmPassword: "",
  });

  const handleSubmit = async () => {
    if (step3.password !== step3.confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
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
      if (!res.ok) {
        const data = await res.json();
        setError(data.message ?? "Registration failed.");
        return;
      }
      router.push(`/en/verify-email?email=${encodeURIComponent(step3.contactEmail)}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-xl space-y-6">
        {/* Header */}
        <div className="text-center space-y-1">
          <div className="flex justify-center">
            <div className="h-12 w-12 rounded-xl bg-primary flex items-center justify-center">
              <Building2 className="h-6 w-6 text-white" />
            </div>
          </div>
          <h1 className="text-2xl font-bold text-foreground">Register Your Company</h1>
          <p className="text-sm text-muted-foreground">Join MPLOYEDIN — Gulf&apos;s AI-powered recruitment platform</p>
        </div>

        {/* Step Tracker */}
        <div className="flex items-center gap-2">
          {[1, 2, 3].map((s) => (
            <div key={s} className="flex items-center gap-2 flex-1">
              <div className={`h-7 w-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                s < step ? "bg-primary text-white" : s === step ? "bg-primary text-white" : "bg-muted text-muted-foreground"
              }`}>
                {s < step ? <CheckCircle className="h-4 w-4" /> : s}
              </div>
              <span className="text-xs hidden sm:block text-muted-foreground">
                {s === 1 ? "Company" : s === 2 ? "Verification" : "Contact"}
              </span>
              {s < 3 && <div className="h-px flex-1 bg-border" />}
            </div>
          ))}
        </div>

        {/* Card */}
        <div className="card-base space-y-4">
          {step === 1 && (
            <>
              <h2 className="text-base font-semibold flex items-center gap-2">
                <Building2 className="h-4 w-4 text-primary" /> Company Details
              </h2>
              <FormInput label="Company Name *" value={step1.companyName}
                onChange={(e) => setStep1(p => ({ ...p, companyName: e.target.value }))} />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <FormSelect label="Industry *" value={step1.industry} options={INDUSTRIES}
                  onChange={(v) => setStep1(p => ({ ...p, industry: v }))} />
                <FormSelect label="Company Size *" value={step1.size} options={SIZES}
                  onChange={(v) => setStep1(p => ({ ...p, size: v }))} />
              </div>
              <FormInput label="Website" value={step1.website} placeholder="https://example.com"
                onChange={(e) => setStep1(p => ({ ...p, website: e.target.value }))} />
              <div className="grid grid-cols-2 gap-3">
                <FormSelect label="Country *" value={step1.country} options={COUNTRIES}
                  onChange={(v) => setStep1(p => ({ ...p, country: v }))} />
                <FormInput label="City *" value={step1.city}
                  onChange={(e) => setStep1(p => ({ ...p, city: e.target.value }))} />
              </div>
            </>
          )}

          {step === 2 && (
            <>
              <h2 className="text-base font-semibold flex items-center gap-2">
                <FileCheck className="h-4 w-4 text-primary" /> Verification Level
              </h2>
              <div className="space-y-2">
                {VERIFICATION_LEVELS.map((lvl) => (
                  <label key={lvl.value} className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-all ${
                    step2.verificationLevel === lvl.value ? "border-primary bg-primary/5" : "border-border hover:border-primary/40"
                  }`}>
                    <input type="radio" name="verLevel" value={lvl.value} checked={step2.verificationLevel === lvl.value}
                      onChange={() => setStep2(p => ({ ...p, verificationLevel: lvl.value }))}
                      className="mt-0.5 accent-primary" />
                    <div>
                      <p className="text-sm font-medium">{lvl.label}</p>
                      <p className="text-xs text-muted-foreground">{lvl.description}</p>
                    </div>
                  </label>
                ))}
              </div>
              {step2.verificationLevel !== "basic" && (
                <FormFileDrop label="Trade Licence *" accept=".pdf,.jpg,.png"
                  onChange={(file: File | null) => setStep2(p => ({ ...p, tradeLicenseFile: file }))} />
              )}
              {step2.verificationLevel === "premium" && (
                <FormFileDrop label="MoH / Free Zone Certificate *" accept=".pdf,.jpg,.png"
                  onChange={(file: File | null) => setStep2(p => ({ ...p, mohCertFile: file }))} />
              )}
            </>
          )}

          {step === 3 && (
            <>
              <h2 className="text-base font-semibold">Contact Person</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <FormInput label="Full Name *" value={step3.contactName}
                  onChange={(e) => setStep3(p => ({ ...p, contactName: e.target.value }))} />
                <FormInput label="Job Title" value={step3.contactTitle}
                  onChange={(e) => setStep3(p => ({ ...p, contactTitle: e.target.value }))} />
              </div>
              <FormInput label="Work Email *" type="email" value={step3.contactEmail}
                onChange={(e) => setStep3(p => ({ ...p, contactEmail: e.target.value }))} />
              <FormInput label="Phone" value={step3.contactPhone}
                onChange={(e) => setStep3(p => ({ ...p, contactPhone: e.target.value }))} />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <FormInput label="Password *" type="password" value={step3.password}
                  onChange={(e) => setStep3(p => ({ ...p, password: e.target.value }))} />
                <FormInput label="Confirm Password *" type="password" value={step3.confirmPassword}
                  onChange={(e) => setStep3(p => ({ ...p, confirmPassword: e.target.value }))} />
              </div>
              {error && <p className="text-xs text-destructive">{error}</p>}
            </>
          )}

          {/* Navigation */}
          <div className="flex items-center justify-between pt-2">
            <button
              onClick={() => setStep(s => s - 1)}
              disabled={step === 1}
              className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground disabled:opacity-40 transition-colors"
            >
              <ChevronLeft className="h-4 w-4" /> Back
            </button>

            {step < 3 ? (
              <button
                onClick={() => setStep(s => s + 1)}
                className="btn-primary flex items-center gap-1"
              >
                Next <ChevronRight className="h-4 w-4" />
              </button>
            ) : (
              <button
                onClick={handleSubmit}
                disabled={loading}
                className="btn-primary flex items-center gap-2 disabled:opacity-60"
              >
                {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                {loading ? "Registering…" : "Complete Registration"}
              </button>
            )}
          </div>
        </div>

        <p className="text-center text-xs text-muted-foreground">
          Already have an account?{" "}
          <a href="/en/login" className="text-primary hover:underline">Sign in</a>
        </p>
      </div>
    </div>
  );
}
