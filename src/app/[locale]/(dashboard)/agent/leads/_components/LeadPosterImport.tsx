"use client";

import { useEffect, useRef, useState, type DragEvent } from "react";
import { AlertTriangle, Briefcase, CheckCircle2, FileText, ImageUp, Loader2, RefreshCw, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  LEAD_POSTER_ACCEPT, readLeadPoster, type LeadPosterFailure, type LeadPosterResult,
} from "@/lib/leads/posterClient";
import type { T } from "./leadShared";

interface LeadPosterImportProps {
  result: LeadPosterResult | null;
  onResult: (result: LeadPosterResult | null) => void;
  /** Field name → its label, for the "please check" list. */
  fieldLabels: Record<string, string>;
  t: T;
}

const FAILURE_KEYS: Record<LeadPosterFailure, string> = {
  not_poster: "posterErrorNotPoster",
  unreadable: "posterErrorUnreadable",
  too_large: "posterErrorTooLarge",
  bad_type: "posterErrorType",
  limit: "posterErrorLimit",
  failed: "posterErrorFailed",
};

/**
 * Top of the New Lead form: drop a hiring poster, the AI fills the form, the
 * agent checks what it was unsure of and saves. The poster is kept on the lead.
 */
export function LeadPosterImport({ result, onResult, fieldLabels, t }: LeadPosterImportProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [reading, setReading] = useState<string | null>(null);
  const [failure, setFailure] = useState<LeadPosterFailure | null>(null);
  const [dragging, setDragging] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);

  // The thumbnail is a local object URL; free it when replaced or unmounted.
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  async function read(file: File) {
    setFailure(null);
    setReading(file.name);
    setPreview(file.type.startsWith("image/") ? URL.createObjectURL(file) : null);
    const outcome = await readLeadPoster(file);
    setReading(null);
    if (outcome.ok) onResult(outcome.data);
    else { setFailure(outcome.reason); setPreview(null); }
  }

  function pick() { inputRef.current?.click(); }

  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    const file = event.dataTransfer.files?.[0];
    if (file) void read(file);
  }

  const input = (
    <input
      ref={inputRef}
      type="file"
      accept={LEAD_POSTER_ACCEPT}
      className="sr-only"
      aria-label={t("posterChooseFile")}
      onChange={(e) => { const file = e.target.files?.[0]; e.target.value = ""; if (file) void read(file); }}
    />
  );

  if (reading) {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-primary/30 bg-primary/5 p-3" role="status" aria-live="polite">
        {preview
          ? <img src={preview} alt="" className="h-12 w-12 shrink-0 rounded-lg object-cover opacity-70" />
          : <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-primary/10"><FileText className="size-5 text-primary" aria-hidden="true" /></span>}
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <Loader2 className="size-4 animate-spin text-primary" aria-hidden="true" /> {t("posterReading")}
          </p>
          <p dir="auto" className="truncate text-xs text-muted-foreground">{reading}</p>
        </div>
      </div>
    );
  }

  if (result) {
    const unsure = result.unsure.filter((f) => fieldLabels[f]);
    return (
      <div className="space-y-2.5 rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-3">
        <div className="flex items-start gap-3">
          {preview
            ? <img src={preview} alt={t("posterThumbAlt")} className="h-14 w-14 shrink-0 rounded-lg border border-border object-cover" />
            : <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10"><FileText className="size-5 text-emerald-700" aria-hidden="true" /></span>}
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
              <CheckCircle2 className="size-4 shrink-0 text-emerald-600" aria-hidden="true" /> {t("posterFilled")}
            </p>
            <p dir="auto" className="truncate text-xs text-muted-foreground">{result.posterName}</p>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <Button type="button" variant="ghost" size="icon" className="size-9" onClick={pick} aria-label={t("posterReplace")} title={t("posterReplace")}>
              <RefreshCw className="size-4" aria-hidden="true" />
            </Button>
            <Button type="button" variant="ghost" size="icon" className="size-9" onClick={() => { onResult(null); setPreview(null); }} aria-label={t("posterRemove")} title={t("posterRemove")}>
              <X className="size-4" aria-hidden="true" />
            </Button>
          </div>
          {input}
        </div>
        {result.roles.length > 0 && (
          <ul className="flex flex-wrap gap-1.5" aria-label={t("rolesHiringLabel")}>
            {result.roles.map((role) => (
              <li key={role.title} dir="auto" className="inline-flex items-center gap-1 rounded-full border border-border bg-background px-2 py-0.5 text-xs font-medium">
                <Briefcase className="size-3 text-muted-foreground" aria-hidden="true" />
                {role.title}{role.count > 1 && <span className="tabular-nums text-muted-foreground">×{role.count}</span>}
              </li>
            ))}
          </ul>
        )}
        {unsure.length > 0 ? (
          <p className="flex items-start gap-1.5 text-xs text-amber-800">
            <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
            <span>{t("posterCheckFields", { fields: unsure.map((f) => fieldLabels[f]).join(", ") })}</span>
          </p>
        ) : (
          <p className="text-xs text-muted-foreground">{t("posterCheckAll")}</p>
        )}
        {!result.posterToken && <p className="text-xs text-muted-foreground">{t("posterNotStored")}</p>}
      </div>
    );
  }

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
      className={cn(
        // Stacked: the dialog is ~410px wide, too narrow for text and a button side by side.
        "flex flex-wrap items-start gap-3 rounded-xl border border-dashed p-3 transition-colors",
        dragging ? "border-primary bg-primary/5" : "border-border bg-muted/30",
      )}
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
        <Sparkles className="size-5 text-primary" aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1 basis-[12rem]">
        <p className="text-sm font-semibold text-foreground">{t("posterTitle")}</p>
        <p className="text-xs text-muted-foreground">{t("posterHint")}</p>
        {failure && (
          <p className="mt-1 flex items-start gap-1.5 text-xs text-destructive" role="alert">
            <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
            {t(FAILURE_KEYS[failure])}
          </p>
        )}
      </div>
      <Button type="button" variant="outline" onClick={pick} className="min-h-11 w-full gap-2 sm:min-h-9">
        <ImageUp className="size-4" aria-hidden="true" /> {t("posterChooseFile")}
      </Button>
      {input}
    </div>
  );
}
