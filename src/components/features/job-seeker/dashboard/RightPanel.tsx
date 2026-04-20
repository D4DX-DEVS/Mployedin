"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { TrendingUp, TrendingDown, Sparkles, CheckCircle2, Clock, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";

// ── Types ─────────────────────────────────────────────────────────────────────

interface DashboardStats {
  recruiterViews?: {
    total: number;
    delta: number;
    daily: number[];
  };
}

interface ActivityEvent {
  id: string;
  type: string;
  message: string;
  createdAt: string;
  hasCta: boolean;
  ctaLabel?: string;
  ctaHref?: string;
}

interface ProfileCompletion {
  score: number;
  missing: ("resume" | "skills" | "experience" | "preferences")[];
}

// ── RecruiterViews ────────────────────────────────────────────────────────────

function RecruiterViews({ stats }: { stats?: DashboardStats }) {
  const views = stats?.recruiterViews;
  if (!views) {
    return (
      <div className="card-base p-4">
        <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">
          Recruiter Views
        </h4>
        <p className="text-xs text-muted-foreground">No view data yet</p>
      </div>
    );
  }

  const max = Math.max(...views.daily, 1);

  return (
    <div className="card-base p-4">
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
          Recruiter Views
        </h4>
        <span
          className={`text-xs font-medium flex items-center gap-0.5 ${
            views.delta >= 0 ? "text-green-600" : "text-red-500"
          }`}
        >
          {views.delta >= 0 ? (
            <TrendingUp className="h-3 w-3" />
          ) : (
            <TrendingDown className="h-3 w-3" />
          )}
          {views.delta >= 0 ? "+" : ""}
          {views.delta} from last week
        </span>
      </div>

      {/* Mini bar chart */}
      <div className="flex items-end gap-1 h-12">
        {views.daily.map((val, i) => (
          <div key={i} className="flex-1 flex flex-col items-center gap-0.5">
            <div
              className="w-full rounded-sm bg-primary/70 transition-all duration-300 hover:bg-primary"
              style={{ height: `${(val / max) * 100}%`, minHeight: val > 0 ? "3px" : "0" }}
            />
            <span className="text-[8px] text-muted-foreground">
              {["M", "T", "W", "T", "F", "S", "S"][i]}
            </span>
          </div>
        ))}
      </div>

      <p className="mt-2 text-xs text-muted-foreground">
        <span className="font-semibold text-foreground">{views.total}</span> searches this week
      </p>
    </div>
  );
}

// ── AICoach ───────────────────────────────────────────────────────────────────

const AI_COACH_ITEMS = [
  {
    suggestion: "Adding 3 more skills to your profile increases matches by a third",
    href: "/job-seeker/skills",
    action: "Add Skills",
  },
  {
    suggestion: "Jobs you apply to within 24 hours of posting get 2× more responses",
    href: "/job-seeker/jobs",
    action: "Browse Today's Jobs",
  },
  {
    suggestion: "Uploading your resume unlocks AI match analysis for every application",
    href: "/job-seeker/cv",
    action: "Upload Resume",
  },
];

function AICoach() {
  return (
    <div className="card-base p-4">
      <div className="flex items-center gap-2 mb-3">
        <Sparkles className="h-4 w-4 text-violet-500" />
        <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
          AI Coach
        </h4>
      </div>
      <div className="space-y-3">
        {AI_COACH_ITEMS.map((item) => (
          <div key={item.action} className="rounded-lg bg-violet-50 border border-violet-100 p-3 transition-all duration-150 hover:border-violet-200 hover:shadow-sm">
            <p className="text-xs text-violet-900">{item.suggestion}</p>
            <Link
              href={item.href}
              className="mt-1.5 inline-flex items-center gap-1 text-[11px] font-semibold text-violet-600 hover:underline"
            >
              {item.action}
              <ExternalLink className="h-2.5 w-2.5" />
            </Link>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── NextSteps ─────────────────────────────────────────────────────────────────

const NEXT_STEP_CONFIG: Record<
  string,
  { label: string; href: string }
> = {
  resume: { label: "Upload your resume", href: "/job-seeker/cv" },
  skills: { label: "Add at least 3 skills", href: "/job-seeker/skills" },
  experience: { label: "Add work experience", href: "/job-seeker/profile" },
  preferences: { label: "Set job preferences", href: "/job-seeker/preferences" },
};

function NextSteps({ completion }: { completion?: ProfileCompletion }) {
  if (!completion || completion.missing.length === 0) return null;

  return (
    <div className="card-base p-4">
      <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">
        Next Steps
      </h4>
      <ol className="space-y-2">
        {completion.missing.slice(0, 4).map((key, i) => {
          const cfg = NEXT_STEP_CONFIG[key];
          return (
            <li key={key} className="flex items-start gap-2">
              <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[9px] font-bold text-primary mt-0.5">
                {i + 1}
              </span>
              <Link
                href={cfg.href}
                className="text-xs text-foreground hover:text-primary hover:underline"
              >
                {cfg.label}
              </Link>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

// ── ActivityFeed ──────────────────────────────────────────────────────────────

function formatRelativeTime(isoString: string) {
  const diff = Date.now() - new Date(isoString).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function ActivityFeed({ events }: { events?: ActivityEvent[] }) {
  if (!events || events.length === 0) {
    return (
      <div className="card-base p-4">
        <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">
          Activity
        </h4>
        <p className="text-xs text-muted-foreground">
          Your activity will appear as you apply and explore
        </p>
      </div>
    );
  }

  return (
    <div className="card-base p-4">
      <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">
        Activity
      </h4>
      <div className="space-y-3">
        {events.slice(0, 5).map((ev) => (
          <div key={ev.id} className="flex items-start gap-2 rounded-lg p-1.5 -mx-1.5 transition-colors hover:bg-muted/50">
            <div className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10">
              <CheckCircle2 className="h-3 w-3 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs text-foreground leading-snug">{ev.message}</p>
              <div className="flex items-center gap-2 mt-0.5">
                <Clock className="h-2.5 w-2.5 text-muted-foreground" />
                <span className="text-[10px] text-muted-foreground">
                  {formatRelativeTime(ev.createdAt)}
                </span>
              </div>
              {ev.hasCta && ev.ctaHref && (
                <Link href={ev.ctaHref}>
                  <Button variant="link" size="sm" className="h-auto py-0 px-0 text-[11px] font-semibold">
                    {ev.ctaLabel}
                  </Button>
                </Link>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── RightPanel (orchestrator) ─────────────────────────────────────────────────

export function RightPanel() {
  const { data: stats } = useQuery<DashboardStats>({
    queryKey: ["dashboard-stats"],
    queryFn: () => fetch("/api/dashboard/stats").then((r) => r.json()),
    staleTime: 2 * 60 * 1000,
  });

  const { data: activityData } = useQuery<{ events: ActivityEvent[] }>({
    queryKey: ["activity"],
    queryFn: () => fetch("/api/activity").then((r) => r.json()),
    staleTime: 0,
    refetchInterval: 30 * 1000,
  });

  const { data: completion } = useQuery<ProfileCompletion>({
    queryKey: ["profile-completion"],
    queryFn: () => fetch("/api/user/profile-completion").then((r) => r.json()),
    staleTime: 5 * 60 * 1000,
  });

  return (
    <>
      <RecruiterViews stats={stats} />
      <AICoach />
      <NextSteps completion={completion} />
      <ActivityFeed events={activityData?.events} />
    </>
  );
}
