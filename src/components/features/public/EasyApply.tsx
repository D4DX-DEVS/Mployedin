"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Loader2, Zap, FileText, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";

interface EasyApplyProps {
  jobId: string;
  jobTitle: string;
  locale: string;
}

interface JobSeekerProfile {
  name?: string;
  email?: string;
  phone?: string;
  skills?: string[];
  documents?: { name: string; url: string; type: string }[];
}

export default function EasyApply({ jobId, jobTitle, locale }: EasyApplyProps) {
  const { data: session, status } = useSession();
  const router = useRouter();

  const [profile, setProfile] = useState<JobSeekerProfile | null>(null);
  const [coverLetter, setCoverLetter] = useState("");
  const [showCoverLetter, setShowCoverLetter] = useState(false);
  const [loading, setLoading] = useState(false);
  const [applied, setApplied] = useState(false);
  const [error, setError] = useState("");
  const [fetchingProfile, setFetchingProfile] = useState(false);

  const role = (session?.user as { role?: string })?.role;
  const isJobSeeker = role === "job_seeker";

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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isJobSeeker]);

  if (status === "loading" || fetchingProfile) {
    return (
      <Button disabled className="w-full h-12 text-base">
        <Loader2 className="h-4 w-4 animate-spin mr-2" />
        Loading…
      </Button>
    );
  }

  if (!session) {
    return (
      <Button
        className="w-full h-12 text-base font-medium"
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
      <Button variant="outline" className="w-full h-12 text-base" disabled>
        Job seekers only can apply
      </Button>
    );
  }

  if (applied) {
    return (
      <div className="w-full rounded-xl border border-green-500/30 bg-green-500/10 px-4 py-4 text-center">
        <p className="text-green-600 font-semibold text-sm">✓ Application submitted!</p>
        <p className="text-xs text-muted-foreground mt-1">
          We&apos;ve sent your profile to the employer.
        </p>
      </div>
    );
  }

  async function handleApply() {
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/applications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jobId,
          easyApply: true,
          coverLetter: coverLetter.trim() || undefined,
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
    <div className="space-y-3">
      {/* Profile preview */}
      {profile && (
        <div className="rounded-lg border border-border bg-muted/30 px-4 py-3 space-y-1.5">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Applying as
          </p>
          {profile.name && (
            <p className="text-sm font-semibold text-foreground">{profile.name}</p>
          )}
          {profile.email && (
            <p className="text-xs text-muted-foreground">{profile.email}</p>
          )}
          {cvDocument ? (
            <p className="text-xs text-green-600 flex items-center gap-1">
              <FileText className="h-3 w-3" /> {cvDocument.name} attached
            </p>
          ) : (
            <p className="text-xs text-muted-foreground/70 flex items-center gap-1">
              <FileText className="h-3 w-3" /> No CV on file — profile only
            </p>
          )}
          {profile.skills && profile.skills.length > 0 && (
            <div className="flex flex-wrap gap-1 pt-0.5">
              {profile.skills.slice(0, 4).map((s) => (
                <span
                  key={s}
                  className="text-[10px] bg-primary/10 text-primary px-2 py-0.5 rounded-full"
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

      {/* Optional cover letter */}
      <div>
        <button
          type="button"
          onClick={() => setShowCoverLetter((v) => !v)}
          className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
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
            className="mt-2 w-full rounded-lg border border-border bg-background p-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/40 resize-y"
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
        className="w-full h-12 text-base font-medium gap-2"
      >
        {loading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Zap className="h-4 w-4" />
        )}
        {loading ? "Submitting…" : "Easy Apply"}
      </Button>

      {error && (
        <p className="text-xs text-destructive text-center">{error}</p>
      )}

      <p className="text-xs text-muted-foreground text-center">
        Your profile is auto-attached to the application.
      </p>
    </div>
  );
}
