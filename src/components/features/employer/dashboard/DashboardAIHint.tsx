"use client";

import { Bot, Sparkles, Briefcase, Users, MessageSquare } from "lucide-react";
import { cn } from "@/lib/utils";

interface AIQuickAction {
  icon: React.ElementType;
  label: string;
  description: string;
}

interface DashboardAIHintProps {
  hasJobs: boolean;
  hasApplications: boolean;
  hasInterviews: boolean;
}

export function DashboardAIHint({ hasJobs, hasApplications, hasInterviews }: DashboardAIHintProps) {
  // Show contextual hint based on state
  let hint: string;
  let actions: AIQuickAction[];

  if (!hasJobs) {
    hint = "Describe a role in plain English and I'll create the full job posting";
    actions = [
      { icon: Briefcase, label: "Create a job", description: "via voice or text" },
    ];
  } else if (hasApplications) {
    hint = "I can screen candidates, generate interview questions, or compare applicants";
    actions = [
      { icon: Users, label: "Screen candidates", description: "rank by fit" },
      { icon: MessageSquare, label: "Interview prep", description: "AI questions" },
    ];
  } else {
    hint = "I can help you improve job descriptions or prepare for interviews";
    actions = [
      { icon: Briefcase, label: "Improve jobs", description: "+20% visibility" },
      { icon: MessageSquare, label: "Interview prep", description: "AI questions" },
    ];
  }

  // Trigger the floating widget by dispatching a custom event
  const openAI = () => {
    // Find and click the floating AI button
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
            <span className="text-sm font-semibold text-foreground">AI Hiring Assistant</span>
            <Sparkles className="h-3.5 w-3.5 text-amber-500" />
          </div>
          <p className="text-xs text-muted-foreground truncate">{hint}</p>
        </div>
        <div className="hidden sm:flex items-center gap-2">
          {actions.map((a) => {
            const Icon = a.icon;
            return (
              <div
                key={a.label}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 rounded-lg",
                  "bg-muted/50 group-hover:bg-primary/10 transition-colors"
                )}
              >
                <Icon className="h-3.5 w-3.5 text-primary" />
                <span className="text-xs font-medium text-foreground">{a.label}</span>
              </div>
            );
          })}
        </div>
      </button>
    </div>
  );
}
