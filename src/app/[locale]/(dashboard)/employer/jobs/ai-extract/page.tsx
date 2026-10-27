"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  Upload,
  FileImage,
  Loader2,
  Sparkles,
  Users,
  ArrowRight,
  FileText,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { WorkspaceHeader } from "@/components/shared/WorkspaceHeader";
import { cn } from "@/lib/utils";
import type { JobFormValues } from "@/components/features/employer/job-form/jobFormSchema";
import { useJobPostingTarget } from "@/components/features/jobs/jobPostingTarget";
import { BulkJobReview, isReadyToSave } from "@/components/features/jobs/bulk-review/BulkJobReview";
import { csrfFetch } from "@/lib/security/csrf-client";

interface ExtractedJob {
  title: string;
  category?: string;
  description?: string;
  location?: { country?: string; city?: string; isRemote?: boolean };
  requirements?: { skills?: string[]; preferredSkills?: string[]; experienceMin?: number; experienceMax?: number };
  salary?: { min?: number; max?: number; currency?: string; period?: string; isNegotiable?: boolean };
  employmentType?: string;
  workMode?: string;
  responsibilities?: string[];
  qualifications?: string[];
  benefits?: string[];
  vacancies?: number;
  tags?: string[];
  contactInfo?: string;
}

type PostingStatus = "idle" | "posting" | "posted" | "error";

const AI_PREFILL_STORAGE_KEY = "job-ai-prefill";
const AI_EXTRACT_SNAPSHOT_KEY = "job-ai-extract-snapshot";

/**
 * Tier-1 within-tab restore: read whatever we persisted to sessionStorage on
 * the last extraction. Survives Back / F5 in the same tab only — NOT tab
 * close (that's the dashboard "Continue extraction" card path via ?draft=ID).
 *
 * Mirrors `ai-create`'s `readChatSession()`. Includes a 24h staleness gate so
 * a stale extract from a previous session doesn't surprise the user.
 */
interface SessionSnapshot {
  draftId: string | null;
  fileName: string | null;
  jobs: ExtractedJob[];
  companyName: string;
  selectedIndices: number[];
  postingStatuses: Record<string, PostingStatus>;
  /** Jobs changed in the review list (by hand or by the AI assistant), by index. */
  edits?: Record<string, Partial<JobFormValues>>;
  savedAt: number;
}

function readSessionSnapshot(): SessionSnapshot | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(AI_EXTRACT_SNAPSHOT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SessionSnapshot;
    // Staleness gate: ignore snapshots older than 24h.
    if (!parsed.savedAt || Date.now() - parsed.savedAt > 24 * 60 * 60 * 1000) {
      sessionStorage.removeItem(AI_EXTRACT_SNAPSHOT_KEY);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function buildPrefill(job: ExtractedJob): Partial<JobFormValues> {
  return {
    title: job.title ?? "",
    category: job.category ?? "",
    description: job.description ?? "",
    location: {
      country: job.location?.country ?? "",
      city: job.location?.city ?? "",
      isRemote: job.location?.isRemote ?? false,
    },
    employmentType: job.employmentType as JobFormValues["employmentType"],
    workMode: job.workMode as JobFormValues["workMode"],
    requirements: {
      skills: job.requirements?.skills ?? [],
      preferredSkills: job.requirements?.preferredSkills ?? [],
      experienceMin: job.requirements?.experienceMin ?? 0,
      experienceMax: job.requirements?.experienceMax ?? 10,
    },
    responsibilities: job.responsibilities ?? [],
    qualifications: job.qualifications ?? [],
    benefits: job.benefits ?? [],
    salary: {
      min: job.salary?.min ?? 0,
      max: job.salary?.max ?? 0,
      currency: job.salary?.currency ?? "USD",
      period: (job.salary?.period as "monthly" | "yearly" | "lpa") ?? "monthly",
      isNegotiable: job.salary?.isNegotiable ?? false,
    },
    showSalary: Boolean((job.salary?.min ?? 0) > 0 || (job.salary?.max ?? 0) > 0),
    vacancies: job.vacancies ?? 1,
    tags: job.tags ?? [],
  };
}

export default function AIJobExtractPage() {
  const t = useTranslations("employerAiExtract");
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const searchParams = useSearchParams();
  // Employer page, also served to agents at /agent/jobs/ai-extract?employer=.
  const target = useJobPostingTarget();
  const forEmployer = target.employerId ? { employerId: target.employerId } : {};

  // ── Hydration sources (ordered by priority) ─────────────────────────────
  // 1. ?draft=<id> query — coming from the dashboard "Continue extraction"
  //    card; needs an async fetch from /api/ai/job-extract/drafts/[id].
  // 2. sessionStorage snapshot — survives Back / F5 within the same tab,
  //    mirroring the working `ai-create` page pattern (see repo memory).
  // 3. Empty — fresh upload.
  const draftIdFromUrl = searchParams?.get("draft") ?? null;

  const [dragActive, setDragActive] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [extracting, setExtracting] = useState(false);
  // Everything starts empty and is restored after mount: sessionStorage can't
  // be read during SSR without a hydration mismatch (same as ai-create).
  const [restoringDraft, setRestoringDraft] = useState(Boolean(draftIdFromUrl));
  const [draftId, setDraftId] = useState<string | null>(draftIdFromUrl);
  const [fileName, setFileName] = useState<string | null>(null);
  const [extractedJobs, setExtractedJobs] = useState<ExtractedJob[]>([]);
  const [companyName, setCompanyName] = useState<string>("");
  const [selectedJobs, setSelectedJobs] = useState<Set<number>>(new Set());
  const [postingStatuses, setPostingStatuses] = useState<Map<number, PostingStatus>>(new Map());
  const [bulkPosting, setBulkPosting] = useState(false);
  const [edits, setEdits] = useState<Record<number, Partial<JobFormValues>>>({});
  /** Each job as the review list shows it: the poster's edits, else the extraction. */
  const reviewJobs = extractedJobs.map((job, i) => edits[i] ?? buildPrefill(job));
  /** Bumped when a new list replaces the old one, so the review starts fresh. */
  const [reviewBatch, setReviewBatch] = useState(0);

  // ── Restore: this tab's snapshot first, else the draft in ?draft=<id> ──
  // The snapshot covers Back/refresh in the same tab; for the same draft it is
  // newer than the server copy (it has the review edits and removed jobs).
  // The API fetch covers Scenario 1 & 2 (closed tab / new day).
  useEffect(() => {
    const snapshot = readSessionSnapshot();
    if (snapshot && (!draftIdFromUrl || snapshot.draftId === draftIdFromUrl)) {
      setDraftId(snapshot.draftId);
      setFileName(snapshot.fileName);
      setExtractedJobs(snapshot.jobs);
      setCompanyName(snapshot.companyName ?? "");
      setSelectedJobs(new Set(snapshot.selectedIndices ?? []));
      setPostingStatuses(new Map(Object.entries(snapshot.postingStatuses ?? {}).map(([k, v]) => [Number(k), v])));
      setEdits(Object.fromEntries(Object.entries(snapshot.edits ?? {}).map(([k, v]) => [Number(k), v])));
      setReviewBatch((b) => b + 1);
      setRestoringDraft(false);
      return;
    }
    if (!draftIdFromUrl) return;
    let cancelled = false;
    (async () => {
      setRestoringDraft(true);
      try {
        const res = await fetch(`/api/ai/job-extract/drafts/${draftIdFromUrl}`, {
          cache: "no-store",
        });
        if (!res.ok) {
          if (!cancelled) toast.error(t("toastDraftUnavailable"));
          return;
        }
        const { draft } = (await res.json()) as {
          draft: {
            jobs: Array<{ index: number; status: PostingStatus; data: ExtractedJob }>;
            companyName?: string;
            fileName: string;
            selectedIndices?: number[];
          };
        };
        if (cancelled) return;

        const jobs = draft.jobs
          .slice()
          .sort((a, b) => a.index - b.index)
          .map((j) => j.data);
        const statuses = new Map<number, PostingStatus>();
        for (const j of draft.jobs) {
          // Map draft job status → client posting status. ("posted" → posted,
          //  "skipped" → error-ish? no — keep idle so the user can still re-post.
          //  Only "posted" is terminal.)
          if (j.status === "posted") statuses.set(j.index, "posted");
        }
        setExtractedJobs(jobs);
        setEdits({});
        setCompanyName(draft.companyName ?? "");
        setFileName(draft.fileName);
        setDraftId(draftIdFromUrl);
        setPostingStatuses(statuses);
        setSelectedJobs(new Set(draft.selectedIndices ?? jobs.map((_, i) => i)));
        setReviewBatch((b) => b + 1);
      } catch {
        if (!cancelled) toast.error(t("toastDraftUnavailable"));
      } finally {
        if (!cancelled) setRestoringDraft(false);
      }
    })();
    return () => {
      cancelled = true;
    };
     
  }, [draftIdFromUrl]);

  // ── Persist snapshot to sessionStorage on every change (Tier 1) ──────────
  // Same shape + clear-on-consume contract as `ai-create`'s chat session.
  const hadJobs = useRef(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (extractedJobs.length === 0) {
      // Never clobber with the empty state on load; but once the poster has
      // removed every job (or started a new upload) there is nothing to resume.
      if (hadJobs.current) {
        try { sessionStorage.removeItem(AI_EXTRACT_SNAPSHOT_KEY); } catch { /* noop */ }
      }
      hadJobs.current = false;
      return;
    }
    hadJobs.current = true;
    try {
      sessionStorage.setItem(
        AI_EXTRACT_SNAPSHOT_KEY,
        JSON.stringify({
          draftId,
          fileName,
          jobs: extractedJobs,
          companyName,
          selectedIndices: Array.from(selectedJobs),
          postingStatuses: Object.fromEntries(postingStatuses),
          edits,
          savedAt: Date.now(),
        })
      );
    } catch {
      /* quota / serialization — non-critical */
    }
    // Celar the snapshot once every job is posted so a future Back doesn't
    // resurrect a fully-completed extraction.
    if (postingStatuses.size > 0 &&
        Array.from(postingStatuses.values()).every((s) => s === "posted") &&
        postingStatuses.size === extractedJobs.length) {
      try { sessionStorage.removeItem(AI_EXTRACT_SNAPSHOT_KEY); } catch { /* noop */ }
    }
  }, [extractedJobs, companyName, selectedJobs, postingStatuses, draftId, fileName, edits]);

  const handleFile = useCallback((f: File) => {
    const allowedTypes = [
      "application/pdf",
      "image/jpeg",
      "image/png",
      "image/webp",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ];
    if (!allowedTypes.includes(f.type)) {
      toast.error(t("toastInvalidType"));
      return;
    }
    if (f.size > 10 * 1024 * 1024) {
      toast.error(t("toastTooLarge"));
      return;
    }
    setFile(f);
    setExtractedJobs([]);
    setEdits({});
    setSelectedJobs(new Set());
    setPostingStatuses(new Map());
    // New upload → new extraction: forget any prior draft so we don't
    // accidentally stamp a stale draft's entries with the new jobs.
    setDraftId(null);
    setFileName(null);

    // Generate preview for images
    if (f.type.startsWith("image/")) {
      const reader = new FileReader();
      reader.onload = () => setPreview(reader.result as string);
      reader.readAsDataURL(f);
    } else {
      setPreview(null);
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
    const f = e.dataTransfer.files[0];
    if (f) handleFile(f);
  }, [handleFile]);

  const handleExtract = async () => {
    if (!file) return;
    setExtracting(true);

    try {
      const formData = new FormData();
      formData.append("file", file);
      if (target.employerId) formData.append("employerId", target.employerId);

      const res = await fetch("/api/ai/job-extract", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const err = await res.json();
        toast.error(err.error ?? t("toastExtractFailed"));
        return;
      }

      const data = await res.json();
      setExtractedJobs(data.jobs);
      setEdits({});
      setCompanyName(data.companyName ?? "");
      setFileName(file.name);
      if (data.draftId) setDraftId(data.draftId);
      // Select all jobs by default
      setSelectedJobs(new Set(data.jobs.map((_: ExtractedJob, i: number) => i)));
      setReviewBatch((b) => b + 1);
      toast.success(t("toastExtracted", { count: data.totalJobs }));
    } catch {
      toast.error(t("toastProcessFailed"));
    } finally {
      setExtracting(false);
    }
  };

  const toggleJobSelection = (index: number) => {
    setSelectedJobs((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  const editInForm = (index: number) => {
    try {
      // Carry the ExtractionDraft id + index in the same payload so JobFormWizard
      // can forward them to POST /api/jobs and the draft entry gets stamped.
      // The form opens with the job's AI assistant beside it, so whatever the
      // poster did not say can be added by chatting (client 2026-10-27).
      const prefill = {
        ...reviewJobs[index],
        ...forEmployer,
        ...(draftId ? { extractionDraftId: draftId, extractionDraftIndex: index } : {}),
      };
      sessionStorage.setItem(AI_PREFILL_STORAGE_KEY, JSON.stringify(prefill));
      router.push(target.withEmployer(`${target.jobsHref}/new?mode=manual&prefill=ai`));
    } catch {
      toast.error(t("toastFormFailed"));
    }
  };

  /**
   * Saves the checked jobs as drafts. Quick Post and publishing several jobs
   * at once are gone (client 2026-10-27): each draft is published from its
   * own page once it has been reviewed.
   */
  const saveSelectedAsDrafts = async () => {
    const selectedIndices = Array.from(selectedJobs).filter((i) => isReadyToSave(reviewJobs[i] ?? {})).sort((a, b) => a - b);
    if (selectedIndices.length === 0) {
      toast.error(t("toastSelectOne"));
      return;
    }

    setBulkPosting(true);
    let successCount = 0;
    let failCount = 0;

    for (const index of selectedIndices) {
      if (postingStatuses.get(index) === "posted") continue;

      setPostingStatuses((prev) => new Map(prev).set(index, "posting"));

      try {
        const payload = {
          ...reviewJobs[index],
          ...forEmployer,
          status: "draft",
          // Write-back hooks: tell /api/jobs which extraction draft entry to
          // stamp as done + record the new jobId.
          ...(draftId ? { extractionDraftId: draftId, extractionDraftIndex: index } : {}),
        };

        const res = await csrfFetch("/api/jobs", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

        if (res.ok) {
          setPostingStatuses((prev) => new Map(prev).set(index, "posted"));
          successCount++;
        } else {
          setPostingStatuses((prev) => new Map(prev).set(index, "error"));
          failCount++;
        }
      } catch {
        setPostingStatuses((prev) => new Map(prev).set(index, "error"));
        failCount++;
      }
    }

    setBulkPosting(false);

    if (successCount > 0) {
      toast.success(t("toastSavedDrafts", { count: successCount }));
    }
    if (failCount > 0) {
      toast.error(t("toastDraftsFailed", { count: failCount }));
    }
  };

  /** Drops one job and shifts every per-index record after it down by one. */
  const removeJob = (index: number) => {
    const shift = <V,>(entries: Iterable<[number, V]>): Array<[number, V]> => {
      const out: Array<[number, V]> = [];
      for (const [i, v] of entries) {
        if (i < index) out.push([i, v]);
        else if (i > index) out.push([i - 1, v]);
      }
      return out;
    };
    setExtractedJobs((prev) => prev.filter((_, i) => i !== index));
    setSelectedJobs((prev) => new Set(shift(Array.from(prev, (i) => [i, true] as [number, boolean])).map(([i]) => i)));
    setPostingStatuses((prev) => new Map(shift(prev.entries())));
    setEdits((prev) => Object.fromEntries(shift(Object.entries(prev).map(([k, v]) => [Number(k), v] as [number, Partial<JobFormValues>]))));
  };

  const postedCount = Array.from(postingStatuses.values()).filter((s) => s === "posted").length;
  const allPosted = postedCount === extractedJobs.length && extractedJobs.length > 0;

  return (
    <div className="page-container">
      <WorkspaceHeader
        title={t("title")}
        context={t("description")}
      />

      {/* Upload Section */}
      <section className="overflow-hidden rounded-3xl border border-border/70 bg-gradient-to-br from-background via-background to-primary/5 shadow-sm panel-body">
        <div className="flex items-center gap-2 text-sm font-medium text-primary">
          <Sparkles className="h-4 w-4" />
          {t("uploadTitle")}
        </div>
        <p className="mt-2 text-sm text-muted-foreground">
          {t("uploadDesc")}
        </p>

        <div className="mt-5 grid gap-5 lg:grid-cols-2">
          {/* Drop zone */}
          <div
            className={cn(
              "relative flex flex-col items-center justify-center rounded-2xl border-2 border-dashed p-8 transition-colors cursor-pointer min-h-[240px]",
              dragActive
                ? "border-primary bg-primary/5"
                : file
                  ? "border-green-400 bg-green-50/50"
                  : "border-border hover:border-primary/50 hover:bg-muted/30"
            )}
            onClick={() => fileInputRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
            onDragLeave={() => setDragActive(false)}
            onDrop={handleDrop}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,application/pdf,.docx"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFile(f);
                e.target.value = "";
              }}
            />

            {file ? (
              <div className="text-center space-y-3">
                {preview ? (
                  <img
                    src={preview}
                    alt="Preview"
                    className="mx-auto max-h-32 rounded-xl object-contain shadow-sm"
                  />
                ) : (
                  <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-green-100 text-green-600">
                    <FileText className="h-7 w-7" />
                  </div>
                )}
                <div>
                  <p className="text-sm font-medium text-foreground">{file.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {t("fileSize", { size: (file.size / 1024 / 1024).toFixed(1) })}
                  </p>
                </div>
              </div>
            ) : (
              <div className="text-center space-y-3">
                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-muted/50 text-muted-foreground">
                  <Upload className="h-7 w-7" />
                </div>
                <div>
                  <p className="text-sm font-medium text-foreground">
                    {t("dropZone")}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {t("dropHint")}
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Info & Extract Button */}
          <div className="flex flex-col justify-between space-y-3 sm:space-y-4">
            <div className="space-y-3">
              <div className="rounded-2xl border border-border/70 bg-background/85 space-y-3 card-pad">
                <h3 className="heading-label font-semibold text-foreground">{t("supports")}</h3>
                <ul className="space-y-2 text-xs text-muted-foreground">
                  <li className="flex items-start gap-2">
                    <FileImage className="mt-0.5 h-3.5 w-3.5 text-primary flex-shrink-0" />
                    {t("support1")}
                  </li>
                  <li className="flex items-start gap-2">
                    <FileText className="mt-0.5 h-3.5 w-3.5 text-primary flex-shrink-0" />
                    {t("support2")}
                  </li>
                  <li className="flex items-start gap-2">
                    <Users className="mt-0.5 h-3.5 w-3.5 text-primary flex-shrink-0" />
                    {t("support3")}
                  </li>
                  <li className="flex items-start gap-2">
                    <Sparkles className="mt-0.5 h-3.5 w-3.5 text-primary flex-shrink-0" />
                    {t("support4")}
                  </li>
                </ul>
              </div>
            </div>

            <Button
              onClick={handleExtract}
              disabled={!file || extracting}
              className="w-full h-12 rounded-xl bg-primary text-white text-sm font-semibold shadow-sm"
              size="lg"
            >
              {extracting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {t("extracting")}
                </>
              ) : (
                <>
                  <Sparkles className="mr-2 h-4 w-4" />
                  {t("extract")}
                </>
              )}
            </Button>
          </div>
        </div>
      </section>

      {/* Extracted Jobs */}
      {extractedJobs.length > 0 && (
        <section className="space-y-3 sm:space-y-4">
          <div>
            <h2 className="heading-section font-semibold text-foreground">
              {t("extractedJobs", { count: extractedJobs.length })}
            </h2>
            <p className="text-sm text-muted-foreground">
              {companyName && <span className="font-medium">{companyName}</span>}
              {companyName && " • "}
              {t("reviewAndSave")}
            </p>
          </div>

          <BulkJobReview
            key={reviewBatch}
            jobs={reviewJobs}
            selected={selectedJobs}
            statuses={Object.fromEntries(
              Array.from(postingStatuses, ([i, s]) => [i, s === "posted" ? "saved" : s === "posting" ? "saving" : s === "error" ? "error" : "idle"] as const)
            )}
            saving={bulkPosting}
            onToggle={toggleJobSelection}
            onToggleAll={() => {
              const pending = reviewJobs.map((_, i) => i).filter((i) => postingStatuses.get(i) !== "posted" && isReadyToSave(reviewJobs[i]));
              const all = pending.every((i) => selectedJobs.has(i));
              setSelectedJobs(all ? new Set() : new Set(pending));
            }}
            onChange={(index, next) => setEdits((prev) => ({ ...prev, [index]: next }))}
            onRemove={removeJob}
            onSaveSelected={saveSelectedAsDrafts}
            onOpenInForm={editInForm}
          />

          {/* Navigate to jobs list after all posted */}
          {allPosted && (
            <div className="flex justify-center pt-4">
              <Button
                onClick={() => router.push(target.jobsHref)}
                className="gap-2"
              >
                {t("viewAllJobs")}
                <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
