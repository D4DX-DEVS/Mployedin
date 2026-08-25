"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  Upload, FileImage, Loader2, Sparkles, Check, X,
  Briefcase, MapPin, DollarSign, Users, ArrowRight,
  Trash2, Edit, Send, FileText, AlertCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/shared/PageHeader";
import { cn } from "@/lib/utils";
import type { JobFormValues } from "@/components/features/employer/job-form/jobFormSchema";
import { formatCount } from "@/lib/ui/intlFormat";

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
  const { locale } = useParams<{ locale: string }>();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const searchParams = useSearchParams();

  // ── Hydration sources (ordered by priority) ─────────────────────────────
  // 1. ?draft=<id> query — coming from the dashboard "Continue extraction"
  //    card; needs an async fetch from /api/ai/job-extract/drafts/[id].
  // 2. sessionStorage snapshot — survives Back / F5 within the same tab,
  //    mirroring the working `ai-create` page pattern (see repo memory).
  // 3. Empty — fresh upload.
  const draftIdFromUrl = searchParams?.get("draft") ?? null;
  const sessionSnapshot = readSessionSnapshot();

  const [dragActive, setDragActive] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [extracting, setExtracting] = useState(false);
  const [restoringDraft, setRestoringDraft] = useState(Boolean(draftIdFromUrl));
  const [draftId, setDraftId] = useState<string | null>(
    draftIdFromUrl ?? sessionSnapshot?.draftId ?? null
  );
  const [fileName, setFileName] = useState<string | null>(
    sessionSnapshot?.fileName ?? null
  );
  const [extractedJobs, setExtractedJobs] = useState<ExtractedJob[]>(
    sessionSnapshot?.jobs ?? []
  );
  const [companyName, setCompanyName] = useState<string>(
    sessionSnapshot?.companyName ?? ""
  );
  const [selectedJobs, setSelectedJobs] = useState<Set<number>>(
    new Set(sessionSnapshot?.selectedIndices ?? [])
  );
  const [postingStatuses, setPostingStatuses] = useState<Map<number, PostingStatus>>(
    new Map(Object.entries(sessionSnapshot?.postingStatuses ?? {}).map(
      ([k, v]) => [Number(k), v as PostingStatus]
    ))
  );
  const [bulkPosting, setBulkPosting] = useState(false);

  // ── Cross-session resume: fetch the draft when arriving via ?draft=<id> ──
  // Covers Scenario 1 & 2 (closed tab / new day). The sessionSnapshot only
  // handles within-tab Back/refresh; the API fetch handles across-session.
  useEffect(() => {
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
        setCompanyName(draft.companyName ?? "");
        setFileName(draft.fileName);
        setDraftId(draftIdFromUrl);
        setPostingStatuses(statuses);
        setSelectedJobs(new Set(draft.selectedIndices ?? jobs.map((_, i) => i)));
      } catch {
        if (!cancelled) toast.error(t("toastDraftUnavailable"));
      } finally {
        if (!cancelled) setRestoringDraft(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftIdFromUrl]);

  // ── Persist snapshot to sessionStorage on every change (Tier 1) ──────────
  // Same shape + clear-on-consume contract as `ai-create`'s chat session.
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (extractedJobs.length === 0) return; // never clobber with the empty state
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
  }, [extractedJobs, companyName, selectedJobs, postingStatuses, draftId, fileName]);

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
      setCompanyName(data.companyName ?? "");
      setFileName(file.name);
      if (data.draftId) setDraftId(data.draftId);
      // Select all jobs by default
      setSelectedJobs(new Set(data.jobs.map((_: ExtractedJob, i: number) => i)));
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

  const editInForm = (job: ExtractedJob, index: number) => {
    try {
      // Carry the ExtractionDraft id + index in the same payload so JobFormWizard
      // can forward them to POST /api/jobs and the draft entry gets stamped.
      const prefill = {
        ...buildPrefill(job),
        ...(draftId ? { extractionDraftId: draftId, extractionDraftIndex: index } : {}),
      };
      sessionStorage.setItem(AI_PREFILL_STORAGE_KEY, JSON.stringify(prefill));
      router.push(`/${locale}/employer/jobs/new?mode=manual&prefill=ai`);
    } catch {
      toast.error(t("toastFormFailed"));
    }
  };

  const postSingleJob = async (index: number) => {
    const job = extractedJobs[index];
    setPostingStatuses((prev) => new Map(prev).set(index, "posting"));

    try {
      const payload = {
        ...buildPrefill(job),
        status: "active",
        // Write-back hooks: tell /api/jobs which extraction draft entry to
        // stamp as "posted" + record the new jobId.
        ...(draftId ? { extractionDraftId: draftId, extractionDraftIndex: index } : {}),
      };

      const res = await fetch("/api/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        setPostingStatuses((prev) => new Map(prev).set(index, "posted"));
      } else {
        const err = await res.json();
        toast.error(t("toastSinglePostFailed", { title: job.title, error: err.error ?? t("unknownError") }));
        setPostingStatuses((prev) => new Map(prev).set(index, "error"));
      }
    } catch {
      setPostingStatuses((prev) => new Map(prev).set(index, "error"));
    }
  };

  const handleBulkPost = async () => {
    const selectedIndices = Array.from(selectedJobs);
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
        const job = extractedJobs[index];
        const payload = {
          ...buildPrefill(job),
          status: "active",
          ...(draftId ? { extractionDraftId: draftId, extractionDraftIndex: index } : {}),
        };

        const res = await fetch("/api/jobs", {
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
      toast.success(t("toastPosted", { count: successCount }));
    }
    if (failCount > 0) {
      toast.error(t("toastPostFailed", { count: failCount }));
    }
  };

  const removeJob = (index: number) => {
    setExtractedJobs((prev) => prev.filter((_, i) => i !== index));
    setSelectedJobs((prev) => {
      const next = new Set<number>();
      for (const i of prev) {
        if (i < index) next.add(i);
        else if (i > index) next.add(i - 1);
      }
      return next;
    });
  };

  const postedCount = Array.from(postingStatuses.values()).filter((s) => s === "posted").length;
  const allPosted = postedCount === extractedJobs.length && extractedJobs.length > 0;

  return (
    <div className="page-container">
      <PageHeader
        title={t("title")}
        description={t("description")}
      />

      {/* Upload Section */}
      <section className="overflow-hidden rounded-[28px] border border-border/70 bg-gradient-to-br from-background via-background to-primary/5 p-6 shadow-sm">
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
              <div className="rounded-2xl border border-border/70 bg-background/85 p-4 space-y-3">
                <h3 className="text-sm font-semibold text-foreground">{t("supports")}</h3>
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
          {/* Header with bulk actions */}
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <h2 className="text-lg font-semibold text-foreground">
                {t("extractedJobs", { count: extractedJobs.length })}
              </h2>
              <p className="text-sm text-muted-foreground">
                {companyName && <span className="font-medium">{companyName}</span>}
                {companyName && " • "}
                {t("reviewAndPost")}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  if (selectedJobs.size === extractedJobs.length) {
                    setSelectedJobs(new Set());
                  } else {
                    setSelectedJobs(new Set(extractedJobs.map((_, i) => i)));
                  }
                }}
              >
                {selectedJobs.size === extractedJobs.length ? t("deselectAll") : t("selectAll")}
              </Button>
              <Button
                onClick={handleBulkPost}
                disabled={selectedJobs.size === 0 || bulkPosting || allPosted}
                className="gap-2"
              >
                {bulkPosting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    {t("posting")}
                  </>
                ) : allPosted ? (
                  <>
                    <Check className="h-4 w-4" />
                    {t("allPosted")}
                  </>
                ) : (
                  <>
                    <Send className="h-4 w-4" />
                    {t("postSelected", { count: selectedJobs.size })}
                  </>
                )}
              </Button>
            </div>
          </div>

          {/* Job Cards */}
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {extractedJobs.map((job, index) => {
              const status = postingStatuses.get(index) ?? "idle";
              const isSelected = selectedJobs.has(index);

              return (
                <div
                  key={index}
                  className={cn(
                    "relative rounded-2xl border p-5 transition-all",
                    status === "posted"
                      ? "border-green-300 bg-green-50/50"
                      : status === "error"
                        ? "border-destructive/30 bg-destructive/5"
                        : isSelected
                          ? "border-primary/40 bg-primary/[0.02] shadow-sm"
                          : "border-border/70 bg-background hover:border-border"
                  )}
                >
                  {/* Selection checkbox */}
                  {status !== "posted" && (
                    <button
                      type="button"
                      onClick={() => toggleJobSelection(index)}
                      className={cn(
                        "absolute top-3 left-3 h-5 w-5 rounded-md border-2 flex items-center justify-center transition-colors",
                        isSelected
                          ? "border-primary bg-primary text-white"
                          : "border-border hover:border-primary"
                      )}
                    >
                      {isSelected && <Check className="h-3 w-3" />}
                    </button>
                  )}

                  {/* Status badge */}
                  {status === "posted" && (
                    <div className="absolute top-3 right-3 flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-medium text-green-700">
                      <Check className="h-3 w-3" />
                      {t("posted")}
                    </div>
                  )}
                  {status === "posting" && (
                    <div className="absolute top-3 right-3">
                      <Loader2 className="h-4 w-4 animate-spin text-primary" />
                    </div>
                  )}
                  {status === "error" && (
                    <div className="absolute top-3 right-3 flex items-center gap-1 rounded-full bg-destructive/10 px-2 py-0.5 text-[10px] font-medium text-destructive">
                      <AlertCircle className="h-3 w-3" />
                      {t("failed")}
                    </div>
                  )}

                  <div className="ml-7 space-y-3">
                    {/* Title */}
                    <div>
                      <h3 className="text-sm font-semibold text-foreground line-clamp-2">
                        {job.title}
                      </h3>
                      {job.category && (
                        <span className="mt-1 inline-block rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">
                          {job.category}
                        </span>
                      )}
                    </div>

                    {/* Details */}
                    <div className="space-y-1.5 text-xs text-muted-foreground">
                      {(job.location?.city || job.location?.country) && (
                        <div className="flex items-center gap-1.5">
                          <MapPin className="h-3 w-3 flex-shrink-0" />
                          <span>
                            {[job.location.city, job.location.country].filter(Boolean).join(", ")}
                            {job.location.isRemote && t("remoteSuffix")}
                          </span>
                        </div>
                      )}
                      {((job.salary?.min ?? 0) > 0 || (job.salary?.max ?? 0) > 0) && (
                        <div className="flex items-center gap-1.5">
                          <DollarSign className="h-3 w-3 flex-shrink-0" />
                          <span>
                            {job.salary?.currency ?? "USD"} {formatCount(job.salary?.min)}–{formatCount(job.salary?.max)}/{job.salary?.period ?? "mo"}
                          </span>
                        </div>
                      )}
                      {(job.vacancies ?? 0) > 1 && (
                        <div className="flex items-center gap-1.5">
                          <Users className="h-3 w-3 flex-shrink-0" />
                          <span>{t("openingsCount", { count: job.vacancies ?? 0 })}</span>
                        </div>
                      )}
                      {job.employmentType && (
                        <div className="flex items-center gap-1.5">
                          <Briefcase className="h-3 w-3 flex-shrink-0" />
                          <span className="capitalize">{job.employmentType.replace("_", "-")}</span>
                          {job.workMode && <span> • {job.workMode}</span>}
                        </div>
                      )}
                    </div>

                    {/* Skills */}
                    {job.requirements?.skills && job.requirements.skills.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {job.requirements.skills.slice(0, 5).map((skill) => (
                          <span
                            key={skill}
                            className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary"
                          >
                            {skill}
                          </span>
                        ))}
                        {job.requirements.skills.length > 5 && (
                          <span className="text-[10px] text-muted-foreground">
                            +{job.requirements.skills.length - 5}
                          </span>
                        )}
                      </div>
                    )}

                    {/* Actions */}
                    {status !== "posted" && (
                      <div className="flex items-center gap-2 pt-2 border-t border-border/50">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 text-xs gap-1"
                          onClick={() => editInForm(job, index)}
                        >
                          <Edit className="h-3 w-3" />
                          {t("editAndPost")}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 text-xs gap-1"
                          onClick={() => postSingleJob(index)}
                          disabled={status === "posting"}
                        >
                          {status === "posting" ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <ArrowRight className="h-3 w-3" />
                          )}
                          {t("quickPost")}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 text-xs gap-1 text-destructive hover:text-destructive ml-auto"
                          onClick={() => removeJob(index)}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Navigate to jobs list after all posted */}
          {allPosted && (
            <div className="flex justify-center pt-4">
              <Button
                onClick={() => router.push(`/${locale}/employer/jobs`)}
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
