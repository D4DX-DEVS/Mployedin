"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Loader2, Zap, FileText, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export interface EasyApplyScreeningQuestion {
  id: string;
  label: string;
  type: "text" | "textarea" | "select" | "checkbox" | "radio" | "number" | "date";
  required: boolean;
  options?: string[];
  placeholder?: string;
  order: number;
}

interface EasyApplyProps {
  jobId: string;
  jobTitle: string;
  locale: string;
  screeningQuestions?: EasyApplyScreeningQuestion[];
}

interface JobSeekerProfile {
  name?: string;
  email?: string;
  phone?: string;
  skills?: string[];
  documents?: { name: string; url: string; type: string }[];
}

export default function EasyApply({ jobId, jobTitle, locale, screeningQuestions = [] }: EasyApplyProps) {
  const { data: session, status } = useSession();
  const router = useRouter();

  const [profile, setProfile] = useState<JobSeekerProfile | null>(null);
  const [coverLetter, setCoverLetter] = useState("");
  const [showCoverLetter, setShowCoverLetter] = useState(false);
  const [loading, setLoading] = useState(false);
  const [applied, setApplied] = useState(false);
  const [error, setError] = useState("");
  const [fetchingProfile, setFetchingProfile] = useState(false);
  const [answers, setAnswers] = useState<Record<string, string | string[] | boolean>>({});

  const role = (session?.user as { role?: string })?.role;
  const isJobSeeker = role === "job_seeker";

  const sortedQuestions = [...screeningQuestions].sort((a, b) => a.order - b.order);
  const hasQuestions = sortedQuestions.length > 0;

  // Load profile to auto-fill
  useEffect(() => {
    if (!isJobSeeker || profile) return;
    setFetchingProfile(true);
    fetch("/api/job-seeker/me")
      .then((r) => r.json())
      .then((data) => {
        if (data?.jobSeeker) {
          const js = data.jobSeeker;
          setProfile({
            name: js.name ?? session?.user?.name ?? "",
            email: session?.user?.email ?? "",
            phone: js.phone ?? "",
            skills: js.skills ?? [],
            documents: js.documents ?? [],
          });
        }
      })
      .catch(() => {/* silently ignore */})
      .finally(() => setFetchingProfile(false));
  }, [isJobSeeker, profile, session?.user?.email, session?.user?.name]);

  if (status === "loading" || fetchingProfile) {
    return (
      <Button disabled className="h-12 w-full rounded-2xl text-base">
        <Loader2 className="h-4 w-4 animate-spin mr-2" />
        Loading…
      </Button>
    );
  }

  if (!session) {
    return (
      <Button
        className="h-12 w-full rounded-2xl text-base font-medium"
        onClick={() =>
          router.push(`/${locale}/login?callbackUrl=/${locale}/jobs/${jobId}`)
        }
      >
        Sign in to Apply
      </Button>
    );
  }

  if (!isJobSeeker) {
    return (
      <Button variant="outline" className="h-12 w-full rounded-2xl text-base" disabled>
        Job seekers only can apply
      </Button>
    );
  }

  if (applied) {
    return (
      <div className="w-full rounded-[22px] border border-green-500/30 bg-green-500/10 px-4 py-4 text-center">
        <p className="text-sm font-semibold text-green-600">✓ Application submitted!</p>
        <p className="mt-1 text-xs text-muted-foreground">
          We&apos;ve sent your profile to the employer.
        </p>
      </div>
    );
  }

  function setAnswer(questionId: string, value: string | string[] | boolean) {
    setAnswers((prev) => ({ ...prev, [questionId]: value }));
  }

  function toggleCheckboxOption(questionId: string, option: string) {
    setAnswers((prev) => {
      const current = (prev[questionId] as string[]) ?? [];
      const next = current.includes(option)
        ? current.filter((o) => o !== option)
        : [...current, option];
      return { ...prev, [questionId]: next };
    });
  }

  function validateAnswers(): boolean {
    for (const q of sortedQuestions) {
      if (!q.required) continue;
      const val = answers[q.id];
      if (val === undefined || val === "" || (Array.isArray(val) && val.length === 0)) {
        setError(`Please answer the required question: "${q.label}"`);
        return false;
      }
    }
    return true;
  }

  async function handleApply() {
    setError("");

    if (hasQuestions && !validateAnswers()) return;

    setLoading(true);
    try {
      const screeningAnswerPayload = sortedQuestions.map((q) => ({
        questionId: q.id,
        questionLabel: q.label,
        answer: answers[q.id] ?? (q.type === "checkbox" ? [] : ""),
      }));

      const res = await fetch("/api/applications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jobId,
          easyApply: true,
          coverLetter: coverLetter.trim() || undefined,
          screeningAnswers: hasQuestions ? screeningAnswerPayload : undefined,
        }),
      });
      const data = await res.json();
      if (res.status === 409) {
        setApplied(true);
        return;
      }
      if (!res.ok) {
        setError(data.error ?? "Failed to apply. Please try again.");
        return;
      }
      setApplied(true);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  // CV to auto-attach
  const cvDocument = profile?.documents?.find(
    (d) => d.type === "CV" || d.type === "cv" || d.name?.toLowerCase().includes("cv") || d.name?.toLowerCase().includes("resume")
  );

  return (
    <div className="space-y-4">
      {profile && (
        <div className="space-y-2 rounded-[22px] border border-border/70 bg-muted/20 px-4 py-4 shadow-[0_12px_28px_rgba(15,23,42,0.04)]">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Applying as
          </p>
          {profile.name && (
            <p className="text-sm font-semibold text-foreground">{profile.name}</p>
          )}
          {profile.email && (
            <p className="text-xs text-muted-foreground">{profile.email}</p>
          )}
          {cvDocument ? (
            <p className="flex items-center gap-1 text-xs text-green-600">
              <FileText className="h-3 w-3" /> {cvDocument.name} attached
            </p>
          ) : (
            <p className="flex items-center gap-1 text-xs text-muted-foreground/70">
              <FileText className="h-3 w-3" /> No CV on file — profile only
            </p>
          )}
          {profile.skills && profile.skills.length > 0 && (
            <div className="flex flex-wrap gap-1.5 pt-1">
              {profile.skills.slice(0, 4).map((s) => (
                <span
                  key={s}
                  className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] text-primary"
                >
                  {s}
                </span>
              ))}
              {profile.skills.length > 4 && (
                <span className="text-[10px] text-muted-foreground">
                  +{profile.skills.length - 4} more
                </span>
              )}
            </div>
          )}
        </div>
      )}

      {/* Screening Questions */}
      {hasQuestions && (
        <div className="space-y-3 rounded-[22px] border border-border/70 bg-muted/10 px-4 py-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Screening Questions
          </p>
          {sortedQuestions.map((q) => (
            <div key={q.id} className="space-y-1.5">
              <Label className="text-sm font-medium text-foreground">
                {q.label}
                {q.required && <span className="ml-1 text-destructive">*</span>}
              </Label>

              {q.type === "text" && (
                <Input
                  placeholder={q.placeholder || ""}
                  value={(answers[q.id] as string) ?? ""}
                  onChange={(e) => setAnswer(q.id, e.target.value)}
                  className="rounded-xl"
                  maxLength={500}
                />
              )}

              {q.type === "textarea" && (
                <textarea
                  className="textarea-field min-h-[80px] w-full rounded-xl border border-border bg-background px-3 py-2 text-sm"
                  placeholder={q.placeholder || ""}
                  value={(answers[q.id] as string) ?? ""}
                  onChange={(e) => setAnswer(q.id, e.target.value)}
                  maxLength={2000}
                  rows={3}
                />
              )}

              {q.type === "number" && (
                <Input
                  type="number"
                  placeholder={q.placeholder || ""}
                  value={(answers[q.id] as string) ?? ""}
                  onChange={(e) => setAnswer(q.id, e.target.value)}
                  className="rounded-xl"
                />
              )}

              {q.type === "date" && (
                <Input
                  type="date"
                  value={(answers[q.id] as string) ?? ""}
                  onChange={(e) => setAnswer(q.id, e.target.value)}
                  className="rounded-xl"
                />
              )}

              {q.type === "select" && (
                <select
                  className="h-9 w-full rounded-xl border border-border bg-background px-3 text-sm"
                  value={(answers[q.id] as string) ?? ""}
                  onChange={(e) => setAnswer(q.id, e.target.value)}
                >
                  <option value="">{q.placeholder || "Select an option"}</option>
                  {(q.options ?? []).map((opt) => (
                    <option key={opt} value={opt}>{opt}</option>
                  ))}
                </select>
              )}

              {q.type === "radio" && (
                <div className="space-y-1.5">
                  {(q.options ?? []).map((opt) => (
                    <label key={opt} className="flex items-center gap-2 text-sm">
                      <input
                        type="radio"
                        name={`sq-${q.id}`}
                        value={opt}
                        checked={(answers[q.id] as string) === opt}
                        onChange={() => setAnswer(q.id, opt)}
                        className="accent-primary"
                      />
                      {opt}
                    </label>
                  ))}
                </div>
              )}

              {q.type === "checkbox" && (
                <div className="space-y-1.5">
                  {(q.options ?? []).length > 0 ? (
                    (q.options ?? []).map((opt) => (
                      <label key={opt} className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={((answers[q.id] as string[]) ?? []).includes(opt)}
                          onChange={() => toggleCheckboxOption(q.id, opt)}
                          className="accent-primary"
                        />
                        {opt}
                      </label>
                    ))
                  ) : (
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={!!answers[q.id]}
                        onChange={(e) => setAnswer(q.id, e.target.checked)}
                        className="accent-primary"
                      />
                      Yes
                    </label>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <div>
        <button
          type="button"
          onClick={() => setShowCoverLetter((v) => !v)}
          aria-label={showCoverLetter ? "Hide cover letter" : "Add cover letter"}
          className="flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          {showCoverLetter ? (
            <ChevronUp className="h-3 w-3" />
          ) : (
            <ChevronDown className="h-3 w-3" />
          )}
          {showCoverLetter ? "Hide" : "Add"} cover letter (optional)
        </button>
        {showCoverLetter && (
          <textarea
            className="textarea-field mt-2 min-h-[132px] rounded-[22px] border-border/70 bg-background px-4 py-3 text-sm shadow-none"
            rows={4}
            maxLength={2000}
            placeholder={`Why are you a great fit for ${jobTitle}?`}
            value={coverLetter}
            onChange={(e) => setCoverLetter(e.target.value)}
          />
        )}
        {showCoverLetter && (
          <p className="text-xs text-muted-foreground text-right mt-1">
            {coverLetter.length}/2000
          </p>
        )}
      </div>

      <Button
        onClick={handleApply}
        disabled={loading}
        className="h-12 w-full rounded-2xl text-base font-medium gap-2"
      >
        {loading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Zap className="h-4 w-4" />
        )}
        {loading ? "Submitting…" : "Easy Apply"}
      </Button>

      {error && (
        <p className="text-center text-xs text-destructive">{error}</p>
      )}

      <p className="text-center text-xs text-muted-foreground">
        Your profile is auto-attached to the application.
      </p>
    </div>
  );
}
