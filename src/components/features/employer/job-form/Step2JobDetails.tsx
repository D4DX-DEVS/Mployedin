"use client";

import { useState } from "react";
import { useFormContext } from "react-hook-form";
import { motion } from "framer-motion";
import { Sparkles, Loader2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
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

  const [generating, setGenerating] = useState(false);
  const [aiError, setAiError] = useState("");
  const [generated, setGenerated] = useState<GeneratedDescription | null>(null);

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
      className="space-y-6"
    >
      <div>
        <h2 className="text-lg font-semibold text-foreground">Job Details</h2>
        <p className="text-sm text-muted-foreground mt-0.5">
          Describe the role clearly — great descriptions attract the right candidates.
        </p>
      </div>

      {/* AI Generated structured preview */}
      {generated && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-lg border border-primary/20 bg-primary/5 p-4 space-y-3"
        >
          <div className="flex items-center gap-2 text-sm font-medium text-primary">
            <Sparkles className="w-4 h-4" />
            AI Generated — 3 structured sections
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
            {[
              { label: "Responsibilities", content: generated.responsibilities },
              { label: "Requirements", content: generated.requirements },
              { label: "Nice to Have", content: generated.niceToHave },
            ].map(({ label, content }) => (
              <div key={label} className="rounded-md bg-background border border-border p-3 space-y-1">
                <span className="font-semibold text-foreground">{label}</span>
                <p className="text-muted-foreground line-clamp-4">{content}</p>
              </div>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            Showing preview — full text has been applied below. Edit as needed.
          </p>
        </motion.div>
      )}

      {/* Description field */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label htmlFor="description" className="text-sm font-medium">
            Job Description <span className="text-destructive">*</span>
          </Label>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={generateDescription}
            disabled={generating}
            className="gap-1.5 text-xs h-8"
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

        {/* AI loading skeleton */}
        {generating && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="space-y-2 p-4 rounded-lg border border-border bg-muted/30"
          >
            {[80, 65, 90, 70, 55].map((w, i) => (
              <div
                key={i}
                className="h-3 rounded animate-pulse bg-muted"
                style={{ width: `${w}%` }}
              />
            ))}
          </motion.div>
        )}

        {!generating && (
          <Textarea
            id="description"
            {...register("description")}
            placeholder="Describe the role, responsibilities, and what you're looking for…&#10;&#10;## Responsibilities&#10;- Lead the development of…&#10;&#10;## Requirements&#10;- 3+ years experience…"
            rows={12}
            className={cn(
              "resize-y font-mono text-sm",
              errors.description && "border-destructive"
            )}
          />
        )}

        {/* Character counter */}
        <div className="flex items-center justify-between">
          {errors.description ? (
            <p className="text-xs text-destructive flex items-center gap-1">
              <AlertCircle className="w-3 h-3" />
              {errors.description.message}
            </p>
          ) : (
            <span className="text-xs text-muted-foreground">
              {charCount < MIN_CHARS && `${MIN_CHARS - charCount} more characters needed`}
            </span>
          )}
          <span
            className={cn(
              "text-xs tabular-nums",
              charCount > MAX_CHARS * 0.9
                ? "text-destructive"
                : charCount > MIN_CHARS
                  ? "text-muted-foreground"
                  : "text-muted-foreground"
            )}
          >
            {charCount.toLocaleString()} / {MAX_CHARS.toLocaleString()}
          </span>
        </div>
      </div>

      {aiError && (
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="text-sm text-destructive flex items-center gap-1.5 p-3 bg-destructive/5 rounded-lg border border-destructive/20"
        >
          <AlertCircle className="w-4 h-4 shrink-0" />
          {aiError}
        </motion.p>
      )}
    </motion.div>
  );
}
