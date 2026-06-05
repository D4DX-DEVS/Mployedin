"use client";

import { useState } from "react";
import { Sparkles, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { csrfFetch } from "@/lib/security/csrf-client";
import { useTranslations } from "next-intl";

/**
 * Inline "Write with AI" button that calls /api/ai/profile-fill
 * to generate or improve a specific CV section.
 */
export function AIWriteButton({
  section,
  context,
  onResult,
  disabled,
  label,
}: {
  /** Which section to generate: "summary" | "experience_description" | "skills" | "project_description" */
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
      const res = await csrfFetch("/api/ai/profile-fill", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ section, ...context }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error ?? t("generationFailed"));
      }
      const data = await res.json();
      const text = data.result ?? data.text ?? data.content ?? "";
      if (text) {
        onResult(text);
        toast.success(t("generated"));
      } else {
        toast.error(t("empty"));
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("failed"));
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
