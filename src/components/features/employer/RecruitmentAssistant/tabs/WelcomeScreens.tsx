"use client";

import { Briefcase, PenLine, Copy, LayoutList } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTranslations } from "next-intl";

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
  const t = useTranslations("recruitmentAI");
  const actions: QuickAction[] = [
    {
      icon: <Briefcase className="h-5 w-5" />,
      label: t("jobCreator.actions.postNew"),
      desc: t("jobCreator.actions.postNewDesc"),
      prompt: t("jobCreator.actions.postNewPrompt"),
    },
    {
      icon: <PenLine className="h-5 w-5" />,
      label: t("jobCreator.actions.editExisting"),
      desc: t("jobCreator.actions.editExistingDesc"),
      prompt: t("jobCreator.actions.editExistingPrompt"),
    },
    {
      icon: <Copy className="h-5 w-5" />,
      label: t("jobCreator.actions.cloneJob"),
      desc: t("jobCreator.actions.cloneJobDesc"),
      prompt: t("jobCreator.actions.cloneJobPrompt"),
    },
    {
      icon: <LayoutList className="h-5 w-5" />,
      label: t("jobCreator.actions.bulkCreate"),
      desc: t("jobCreator.actions.bulkCreateDesc"),
      prompt: t("jobCreator.actions.bulkCreatePrompt"),
    },
  ];

  return (
    <WelcomeScreen
      icon={
        <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto">
          <Briefcase className="h-7 w-7 text-primary" />
        </div>
      }
      title={t("jobCreator.welcome")}
      subtitle={t("welcomeSubtitles.jobCreator")}
      actions={actions}
      onAction={onAction}
      onStartBlank={onStartBlank}
      blankLabel={t("openBlankChat")}
    />
  );
}

export function InterviewWelcome({ onAction, onStartBlank }: TabWelcomeProps) {
  const t = useTranslations("recruitmentAI");
  const actions: QuickAction[] = [
    {
      icon: (
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
      label: t("interview.actions.generateQuestions"),
      desc: t("interview.actions.generateQuestionsDesc"),
      prompt: t("interview.actions.generateQuestionsPrompt"),
    },
    {
      icon: (
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
      ),
      label: t("interview.actions.scheduleInterview"),
      desc: t("interview.actions.scheduleInterviewDesc"),
      prompt: t("interview.actions.scheduleInterviewPrompt"),
    },
    {
      icon: (
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
        </svg>
      ),
      label: t("interview.actions.prepBrief"),
      desc: t("interview.actions.prepBriefDesc"),
      prompt: t("interview.actions.prepBriefPrompt"),
    },
    {
      icon: (
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
        </svg>
      ),
      label: t("interview.actions.reviewFeedback"),
      desc: t("interview.actions.reviewFeedbackDesc"),
      prompt: t("interview.actions.reviewFeedbackPrompt"),
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
      title={t("interview.welcome")}
      subtitle={t("welcomeSubtitles.interview")}
      actions={actions}
      onAction={onAction}
      onStartBlank={onStartBlank}
      blankLabel={t("openBlankChat")}
    />
  );
}

export function ScreeningWelcome({ onAction, onStartBlank }: TabWelcomeProps) {
  const t = useTranslations("recruitmentAI");
  const actions: QuickAction[] = [
    {
      icon: (
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 4h13M3 8h9m-9 4h9m5-4v12m0 0l-4-4m4 4l4-4" />
        </svg>
      ),
      label: t("screening.actions.screenApplicants"),
      desc: t("screening.actions.screenApplicantsDesc"),
      prompt: t("screening.actions.screenApplicantsPrompt"),
    },
    {
      icon: (
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
        </svg>
      ),
      label: t("screening.actions.compareCandidates"),
      desc: t("screening.actions.compareCandidatesDesc"),
      prompt: t("screening.actions.compareCandidatesPrompt"),
    },
    {
      icon: (
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
        </svg>
      ),
      label: t("screening.actions.skillsGap"),
      desc: t("screening.actions.skillsGapDesc"),
      prompt: t("screening.actions.skillsGapPrompt"),
    },
    {
      icon: (
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
        </svg>
      ),
      label: t("screening.actions.shortlist"),
      desc: t("screening.actions.shortlistDesc"),
      prompt: t("screening.actions.shortlistPrompt"),
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
      title={t("screening.welcome")}
      subtitle={t("welcomeSubtitles.screening")}
      actions={actions}
      onAction={onAction}
      onStartBlank={onStartBlank}
      blankLabel={t("openBlankChat")}
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
  blankLabel: string;
}

function WelcomeScreen({ icon, title, subtitle, actions, onAction, onStartBlank, blankLabel }: WelcomeScreenProps) {
  return (
    <div className="flex flex-col items-center px-4 py-6 gap-5">
      {icon}
      <div className="text-center">
        <h3 className="heading-subsection font-semibold text-foreground">{title}</h3>
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
        {blankLabel}
      </button>
    </div>
  );
}
