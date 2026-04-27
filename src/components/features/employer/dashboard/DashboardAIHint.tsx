"use client";

import { useTranslations } from "next-intl";
import { Bot, Sparkles, Briefcase, Users, MessageSquare } from "lucide-react";
import { cn } from "@/lib/utils";

interface AIQuickAction {
  icon: React.ElementType;
  labelKey: string;
  descKey: string;
}

interface DashboardAIHintProps {
  hasJobs: boolean;
  hasApplications: boolean;
  hasInterviews: boolean;
}

export function DashboardAIHint({ hasJobs, hasApplications, hasInterviews }: DashboardAIHintProps) {
  const t = useTranslations("employerDashboard.dashboardAIHint");

  let hintKey: string;
  let actions: AIQuickAction[];

  if (!hasJobs) {
    hintKey = "describeRole";
    actions = [
      { icon: Briefcase, labelKey: "createJob", descKey: "viaVoiceOrText" },
    ];
  } else if (hasApplications) {
    hintKey = "screenCandidates";
    actions = [
      { icon: Users, labelKey: "screenByFit", descKey: "rankByFit" },
      { icon: MessageSquare, labelKey: "interviewPrep", descKey: "aiQuestions" },
    ];
  } else {
    hintKey = "improveJobs";
    actions = [
      { icon: Briefcase, labelKey: "improveJobsLabel", descKey: "improveVisibility" },
      { icon: MessageSquare, labelKey: "interviewPrep", descKey: "aiQuestions" },
    ];
  }

  const openAI = () => {
    const btn = document.querySelector<HTMLButtonElement>('[aria-label="Open Recruitment AI"]');
    btn?.click();
  };

  return (
    <div className="card-base p-0 overflow-hidden">
      <button
        onClick={openAI}
        className="w-full px-5 py-4 sm:px-6 flex items-center gap-4 hover:bg-muted/30 transition-colors text-left group"
      >
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary/10 to-indigo-500/10 flex items-center justify-center shrink-0 group-hover:from-primary/20 group-hover:to-indigo-500/20 transition-colors">
          <Bot className="h-5 w-5 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-0.5">
            <span className="text-sm font-semibold text-foreground">{t("aiHiringAssistant")}</span>
            <Sparkles className="h-3.5 w-3.5 text-amber-500" />
          </div>
          <p className="text-xs text-muted-foreground truncate">{t(hintKey)}</p>
        </div>
        <div className="hidden sm:flex items-center gap-2">
          {actions.map((a) => {
            const Icon = a.icon;
            return (
              <div
                key={a.labelKey}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 rounded-lg",
                  "bg-muted/50 group-hover:bg-primary/10 transition-colors"
                )}
              >
                <Icon className="h-3.5 w-3.5 text-primary" />
                <span className="text-xs font-medium text-foreground">{t(a.labelKey)}</span>
              </div>
            );
          })}
        </div>
      </button>
    </div>
  );
}
