"use client";

import { useState } from "react";
import { Sparkles, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { csrfFetch } from "@/lib/security/csrf-client";
import { useTranslations } from "next-intl";

/** Maps a CV section to a human-readable context string for the AI prompt. */
const SECTION_CONTEXT: Record<string, string> = {
  summary: "professional summary for a resume",
  experience_description: "work experience description for a professional resume",
  project_description: "project description for a professional resume",
};

/**
 * Inline "Write with AI" button that calls /api/ai/enhance-text
 * to generate or improve the text of a specific CV field.
 */
export function AIWriteButton({
  section,
  context,
  onResult,
  disabled,
  label,
}: {
  /** Which section to generate: "summary" | "experience_description" | "project_description" */
  section: string;
  /** Additional context — e.g. job title, current text, skills list */
  context: Record<string, string>;
  /** Called with the AI-generated text */
  onResult: (text: string) => void;
  disabled?: boolean;
  label?: string;
}) {
  const t = useTranslations("cvBuilderPage.aiWrite");
  const [loading, setLoading] = useState(false);
  const buttonLabel = label ?? t("button");

  async function handleClick() {
    setLoading(true);
    try {
      // Build the seed text the AI should enhance from the provided context.
      const seedText =
        context.currentText?.trim() ||
        [context.jobTitle, context.company].filter(Boolean).join(" at ").trim() ||
        context.projectTitle?.trim() ||
        context.skills?.trim() ||
        context.techStack?.trim() ||
        "";

      if (!seedText) {
        toast.error(t("empty"));
        return;
      }

      const res = await csrfFetch("/api/ai/enhance-text", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: seedText,
          context: SECTION_CONTEXT[section] ?? "text for a professional resume",
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error ?? t("generationFailed"));
      }
      const data = await res.json();
      const text = data.enhanced ?? "";
      if (text) {
        onResult(text);
        toast.success(t("generated"));
      } else {
        toast.error(t("empty"));
      }
    } catch (e) {
      toast.error(t("failed"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={loading || disabled}
      className="inline-flex items-center gap-1 text-[0.7rem] font-medium text-primary hover:text-primary/80 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
    >
      {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
      {loading ? t("generating") : buttonLabel}
    </button>
  );
}
