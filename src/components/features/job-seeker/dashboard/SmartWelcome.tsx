"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
// TODO: Re-add useMutation usage for auto-apply toggle when feature is ready
import Link from "next/link";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { CheckCircle2, Circle, Upload } from "lucide-react";
// TODO: Re-add Zap, ZapOff when auto-apply feature is ready
import { toast } from "sonner";
import { useRef } from "react";

interface CompletionStep {
  key: string;
  label: string;
  done: boolean;
}

interface SmartWelcomeProps {
  name: string;
  profileCompleteness: number;
  completionSteps: CompletionStep[];
  locale: string;
}

const stepLinks: Record<string, string> = {
  skills: "/job-seeker/skills",
  experience: "/job-seeker/profile",
  education: "/job-seeker/profile",
  cv: "/job-seeker/cv",
  preferences: "/job-seeker/preferences",
};

function HeroSkeleton() {
  return (
    <div className="card-base p-6 animate-pulse">
      <div className="h-4 w-40 rounded bg-muted mb-2" />
      <div className="h-3 w-64 rounded bg-muted mb-4" />
      <div className="h-1.5 rounded bg-muted w-full" />
    </div>
  );
}

export function SmartWelcome({
  name,
  profileCompleteness,
  completionSteps,
  locale,
}: SmartWelcomeProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const qc = useQueryClient();

  // Fetch dashboard stats for recruiter views sentence
  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ["dashboard-stats"],
    queryFn: () => fetch("/api/dashboard/stats").then((r) => r.json()),
    staleTime: 2 * 60 * 1000,
  });

  // TODO: Auto-apply profile fetch — re-enable when auto-apply feature is ready
  // Fetch profile to know autoApply state
  // const { data: profile, isLoading: profileLoading } = useQuery({
  //   queryKey: ["job-seeker-profile"],
  //   queryFn: () => fetch("/api/job-seeker/profile").then((r) => r.json()),
  //   staleTime: 5 * 60 * 1000,
  // });

  // TODO: Auto-apply toggle — re-enable when auto-apply feature is ready
  // const autoApply = profile?.applicationMode === "auto";

  // Auto Apply toggle mutation (optimistic)
  // const toggleAutoApply = useMutation({
  //   mutationFn: (enabled: boolean) =>
  //     fetch("/api/user/autoapply", {
  //       method: "PATCH",
  //       headers: { "Content-Type": "application/json" },
  //       body: JSON.stringify({ enabled }),
  //     }).then((r) => {
  //       if (!r.ok) throw new Error("Failed");
  //       return r.json();
  //     }),
  //   onMutate: async (enabled) => {
  //     await qc.cancelQueries({ queryKey: ["job-seeker-profile"] });
  //     const prev = qc.getQueryData(["job-seeker-profile"]);
  //     qc.setQueryData(["job-seeker-profile"], (old: Record<string, unknown>) => ({
  //       ...(old ?? {}),
  //       applicationMode: enabled ? "auto" : "manual",
  //     }));
  //     return { prev };
  //   },
  //   onError: (_err, _enabled, ctx) => {
  //     qc.setQueryData(["job-seeker-profile"], ctx?.prev);
  //     toast.error("Failed to update Auto Apply setting");
  //   },
  //   onSuccess: (_, enabled) => {
  //     toast.success(enabled ? "Auto Apply enabled" : "Auto Apply disabled");
  //     qc.invalidateQueries({ queryKey: ["job-seeker-profile"] });
  //   },
  // });

  // Resume upload mutation
  const uploadResume = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/job-seeker/cv", { method: "POST", body: formData });
      if (!res.ok) throw new Error("Upload failed");
      return res.json();
    },
    onSuccess: () => {
      toast.success("Resume uploaded successfully");
      qc.invalidateQueries({ queryKey: ["job-seeker-profile"] });
      qc.invalidateQueries({ queryKey: ["profile-completion"] });
    },
    onError: () => toast.error("Resume upload failed"),
  });

  const completedCount = completionSteps.filter((s) => s.done).length;
  const allDone = completedCount === completionSteps.length;

  if (statsLoading) return <HeroSkeleton />;

  const recruiterViews = stats?.recruiterViews?.total ?? 0;
  const recruitersThisWeek = stats?.recruiterViews?.delta ?? 0;

  return (
    <div className="card-base p-6">
      {/* Top row: name + auto apply toggle */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h2 className="text-xl font-bold text-foreground">
            {allDone ? `Great job, ${name}!` : `Welcome back, ${name}`}
          </h2>
          {/* Recruiter insight — spec-compliant phrasing */}
          {recruiterViews > 0 ? (
            <p className="mt-1 text-sm text-muted-foreground">
              You appeared in{" "}
              <span className="font-semibold text-foreground">{recruiterViews}</span>{" "}
              recruiter search{recruiterViews !== 1 ? "es" : ""} this week
              {recruitersThisWeek > 0 && (
                <span className="ml-1 text-green-600 font-medium">
                  (+{recruitersThisWeek} from last week)
                </span>
              )}
            </p>
          ) : (
            <p className="mt-1 text-sm text-muted-foreground">
              {allDone
                ? "Your profile looks strong — keep applying"
                : "Complete your profile to attract recruiters"}
            </p>
          )}
        </div>

        {/* TODO: Auto-apply toggle — re-enable when auto-apply feature is ready */}
        {/* When ready, restore the auto-apply toggle button here (Zap/ZapOff icons, toggleAutoApply mutation) */}
      </div>

      {/* Thin progress bar */}
      <Progress value={profileCompleteness} className="mt-4 h-1.5" />
      <p className="mt-1 text-xs text-muted-foreground text-right">
        {profileCompleteness}% profile complete
      </p>

      {/* Completion chips + Resume CTA */}
      {!allDone && (
        <div className="mt-3 flex flex-wrap gap-2">
          {completionSteps.map((step) => (
            <Link
              key={step.key}
              href={`/${locale}${stepLinks[step.key] ?? "/job-seeker/profile"}`}
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                step.done
                  ? "border-green-200 bg-green-50 text-green-700"
                  : "border-border bg-card text-muted-foreground hover:border-primary/40 hover:text-primary"
              }`}
            >
              {step.done ? (
                <CheckCircle2 className="h-3 w-3" />
              ) : (
                <Circle className="h-3 w-3" />
              )}
              {step.label}
            </Link>
          ))}

          {/* Resume upload */}
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.doc,.docx"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) uploadResume.mutate(file);
            }}
          />
          <Button
            variant="outline"
            size="sm"
            className="h-7 rounded-full text-xs"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploadResume.isPending}
          >
            <Upload className="mr-1 h-3 w-3" />
            Upload Resume
          </Button>
        </div>
      )}
    </div>
  );
}
