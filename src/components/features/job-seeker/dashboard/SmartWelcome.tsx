import Link from "next/link";
import { Progress } from "@/components/ui/progress";
import { CheckCircle2, Circle } from "lucide-react";

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

export function SmartWelcome({
  name,
  profileCompleteness,
  completionSteps,
  locale,
}: SmartWelcomeProps) {
  const completedCount = completionSteps.filter((s) => s.done).length;
  const totalCount = completionSteps.length;
  const allDone = completedCount === totalCount;

  return (
    <div className="card-base p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-bold text-foreground">
            {allDone
              ? `Great job, ${name}! 🎉`
              : `Welcome back, ${name}!`}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {allDone
              ? "Your profile is looking strong. Keep applying!"
              : `You're ${profileCompleteness}% closer to getting hired. Complete your profile to improve matches.`}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <span
            className={`text-2xl font-bold ${
              profileCompleteness >= 80
                ? "text-green-600"
                : profileCompleteness >= 50
                ? "text-amber-500"
                : "text-red-500"
            }`}
          >
            {profileCompleteness}%
          </span>
          <p className="text-xs text-muted-foreground">Profile Complete</p>
        </div>
      </div>

      <Progress value={profileCompleteness} className="mt-4 h-2" />

      {!allDone && (
        <div className="mt-4 flex flex-wrap gap-2">
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
        </div>
      )}
    </div>
  );
}
