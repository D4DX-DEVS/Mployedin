"use client";

import { useState } from "react";
import { useFormContext } from "react-hook-form";
import { motion } from "framer-motion";
import { Sparkles, Loader2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import type { JobFormValues } from "./jobFormSchema";

const MIN_CHARS = 20;
const MAX_CHARS = 5000;

interface GeneratedDescription {
  full: string;
  responsibilities: string;
  requirements: string;
  niceToHave: string;
}

const DESCRIPTION_SECTIONS = [
  {
    label: "Role summary",
    anchor: "## Role Summary",
    content: "## Role Summary\n- Explain what this role owns and why it matters."
  },
  {
    label: "Key responsibilities",
    anchor: "## Key Responsibilities",
    content: "## Key Responsibilities\n- Lead or support the main workstreams for this role."
  },
  {
    label: "Must-have requirements",
    anchor: "## Must-Have Requirements",
    content: "## Must-Have Requirements\n- List the skills, tools, and experience candidates must already have."
  },
  {
    label: "Benefits",
    anchor: "## Benefits",
    content: "## Benefits\n- Mention standout perks, flexibility, or growth opportunities."
  },
] as const;

export function Step2JobDetails() {
  const {
    register,
    watch,
    setValue,
    formState: { errors },
  } = useFormContext<JobFormValues>();

  const title = watch("title");
  const category = watch("category");
  const locationCountry = watch("location.country");
  const skills = watch("requirements.skills");
  const description = watch("description");

  const charCount = description?.length ?? 0;
  const descriptionStrength =
    charCount >= 600 ? "Strong" : charCount >= 250 ? "Good start" : "Needs detail";

  const [generating, setGenerating] = useState(false);
  const [aiError, setAiError] = useState("");
  const [generated, setGenerated] = useState<GeneratedDescription | null>(null);

  function insertSectionTemplate(section: (typeof DESCRIPTION_SECTIONS)[number]) {
    const currentValue = description?.trim() ?? "";
    if (currentValue.toLowerCase().includes(section.anchor.toLowerCase())) return;

    const nextValue = currentValue
      ? `${currentValue}\n\n${section.content}`
      : section.content;

    setValue("description", nextValue, { shouldValidate: true });
  }

  async function generateDescription() {
    if (!title) {
      setAiError("Please enter a job title in step 1 first.");
      return;
    }
    setGenerating(true);
    setAiError("");

    try {
      const res = await fetch("/api/ai/job-description", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          category,
          location: locationCountry,
          skills: skills?.slice(0, 10) ?? [],
        }),
      });

      if (!res.ok) {
        const err = (await res.json()) as { error?: string };
        setAiError(err.error ?? "Generation failed. Please try again.");
        return;
      }

      const data = (await res.json()) as { description: GeneratedDescription };
      setGenerated(data.description);
      setValue("description", data.description.full, { shouldValidate: true });
    } catch {
      setAiError("Network error. Please try again.");
    } finally {
      setGenerating(false);
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      transition={{ duration: 0.25 }}
      className="space-y-5"
    >
      <div className="flex flex-col gap-3 rounded-2xl border border-border/70 bg-muted/20 p-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold text-foreground">Job Details</h2>
          <p className="text-sm text-muted-foreground">
            Write a clear, skimmable description so candidates can qualify themselves quickly.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge variant="secondary" className="rounded-full px-3 py-1 text-xs">
            {descriptionStrength}
          </Badge>
          <Badge variant="secondary" className="rounded-full px-3 py-1 text-xs">
            {charCount.toLocaleString()} characters
          </Badge>
          <Badge variant="secondary" className="rounded-full px-3 py-1 text-xs">
            AI assist ready
          </Badge>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.55fr)_minmax(17rem,0.95fr)]">
        <div className="space-y-3 rounded-2xl border border-border bg-background p-4 shadow-sm">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1">
              <Label htmlFor="description" className="text-sm font-medium">
                Job Description <span className="text-destructive">*</span>
              </Label>
              <p className="text-xs text-muted-foreground">
                Keep it structured. Candidates scan responsibilities, requirements, and benefits first.
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={generateDescription}
              disabled={generating}
              className="h-8 gap-1.5 text-xs"
            >
              {generating ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  Generating…
                </>
              ) : (
                <>
                  <Sparkles className="w-3.5 h-3.5 text-primary" />
                  Generate with AI
                </>
              )}
            </Button>
          </div>

          <div className="flex flex-wrap gap-2">
            {DESCRIPTION_SECTIONS.map((section) => (
              <button
                key={section.label}
                type="button"
                onClick={() => insertSectionTemplate(section)}
                className="rounded-full border border-border bg-background px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:bg-primary/[0.04] hover:text-foreground"
              >
                + {section.label}
              </button>
            ))}
          </div>

          {generating && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="space-y-2 rounded-xl border border-border bg-muted/30 p-4"
            >
              {[80, 65, 90, 70, 55].map((w, i) => (
                <div
                  key={i}
                  className="h-3 animate-pulse rounded bg-muted"
                  style={{ width: `${w}%` }}
                />
              ))}
            </motion.div>
          )}

          {!generating && (
            <Textarea
              id="description"
              {...register("description")}
              maxLength={MAX_CHARS}
              placeholder="Describe the role, responsibilities, and what you're looking for…&#10;&#10;## Role Summary&#10;- Briefly explain what the person will own.&#10;&#10;## Key Responsibilities&#10;- List the main day-to-day work.&#10;&#10;## Must-Have Requirements&#10;- Highlight essential experience and skills."
              rows={10}
              className={cn(
                "min-h-[260px] resize-y text-sm leading-6",
                errors.description && "border-destructive"
              )}
            />
          )}

          <div className="flex items-center justify-between gap-3">
            {errors.description ? (
              <p className="flex items-center gap-1 text-xs text-destructive">
                <AlertCircle className="w-3 h-3" />
                {errors.description.message}
              </p>
            ) : (
              <span className="text-xs text-muted-foreground">
                {charCount < MIN_CHARS
                  ? `${MIN_CHARS - charCount} more characters needed`
                  : "Looks valid. Add specifics to improve candidate quality."}
              </span>
            )}
            <span
              className={cn(
                "text-xs tabular-nums",
                charCount > MAX_CHARS * 0.9 ? "text-destructive" : "text-muted-foreground"
              )}
            >
              {charCount.toLocaleString()} / {MAX_CHARS.toLocaleString()}
            </span>
          </div>
        </div>

        <div className="space-y-3">
          <div className="rounded-2xl border border-border bg-background p-4 shadow-sm">
            <p className="text-sm font-semibold text-foreground">What strong listings include</p>
            <div className="mt-3 space-y-3 text-xs text-muted-foreground">
              <div className="rounded-xl border border-border/70 bg-muted/30 p-3">
                Start with one short summary sentence that explains the role and team.
              </div>
              <div className="rounded-xl border border-border/70 bg-muted/30 p-3">
                Use bullets for responsibilities and must-have skills so candidates can scan quickly.
              </div>
              <div className="rounded-xl border border-border/70 bg-muted/30 p-3">
                Mention impact, tools, and growth opportunities to make the role feel concrete.
              </div>
            </div>
          </div>

          {generated && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-3 rounded-2xl border border-primary/20 bg-primary/5 p-4 shadow-sm"
            >
              <div className="flex items-center gap-2 text-sm font-medium text-primary">
                <Sparkles className="w-4 h-4" />
                AI draft sections
              </div>
              <div className="space-y-2 text-xs">
                {[
                  { label: "Responsibilities", content: generated.responsibilities },
                  { label: "Requirements", content: generated.requirements },
                  { label: "Nice to Have", content: generated.niceToHave },
                ].map(({ label, content }) => (
                  <div key={label} className="rounded-xl border border-border/70 bg-background p-3">
                    <p className="font-semibold text-foreground">{label}</p>
                    <p className="mt-1 line-clamp-3 text-muted-foreground">{content}</p>
                  </div>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                Full text has already been applied to the editor. Review before posting.
              </p>
            </motion.div>
          )}
        </div>
      </div>

      {aiError && (
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="flex items-center gap-1.5 rounded-xl border border-destructive/20 bg-destructive/5 p-3 text-sm text-destructive"
        >
          <AlertCircle className="w-4 h-4 shrink-0" />
          {aiError}
        </motion.p>
      )}
    </motion.div>
  );
}
