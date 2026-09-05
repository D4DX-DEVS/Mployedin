"use client";

import { Fragment, useState, useRef, useEffect, useCallback } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { WorkspaceHeader } from "@/components/shared/WorkspaceHeader";
import Link from "next/link";
import { Bot, FileText, Globe, Loader2, Mic, Send, Sparkles, Upload, WandSparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useVoiceInput } from "@/hooks/useVoiceInput";
import type { JobFormValues } from "@/components/features/employer/job-form/jobFormSchema";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useTranslations, useLocale } from "next-intl";
import { formatCount } from "@/lib/ui/intlFormat";

function hasMalayalam(text: string): boolean {
  return /[\u0D00-\u0D7F]/.test(text);
}

interface Message {
  role: "user" | "assistant";
  content: string;
}

interface ExtractedRequirements {
  skills?: string[];
  experienceMin?: number;
  experienceMax?: number;
}

interface ExtractedSalary {
  min?: number;
  max?: number;
  currency?: string;
  period?: "monthly" | "yearly" | "lpa";
  isNegotiable?: boolean;
}

interface ExtractedJob {
  title?: string;
  category?: string;
  location?: string | { country?: string; city?: string; isRemote?: boolean };
  description?: string;
  requirements?: string[] | ExtractedRequirements & { preferredSkills?: string[] };
  salary?: ExtractedSalary;
  employmentType?: string;
  workMode?: string;
  responsibilities?: string[];
  qualifications?: string[];
  benefits?: string[];
  vacancies?: number;
  showSalary?: boolean;
  tags?: string[];
  visibility?: string;
}

const AI_PREFILL_STORAGE_KEY = "job-ai-prefill";
const AI_CHAT_STORAGE_KEY = "job-ai-chat-session";

/** Read the persisted AI chat session (conversation + extracted draft). */
function readChatSession(): { messages?: Message[]; extractedJob?: ExtractedJob | null; extractedBulkJobs?: ExtractedJob[] } | null {
  if (typeof window === "undefined") return null;
  try {
    const saved = sessionStorage.getItem(AI_CHAT_STORAGE_KEY);
    return saved ? JSON.parse(saved) : null;
  } catch {
    return null;
  }
}
const VOICE_WAVE_BARS = [0.45, 0.8, 1, 0.65, 0.9, 0.55, 0.75] as const;
const DETECTED_LANGUAGE_LABELS: Record<string, string> = {
  "en-US": "langEnglish",
  "ar-SA": "langArabic",
  "ml-IN": "langMalayalam",
  "hi-IN": "langHindi",
  "ta-IN": "langTamil",
  "te-IN": "langTelugu",
  "ur-PK": "langUrdu",
};

function extractSkills(requirements?: ExtractedJob["requirements"]): string[] {
  if (Array.isArray(requirements)) {
    return requirements.filter(Boolean).slice(0, 12);
  }

  return requirements?.skills?.filter(Boolean).slice(0, 12) ?? [];
}

function normalizeLocation(location?: ExtractedJob["location"]): JobFormValues["location"] {
  if (!location) {
    return { country: "", city: "", isRemote: false };
  }

  if (typeof location === "object") {
    return {
      country: location.country ?? "",
      city: location.city ?? "",
      isRemote: Boolean(location.isRemote),
    };
  }

  const isRemote = /remote/i.test(location);
  const parts = location.split(",").map((part) => part.trim()).filter(Boolean);

  return {
    city: isRemote ? "Remote" : (parts[0] ?? ""),
    country: isRemote ? (parts[1] ?? "Remote / Global") : (parts.slice(1).join(", ") || ""),
    isRemote,
  };
}

function normalizeEmploymentType(val?: string): JobFormValues["employmentType"] | undefined {
  const valid = ["full_time", "part_time", "contract", "internship", "freelance"] as const;
  if (!val) return undefined;
  const normalized = val.toLowerCase().replace(/[- ]/g, "_");
  return valid.includes(normalized as typeof valid[number]) ? normalized as typeof valid[number] : undefined;
}

function normalizeWorkMode(val?: string): JobFormValues["workMode"] | undefined {
  const map: Record<string, JobFormValues["workMode"]> = {
    onsite: "onsite", "on-site": "onsite", "on_site": "onsite", office: "onsite",
    hybrid: "hybrid",
    remote: "remote", wfh: "remote",
  };
  if (!val) return undefined;
  return map[val.toLowerCase()] ?? undefined;
}

function buildPrefill(job: ExtractedJob): Partial<JobFormValues> {
  const requirements = Array.isArray(job.requirements) ? {} : (job.requirements ?? {});
  const preferredSkills = !Array.isArray(job.requirements) ? (job.requirements?.preferredSkills ?? []) : [];

  return {
    title: job.title ?? "",
    category: job.category ?? "",
    description: job.description ?? "",
    location: normalizeLocation(job.location),
    employmentType: normalizeEmploymentType(job.employmentType),
    workMode: normalizeWorkMode(job.workMode),
    requirements: {
      skills: extractSkills(job.requirements),
      preferredSkills: preferredSkills.filter(Boolean).slice(0, 30),
      experienceMin: requirements.experienceMin ?? 0,
      experienceMax: requirements.experienceMax ?? 10,
    },
    responsibilities: job.responsibilities?.filter(Boolean).slice(0, 20) ?? [],
    qualifications: job.qualifications?.filter(Boolean).slice(0, 20) ?? [],
    benefits: job.benefits?.filter(Boolean).slice(0, 20) ?? [],
    salary: {
      min: job.salary?.min ?? 0,
      max: job.salary?.max ?? 0,
      currency: job.salary?.currency ?? "USD",
      period: job.salary?.period ?? "monthly",
      isNegotiable: job.salary?.isNegotiable ?? false,
    },
    showSalary: job.showSalary ?? Boolean((job.salary?.min ?? 0) > 0 || (job.salary?.max ?? 0) > 0),
    vacancies: job.vacancies,
    tags: job.tags?.length ? job.tags.slice(0, 6) : extractSkills(job.requirements).slice(0, 6),
  };
}

function getDetectedLanguageLabel(language: string | null, t: (key: string) => string): string | null {
  if (!language) {
    return null;
  }

  const key = DETECTED_LANGUAGE_LABELS[language];
  return key ? t(`jobCreator.${key}`) : language;
}

const VOICE_LANGUAGES = [
  { code: "auto", labelKey: "langAuto", flag: "🌐" },
  { code: "en", labelKey: "langEnglish", flag: "🇬🇧" },
  { code: "ar", labelKey: "langArabic", flag: "🇸🇦" },
  { code: "ml", labelKey: "langMalayalam", flag: "🇮🇳" },
  { code: "hi", labelKey: "langHindi", flag: "🇮🇳" },
  { code: "ur", labelKey: "langUrdu", flag: "🇵🇰" },
  { code: "ta", labelKey: "langTamil", flag: "🇮🇳" },
  { code: "te", labelKey: "langTelugu", flag: "🇮🇳" },
];

// ─── Markdown renderer ─────────────────────────────────────────
function renderInline(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**"))
      return <strong key={i} className="font-semibold">{part.slice(2, -2)}</strong>;
    if (part.startsWith("*") && part.endsWith("*"))
      return <em key={i}>{part.slice(1, -1)}</em>;
    if (part.startsWith("`") && part.endsWith("`"))
      return <code key={i} className="rounded bg-black/10 px-1 font-mono text-[0.88em]">{part.slice(1, -1)}</code>;
    return part;
  });
}

function renderMarkdown(text: string) {
  const blocks = text.split(/\n{2,}/);
  return blocks.map((block, bi) => {
    const indent = bi > 0 ? "mt-2" : "";
    if (/^\d+\.\s/m.test(block)) {
      const items = block.split(/\n/).filter(Boolean);
      return (
        <ol key={bi} className={`list-decimal list-inside space-y-0.5 ${indent}`}>
          {items.map((item, ii) => (
            <li key={ii}>{renderInline(item.replace(/^\d+\.\s*/, ""))}</li>
          ))}
        </ol>
      );
    }
    if (/^[-•*]\s/m.test(block)) {
      const items = block.split(/\n/).filter(Boolean);
      return (
        <ul key={bi} className={`list-disc list-inside space-y-0.5 ${indent}`}>
          {items.map((item, ii) => (
            <li key={ii}>{renderInline(item.replace(/^[-•*]\s*/, ""))}</li>
          ))}
        </ul>
      );
    }
    const lines = block.split("\n");
    return (
      <p key={bi} className={indent}>
        {lines.map((line, li) => (
          <Fragment key={li}>
            {li > 0 && <br />}
            {renderInline(line)}
          </Fragment>
        ))}
      </p>
    );
  });
}

export default function EmployerAIJobCreatePage() {
  const router = useRouter();
  const { locale } = useParams<{ locale: string }>();
  const searchParams = useSearchParams();
  const t = useTranslations("ai");
  const currentLocale = useLocale();
  const isRtl = currentLocale === "ar";
  // Deterministic initial state (matches SSR HTML); the saved session is
  // restored in an effect below to avoid a hydration mismatch.
  const [messages, setMessages] = useState<Message[]>([
    { role: "assistant", content: t("jobCreator.initialMessage") },
  ]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [extractedJob, setExtractedJob] = useState<ExtractedJob | null>(null);
  const [extractedBulkJobs, setExtractedBulkJobs] = useState<ExtractedJob[]>([]);
  const [creatingBulk, setCreatingBulk] = useState(false);
  const [bulkProgress, setBulkProgress] = useState<{ created: number; total: number; errors: string[] } | null>(null);
  const [voiceLanguage, setVoiceLanguage] = useState("auto");
  const [showLangPicker, setShowLangPicker] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  // Server-side ConversationThread id (resumable across tab close / logout /
  // next day). null until the first assistant reply persists a thread.
  const [threadId, setThreadId] = useState<string | null>(null);
  const [restoringThread, setRestoringThread] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const autoResize = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, []);

  const {
    state: voiceState,
    startRecording,
    cancelRecording,
    submitRecording,
    isRecording,
    isProcessing: isVoiceProcessing,
    durationMs,
    durationLabel,
    detectedLanguage,
    clearTranscript,
    error: voiceError,
  } = useVoiceInput({
    language: voiceLanguage,
    mode: "explicitSend",
    maxDurationMs: 60000,
    onTranscript: (text) => {
      setInput((current) => current ? `${current} ${text}` : text);
      requestAnimationFrame(() => autoResize());
    },
  });

  const detectedLanguageLabel = getDetectedLanguageLabel(detectedLanguage, t);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Restore the persisted session after mount (client-only; sessionStorage
  // can't be read during SSR without causing a hydration mismatch).
  useEffect(() => {
    const saved = readChatSession();
    if (!saved) return;
    if (saved.messages && saved.messages.length > 0) setMessages(saved.messages);
    if (saved.extractedJob) setExtractedJob(saved.extractedJob);
    if (saved.extractedBulkJobs && saved.extractedBulkJobs.length > 0) setExtractedBulkJobs(saved.extractedBulkJobs);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist the conversation + draft so an accidental remount or navigation
  // (back from the form, tab switch, dev Fast Refresh) doesn't discard the
  // AI-generated draft. Cleared once the draft is carried into the job form.
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (messages.length <= 1 && !extractedJob && extractedBulkJobs.length === 0) return;
    try {
      sessionStorage.setItem(
        AI_CHAT_STORAGE_KEY,
        JSON.stringify({ messages, extractedJob, extractedBulkJobs }),
      );
    } catch {
      /* quota / serialization — non-critical */
    }
  }, [messages, extractedJob, extractedBulkJobs]);

  // ── Cross-session resume (Scenario: close tab / next day / logout) ──────
  // ?resume=<threadId> on the URL → fetch the persisted ConversationThread
  // and rehydrate messages + extracted job. Tier-3 persistence, mirrors the
  // ai-extract ?draft=<id> pattern.
  const resumeId = searchParams?.get("resume") ?? null;
  useEffect(() => {
    if (!resumeId) return;
    let cancelled = false;
    (async () => {
      setRestoringThread(true);
      try {
        const res = await fetch(`/api/ai/chat/drafts/${resumeId}`, { cache: "no-store" });
        if (!res.ok) {
          if (!cancelled) toast.error(t("jobCreator.toastThreadUnavailable"));
          return;
        }
        const { thread } = (await res.json()) as {
          thread: {
            messages: Array<{ role: "user" | "assistant" | "system"; content: string }>;
            meta?: { extractedJob?: ExtractedJob | null; extractedBulkJobs?: ExtractedJob[] };
          };
        };
        if (cancelled || !thread.messages?.length) return;
        // Filter out "system" role messages — the chat UI Message type only
        // supports "user" | "assistant"; system messages are transient and not
        // rendered, so dropping them on restore is safe.
        setMessages(thread.messages.filter((m) => m.role !== "system") as never);
        setThreadId(resumeId);
        if (thread.meta?.extractedJob) setExtractedJob(thread.meta.extractedJob);
        if (thread.meta?.extractedBulkJobs) setExtractedBulkJobs(thread.meta.extractedBulkJobs);
      } catch {
        if (!cancelled) toast.error(t("jobCreator.toastThreadUnavailable"));
      } finally {
        if (!cancelled) setRestoringThread(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resumeId]);

  // ── Server-persist after each completed assistant reply ────────────────
  // Fires whenever messages change AND the last message is an assistant turn
  // (i.e. the AI just finished responding). One upsert per completed reply —
  // NOT per token, NOT on user keystroke. Mirrors ChatGPT's save cadence.
  useEffect(() => {
    if (restoringThread) return; // don't race with the resume fetch
    if (messages.length <= 1) return; // skip the initial greeting
    const last = messages[messages.length - 1];
    if (last?.role !== "assistant") return;
    // Skip the placeholder empty assistant bubble during streaming.
    if (!last.content || !last.content.trim()) return;

    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/ai/chat/drafts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...(threadId ? { threadId } : {}),
            messages: messages.map((m) => ({ role: m.role, content: m.content })),
            ...(extractedJob ? { extractedJob } : {}),
            ...(extractedBulkJobs.length > 0 ? { extractedBulkJobs } : {}),
          }),
        });
        if (!res.ok) return;
        const data = (await res.json()) as { threadId: string };
        if (!cancelled && data.threadId && data.threadId !== threadId) {
          setThreadId(data.threadId);
        }
      } catch {
        // Best-effort — a failed persist must not interrupt the chat.
      }
    })();
    return () => { cancelled = true; };
  }, [messages, extractedJob, extractedBulkJobs, threadId, restoringThread]);

  const sendMessage = async () => {
    if (!input.trim() || isStreaming || isRecording || isVoiceProcessing) return;

    const userMsg: Message = { role: "user", content: input.trim() };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    if (textareaRef.current) textareaRef.current.style.height = "auto";
    setIsStreaming(true);

    const allMessages = [...messages, userMsg];
    const assistantMsg: Message = { role: "assistant", content: "" };
    setMessages((prev) => [...prev, assistantMsg]);

    try {
      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: allMessages.map((m) => ({ role: m.role, content: m.content })),
          context: "job_creator",
        }),
      });

      if (!res.ok || !res.body) throw new Error(t("jobCreator.streamError"));

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let accumulated = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        accumulated += chunk;
        setMessages((prev) => {
          const copy = [...prev];
          copy[copy.length - 1] = { ...copy[copy.length - 1], content: accumulated };
          return copy;
        });
      }

      // Try to extract job data — check bulk first
      const bulkMatch = accumulated.match(/<BULK_JOB_DATA>([\s\S]*?)<\/BULK_JOB_DATA>/);
      if (bulkMatch) {
        try {
          const parsed = JSON.parse(bulkMatch[1].trim());
          if (Array.isArray(parsed) && parsed.length > 0) {
            setExtractedBulkJobs(parsed.slice(0, 10));
            setExtractedJob(null);
            toast.success(t("jobCreator.draftReady"));
          }
        } catch { /* ignore parse errors */ }
      } else {
        const jobDataMatch = accumulated.match(/<JOB_DATA>([\s\S]*?)<\/JOB_DATA>/);
        if (jobDataMatch) {
          try {
            const jobData = JSON.parse(jobDataMatch[1].trim());
            setExtractedJob(jobData);
            setExtractedBulkJobs([]);
            toast.success(t("jobCreator.draftReady"));
          } catch { /* ignore parse errors */ }
        }
      }
    } catch {
      setMessages((prev) => {
        const copy = [...prev];
        copy[copy.length - 1] = { ...copy[copy.length - 1], content: t("errorMessage") };
        return copy;
      });
    } finally {
      setIsStreaming(false);
    }
  };

  const reviewInForm = () => {
    if (!extractedJob) return;
    try {
      sessionStorage.setItem(AI_PREFILL_STORAGE_KEY, JSON.stringify(buildPrefill(extractedJob)));
      sessionStorage.removeItem(AI_CHAT_STORAGE_KEY);
      // Mark the server-side thread as inactive so the dashboard card stops
      // surfacing it once the draft has been carried into the job form.
      if (threadId) {
        fetch(`/api/ai/chat/drafts/${threadId}`, { method: "DELETE" }).catch(() => {});
      }
      router.push(`/${locale}/employer/jobs/new?mode=manual&prefill=ai`);
    } catch {
      toast.error(t("jobCreator.failedOpenForm"));
    }
  };

  const createBulkJobDrafts = async () => {
    if (extractedBulkJobs.length === 0) return;
    setCreatingBulk(true);
    setBulkProgress({ created: 0, total: extractedBulkJobs.length, errors: [] });
    const errors: string[] = [];
    let created = 0;

    for (const job of extractedBulkJobs) {
      try {
        const sanitized = buildPrefill(job);
        const res = await fetch("/api/jobs", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...sanitized, status: "draft" }),
        });
        if (res.ok) {
          created++;
        } else {
          const err = await res.json().catch(() => ({}));
          errors.push(`${job.title ?? "Unknown"}: ${(err as { error?: string }).error ?? "Failed"}`);
        }
      } catch {
        errors.push(`${job.title ?? "Unknown"}: Network error`);
      }
      setBulkProgress({ created, total: extractedBulkJobs.length, errors });
    }

    setCreatingBulk(false);
    if (errors.length === 0) {
      toast.success(t("bulkSuccess", { count: created }));
      setExtractedBulkJobs([]);
      setBulkProgress(null);
      setTimeout(() => {
        router.push(`/${locale}/employer/jobs`);
      }, 1500);
    } else {
      toast.error(t("bulkPartial", { created, total: extractedBulkJobs.length, failed: errors.length }));
    }
  };

  // Upload Job Poster — feeds the uploaded file through the same
  // /api/ai/job-extract endpoint used by the standalone ai-extract page, then
  // surfaces the result inside this chat workspace (single job → extractedJob
  // preview; bulk jobs → extractedBulkJobs chooser). Keeps Typing, Voice, and
  // Upload as one unified input workspace.
  const handleUploadPoster = async (file: File) => {
    const allowedTypes = [
      "application/pdf",
      "image/jpeg",
      "image/png",
      "image/webp",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ];
    if (!allowedTypes.includes(file.type)) {
      toast.error(t("jobCreator.toastInvalidType"));
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error(t("jobCreator.toastTooLarge"));
      return;
    }

    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch("/api/ai/job-extract", { method: "POST", body: formData });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error((err as { error?: string }).error ?? t("jobCreator.toastExtractFailed"));
        return;
      }

      const data = await res.json();
      const jobs: ExtractedJob[] = Array.isArray(data.jobs) ? data.jobs : [];

      if (jobs.length === 0) {
        toast.error(t("jobCreator.toastNoJobs"));
        return;
      }

      // Inject an assistant message so the chat history reflects the upload.
      const summary =
        jobs.length === 1
          ? t("jobCreator.uploadExtractedOne", { title: jobs[0].title ?? t("jobCreator.untitledJob") })
          : t("jobCreator.uploadExtractedMany", { count: jobs.length });
      setMessages((prev) => [...prev, { role: "assistant", content: summary }]);

      if (jobs.length === 1) {
        setExtractedJob(jobs[0]);
        setExtractedBulkJobs([]);
      } else {
        setExtractedBulkJobs(jobs.slice(0, 10));
        setExtractedJob(null);
      }
      toast.success(
        jobs.length === 1
          ? t("jobCreator.draftReady")
          : t("jobCreator.toastExtracted", { count: jobs.length })
      );
    } catch {
      toast.error(t("jobCreator.toastProcessFailed"));
    } finally {
      setIsUploading(false);
      // Reset the hidden input so the same file can be re-uploaded if needed.
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  return (
    <div className="page-container">
      <WorkspaceHeader
        title={t("jobCreator.title")}
        context={t("jobCreator.description")}
        actions={
          <Link
            href={`/${locale}/employer/jobs/new?mode=manual`}
            aria-label={t("jobCreator.manualJobForm")}
            className="inline-flex items-center gap-2 rounded-xl border border-border bg-background/80 px-3 text-sm font-semibold text-foreground transition hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 sm:px-4"
          >
            <FileText className="h-4 w-4" aria-hidden="true" />
            <span className="hidden sm:inline">{t("jobCreator.manualJobForm")}</span>
          </Link>
        }
      />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Chat panel */}
        <div className="md:col-span-2 flex flex-col card-base h-[500px]">
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {messages.map((msg, i) => (
              <div key={i} className={`flex gap-2 ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                {msg.role === "assistant" && (
                  <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <Bot className="h-4 w-4 text-primary" />
                  </div>
                )}
                <div className={cn(
                  "max-w-[85%] rounded-2xl px-3 py-2 text-sm",
                  msg.role === "user"
                    ? "bg-primary text-white rounded-tr-none"
                    : "bg-muted text-foreground rounded-tl-none",
                  hasMalayalam(msg.content) && "font-malayalam"
                )}>
                  {(() => {
                    const hasJobData = /<JOB_DATA>[\s\S]*?<\/JOB_DATA>/.test(msg.content) || /<BULK_JOB_DATA>[\s\S]*?<\/BULK_JOB_DATA>/.test(msg.content);
                    const displayText = msg.content.replace(/<JOB_DATA>[\s\S]*?<\/JOB_DATA>/, "").replace(/<BULK_JOB_DATA>[\s\S]*?<\/BULK_JOB_DATA>/, "").trim();
                    if (msg.role === "assistant") {
                      return (
                        <div className="prose-sm prose-p:my-0 prose-li:my-0">
                          {renderMarkdown(displayText)}
                          {hasJobData && !isStreaming && (
                            <div className="mt-3 flex items-center gap-2 rounded-lg bg-green-50 border border-green-200 text-green-800 text-xs chip-pad">
                              <Sparkles className="h-3.5 w-3.5 flex-shrink-0" />
                              <span className="font-medium">{t("jobCreator.draftReadyPanel")}</span>
                            </div>
                          )}
                          {isStreaming && i === messages.length - 1 && (
                            <span className="inline-block w-1 h-4 ml-0.5 bg-primary animate-pulse" />
                          )}
                        </div>
                      );
                    }
                    return (
                      <>
                        <span className="whitespace-pre-wrap">{displayText}</span>
                        {isStreaming && i === messages.length - 1 && (
                          <span className="inline-block w-1 h-4 ml-0.5 bg-primary animate-pulse" />
                        )}
                      </>
                    );
                  })()}
                </div>
              </div>
            ))}
            <div ref={bottomRef} />
          </div>
          <div className="border-t bg-background/95 p-3 space-y-2">
            <div className="space-y-3">
              <Textarea
                ref={textareaRef}
                aria-label={t("jobCreator.inputPlaceholder")}
                value={input}
                onChange={(e) => {
                  if (detectedLanguage) {
                    clearTranscript();
                  }
                  setInput(e.target.value);
                  autoResize();
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void sendMessage();
                  }
                }}
                placeholder={t("jobCreator.inputPlaceholder")}
                disabled={isStreaming || isRecording || isVoiceProcessing}
                rows={1}
                className="min-h-[4rem] max-h-[200px] flex-1 resize-none rounded-xl border-border/60 bg-muted/20 overflow-y-auto transition-[height] duration-100"
              />
              {voiceState === "recording" ? (
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={cancelRecording}
                    className="rounded-xl border-border/60 px-3 text-muted-foreground hover:text-foreground"
                    aria-label={t("cancelVoiceInput")}
                  >
                    <X className="mr-1.5 h-4 w-4" /> {t("cancel")}
                  </Button>
                  <div
                    role="status"
                    aria-live="polite"
                    aria-atomic="true"
                    className="flex min-w-0 flex-1 items-center gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700"
                  >
                    <span className="relative flex h-2.5 w-2.5 shrink-0" aria-hidden="true">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />
                      <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-red-500" />
                    </span>
                    <div className="flex items-end gap-0.5 h-4" aria-hidden="true">
                      {VOICE_WAVE_BARS.map((height, index) => (
                        <span
                          key={index}
                          className="w-0.5 rounded-full bg-current origin-bottom"
                          style={{
                            height: `${height * 100}%`,
                            animation: "voiceBar 0.8s ease-in-out infinite alternate",
                            animationDelay: `${index * 0.1}s`,
                          }}
                        />
                      ))}
                    </div>
                    <div className="min-w-0">
                      <p className="font-medium leading-none">{t("listening")}</p>
                      <p className="mt-1 text-xs text-red-700/80">{t("jobCreator.tapSendWhenReady")}</p>
                    </div>
                    <span
                      className="ml-auto font-mono text-sm tabular-nums"
                      aria-label={`Recording length ${Math.max(1, Math.floor(durationMs / 1000))} seconds`}
                    >
                      {durationLabel}
                    </span>
                  </div>
                  <Button
                    type="button"
                    onClick={submitRecording}
                    className="rounded-xl px-4"
                    aria-label={t("sendVoiceInput")}
                  >
                    <Send className="mr-1.5 h-4 w-4" /> {t("send")}
                  </Button>
                </div>
              ) : voiceState === "processing" ? (
                <div
                  role="status"
                  aria-live="polite"
                  aria-atomic="true"
                  className="flex items-center justify-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700"
                >
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span className="font-medium">{t("processingVoice")}</span>
                </div>
              ) : (
                <div className="flex items-center justify-end gap-2">
                  {/* Voice language picker */}
                  <div className="relative">
                    <button
                      onClick={() => setShowLangPicker((v) => !v)}
                      disabled={isRecording || isVoiceProcessing}
                      className="flex items-center gap-0.5 text-[11px] text-muted-foreground hover:text-foreground transition-colors px-1.5 py-1 rounded hover:bg-muted disabled:opacity-40"
                      title={t("voiceLanguage")}
                    >
                      <Globe className="h-3 w-3" />
                      <span>{(VOICE_LANGUAGES.find((l) => l.code === voiceLanguage) ?? VOICE_LANGUAGES[0]).flag} {voiceLanguage.toUpperCase()}</span>
                    </button>
                    {showLangPicker && (
                      <div className="absolute bottom-full right-0 mb-1 z-50 w-36 rounded-xl border border-border bg-popover shadow-lg overflow-hidden">
                        {VOICE_LANGUAGES.map((lang) => (
                          <button
                            key={lang.code}
                            onClick={() => { setVoiceLanguage(lang.code); setShowLangPicker(false); }}
                            className={cn(
                              "w-full flex items-center gap-2 px-3 py-2 text-xs text-left hover:bg-muted transition-colors",
                              lang.code === voiceLanguage && "bg-primary/10 text-primary font-medium"
                            )}
                          >
                            <span>{lang.flag}</span>
                            <span>{t(`jobCreator.${lang.labelKey}`)}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isStreaming || isUploading}
                    className="relative h-10 gap-1.5 rounded-xl border-border/60 px-3 text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary"
                    title={t("jobCreator.uploadJobPosterHint")}
                    aria-label={t("jobCreator.uploadJobPosterHint")}
                  >
                    {isUploading ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <>
                        <Upload className="h-4 w-4" />
                        <Sparkles className="absolute -top-1 -right-1 h-3 w-3 rounded-full bg-primary p-0.5 text-white" />
                        <span className="text-xs font-medium">{t("jobCreator.uploadJobPosterLabel")}</span>
                      </>
                    )}
                  </Button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="application/pdf,image/jpeg,image/png,image/webp,.docx"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) void handleUploadPoster(file);
                    }}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => void startRecording()}
                    disabled={isStreaming}
                    className="h-10 w-10 rounded-xl border-border/60 p-0 text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary"
                    title={t("startVoiceInput")}
                    aria-label={t("startVoiceInput")}
                  >
                    <Mic className="h-4 w-4" />
                  </Button>
                  <button
                    onClick={() => void sendMessage()}
                    disabled={!input.trim() || isStreaming}
                    aria-label={t("sendMessage")}
                    className="btn-primary h-10 w-10 rounded-xl p-0 flex-shrink-0 flex items-center justify-center disabled:opacity-50"
                  >
                    <Send className="h-4 w-4" />
                  </button>
                </div>
              )}
            </div>
            <div className="min-h-5" aria-live="polite" aria-atomic="true">
              {voiceError ? (
                <p role="alert" className="text-xs text-destructive">
                  {voiceError}
                </p>
              ) : voiceState === "idle" && detectedLanguageLabel ? (
                <p className="text-[11px] text-muted-foreground/80">
                  {t("jobCreator.detectedLanguage", { lang: detectedLanguageLabel })}
                </p>
              ) : voiceState === "idle" ? (
                <p className="text-[11px] text-muted-foreground/70 text-center sm:text-left">
                  {t("jobCreator.enterToSend")}
                </p>
              ) : null}
            </div>
          </div>
        </div>

        {/* Extracted job preview */}
        <div className="space-y-3">
          <div className={`card-base space-y-3 transition-all ${extractedJob ? "border-green-300 bg-green-50/30" : ""} panel-body`}>
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              <h2 className="heading-label font-semibold">{t("jobCreator.jobPreview")}</h2>
            </div>
            {!extractedJob && extractedBulkJobs.length === 0 && (
              <div className="space-y-3 text-xs text-muted-foreground">
                <p>{t("jobCreator.aiWillAsk")}</p>
                <div className="grid gap-2">
                  <div className="rounded-xl border border-dashed border-border chip-pad">{t("jobCreator.roleAndTeam")}</div>
                  <div className="rounded-xl border border-dashed border-border chip-pad">{t("jobCreator.locationAndWork")}</div>
                  <div className="rounded-xl border border-dashed border-border chip-pad">{t("jobCreator.keySkills")}</div>
                  <div className="rounded-xl border border-dashed border-border chip-pad">{t("jobCreator.optionalSalary")}</div>
                </div>
              </div>
            )}
            {extractedJob && (
              <div className="space-y-2 text-xs">
                <p><strong>{t("jobCreator.titleLabel")}</strong> {extractedJob.title ?? "—"}</p>
                <p><strong>{t("jobCreator.categoryLabel")}</strong> {extractedJob.category ?? "—"}</p>
                <p><strong>{t("jobCreator.locationLabel")}</strong> {typeof extractedJob.location === "string" ? extractedJob.location : [extractedJob.location?.city, extractedJob.location?.country].filter(Boolean).join(", ") || "—"}</p>
                <p><strong>{t("jobCreator.typeLabel")}</strong> {extractedJob.employmentType ? extractedJob.employmentType.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) : "—"}</p>
                <p><strong>{t("jobCreator.workModeLabel")}</strong> {extractedJob.workMode ? extractedJob.workMode.replace(/\b\w/g, (c) => c.toUpperCase()) : "—"}</p>
                {extractedJob.salary && (extractedJob.salary.min || extractedJob.salary.max) ? (
                  <p><strong>{t("jobCreator.salaryLabel")}</strong> {extractedJob.showSalary === false ? t("jobCreator.notDisclosed") : `${extractedJob.salary.currency ?? "USD"} ${formatCount(extractedJob.salary.min) ?? 0} – ${formatCount(extractedJob.salary.max) ?? 0}`}</p>
                ) : (
                  <p><strong>{t("jobCreator.salaryLabel")}</strong> <span className="text-muted-foreground italic">{t("jobCreator.notSpecified")}</span></p>
                )}
                {extractSkills(extractedJob.requirements).length ? (
                  <div>
                    <strong>{t("jobCreator.requiredSkills")}</strong>
                    <ul className="mt-1 space-y-0.5 list-disc list-inside">
                      {extractSkills(extractedJob.requirements).map((r, i) => (
                        <li key={i} className="text-muted-foreground">{r}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                {extractedJob.responsibilities?.length ? (
                  <div>
                    <strong>{t("jobCreator.responsibilities")}</strong>
                    <ul className="mt-1 space-y-0.5 list-disc list-inside">
                      {extractedJob.responsibilities.slice(0, 5).map((r, i) => (
                        <li key={i} className="text-muted-foreground">{r}</li>
                      ))}
                      {extractedJob.responsibilities.length > 5 && <li className="text-muted-foreground italic">+{extractedJob.responsibilities.length - 5} {t("jobCreator.more", { count: extractedJob.responsibilities.length - 5 }).replace(/^\+\d+\s*/, "")}</li>}
                    </ul>
                  </div>
                ) : null}
                {extractedJob.benefits?.length ? (
                  <div>
                    <strong>{t("jobCreator.benefits")}</strong>
                    <ul className="mt-1 space-y-0.5 list-disc list-inside">
                      {extractedJob.benefits.map((b, i) => (
                        <li key={i} className="text-muted-foreground">{b}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                <p className="rounded-lg bg-background/80 px-3 py-2 text-[11px] text-muted-foreground">
                  {t("jobCreator.nothingSavedYet")}
                </p>
                <Button onClick={reviewInForm} className="w-full gap-2 text-xs">
                  <WandSparkles className="h-4 w-4" /> {t("jobCreator.reviewInForm")}
                </Button>
              </div>
            )}
            {extractedBulkJobs.length > 0 && (
              <div className="space-y-3 text-xs">
                <p className="font-medium text-sm">{t("bulkPreview", { count: extractedBulkJobs.length })}</p>
                {extractedBulkJobs.map((job, idx) => (
                  <div key={idx} className="rounded-lg border border-border/60 space-y-1 chip-pad">
                    <p className="font-semibold text-foreground">{job.title ?? "Untitled"}</p>
                    <p className="text-muted-foreground">{typeof job.location === "string" ? job.location : [job.location?.city, job.location?.country].filter(Boolean).join(", ") || "—"}</p>
                    <p className="text-muted-foreground">{job.employmentType ? job.employmentType.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) : "—"} · {job.workMode ? job.workMode.replace(/\b\w/g, (c) => c.toUpperCase()) : "—"}</p>
                    {extractSkills(job.requirements).length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1">
                        {extractSkills(job.requirements).slice(0, 5).map((s, si) => (
                          <span key={si} className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] text-primary">{s}</span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
                {bulkProgress && (
                  <div className="rounded-lg bg-muted/50 px-3 py-2 text-xs">
                    <p>{t("bulkPartial", { created: bulkProgress.created, total: bulkProgress.total, failed: bulkProgress.errors.length })}</p>
                  </div>
                )}
                <Button onClick={createBulkJobDrafts} disabled={creatingBulk} className="w-full gap-2 text-xs">
                  {creatingBulk ? <Loader2 className="h-4 w-4 animate-spin" /> : <WandSparkles className="h-4 w-4" />}
                  {creatingBulk ? `Creating... (${bulkProgress?.created ?? 0}/${extractedBulkJobs.length})` : t("jobCreator.createAllDrafts", { count: extractedBulkJobs.length })}
                </Button>
                <p className="rounded-lg bg-background/80 px-3 py-2 text-[11px] text-muted-foreground">
                  {t("jobCreator.nothingSavedYet")}
                </p>
              </div>
            )}
          </div>

        </div>
      </div>
    </div>
  );
}
