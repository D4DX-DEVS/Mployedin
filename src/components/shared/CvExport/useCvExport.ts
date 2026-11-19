"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { csrfFetch } from "@/lib/security/csrf-client";
import { prefStorage } from "@/lib/consent/prefStorage";
import { FormError } from "@/lib/errors/form-error";
import { useCvPdfLabels } from "@/app/[locale]/(dashboard)/job-seeker/cv/use-cv-pdf-labels";
import {
  CV_EXPORT_MAX_ITEMS,
  type CvExportAllowedItem,
  type CvExportManifestItem,
  type CvExportManifestResponse,
} from "@/lib/cv/cvExportTypes";
import { builtCvLabelLang, resolveCvPdfLabels } from "@/lib/cv/cvPdfLabels";
import type { BuildCvZipResult, CvDetails, CvExportMode } from "@/lib/cv/cvZip";
import {
  computeCounts,
  displayName,
  downloadBlob,
  fetchOriginal,
  fetchStandardised,
  planCvExportEntries,
  wantsOriginal,
  wantsStandardised,
  type CvExportCounts,
  type CvExportItem,
  type CvExportNotes,
} from "./cvExportFiles";

export type { CvExportCounts, CvExportItem } from "./cvExportFiles";
export type { CvExportMode } from "@/lib/cv/cvZip";

/**
 * Where the last chosen mode is remembered. A UI preference (consent registry row `ui:*`), so it goes
 * through prefStorage: kept on the device only when preferences are allowed, else for this visit.
 */
export const CV_EXPORT_MODE_KEY = "ui:cvExport.mode";

/** File fetches in flight at once. */
const CONCURRENCY = 3;

const MODES: readonly CvExportMode[] = ["standardised", "original", "both"];
const DEFAULT_MODE: CvExportMode = "standardised";

/**
 * idle      nothing asked (closed, no candidates, or too many)
 * checking  asking the manifest which CVs exist
 * ready     counts known; the person can change the mode and export
 * running   fetching and drawing the files, then zipping
 * done      the ZIP was handed to the browser
 * error     the check failed (no counts), or the export produced no file (counts kept, can retry)
 */
export type CvExportPhase = "idle" | "checking" | "ready" | "running" | "done" | "error";

export interface CvExportProgress {
  /** Candidates finished. */
  done: number;
  /** Candidates with something to prepare. */
  total: number;
  /** "files" while fetching and drawing; "zipping" while the ZIP is built. */
  stage: "files" | "zipping";
  /** What was started last (several candidates run at once). */
  current: { name: string; step: "original" | "standardised" } | null;
}

export interface CvExportSummary {
  /** Candidates with at least one CV file in the ZIP. */
  exported: number;
  /** Candidates with none (they are in the report). */
  skipped: number;
  fileName: string;
  /** CV files in the ZIP. */
  fileCount: number;
}

export interface UseCvExportOptions {
  /** Only a dialog that is open does any work; closing it aborts whatever is running. */
  open: boolean;
  /** The selected candidates. At most CV_EXPORT_MAX_ITEMS; more is refused (`overLimit`) without asking the server. */
  items: CvExportItem[];
  /** Rows for candidates.xlsx, keyed by `seekerId`. Without it the details sheet is never offered. */
  detailsRows?: CvDetails;
  /** Called once, after the ZIP was handed to the browser. */
  onDone?: (summary: CvExportSummary) => void;
}

export interface UseCvExportResult {
  phase: CvExportPhase;
  mode: CvExportMode;
  setMode: (mode: CvExportMode) => void;
  /** Null until the manifest has answered. */
  counts: CvExportCounts | null;
  /** More candidates than one export may hold. */
  overLimit: boolean;
  progress: CvExportProgress | null;
  /** Copy written for the screen (a FormError), never a raw message. */
  error: FormError | null;
  /** The last run was cancelled by the person (cleared by the next run or a change of mode). */
  cancelled: boolean;
  /** The selection changed while an export was running, so the export was cancelled (cleared like `cancelled`). */
  selectionChanged: boolean;
  start: (options?: { includeDetails?: boolean }) => void;
  cancel: () => void;
  /** Ask the manifest again after a failed check. */
  retry: () => void;
}

function readStoredMode(): CvExportMode {
  // prefStorage never throws: blocked storage reads as nothing stored, so the default applies.
  const stored = prefStorage.get(CV_EXPORT_MODE_KEY);
  if (stored && (MODES as readonly string[]).includes(stored)) return stored as CvExportMode;
  return DEFAULT_MODE;
}

function storeMode(mode: CvExportMode): void {
  // Not remembered when storage is blocked; the choice still applies now.
  prefStorage.set(CV_EXPORT_MODE_KEY, mode);
}

const itemsSignature = (items: readonly CvExportItem[]) =>
  items.map((item) => `${item.seekerId}:${item.applicationId ?? ""}`).join("|");

interface Manifest {
  rows: CvExportManifestItem[];
  /** The items the rows answer, in the same order. */
  items: CvExportItem[];
}

export function useCvExport({ open, items, detailsRows, onDone }: UseCvExportOptions): UseCvExportResult {
  const t = useTranslations("cvExport");
  const tf = useTranslations("formErrors");
  const labels = useCvPdfLabels();
  const uiLocale = useLocale();

  const overLimit = items.length > CV_EXPORT_MAX_ITEMS;
  const checkable = items.length > 0 && !overLimit;

  const [phase, setPhaseState] = useState<CvExportPhase>(open && checkable ? "checking" : "idle");
  const [manifest, setManifestState] = useState<Manifest | null>(null);
  const [mode, setModeState] = useState<CvExportMode>(() => (typeof window === "undefined" ? DEFAULT_MODE : readStoredMode()));
  const [progress, setProgress] = useState<CvExportProgress | null>(null);
  const [error, setError] = useState<FormError | null>(null);
  const [cancelled, setCancelled] = useState(false);
  const [selectionChanged, setSelectionChanged] = useState(false);

  // Latest values for the async work, so it never closes over a stale render.
  const itemsRef = useRef(items);
  const detailsRef = useRef(detailsRows);
  const onDoneRef = useRef(onDone);
  const labelsRef = useRef(labels);
  const uiLocaleRef = useRef(uiLocale);
  const tRef = useRef(t);
  const tfRef = useRef(tf);
  itemsRef.current = items;
  detailsRef.current = detailsRows;
  onDoneRef.current = onDone;
  labelsRef.current = labels;
  uiLocaleRef.current = uiLocale;
  tRef.current = t;
  tfRef.current = tf;

  const phaseRef = useRef(phase);
  const manifestRef = useRef<Manifest | null>(null);
  const modeRef = useRef(mode);
  const controllerRef = useRef<AbortController | null>(null);
  /** Bumped whenever the current work is abandoned, so a late answer can tell it is stale. */
  const generationRef = useRef(0);

  const setPhase = useCallback((next: CvExportPhase) => {
    phaseRef.current = next;
    setPhaseState(next);
  }, []);
  const setManifest = useCallback((next: Manifest | null) => {
    manifestRef.current = next;
    setManifestState(next);
  }, []);

  const abandon = useCallback(() => {
    controllerRef.current?.abort();
    controllerRef.current = null;
    generationRef.current += 1;
  }, []);

  /* ── manifest ─────────────────────────────────────── */

  const check = useCallback(async () => {
    abandon();
    const controller = new AbortController();
    controllerRef.current = controller;
    const generation = generationRef.current;
    const asked = itemsRef.current;

    setError(null);
    setCancelled(false);
    setSelectionChanged(false);
    setProgress(null);
    setManifest(null);
    if (asked.length === 0 || asked.length > CV_EXPORT_MAX_ITEMS) {
      setPhase("idle");
      return;
    }
    setPhase("checking");

    try {
      const res = await csrfFetch("/api/cv-export/manifest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: asked.map((item) => ({
            seekerId: item.seekerId,
            ...(item.applicationId ? { applicationId: item.applicationId } : {}),
          })),
        }),
        signal: controller.signal,
      });
      if (!res.ok) {
        if (res.status === 429) throw new FormError(tfRef.current("rateLimit"));
        if (res.status === 401 || res.status === 403) throw new FormError(tfRef.current("permission"));
        throw new FormError(tRef.current("checkError"));
      }
      const body = (await res.json()) as Partial<CvExportManifestResponse> | null;
      if (generation !== generationRef.current) return;
      const rows = Array.isArray(body?.items) ? body.items : null;
      // The rows answer the items one for one; anything else cannot be trusted.
      if (!rows || rows.length !== asked.length) throw new FormError(tRef.current("checkError"));
      setManifest({ rows, items: asked });
      setPhase("ready");
    } catch (err) {
      if (generation !== generationRef.current) return;
      if (err instanceof FormError) setError(err);
      else setError(new FormError(err instanceof TypeError ? tfRef.current("network") : tRef.current("checkError")));
      setPhase("error");
    }
  }, [abandon, setManifest, setPhase]);

  const signature = itemsSignature(items);
  useEffect(() => {
    if (!open) {
      abandon();
      setManifest(null);
      setError(null);
      setProgress(null);
      setCancelled(false);
      setSelectionChanged(false);
      setPhase("idle");
      return;
    }
    // A run still going when the selection changes is abandoned by check(); the person is told.
    const interrupted = phaseRef.current === "running";
    void check();
    if (interrupted) setSelectionChanged(true);
    return abandon;
    // `signature`, not `items`: callers rebuild the array on every render.
  }, [open, signature, check, abandon, setManifest, setPhase]);

  /* ── mode ─────────────────────────────────────────── */

  const setMode = useCallback((next: CvExportMode) => {
    modeRef.current = next;
    setModeState(next);
    storeMode(next);
    // A note about the last run no longer describes the choice being made.
    setCancelled(false);
    setSelectionChanged(false);
  }, []);

  const counts = useMemo(
    () =>
      manifest
        ? computeCounts(manifest.rows, manifest.items, mode, (id) => tRef.current("unnamedCandidate", { id }))
        : null,
    [manifest, mode],
  );

  /* ── run ──────────────────────────────────────────── */

  const run = useCallback(
    async (known: Manifest, chosen: CvExportMode, includeDetails: boolean) => {
      abandon();
      const controller = new AbortController();
      controllerRef.current = controller;
      const generation = generationRef.current;
      const { signal } = controller;
      /** False once cancelled, closed or superseded: nothing further may change state. */
      const live = () => generation === generationRef.current && !signal.aborted;

      const unnamed = (id: string) => tRef.current("unnamedCandidate", { id });
      const notes: CvExportNotes = {
        noProfileDetails: tRef.current("noteNoProfileDetails"),
        noUploadedFile: tRef.current("noteNoUploadedFile"),
        noAccess: tRef.current("noteNoAccess"),
        notFound: tRef.current("noteNotFound"),
        downloadError: tRef.current("noteDownloadError"),
        buildError: tRef.current("noteBuildError"),
        standardisedAlreadyIncluded: tRef.current("noteStandardisedAlreadyIncluded"),
      };
      const fail = (message: string) => {
        setError(new FormError(message));
        setProgress(null);
        setPhase("error");
      };

      const wantStandardised = wantsStandardised(chosen);
      const wantOriginal = wantsOriginal(chosen);
      const { rows, items: asked } = known;

      const { entries, work } = planCvExportEntries(rows, asked, chosen, notes);
      if (work.length === 0) return;

      setError(null);
      setCancelled(false);
      setSelectionChanged(false);
      setProgress({ done: 0, total: work.length, stage: "files", current: null });
      setPhase("running");

      let zipLib: typeof import("@/lib/cv/cvZip");
      let renderLib: typeof import("@/lib/cv/renderBuiltCv") | null = null;
      try {
        // Loaded now, not with the list page: react-pdf and JSZip are only needed when someone exports.
        [zipLib, renderLib] = await Promise.all([
          import("@/lib/cv/cvZip"),
          wantStandardised ? import("@/lib/cv/renderBuiltCv") : Promise.resolve(null),
        ]);
      } catch {
        if (live()) fail(tRef.current("zipError"));
        return;
      }
      if (!live()) return;

      let finished = 0;
      const queue = [...work];
      const setCurrent = (name: string, step: "original" | "standardised") => {
        if (live()) setProgress((p) => (p ? { ...p, current: { name, step } } : p));
      };

      // Each candidate's headings are in their own CV's language, not the screen's: `labels` is
      // the screen's, used as it is when the CV is in that language or the other one cannot load.
      const renderInCvLanguage =
        (render: typeof import("@/lib/cv/renderBuiltCv").renderBuiltCvPdf): typeof render =>
        async (data, screenLabels, opts) =>
          render(data, await resolveCvPdfLabels(builtCvLabelLang(data), uiLocaleRef.current, screenLabels), opts);

      const prepare = async (index: number) => {
        const row = rows[index] as CvExportAllowedItem;
        const entry = entries[index];
        const name = displayName(row, asked[index], unnamed);
        // `entry.standardised` is already set for a repeat of the same candidate (second application).
        if (wantStandardised && row.hasStandardised && renderLib && !entry.standardised) {
          setCurrent(name, "standardised");
          entry.standardised = await fetchStandardised(row, signal, labelsRef.current, renderInCvLanguage(renderLib.renderBuiltCvPdf), notes);
          if (!live()) return;
        }
        if (wantOriginal && row.hasOriginal) {
          setCurrent(name, "original");
          entry.original = await fetchOriginal(row, signal, zipLib.extFromResponse, notes);
          if (!live()) return;
        }
        finished += 1;
        setProgress((p) => (p ? { ...p, done: finished } : p));
      };

      const worker = async () => {
        while (live()) {
          const index = queue.shift();
          if (index === undefined) return;
          try {
            await prepare(index);
          } catch {
            // The helpers settle failed files themselves; this only guards the loop. Whatever
            // was not settled is reported as an error rather than silently missing.
            const entry = entries[index];
            if (wantStandardised && rows[index] && !rows[index].denied && !entry.standardised) {
              entry.standardised = { status: "error", note: notes.buildError };
            }
            if (wantOriginal && rows[index] && !rows[index].denied && !entry.original) {
              entry.original = { status: "error", note: notes.downloadError };
            }
            // It is finished all the same, or the bar would stall one short.
            finished += 1;
            if (live()) setProgress((p) => (p ? { ...p, done: finished } : p));
          }
        }
      };
      await Promise.all(Array.from({ length: Math.min(CONCURRENCY, work.length) }, worker));
      if (!live()) return;

      const anyFile = entries.some(
        (entry) => (wantStandardised && entry.standardised?.status === "ok") || (wantOriginal && entry.original?.status === "ok"),
      );
      if (!anyFile) {
        fail(tRef.current("exportFailed"));
        return;
      }

      setProgress((p) => (p ? { ...p, stage: "zipping", current: null } : p));
      const details = includeDetails ? detailsRef.current : undefined;
      let result: BuildCvZipResult;
      try {
        result = await zipLib.buildCvZip({ mode: chosen, entries, details, now: new Date() });
      } catch {
        if (live()) fail(tRef.current("zipError"));
        return;
      }
      if (!live()) return;
      if (result.fileCount === 0) {
        fail(tRef.current("exportFailed"));
        return;
      }

      downloadBlob(result.blob, result.fileName);
      setProgress(null);
      setPhase("done");
      onDoneRef.current?.({
        exported: result.exportedCandidates,
        skipped: result.skippedCandidates,
        fileName: result.fileName,
        fileCount: result.fileCount,
      });
    },
    [abandon, setPhase],
  );

  const start = useCallback(
    (options?: { includeDetails?: boolean }) => {
      const known = manifestRef.current;
      if (!known || phaseRef.current === "running" || phaseRef.current === "checking") return;
      void run(known, modeRef.current, options?.includeDetails ?? true);
    },
    [run],
  );

  const cancel = useCallback(() => {
    const was = phaseRef.current;
    if (was !== "running" && was !== "checking") return;
    abandon();
    if (was === "running") {
      setCancelled(true);
      setProgress(null);
      setPhase(manifestRef.current ? "ready" : "idle");
    } else {
      setPhase("idle");
    }
  }, [abandon, setPhase]);

  const retry = useCallback(() => {
    void check();
  }, [check]);

  return { phase, mode, setMode, counts, overLimit, progress, error, cancelled, selectionChanged, start, cancel, retry };
}
