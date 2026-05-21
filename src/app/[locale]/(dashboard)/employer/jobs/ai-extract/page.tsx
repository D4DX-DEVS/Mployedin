"use client";

import { useState, useRef, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
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
  const router = useRouter();
  const { locale } = useParams<{ locale: string }>();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [dragActive, setDragActive] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [extracting, setExtracting] = useState(false);
  const [extractedJobs, setExtractedJobs] = useState<ExtractedJob[]>([]);
  const [companyName, setCompanyName] = useState("");
  const [selectedJobs, setSelectedJobs] = useState<Set<number>>(new Set());
  const [postingStatuses, setPostingStatuses] = useState<Map<number, PostingStatus>>(new Map());
  const [bulkPosting, setBulkPosting] = useState(false);

  const handleFile = useCallback((f: File) => {
    const allowedTypes = [
      "application/pdf",
      "image/jpeg",
      "image/png",
      "image/webp",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ];
    if (!allowedTypes.includes(f.type)) {
      toast.error("Invalid file type. Please upload a PDF, image, or DOCX file.");
      return;
    }
    if (f.size > 10 * 1024 * 1024) {
      toast.error("File too large. Maximum 10MB.");
      return;
    }
    setFile(f);
    setExtractedJobs([]);
    setSelectedJobs(new Set());
    setPostingStatuses(new Map());

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
        toast.error(err.error ?? "Failed to extract job details");
        return;
      }

      const data = await res.json();
      setExtractedJobs(data.jobs);
      setCompanyName(data.companyName ?? "");
      // Select all jobs by default
      setSelectedJobs(new Set(data.jobs.map((_: ExtractedJob, i: number) => i)));
      toast.success(`Extracted ${data.totalJobs} job${data.totalJobs > 1 ? "s" : ""} from the document!`);
    } catch {
      toast.error("Failed to process the file. Please try again.");
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

  const editInForm = (job: ExtractedJob) => {
    try {
      sessionStorage.setItem(AI_PREFILL_STORAGE_KEY, JSON.stringify(buildPrefill(job)));
      router.push(`/${locale}/employer/jobs/new?mode=manual&prefill=ai`);
    } catch {
      toast.error("Failed to open job form");
    }
  };

  const postSingleJob = async (index: number) => {
    const job = extractedJobs[index];
    setPostingStatuses((prev) => new Map(prev).set(index, "posting"));

    try {
      const payload = {
        ...buildPrefill(job),
        status: "active",
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
        toast.error(`Failed to post "${job.title}": ${err.error ?? "Unknown error"}`);
        setPostingStatuses((prev) => new Map(prev).set(index, "error"));
      }
    } catch {
      setPostingStatuses((prev) => new Map(prev).set(index, "error"));
    }
  };

  const handleBulkPost = async () => {
    const selectedIndices = Array.from(selectedJobs);
    if (selectedIndices.length === 0) {
      toast.error("Please select at least one job to post");
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
      toast.success(`Successfully posted ${successCount} job${successCount > 1 ? "s" : ""}!`);
    }
    if (failCount > 0) {
      toast.error(`${failCount} job${failCount > 1 ? "s" : ""} failed to post.`);
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
    <div className="page-container space-y-6">
      <PageHeader
        title="AI Job Extractor"
        description="Upload a job poster, flyer, or PDF — AI will extract all job details and let you post them instantly"
      />

      {/* Upload Section */}
      <section className="overflow-hidden rounded-[28px] border border-border/70 bg-gradient-to-br from-background via-background to-primary/5 p-6 shadow-sm">
        <div className="flex items-center gap-2 text-sm font-medium text-primary">
          <Sparkles className="h-4 w-4" />
          Upload &amp; Extract
        </div>
        <p className="mt-2 text-sm text-muted-foreground">
          Upload an image or PDF of a job poster. AI will read it and extract all job positions — even if there are multiple vacancies on one poster.
        </p>

        <div className="mt-5 grid gap-5 lg:grid-cols-2">
          {/* Drop zone */}
          <div
            className={cn(
              "relative flex flex-col items-center justify-center rounded-2xl border-2 border-dashed p-8 transition-colors cursor-pointer min-h-[240px]",
              dragActive
                ? "border-primary bg-primary/5"
                : file
                  ? "border-green-400 bg-green-50/50 dark:bg-green-950/10"
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
                  <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-green-100 text-green-600 dark:bg-green-900/30">
                    <FileText className="h-7 w-7" />
                  </div>
                )}
                <div>
                  <p className="text-sm font-medium text-foreground">{file.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {(file.size / 1024 / 1024).toFixed(1)} MB • Click to change
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
                    Drop your job poster here
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    PDF, JPEG, PNG, WebP, or DOCX • Max 10MB
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Info & Extract Button */}
          <div className="flex flex-col justify-between space-y-4">
            <div className="space-y-3">
              <div className="rounded-2xl border border-border/70 bg-background/85 p-4 space-y-3">
                <h3 className="text-sm font-semibold text-foreground">What it supports:</h3>
                <ul className="space-y-2 text-xs text-muted-foreground">
                  <li className="flex items-start gap-2">
                    <FileImage className="mt-0.5 h-3.5 w-3.5 text-primary flex-shrink-0" />
                    Job poster images (photos of printed flyers, social media posts)
                  </li>
                  <li className="flex items-start gap-2">
                    <FileText className="mt-0.5 h-3.5 w-3.5 text-primary flex-shrink-0" />
                    PDF documents with job listings or vacancy announcements
                  </li>
                  <li className="flex items-start gap-2">
                    <Users className="mt-0.5 h-3.5 w-3.5 text-primary flex-shrink-0" />
                    Multi-position posters — extracts all jobs at once
                  </li>
                  <li className="flex items-start gap-2">
                    <Sparkles className="mt-0.5 h-3.5 w-3.5 text-primary flex-shrink-0" />
                    Any language — AI detects and translates automatically
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
                  Extracting jobs...
                </>
              ) : (
                <>
                  <Sparkles className="mr-2 h-4 w-4" />
                  Extract Job Details
                </>
              )}
            </Button>
          </div>
        </div>
      </section>

      {/* Extracted Jobs */}
      {extractedJobs.length > 0 && (
        <section className="space-y-4">
          {/* Header with bulk actions */}
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <h2 className="text-lg font-semibold text-foreground">
                Extracted Jobs ({extractedJobs.length})
              </h2>
              <p className="text-sm text-muted-foreground">
                {companyName && <span className="font-medium">{companyName}</span>}
                {companyName && " • "}
                Review and post the extracted positions
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
                {selectedJobs.size === extractedJobs.length ? "Deselect All" : "Select All"}
              </Button>
              <Button
                onClick={handleBulkPost}
                disabled={selectedJobs.size === 0 || bulkPosting || allPosted}
                className="gap-2"
              >
                {bulkPosting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Posting...
                  </>
                ) : allPosted ? (
                  <>
                    <Check className="h-4 w-4" />
                    All Posted
                  </>
                ) : (
                  <>
                    <Send className="h-4 w-4" />
                    Post Selected ({selectedJobs.size})
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
                      ? "border-green-300 bg-green-50/50 dark:bg-green-950/10"
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
                      Posted
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
                      Failed
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
                            {job.location.isRemote && " (Remote)"}
                          </span>
                        </div>
                      )}
                      {((job.salary?.min ?? 0) > 0 || (job.salary?.max ?? 0) > 0) && (
                        <div className="flex items-center gap-1.5">
                          <DollarSign className="h-3 w-3 flex-shrink-0" />
                          <span>
                            {job.salary?.currency ?? "USD"} {job.salary?.min?.toLocaleString()}–{job.salary?.max?.toLocaleString()}/{job.salary?.period ?? "mo"}
                          </span>
                        </div>
                      )}
                      {(job.vacancies ?? 0) > 1 && (
                        <div className="flex items-center gap-1.5">
                          <Users className="h-3 w-3 flex-shrink-0" />
                          <span>{job.vacancies} openings</span>
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
                          onClick={() => editInForm(job)}
                        >
                          <Edit className="h-3 w-3" />
                          Edit & Post
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
                          Quick Post
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
                View All Jobs
                <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
