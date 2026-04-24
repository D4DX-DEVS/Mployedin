"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
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

const COUNTRIES = [
  { value: "AE", label: "United Arab Emirates" },
  { value: "SA", label: "Saudi Arabia" },
  { value: "QA", label: "Qatar" },
  { value: "OM", label: "Oman" },
  { value: "BH", label: "Bahrain" },
  { value: "KW", label: "Kuwait" },
  { value: "IN", label: "India" },
  { value: "PK", label: "Pakistan" },
  { value: "PH", label: "Philippines" },
  { value: "BD", label: "Bangladesh" },
];

const EXPERIENCE_OPTIONS = [
  { value: "0-1", label: "Less than 1 year" },
  { value: "1-3", label: "1–3 years" },
  { value: "3-5", label: "3–5 years" },
  { value: "5-10", label: "5–10 years" },
  { value: "10+", label: "10+ years" },
];

const SPECIALIZATION_OPTIONS = [
  { value: "general", label: "General Recruitment" },
  { value: "technology", label: "Technology & IT" },
  { value: "healthcare", label: "Healthcare" },
  { value: "construction", label: "Construction & Engineering" },
  { value: "hospitality", label: "Hospitality & Tourism" },
  { value: "finance", label: "Finance & Banking" },
  { value: "oil_gas", label: "Oil & Gas" },
  { value: "retail", label: "Retail" },
  { value: "education", label: "Education" },
  { value: "logistics", label: "Logistics & Supply Chain" },
];

const STEPS = [
  { icon: User, label: "Personal Info" },
  { icon: MapPin, label: "Professional Details" },
  { icon: CheckCircle, label: "Complete" },
];

export default function AgentRegisterPage() {
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
      setError("Please fill all required fields");
      return false;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(step1.email)) {
      setError("Invalid email address");
      return false;
    }
    if (step1.password.length < 8) {
      setError("Password must be at least 8 characters");
      return false;
    }
    if (step1.password !== step1.confirmPassword) {
      setError("Passwords do not match");
      return false;
    }
    setError("");
    return true;
  };

  const validateStep2 = (): boolean => {
    if (!step2.country) {
      setError("Please select your country");
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
        setError(data.error ?? "Registration failed. Please try again.");
      }
    } catch {
      setError("Network error. Please try again.");
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
          <h1 className="text-2xl font-bold text-foreground">Agent Registration</h1>
          <p className="mt-1 text-sm text-muted-foreground">Join Mployedin as a recruitment agent</p>
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
            <div className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-600 dark:bg-red-950/30">
              {error}
            </div>
          )}

          {/* Step 1 */}
          {step === 0 && (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold">Personal Information</h2>
              <FormInput label="Full Name *" value={step1.fullName} onChange={(e) => updateStep1("fullName", e.target.value)} placeholder="Enter your full name" />
              <FormInput label="Email Address *" type="email" value={step1.email} onChange={(e) => updateStep1("email", e.target.value)} placeholder="agent@example.com" />
              <FormInput label="Phone Number" value={step1.phone} onChange={(e) => updateStep1("phone", e.target.value)} placeholder="+971 50 000 0000" />
              <FormInput label="Password *" type="password" value={step1.password} onChange={(e) => updateStep1("password", e.target.value)} placeholder="Min 8 characters" />
              <FormInput label="Confirm Password *" type="password" value={step1.confirmPassword} onChange={(e) => updateStep1("confirmPassword", e.target.value)} placeholder="Re-enter password" />
            </div>
          )}

          {/* Step 2 */}
          {step === 1 && (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold">Professional Details</h2>
              <FormSelect label="Country *" value={step2.country} onChange={(v) => updateStep2("country", v)} options={COUNTRIES} placeholder="Select country" />
              <FormInput label="City" value={step2.city} onChange={(e) => updateStep2("city", e.target.value)} placeholder="Enter your city" />
              <FormSelect label="Years of Experience" value={step2.experience} onChange={(v) => updateStep2("experience", v)} options={EXPERIENCE_OPTIONS} placeholder="Select experience" />
              <FormSelect label="Industry Specialization" value={step2.specialization} onChange={(v) => updateStep2("specialization", v)} options={SPECIALIZATION_OPTIONS} placeholder="Select specialization" />
              <FormInput label="Languages (comma-separated)" value={step2.languages} onChange={(e) => updateStep2("languages", e.target.value)} placeholder="English, Arabic, Hindi" />
            </div>
          )}

          {/* Step 3: Success */}
          {step === 2 && (
            <div className="flex flex-col items-center py-8 text-center">
              <CheckCircle className="h-16 w-16 text-emerald-500" />
              <h2 className="mt-4 text-xl font-semibold text-foreground">Registration Complete!</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                We&apos;ve sent a verification email to <strong>{step1.email}</strong>.
                Please check your inbox to activate your account.
              </p>
              <p className="mt-4 text-xs text-muted-foreground">
                Once verified, an admin will review and activate your agent account.
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
                  <ChevronLeft className="h-4 w-4" /> Back
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
                  Create Account
                </button>
              ) : (
                <button
                  onClick={handleNext}
                  className="inline-flex items-center gap-2 rounded-xl bg-primary px-6 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
                >
                  Next <ChevronRight className="h-4 w-4" />
                </button>
              )}
            </div>
          )}
        </div>

        {/* Login link */}
        <p className="mt-4 text-center text-sm text-muted-foreground">
          Already have an account?{" "}
          <a href="/en/login" className="font-medium text-primary hover:underline">Sign in</a>
        </p>
      </div>
    </div>
  );
}
