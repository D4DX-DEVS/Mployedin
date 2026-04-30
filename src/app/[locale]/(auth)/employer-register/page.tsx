"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Building2, FileCheck, UserCircle, CheckCircle, ChevronRight, ChevronLeft, Loader2, ShieldCheck } from "lucide-react";
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
  { value: "technology", label: "Technology & IT" },
  { value: "construction", label: "Construction & Engineering" },
  { value: "healthcare", label: "Healthcare & Pharmaceuticals" },
  { value: "hospitality", label: "Hospitality & Tourism" },
  { value: "finance", label: "Finance & Banking" },
  { value: "retail", label: "Retail & E-commerce" },
  { value: "oil_gas", label: "Oil & Gas / Energy" },
  { value: "logistics", label: "Logistics & Supply Chain" },
  { value: "education", label: "Education & Training" },
  { value: "real_estate", label: "Real Estate & Property" },
  { value: "manufacturing", label: "Manufacturing" },
  { value: "telecommunications", label: "Telecommunications" },
  { value: "media", label: "Media & Entertainment" },
  { value: "legal", label: "Legal & Consulting" },
  { value: "government", label: "Government & Public Sector" },
  { value: "agriculture", label: "Agriculture & Food" },
  { value: "automotive", label: "Automotive" },
  { value: "aviation", label: "Aviation & Aerospace" },
  { value: "other", label: "Other" },
];

const SIZES = [
  { value: "1-10", label: "1–10 employees" },
  { value: "11-50", label: "11–50 employees" },
  { value: "51-200", label: "51–200 employees" },
  { value: "201-500", label: "201–500 employees" },
  { value: "501-1000", label: "501–1,000 employees" },
  { value: "1001-5000", label: "1,001–5,000 employees" },
  { value: "5000+", label: "5,000+ employees" },
];

const COUNTRIES = [
  // Gulf / GCC
  { value: "AE", label: "United Arab Emirates" },
  { value: "SA", label: "Saudi Arabia" },
  { value: "QA", label: "Qatar" },
  { value: "OM", label: "Oman" },
  { value: "BH", label: "Bahrain" },
  { value: "KW", label: "Kuwait" },
  // Middle East & North Africa
  { value: "EG", label: "Egypt" },
  { value: "JO", label: "Jordan" },
  { value: "LB", label: "Lebanon" },
  { value: "IQ", label: "Iraq" },
  { value: "MA", label: "Morocco" },
  { value: "TN", label: "Tunisia" },
  { value: "DZ", label: "Algeria" },
  { value: "LY", label: "Libya" },
  { value: "PS", label: "Palestine" },
  { value: "YE", label: "Yemen" },
  { value: "SD", label: "Sudan" },
  { value: "SY", label: "Syria" },
  // South Asia
  { value: "IN", label: "India" },
  { value: "PK", label: "Pakistan" },
  { value: "BD", label: "Bangladesh" },
  { value: "LK", label: "Sri Lanka" },
  { value: "NP", label: "Nepal" },
  // Southeast Asia
  { value: "PH", label: "Philippines" },
  { value: "ID", label: "Indonesia" },
  { value: "MY", label: "Malaysia" },
  { value: "SG", label: "Singapore" },
  { value: "TH", label: "Thailand" },
  { value: "VN", label: "Vietnam" },
  // East Asia
  { value: "CN", label: "China" },
  { value: "JP", label: "Japan" },
  { value: "KR", label: "South Korea" },
  // Africa
  { value: "NG", label: "Nigeria" },
  { value: "KE", label: "Kenya" },
  { value: "ET", label: "Ethiopia" },
  { value: "GH", label: "Ghana" },
  { value: "ZA", label: "South Africa" },
  { value: "TZ", label: "Tanzania" },
  { value: "UG", label: "Uganda" },
  // Europe
  { value: "GB", label: "United Kingdom" },
  { value: "DE", label: "Germany" },
  { value: "FR", label: "France" },
  { value: "IT", label: "Italy" },
  { value: "ES", label: "Spain" },
  { value: "NL", label: "Netherlands" },
  { value: "TR", label: "Turkey" },
  { value: "SE", label: "Sweden" },
  { value: "CH", label: "Switzerland" },
  { value: "PL", label: "Poland" },
  // Americas
  { value: "US", label: "United States" },
  { value: "CA", label: "Canada" },
  { value: "BR", label: "Brazil" },
  { value: "MX", label: "Mexico" },
  { value: "AR", label: "Argentina" },
  { value: "CO", label: "Colombia" },
  // Oceania
  { value: "AU", label: "Australia" },
  { value: "NZ", label: "New Zealand" },
];

const VERIFICATION_LEVELS: { value: VerificationLevel; label: string; description: string; badge: string }[] = [
  { value: "basic", label: "Basic", description: "Quick setup — email verification only", badge: "Free" },
  { value: "standard", label: "Standard", description: "Upload trade licence for verified badge & full access", badge: "Recommended" },
  { value: "premium", label: "Premium", description: "Government-approved status badge (MoH / Free Zone)", badge: "Top tier" },
];

const STEP_LABELS = [
  { icon: Building2, label: "Company" },
  { icon: FileCheck, label: "Verification" },
  { icon: UserCircle, label: "Contact" },
];

export default function EmployerRegisterPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const referralCode = searchParams.get("ref") ?? "";
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
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

  const validateStep1 = () => {
    if (!step1.companyName.trim()) { setError("Company name is required."); return false; }
    if (!step1.industry) { setError("Please select an industry."); return false; }
    if (!step1.size) { setError("Please select company size."); return false; }
    if (!step1.country) { setError("Please select a country."); return false; }
    if (!step1.city.trim()) { setError("City is required."); return false; }
    setError("");
    return true;
  };

  const validateStep2 = () => {
    if (step2.verificationLevel !== "basic" && !step2.tradeLicenseFile) {
      setError("Please upload your trade licence document.");
      return false;
    }
    if (step2.verificationLevel === "premium" && !step2.mohCertFile) {
      setError("Please upload your MoH / Free Zone certificate.");
      return false;
    }
    setError("");
    return true;
  };

  const validateStep3 = () => {
    if (!step3.contactName.trim()) { setError("Full name is required."); return false; }
    if (!step3.contactEmail.trim()) { setError("Work email is required."); return false; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(step3.contactEmail)) { setError("Please enter a valid email."); return false; }
    if (!step3.password) { setError("Password is required."); return false; }
    if (step3.password.length < 8) { setError("Password must be at least 8 characters."); return false; }
    if (step3.password !== step3.confirmPassword) { setError("Passwords do not match."); return false; }
    if (!agreedToTerms) { setError("You must agree to the Terms of Service and Privacy Policy."); return false; }
    setError("");
    return true;
  };

  const handleNext = () => {
    if (step === 1 && !validateStep1()) return;
    if (step === 2 && !validateStep2()) return;
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
      if (!res.ok) {
        const data = await res.json();
        setError(data.message ?? "Registration failed. Please try again.");
        return;
      }
      router.push(`/en/verify-email?email=${encodeURIComponent(step3.contactEmail)}`);
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
        <h1 className="text-2xl font-bold text-foreground tracking-tight">Register Your Company</h1>
        <p className="text-sm text-muted-foreground">
          Join MPLOYEDIN — Gulf&apos;s AI-powered recruitment platform
        </p>
        {referralCode && (
          <div className="inline-flex items-center gap-1.5 px-3 py-1 mt-1 rounded-full bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800">
            <ShieldCheck className="h-3.5 w-3.5 text-green-600" />
            <span className="text-xs font-medium text-green-700 dark:text-green-400">Referral: {referralCode}</span>
          </div>
        )}
      </div>

      {/* Step Tracker */}
      <div className="flex items-center justify-between px-1">
        {STEP_LABELS.map(({ icon: Icon, label }, i) => {
          const s = i + 1;
          const isActive = s === step;
          const isCompleted = s < step;
          return (
            <div key={label} className="flex items-center gap-1.5 flex-1">
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
              <Building2 className="h-4 w-4 text-primary" /> Company Details
            </h2>
            <FormInput label="Company Name" required value={step1.companyName}
              placeholder="e.g. Acme Corporation"
              onChange={(e) => setStep1(p => ({ ...p, companyName: e.target.value }))} />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <FormSelect label="Industry" required value={step1.industry} options={INDUSTRIES}
                placeholder="Select industry"
                onChange={(v) => setStep1(p => ({ ...p, industry: v }))} />
              <FormSelect label="Company Size" required value={step1.size} options={SIZES}
                placeholder="Select size"
                onChange={(v) => setStep1(p => ({ ...p, size: v }))} />
            </div>
            <FormInput label="Website" value={step1.website} placeholder="https://example.com"
              onChange={(e) => setStep1(p => ({ ...p, website: e.target.value }))} />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <FormSelect label="Country" required value={step1.country} options={COUNTRIES}
                placeholder="Select country"
                onChange={(v) => setStep1(p => ({ ...p, country: v }))} />
              <FormInput label="City" required value={step1.city} placeholder="e.g. Dubai"
                onChange={(e) => setStep1(p => ({ ...p, city: e.target.value }))} />
            </div>
          </div>
        )}

        {/* Step 2: Verification Level */}
        {step === 2 && (
          <div className="space-y-3.5">
            <h2 className="text-sm font-semibold flex items-center gap-2 text-foreground">
              <FileCheck className="h-4 w-4 text-primary" /> Verification Level
            </h2>
            <p className="text-xs text-muted-foreground">
              Higher verification unlocks more features and a trust badge on your profile.
            </p>
            <div className="space-y-2">
              {VERIFICATION_LEVELS.map((lvl) => (
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
              <FormFileDrop label="Trade Licence" required accept=".pdf,.jpg,.jpeg,.png"
                hint="PDF, JPG, or PNG (max 10MB)"
                value={step2.tradeLicenseFile}
                onChange={(file: File | null) => setStep2(p => ({ ...p, tradeLicenseFile: file }))} />
            )}
            {step2.verificationLevel === "premium" && (
              <FormFileDrop label="MoH / Free Zone Certificate" required accept=".pdf,.jpg,.jpeg,.png"
                hint="PDF, JPG, or PNG (max 10MB)"
                value={step2.mohCertFile}
                onChange={(file: File | null) => setStep2(p => ({ ...p, mohCertFile: file }))} />
            )}
          </div>
        )}

        {/* Step 3: Contact Person */}
        {step === 3 && (
          <div className="space-y-3.5">
            <h2 className="text-sm font-semibold flex items-center gap-2 text-foreground">
              <UserCircle className="h-4 w-4 text-primary" /> Contact Person
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <FormInput label="Full Name" required value={step3.contactName}
                placeholder="e.g. John Smith"
                onChange={(e) => setStep3(p => ({ ...p, contactName: e.target.value }))} />
              <FormInput label="Job Title" value={step3.contactTitle}
                placeholder="e.g. HR Manager"
                onChange={(e) => setStep3(p => ({ ...p, contactTitle: e.target.value }))} />
            </div>
            <FormInput label="Work Email" required type="email" value={step3.contactEmail}
              placeholder="you@company.com"
              onChange={(e) => setStep3(p => ({ ...p, contactEmail: e.target.value }))} />
            <FormInput label="Phone" value={step3.contactPhone}
              placeholder="+971 50 123 4567"
              onChange={(e) => setStep3(p => ({ ...p, contactPhone: e.target.value }))} />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <FormInput label="Password" required type="password" value={step3.password}
                placeholder="Min. 8 characters"
                onChange={(e) => setStep3(p => ({ ...p, password: e.target.value }))} />
              <FormInput label="Confirm Password" required type="password" value={step3.confirmPassword}
                placeholder="Re-enter password"
                onChange={(e) => setStep3(p => ({ ...p, confirmPassword: e.target.value }))} />
            </div>
            <div className="flex items-start gap-2.5">
              <input
                id="employer-terms"
                type="checkbox"
                checked={agreedToTerms}
                onChange={(e) => setAgreedToTerms(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-border text-primary focus:ring-primary/40"
              />
              <label htmlFor="employer-terms" className="text-xs text-muted-foreground leading-5">
                I agree to the{" "}
                <Link href="/en/terms" className="text-primary hover:underline" target="_blank">
                  Terms of Service
                </Link>
                {" "}and{" "}
                <Link href="/en/privacy" className="text-primary hover:underline" target="_blank">
                  Privacy Policy
                </Link>
              </label>
            </div>
          </div>
        )}

        {/* Error Display */}
        {error && (
          <div className="flex items-center gap-2 p-2.5 rounded-lg bg-destructive/10 border border-destructive/20">
            <span className="text-xs text-destructive font-medium">{error}</span>
          </div>
        )}

        {/* Navigation */}
        <div className="flex items-center justify-between pt-3 border-t border-border/60">
          <button
            onClick={() => { setError(""); setStep(s => s - 1); }}
            disabled={step === 1}
            className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            <ChevronLeft className="h-4 w-4" /> Back
          </button>

          {step < 3 ? (
            <button
              onClick={handleNext}
              className="btn-primary flex items-center gap-1.5 px-5 py-2.5 text-sm font-medium"
            >
              Next <ChevronRight className="h-4 w-4" />
            </button>
          ) : (
            <button
              onClick={handleSubmit}
              disabled={loading}
              className="btn-primary flex items-center gap-2 px-5 py-2.5 text-sm font-medium disabled:opacity-60"
            >
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              {loading ? "Creating…" : "Complete Registration"}
            </button>
          )}
        </div>
      </div>

      {/* Footer */}
      <p className="text-center text-sm text-muted-foreground">
        Already have an account?{" "}
        <Link href="/en/login" className="text-primary font-medium hover:underline">Sign in</Link>
      </p>
    </div>
  );
}
