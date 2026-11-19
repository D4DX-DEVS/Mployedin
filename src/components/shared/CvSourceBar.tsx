"use client";

import type { KeyboardEvent } from "react";
import { useTranslations } from "next-intl";
import { AlertTriangle, Download, Info, Loader2 } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { withDownloadFlag } from "@/lib/cv/downloadFlag";

export type CvSource = "file" | "built";

/** Why there is no standardised CV to show: too little on the profile, the candidate cannot be found, or loading it failed (try again). */
export type BuiltReason = "empty" | "notFound" | "error";
/** Why there is no original file to show: none on the profile or application, or the candidate/application cannot be found. */
export type FileReason = "missing" | "notFound";

/** The download for the version showing: the standardised PDF (made on demand) or the original file. */
export type CvDownload =
  | { kind: "built"; onClick: () => void; busy: boolean; disabled: boolean }
  | { kind: "file"; href: string; fileName: string };

const SOURCES: readonly CvSource[] = ["built", "file"];

interface CvSourceBarProps {
  value: CvSource;
  onChange: (source: CvSource) => void;
  /** Set when the standardised CV cannot be shown; its tab is then disabled and the reason is written out under the tabs. */
  builtReason: BuiltReason | null;
  /** Set when there is no original file to show; likewise. */
  fileReason: FileReason | null;
  /** The viewer expected the standardised CV (staff): "not available yet" gets an amber status line, not a plain note. */
  emphasiseBuiltReason: boolean;
  /** Offered beside a "couldn't load" note. */
  onRetryBuilt?: () => void;
  /** The "original" is itself a Mployedin-built PDF: the CV the applicant sent with their application. */
  sentWithApplication: boolean;
  /** Phone with the profile pane open: only the tabs stay; the hint, reasons and download belong to the CV pane. */
  compact: boolean;
  tabId: (source: CvSource) => string;
  panelId: string;
  download: CvDownload | null;
  /** Why the download did not happen, when it did not. */
  alert?: string | null;
}

/**
 * Which CV the viewer shows: the Standardised CV (Mployedin), drawn from the
 * profile, or the original file; with the download for the one showing. Plain
 * buttons with the tab roles, not Radix Tabs, so it follows the page direction
 * on its own (Radix pins dir="ltr" unless told otherwise) and spacing is
 * logical only. Two tabs, so either arrow key moves to the other.
 *
 * A tab with nothing behind it is `aria-disabled` rather than `disabled`, and
 * says why three ways: in the page under the tabs (so touch and keyboard users
 * read it, not only a hover tooltip), as its `aria-describedby`, and as its
 * `title`.
 */
export function CvSourceBar({
  value,
  onChange,
  builtReason,
  fileReason,
  emphasiseBuiltReason,
  onRetryBuilt,
  sentWithApplication,
  compact,
  tabId,
  panelId,
  download,
  alert,
}: CvSourceBarProps) {
  const t = useTranslations("resumeViewerModal");
  const isDisabled = (source: CvSource) => (source === "built" ? builtReason !== null : fileReason !== null);

  // The reasons, one line each: when both tabs say the same thing it is said once.
  const notes: Array<{ text: string; amber: boolean; retry: boolean }> = [];
  const noteOf: Partial<Record<CvSource, number>> = {};
  const addNote = (source: CvSource, text: string, amber: boolean, retry: boolean) => {
    const at = notes.findIndex((n) => n.text === text);
    if (at >= 0) { noteOf[source] = at; return; }
    notes.push({ text, amber, retry });
    noteOf[source] = notes.length - 1;
  };
  if (builtReason) {
    const text = builtReason === "empty" ? t("standardisedUnavailable") : builtReason === "error" ? t("standardisedLoadFailed") : t("cvNotFound");
    addNote("built", text, emphasiseBuiltReason && builtReason === "empty", builtReason === "error");
  }
  if (fileReason) addNote("file", fileReason === "missing" ? t("noOriginalFile") : t("cvNotFound"), false, false);
  const noteId = (index: number) => `${panelId}-note-${index}`;

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) return;
    const usable = SOURCES.filter((s) => !isDisabled(s));
    if (usable.length === 0) return;
    e.preventDefault();
    const current = usable.indexOf(value);
    const next =
      e.key === "Home" ? usable[0]
      : e.key === "End" ? usable[usable.length - 1]
      : usable[(current + 1) % usable.length];
    if (next === value) return;
    onChange(next);
    document.getElementById(tabId(next))?.focus();
  }

  const labels: Record<CvSource, { long: string; short: string }> = {
    built: { long: t("standardisedCv"), short: t("standardisedCvShort") },
    file: sentWithApplication
      ? { long: t("sentWithApplication"), short: t("sentWithApplicationShort") }
      : { long: t("originalCv"), short: t("originalCvShort") },
  };
  // Phones with the profile open keep only the tabs.
  const cvOnly = compact ? "hidden sm:flex" : "flex";

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b bg-background px-3 py-2 sm:px-5">
      <div
        role="tablist"
        aria-label={t("cvSourceLabel")}
        onKeyDown={onKeyDown}
        className="flex w-full gap-0.5 rounded-lg border border-border/70 bg-muted/40 p-0.5 sm:inline-flex sm:w-auto"
      >
        {SOURCES.map((source) => {
          const selected = value === source;
          const disabled = isDisabled(source);
          const note = noteOf[source];
          return (
            <button
              key={source}
              id={tabId(source)}
              type="button"
              role="tab"
              aria-selected={selected}
              aria-controls={panelId}
              aria-disabled={disabled || undefined}
              aria-describedby={disabled && note !== undefined ? noteId(note) : undefined}
              aria-label={labels[source].long}
              title={disabled && note !== undefined ? notes[note].text : undefined}
              tabIndex={selected ? 0 : -1}
              onClick={() => { if (!disabled) onChange(source); }}
              className={`min-h-11 min-w-0 flex-1 rounded-md px-3 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:min-h-9 sm:flex-none sm:whitespace-nowrap ${
                disabled
                  ? "cursor-not-allowed text-muted-foreground/60"
                  : selected
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <span className="sm:hidden">{labels[source].short}</span>
              <span className="hidden sm:inline">{labels[source].long}</span>
            </button>
          );
        })}
      </div>

      {value === "built" && !builtReason && (
        // flex-1 with a small basis: the hint takes what is left beside Download and wraps its own text, instead of pushing Download onto a line of its own.
        <p className={`${cvOnly} min-w-0 flex-1 basis-40 items-center gap-1.5 text-xs text-muted-foreground`}>
          <Info className="size-3.5 shrink-0" aria-hidden="true" />
          {t("builtFromProfileHint")}
        </p>
      )}

      {download && (
        <div className={`${cvOnly} ms-auto shrink-0 items-center`}>
          {download.kind === "built" ? (
            <Button size="sm" variant="outline" onClick={download.onClick} disabled={download.disabled || download.busy} className="min-h-9 gap-1.5">
              {download.busy ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Download className="size-4" aria-hidden="true" />}
              {t("builtCvDownload")}
            </Button>
          ) : (
            <a
              // An explicit Download: flagged, so the CV route counts it (the preview fetch never is).
              href={withDownloadFlag(download.href)}
              download={download.fileName}
              target="_blank"
              rel="noopener noreferrer"
              className={cn(buttonVariants({ size: "sm", variant: "outline" }), "min-h-9 gap-1.5")}
            >
              <Download className="size-4" aria-hidden="true" />
              {t("builtCvDownload")}
            </a>
          )}
        </div>
      )}

      {notes.map((note, index) => (
        <div key={note.text} className={`${cvOnly} basis-full flex-wrap items-center gap-x-2 text-xs`}>
          <p
            id={noteId(index)}
            role={note.amber ? "status" : undefined}
            className={
              note.amber
                ? "inline-flex min-w-0 items-center gap-1.5 rounded-md border border-amber-300 bg-amber-50 px-2 py-1 font-medium text-amber-900"
                : "inline-flex min-w-0 items-center gap-1.5 text-muted-foreground"
            }
          >
            {note.amber ? <AlertTriangle className="size-3.5 shrink-0" aria-hidden="true" /> : <Info className="size-3.5 shrink-0" aria-hidden="true" />}
            {note.text}
          </p>
          {note.retry && onRetryBuilt && (
            <button
              type="button"
              onClick={onRetryBuilt}
              className="min-h-9 rounded-md px-2 font-medium text-primary underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {t("tryAgain")}
            </button>
          )}
        </div>
      ))}

      {alert && (
        <p role="alert" className={`${cvOnly} basis-full text-xs text-destructive`}>
          {alert}
        </p>
      )}
    </div>
  );
}
