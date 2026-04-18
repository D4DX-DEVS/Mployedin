"use client";

import { Briefcase, PenLine, Copy, LayoutList } from "lucide-react";
import { cn } from "@/lib/utils";

interface QuickAction {
  icon: React.ReactNode;
  label: string;
  desc: string;
  prompt: string;
}

interface TabWelcomeProps {
  onAction: (prompt: string) => void;
  onStartBlank: () => void;
}

export function JobCreatorWelcome({ onAction, onStartBlank }: TabWelcomeProps) {
  const actions: QuickAction[] = [
    {
      icon: <Briefcase className="h-5 w-5" />,
      label: "Post a New Job",
      desc: "Describe a new role via voice or text",
      prompt: "I want to post a new job. Let's start — what details should I provide?",
    },
    {
      icon: <PenLine className="h-5 w-5" />,
      label: "Edit Existing Job",
      desc: "Update an existing job posting",
      prompt: "I want to update one of my existing job postings. Can you help me improve it?",
    },
    {
      icon: <Copy className="h-5 w-5" />,
      label: "Clone a Job",
      desc: "Duplicate and modify a previous posting",
      prompt: "I want to create a similar job to one I've posted before. Help me clone and modify it.",
    },
    {
      icon: <LayoutList className="h-5 w-5" />,
      label: "Bulk Create",
      desc: "Create multiple jobs at once",
      prompt: "I need to create multiple job postings at once. Can you help me structure them efficiently?",
    },
  ];

  return (
    <WelcomeScreen
      icon={
        <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto">
          <Briefcase className="h-7 w-7 text-primary" />
        </div>
      }
      title="What job do you want to create today?"
      subtitle="Choose a starting point first. You can open a blank chat if you already know what to ask."
      actions={actions}
      onAction={onAction}
      onStartBlank={onStartBlank}
    />
  );
}

export function InterviewWelcome({ onAction, onStartBlank }: TabWelcomeProps) {
  const actions: QuickAction[] = [
    {
      icon: (
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
      label: "Generate Questions",
      desc: "AI-powered interview questions by role",
      prompt: "Generate a set of interview questions for me. What role and type of interview should I specify?",
    },
    {
      icon: (
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
      ),
      label: "Schedule Interview",
      desc: "Plan interview sessions with candidates",
      prompt: "Help me structure an interview schedule for a candidate. What information do you need?",
    },
    {
      icon: (
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
        </svg>
      ),
      label: "Prep Candidate Brief",
      desc: "Summarize candidate profile for interviewers",
      prompt: "Help me create a candidate brief for interviewers. I'll share the candidate's details with you.",
    },
    {
      icon: (
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
        </svg>
      ),
      label: "Review Feedback",
      desc: "Analyze interviewer scorecards",
      prompt: "Help me analyze and summarize interview feedback from multiple interviewers.",
    },
  ];

  return (
    <WelcomeScreen
      icon={
        <div className="w-14 h-14 rounded-2xl bg-amber-500/10 flex items-center justify-center mx-auto">
          <svg className="h-7 w-7 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
      }
      title="How can I help with your interviews?"
      subtitle="Pick the interview task first, or open a blank chat to ask in your own words."
      actions={actions}
      onAction={onAction}
      onStartBlank={onStartBlank}
    />
  );
}

export function ScreeningWelcome({ onAction, onStartBlank }: TabWelcomeProps) {
  const actions: QuickAction[] = [
    {
      icon: (
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 4h13M3 8h9m-9 4h9m5-4v12m0 0l-4-4m4 4l4-4" />
        </svg>
      ),
      label: "Screen Applicants",
      desc: "Rank candidates by job fit score",
      prompt: "Help me screen and rank applicants for a job. I'll provide the job requirements and candidate details.",
    },
    {
      icon: (
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
        </svg>
      ),
      label: "Compare Candidates",
      desc: "Side-by-side candidate comparison",
      prompt: "I want to compare multiple candidates side by side. Help me evaluate them against the job requirements.",
    },
    {
      icon: (
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
        </svg>
      ),
      label: "Skills Gap Report",
      desc: "Find skill gaps in your applicant pool",
      prompt: "Generate a skills gap analysis for my applicant pool. What's missing compared to the job requirements?",
    },
    {
      icon: (
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
        </svg>
      ),
      label: "Shortlist Top 10",
      desc: "Generate AI-ranked shortlist for a job",
      prompt: "Create a shortlist of the top candidates for my job. I'll describe the role and share the applicant profiles.",
    },
  ];

  return (
    <WelcomeScreen
      icon={
        <div className="w-14 h-14 rounded-2xl bg-emerald-500/10 flex items-center justify-center mx-auto">
          <svg className="h-7 w-7 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
      }
      title="What would you like to screen or analyze?"
      subtitle="Choose the screening workflow first, or open a blank chat for a custom request."
      actions={actions}
      onAction={onAction}
      onStartBlank={onStartBlank}
    />
  );
}

// ────────────────────────────────────────────────────────────────
// Shared layout
// ────────────────────────────────────────────────────────────────
interface WelcomeScreenProps {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  actions: QuickAction[];
  onAction: (prompt: string) => void;
  onStartBlank: () => void;
}

function WelcomeScreen({ icon, title, subtitle, actions, onAction, onStartBlank }: WelcomeScreenProps) {
  return (
    <div className="flex flex-col items-center px-4 py-6 gap-5">
      {icon}
      <div className="text-center">
        <h3 className="font-semibold text-base text-foreground">{title}</h3>
        <p className="text-sm text-muted-foreground mt-1 max-w-xs leading-relaxed">{subtitle}</p>
      </div>
      <div className="grid grid-cols-2 gap-2.5 w-full">
        {actions.map((action) => (
          <button
            key={action.label}
            onClick={() => onAction(action.prompt)}
            className={cn(
              "flex flex-col items-start gap-2 p-3.5 rounded-xl border border-border",
              "bg-background hover:bg-muted/40 hover:border-primary/30 active:scale-[0.98]",
              "transition-all duration-150 text-left group"
            )}
          >
            <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center text-foreground/70 group-hover:bg-primary/10 group-hover:text-primary transition-colors">
              {action.icon}
            </div>
            <div>
              <p className="text-xs font-semibold text-foreground leading-snug">{action.label}</p>
              <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug">{action.desc}</p>
            </div>
          </button>
        ))}
      </div>
      <button
        type="button"
        onClick={onStartBlank}
        className="inline-flex items-center justify-center rounded-full border border-border px-4 py-2 text-xs font-semibold text-foreground transition-colors hover:border-primary/40 hover:bg-primary/5"
      >
        Open blank chat
      </button>
    </div>
  );
}
