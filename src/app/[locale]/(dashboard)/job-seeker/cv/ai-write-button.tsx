"use client";

import { useState } from "react";
import { Sparkles, Loader2 } from "lucide-react";
import { toast } from "sonner";

/**
 * Inline "Write with AI" button that calls /api/ai/profile-fill
 * to generate or improve a specific CV section.
 */
export function AIWriteButton({
  section,
  context,
  onResult,
  disabled,
  label = "Write with AI",
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
  const [loading, setLoading] = useState(false);

  async function handleClick() {
    setLoading(true);
    try {
      const res = await fetch("/api/ai/profile-fill", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ section, ...context }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error ?? "AI generation failed");
      }
      const data = await res.json();
      const text = data.result ?? data.text ?? data.content ?? "";
      if (text) {
        onResult(text);
        toast.success("AI content generated!");
      } else {
        toast.error("AI returned empty result");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to generate");
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
      {loading ? "Generating..." : label}
    </button>
  );
}
