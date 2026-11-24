"use client";

import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { AlertCircle, AlertTriangle, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { CV_EXPORT_MAX_ITEMS } from "@/lib/cv/cvExportTypes";
import type { CvDetails } from "@/lib/cv/cvZip";
import { cn } from "@/lib/utils";
import {
  useCvExport,
  type CvExportCounts,
  type CvExportItem,
  type CvExportMode,
  type CvExportSummary,
} from "./useCvExport";
import { CvExportJobOverlapNotice, type CvExportOverlapChoice } from "./CvExportJobOverlapNotice";

export interface CvExportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The selected candidates (at most CV_EXPORT_MAX_ITEMS; the dialog refuses more). */
  items: CvExportItem[];
  /**
   * Rows for an optional `candidates.xlsx`, keyed by `seekerId`. The "Include
   * candidate details sheet" checkbox appears only when this is given.
   */
  detailsRows?: CvDetails;
  /** Called after the ZIP was handed to the browser and the dialog was told to close (for example, to clear the selection). */
  onExported?: (summary: CvExportSummary) => void;
  /**
   * The job these CVs are for (admin). The export is recorded against it, and
   * the dialog says which candidates the client already has, leaving them out
   * by default.
   */
  jobId?: string | null;
  /** A control for choosing that job inside the dialog (optional for the person). */
  jobPicker?: ReactNode;
}

const MODE_OPTIONS: ReadonlyArray<{ value: CvExportMode; label: string; hint: string }> = [
  { value: "standardised", label: "modeStandardised", hint: "modeStandardisedHint" },
  { value: "original", label: "modeOriginal", hint: "modeOriginalHint" },
  { value: "both", label: "modeBoth", hint: "modeBothHint" },
];

/**
 * Export the selected candidates' CVs as one ZIP: standardised (Mployedin),
 * original (uploaded), or both. It asks the server which CVs exist before any
 * file is fetched, so what will be missing is shown up front, then fetches and
 * draws the files in the browser with a progress bar and a Cancel.
 *
 * Mounted by list pages (dashboard routes only: the CV headings it draws with
 * live in `cvBuilderPage.previewSections` and `proficiency`, which the
 * dashboard layout hands to every client component).
 */
export function CvExportDialog({ open, onOpenChange, items, detailsRows, onExported, jobId = null, jobPicker }: CvExportDialogProps) {
  const t = useTranslations("cvExport");
  const tc = useTranslations("common");
  const modeLabelId = useId();
  const namesId = useId();
  const detailsId = useId();
  const [includeDetails, setIncludeDetails] = useState(true);
  const [showNames, setShowNames] = useState(false);
  const radioRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const cancelRef = useRef<HTMLButtonElement>(null);

  const exporter = useCvExport({
    open,
    items,
    detailsRows,
    jobId,
    onDone: (summary) => {
      toast.success(
        summary.skipped > 0
          ? t("toastExportedSkipped", { exported: summary.exported, skipped: summary.skipped })
          : t("toastExported", { exported: summary.exported }),
      );
      onExported?.(summary);
      onOpenChange(false);
    },
  });
  const { phase, mode, setMode, counts, overLimit, progress, error, cancelled, selectionChanged, jobOverlap } = exporter;

  const running = phase === "running";

  // Candidates the client already has for this job: left out unless the person says otherwise.
  const [overlapChoice, setOverlapChoice] = useState<CvExportOverlapChoice>("skip");
  const overlapKey = jobOverlap.map((o) => o.seekerId).join("|");
  useEffect(() => setOverlapChoice("skip"), [overlapKey]);
  const skipSeekerIds = useMemo(
    () => new Set(overlapChoice === "skip" ? jobOverlap.map((o) => o.seekerId) : []),
    [overlapChoice, jobOverlap],
  );
  const exportCount = items.filter((item) => !skipSeekerIds.has(item.seekerId)).length;

  // The button that was pressed is disabled while running; keyboard users land on Cancel.
  useEffect(() => {
    if (running) cancelRef.current?.focus();
  }, [running]);
  const checking = !overLimit && !counts && phase !== "error" && items.length > 0;
  const checkFailed = !overLimit && !counts && phase === "error";
  const canExport = !!counts && counts.exportable > 0 && exportCount > 0 && !running;

  const handleOpenChange = (next: boolean) => {
    // Closing in the middle of an export is a cancel.
    if (!next) exporter.cancel();
    onOpenChange(next);
  };

  const onRadioKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const forward = event.key === "ArrowDown" || event.key === "ArrowRight";
    const backward = event.key === "ArrowUp" || event.key === "ArrowLeft";
    if (!forward && !backward) return;
    event.preventDefault();
    const next = (index + (forward ? 1 : -1) + MODE_OPTIONS.length) % MODE_OPTIONS.length;
    setMode(MODE_OPTIONS[next].value);
    radioRefs.current[next]?.focus();
  };

  const bannerText = overLimit ? t("tooMany", { max: CV_EXPORT_MAX_ITEMS }) : error?.message;
  const percent = progress && progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        closeOnOutsideClick={false}
        className="sm:max-w-lg flex flex-col max-h-[calc(100dvh-4rem)] p-0 overflow-hidden"
      >
        <DialogHeader className="shrink-0 px-14 pt-6 pb-0 sm:ps-6 sm:pe-14">
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </DialogHeader>

        <div className="relative flex-1 space-y-4 overflow-y-auto px-6 py-4">
          {bannerText && (
            <div role="alert" className="flex items-start gap-2 rounded-lg border border-destructive/20 bg-destructive/5 text-sm text-destructive chip-pad">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <span>{bannerText}</span>
            </div>
          )}

          {selectionChanged && !running && (
            <p role="status" className="text-sm text-muted-foreground">{t("selectionChanged")}</p>
          )}

          {!overLimit && items.length > 0 && (
            <p className="text-sm font-medium text-foreground">{t("selectedCount", { count: items.length })}</p>
          )}

          {running && progress ? (
            <div className="space-y-2">
              <div className="flex items-baseline justify-between gap-3">
                {/* The only live region: the count, not the bar or each candidate's name. */}
                <p aria-live="polite" className="text-sm font-medium text-foreground">
                  {progress.stage === "zipping" ? t("zipping") : t("preparing", { done: progress.done, total: progress.total })}
                </p>
                <span className="text-xs tabular-nums text-muted-foreground">{percent}%</span>
              </div>
              {/* A width fill, so the bar grows from the reading-start edge in Arabic too. */}
              <div
                role="progressbar"
                aria-label={t("title")}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={percent}
                className="h-2.5 w-full overflow-hidden rounded-full bg-secondary/60"
              >
                <div className="h-full rounded-full bg-primary transition-[width] duration-300 ease-out" style={{ width: `${percent}%` }} />
              </div>
              <p className="flex min-h-5 items-center gap-1.5 text-xs text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" aria-hidden="true" />
                {progress.current && (
                  <span className="truncate">
                    {t("progressCurrent", {
                      name: progress.current.name,
                      step: progress.current.step === "standardised" ? t("stepStandardised") : t("stepOriginal"),
                    })}
                  </span>
                )}
              </p>
            </div>
          ) : (
            !overLimit &&
            !checkFailed && (
              <>
                <div className="space-y-2">
                  <p id={modeLabelId} className="text-sm font-medium text-foreground">{t("modeLabel")}</p>
                  <div role="radiogroup" aria-labelledby={modeLabelId} className="space-y-2">
                    {MODE_OPTIONS.map((option, index) => {
                      const selected = mode === option.value;
                      return (
                        <button
                          key={option.value}
                          ref={(node) => { radioRefs.current[index] = node; }}
                          type="button"
                          role="radio"
                          aria-checked={selected}
                          tabIndex={selected ? 0 : -1}
                          onClick={() => setMode(option.value)}
                          onKeyDown={(event) => onRadioKeyDown(event, index)}
                          className={cn(
                            "flex min-h-11 w-full items-start gap-3 rounded-xl border p-3 text-start transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
                            selected ? "border-primary bg-primary/5" : "border-border hover:bg-muted/40",
                          )}
                        >
                          <span
                            aria-hidden="true"
                            className={cn(
                              "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border",
                              selected ? "border-primary" : "border-border",
                            )}
                          >
                            {selected && <span className="h-2 w-2 rounded-full bg-primary" />}
                          </span>
                          <span className="min-w-0">
                            <span className="block text-sm font-semibold text-foreground">{t(option.label)}</span>
                            <span className="mt-0.5 block text-xs text-muted-foreground">{t(option.hint)}</span>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {jobPicker && <div className="space-y-1.5">{jobPicker}</div>}

                {jobOverlap.length > 0 && (
                  <CvExportJobOverlapNotice
                    overlap={jobOverlap}
                    newCount={items.filter((item) => !jobOverlap.some((o) => o.seekerId === item.seekerId)).length}
                    choice={overlapChoice}
                    onChoiceChange={setOverlapChoice}
                  />
                )}

                {detailsRows && (
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id={detailsId}
                      checked={includeDetails}
                      onCheckedChange={(checked) => setIncludeDetails(checked === true)}
                    />
                    <Label htmlFor={detailsId} className="cursor-pointer font-normal">{t("includeDetails")}</Label>
                  </div>
                )}

                {checking && (
                  <div role="status" className="flex items-center gap-2 rounded-lg bg-muted/40 px-3 py-2.5 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 shrink-0 animate-spin" aria-hidden="true" />
                    {t("checking")}
                  </div>
                )}

                {counts && (
                  <Warnings counts={counts} showNames={showNames} onToggleNames={() => setShowNames((v) => !v)} namesId={namesId} />
                )}

                {cancelled && phase === "ready" && (
                  <p role="status" className="text-sm text-muted-foreground">{t("cancelled")}</p>
                )}
              </>
            )
          )}
        </div>

        <DialogFooter className="shrink-0 border-t border-border/50 px-6 py-4">
          <Button
            ref={cancelRef}
            type="button"
            variant="outline"
            onClick={() => (running ? exporter.cancel() : handleOpenChange(false))}
          >
            {tc("cancel")}
          </Button>
          {checkFailed ? (
            <Button type="button" onClick={exporter.retry}>{t("retry")}</Button>
          ) : (
            // Stays in place (disabled) while running, so the second click of a double
            // click lands on it and not on Cancel, which would otherwise take its spot.
            <Button
              type="button"
              disabled={!canExport || overLimit}
              onClick={() => exporter.start({ includeDetails: !!detailsRows && includeDetails, skipSeekerIds })}
            >
              {running && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
              {t("exportButton", { count: exportCount })}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface WarningsProps {
  counts: CvExportCounts;
  showNames: boolean;
  onToggleNames: () => void;
  namesId: string;
}

/** What the manifest says will be missing, shown before anything is downloaded. */
function Warnings({ counts, showNames, onToggleNames, namesId }: WarningsProps) {
  const t = useTranslations("cvExport");
  const parts = [
    counts.missingStandardised > 0 && t("warnNoStandardised", { count: counts.missingStandardised }),
    counts.missingOriginal > 0 && t("warnNoOriginal", { count: counts.missingOriginal }),
    counts.denied > 0 && t("warnNoAccess", { count: counts.denied }),
  ].filter(Boolean) as string[];
  const groups = [
    { label: t("namesNoStandardised"), names: counts.names.missingStandardised },
    { label: t("namesNoOriginal"), names: counts.names.missingOriginal },
    { label: t("namesNoAccess"), names: counts.names.denied },
  ].filter((group) => group.names.length > 0);

  if (parts.length === 0 && counts.exportable > 0) return null;

  return (
    <div className="space-y-2">
      {parts.length > 0 && (
        <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 px-3 py-2.5 text-sm text-amber-900">
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <div className="min-w-0 space-y-1">
              <p>{parts.join(" · ")}</p>
              <p className="text-xs">
                {t("warnReport")}{" "}
                <button
                  type="button"
                  aria-expanded={showNames}
                  aria-controls={namesId}
                  onClick={onToggleNames}
                  className="font-medium underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                >
                  {showNames ? t("hideNames") : t("showNames")}
                </button>
              </p>
              {showNames && (
                <div id={namesId} className="space-y-1 pt-1 text-xs">
                  {groups.map((group) => (
                    <p key={group.label}>
                      <span className="font-medium">{group.label}: </span>
                      {group.names.map((name, i) => (
                        <span key={`${name}-${i}`}>
                          {i > 0 && ", "}
                          <bdi>{name}</bdi>
                        </span>
                      ))}
                    </p>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
      {counts.exportable === 0 && (
        <p role="status" className="text-sm text-muted-foreground">{t("nothingToExport")}</p>
      )}
    </div>
  );
}
