"use client";

import {
  ArrowDownWideNarrow, BarChart3, Briefcase, Calendar, CheckCircle2, Clipboard, Copy,
  HelpCircle, LayoutList, PenLine, Star, User, Zap,
} from "lucide-react";
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
      icon: <HelpCircle className="h-5 w-5" />,
      label: t("interview.actions.generateQuestions"),
      desc: t("interview.actions.generateQuestionsDesc"),
      prompt: t("interview.actions.generateQuestionsPrompt"),
    },
    {
      icon: <Calendar className="h-5 w-5" />,
      label: t("interview.actions.scheduleInterview"),
      desc: t("interview.actions.scheduleInterviewDesc"),
      prompt: t("interview.actions.scheduleInterviewPrompt"),
    },
    {
      icon: <User className="h-5 w-5" />,
      label: t("interview.actions.prepBrief"),
      desc: t("interview.actions.prepBriefDesc"),
      prompt: t("interview.actions.prepBriefPrompt"),
    },
    {
      icon: <Clipboard className="h-5 w-5" />,
      label: t("interview.actions.reviewFeedback"),
      desc: t("interview.actions.reviewFeedbackDesc"),
      prompt: t("interview.actions.reviewFeedbackPrompt"),
    },
  ];

  return (
    <WelcomeScreen
      icon={
        <div className="w-14 h-14 rounded-2xl bg-amber-500/10 flex items-center justify-center mx-auto">
          <HelpCircle className="h-7 w-7 text-amber-600" />
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
      icon: <ArrowDownWideNarrow className="h-5 w-5" />,
      label: t("screening.actions.screenApplicants"),
      desc: t("screening.actions.screenApplicantsDesc"),
      prompt: t("screening.actions.screenApplicantsPrompt"),
    },
    {
      icon: <BarChart3 className="h-5 w-5" />,
      label: t("screening.actions.compareCandidates"),
      desc: t("screening.actions.compareCandidatesDesc"),
      prompt: t("screening.actions.compareCandidatesPrompt"),
    },
    {
      icon: <Zap className="h-5 w-5" />,
      label: t("screening.actions.skillsGap"),
      desc: t("screening.actions.skillsGapDesc"),
      prompt: t("screening.actions.skillsGapPrompt"),
    },
    {
      icon: <Star className="h-5 w-5" />,
      label: t("screening.actions.shortlist"),
      desc: t("screening.actions.shortlistDesc"),
      prompt: t("screening.actions.shortlistPrompt"),
    },
  ];

  return (
    <WelcomeScreen
      icon={
        <div className="w-14 h-14 rounded-2xl bg-emerald-500/10 flex items-center justify-center mx-auto">
          <CheckCircle2 className="h-7 w-7 text-emerald-600" />
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
