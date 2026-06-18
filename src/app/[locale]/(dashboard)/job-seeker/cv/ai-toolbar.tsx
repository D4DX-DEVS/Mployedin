"use client";

/* ── AI quick-action toolbar for resume text fields ──
   FlowCV-style chips: Improve · Suggest · Grammar · Shorter.
   Calls POST /api/ai/enhance-text with a `mode`. Operates on PLAIN text — the
   caller converts to/from rich-text HTML where needed.
*/

import { useState } from "react";
import { Sparkles, Lightbulb, SpellCheck, Scissors, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { csrfFetch } from "@/lib/security/csrf-client";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

export type AIMode = "improve" | "suggest" | "grammar" | "shorten";

const SECTION_CONTEXT: Record<string, string> = {
  summary: "professional summary for a resume",
  experience_description: "work experience description for a professional resume",
  project_description: "project description for a professional resume",
};

export function AIToolbar({
  section, seed, context, onResult, disabled, className,
}: {
  /** "summary" | "experience_description" | "project_description" */
  section: string;
  /** Current text (plain) used as the seed for improve / grammar / shorten. */
  seed: string;
  /** Extra context — jobTitle, company, skills, techStack, projectTitle… */
  context: Record<string, string>;
  /** Receives the AI result as plain text. */
  onResult: (text: string) => void;
  disabled?: boolean;
  className?: string;
}) {
  const t = useTranslations("cvBuilderPage.aiToolbar");
  const [active, setActive] = useState<AIMode | null>(null);

  async function run(mode: AIMode) {
    const trimmed = seed.trim();
    const fallbackSeed = [context.jobTitle, context.company].filter(Boolean).join(" at ").trim()
      || context.projectTitle?.trim()
      || context.skills?.trim()
      || context.techStack?.trim()
      || "";

    const text = trimmed || (mode === "suggest" ? fallbackSeed : "");
    if (!text) {
      toast.error(mode === "suggest" ? t("needContext") : t("empty"));
      return;
    }

    setActive(mode);
    try {
      const res = await csrfFetch("/api/ai/enhance-text", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text,
          mode,
          context: SECTION_CONTEXT[section] ?? "text for a professional resume",
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error ?? t("failed"));
      }
      const data = await res.json();
      const result = (data.enhanced ?? "").trim();
      if (result) {
        onResult(result);
        toast.success(t("done"));
      } else {
        toast.error(t("empty"));
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("failed"));
    } finally {
      setActive(null);
    }
  }

  const chips: { mode: AIMode; icon: typeof Sparkles; label: string }[] = [
    { mode: "improve", icon: Sparkles, label: t("improve") },
    { mode: "suggest", icon: Lightbulb, label: t("suggest") },
    { mode: "grammar", icon: SpellCheck, label: t("grammar") },
    { mode: "shorten", icon: Scissors, label: t("shorten") },
  ];

  return (
    <div className={cn("flex flex-wrap items-center gap-1.5", className)}>
      <Sparkles className="h-3.5 w-3.5 text-primary/70" aria-hidden />
      {chips.map(({ mode, icon: Icon, label }) => (
        <button
          key={mode}
          type="button"
          disabled={disabled || active !== null}
          onClick={() => run(mode)}
          className={cn(
            "inline-flex items-center gap-1 rounded-full border border-primary/20 bg-primary/5 px-2 py-0.5 text-[0.7rem] font-medium text-primary transition-colors",
            "hover:bg-primary/10 disabled:opacity-50 disabled:cursor-not-allowed",
          )}
        >
          {active === mode ? <Loader2 className="h-3 w-3 animate-spin" /> : <Icon className="h-3 w-3" />}
          {label}
        </button>
      ))}
    </div>
  );
}
