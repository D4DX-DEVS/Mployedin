"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { createPortal } from "react-dom";
import { useParams, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  Bot,
  X,
  Minus,
  Maximize2,
  Minimize2,
  Send,
  Mic,
  History,
  Plus,
  Trash2,
  Loader2,
  Sparkles,
  ChevronRight,
  Globe,
  LayoutList,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useVoiceInput, type VoiceInputState } from "@/hooks/useVoiceInput";
import { csrfFetch } from "@/lib/security/csrf-client";
import {
  JobCreatorWelcome,
  InterviewWelcome,
  ScreeningWelcome,
} from "./tabs/WelcomeScreens";
import { formatCount, formatDate } from "@/lib/ui/intlFormat";

// ─── Types ──────────────────────────────────────────────────────
interface Message {
  id?: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
}

interface ExtractedJob {
  title?: string;
  category?: string;
  description?: string;
  employmentType?: string;
  workMode?: string;
  location?: { country?: string; city?: string; isRemote?: boolean };
  requirements?: {
    skills?: string[];
    preferredSkills?: string[];
    experienceMin?: number;
    experienceMax?: number;
    education?: string;
  };
  responsibilities?: string[];
  qualifications?: string[];
  benefits?: string[];
  salary?: { min?: number; max?: number; currency?: string; period?: string; isNegotiable?: boolean };
  vacancies?: number;
  visibility?: string;
  tags?: string[];
}

interface Thread {
  _id: string;
  title: string;
  context: string;
  updatedAt: string;
  messages: Message[];
}

type TabId = "job_creator" | "interview_ai" | "screening_ai";

// ─── Work type keywords that should NOT appear in country/city ──────
const WORK_TYPE_RE = /^(hybrid|remote|on-?site|office|in-office|work from home|wfh|flexible|contract|freelance|part.?time|full.?time|on site)$/i;

// City → Country inference table
const CITY_COUNTRY: Record<string, string> = {
  dubai: "United Arab Emirates", "abu dhabi": "United Arab Emirates",
  sharjah: "United Arab Emirates", ajman: "United Arab Emirates",
  riyadh: "Saudi Arabia", jeddah: "Saudi Arabia", mecca: "Saudi Arabia", medina: "Saudi Arabia",
  doha: "Qatar", manama: "Bahrain", muscat: "Oman", "kuwait city": "Kuwait",
  mumbai: "India", bangalore: "India", bengaluru: "India", delhi: "India",
  "new delhi": "India", hyderabad: "India", chennai: "India", pune: "India",
  karachi: "Pakistan", lahore: "Pakistan", islamabad: "Pakistan",
  london: "United Kingdom", manchester: "United Kingdom",
  "new york": "United States", "los angeles": "United States",
};

function sanitizeExtractedJob(job: ExtractedJob): ExtractedJob {
  const rawCountry = job.location?.country?.trim() ?? "";
  const rawCity = job.location?.city?.trim() ?? "";

  // Detect if country/city fields contain work-type words
  const countryIsWorkType = WORK_TYPE_RE.test(rawCountry);
  const cityIsWorkType = WORK_TYPE_RE.test(rawCity);

  // Determine isRemote from any work-type keyword found in country/city fields
  const workTypeText = [rawCountry, rawCity].join(" ").toLowerCase();
  const isRemote = job.location?.isRemote
    ?? /remote|wfh|work from home/i.test(workTypeText);

  // Build clean country
  let country = countryIsWorkType ? "" : rawCountry;
  let city = cityIsWorkType ? "" : rawCity;

  // Try to infer country from city
  if (!country && city) {
    country = CITY_COUNTRY[city.toLowerCase()] ?? "";
  }

  // Fallback so validator doesn't reject (employer will fix in edit page)
  if (!country) country = "To be confirmed";
  if (!city) city = "To be confirmed";

  // Normalize salary period: must be "monthly" | "yearly" | "lpa"
  const rawPeriod = job.salary?.period ?? "monthly";
  const period = /^(month|monthly)$/i.test(rawPeriod)
    ? "monthly"
    : /^(year|yearly|annual|annum|annually)$/i.test(rawPeriod)
      ? "yearly"
      : /^lpa$/i.test(rawPeriod)
        ? "lpa"
        : "monthly";

  // Ensure description meets the validator's min(20) and is meaningful
  let description = job.description ?? "";
  if (description.length < 50) {
    description = `${job.title ?? "Position"} opportunity. ${description} We are looking for talented professionals to join our team.`.trim();
  }

  // Hybrid tag
  const tags = job.tags ?? [];
  if (/hybrid/i.test(workTypeText) && !tags.includes("Hybrid")) {
    tags.push("Hybrid");
  }

  // Normalize employmentType
  const validEmploymentTypes = ["full_time", "part_time", "contract", "internship", "freelance"];
  const employmentType = validEmploymentTypes.includes(job.employmentType ?? "")
    ? job.employmentType
    : undefined;

  // Normalize workMode — infer from location/tags if not set
  const validWorkModes = ["onsite", "hybrid", "remote"];
  let workMode = validWorkModes.includes(job.workMode ?? "")
    ? job.workMode
    : undefined;
  if (!workMode) {
    if (isRemote) workMode = "remote";
    else if (/hybrid/i.test(workTypeText) || tags.includes("Hybrid")) workMode = "hybrid";
  }

  // Move preferredSkills to top-level requirements
  const requirements = {
    ...job.requirements,
    preferredSkills: job.requirements?.preferredSkills ?? [],
  };

  return {
    ...job,
    description,
    employmentType,
    workMode,
    location: { country, city, isRemote },
    requirements,
    responsibilities: job.responsibilities ?? [],
    qualifications: job.qualifications ?? [],
    benefits: job.benefits ?? [],
    salary: job.salary
      ? { ...job.salary, period: period as "monthly" | "yearly" | "lpa" }
      : job.salary,
    tags,
  };
}

// Tab IDs — labels resolved inside the component via useTranslations
const TAB_IDS: TabId[] = ["job_creator", "interview_ai", "screening_ai"];
const TAB_LABEL_KEYS: Record<TabId, string> = {
  job_creator: "tabs.jobCreator",
  interview_ai: "tabs.interview",
  screening_ai: "tabs.screening",
};

const TAB_CONTEXT_MAP: Record<TabId, string> = {
  job_creator: "job_creator",
  interview_ai: "interview_ai",
  screening_ai: "screening_ai",
};

// ─── Component ──────────────────────────────────────────────────
export function RecruitmentAssistant() {
  const params = useParams();
  const router = useRouter();
  const locale = (params?.locale as string) ?? "en";
  const isRtl = locale === "ar";
  const t = useTranslations("recruitmentAI");

  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const [activeTab, setActiveTab] = useState<TabId>("job_creator");
  const [showHistory, setShowHistory] = useState(false);
  const [tabStarted, setTabStarted] = useState<Record<TabId, boolean>>({
    job_creator: false,
    interview_ai: false,
    screening_ai: false,
  });

  // Per-tab state
  const [tabMessages, setTabMessages] = useState<Record<TabId, Message[]>>({
    job_creator: [],
    interview_ai: [],
    screening_ai: [],
  });
  const [threadIds, setThreadIds] = useState<Record<TabId, string | null>>({
    job_creator: null,
    interview_ai: null,
    screening_ai: null,
  });

  const [isStreaming, setIsStreaming] = useState(false);
  const [input, setInput] = useState("");
  const [threads, setThreads] = useState<Thread[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [extractedJob, setExtractedJob] = useState<ExtractedJob | null>(null);
  const [extractedBulkJobs, setExtractedBulkJobs] = useState<ExtractedJob[]>([]);
  const [creatingJob, setCreatingJob] = useState(false);
  const [jobCreatedMsg, setJobCreatedMsg] = useState("");
  const [bulkProgress, setBulkProgress] = useState<{ created: number; total: number; errors: string[] } | null>(null);
  const [voiceLanguage, setVoiceLanguage] = useState("auto");

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const messages = tabMessages[activeTab];
  const threadId = threadIds[activeTab];

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);

  useEffect(() => {
    if (!showHistory && tabStarted[activeTab] && messages.length === 0 && !isStreaming) {
      textareaRef.current?.focus();
    }
  }, [activeTab, isStreaming, messages.length, showHistory, tabStarted]);

  // Voice input — language is user-selectable (not just URL locale)
  const {
    state: voiceState,
    isRecording,
    isProcessing: isVoiceProcessing,
    startRecording,
    cancelRecording,
    submitRecording,
    transcript,
    detectedLanguage,
    durationMs,
    durationLabel,
    clearTranscript,
    error: voiceError,
  } = useVoiceInput({
    language: voiceLanguage,
    maxDurationMs: 60000,
    mode: "explicitSend",
    onTranscript: (text) => {
      setInput((prev) => prev ? `${prev} ${text}` : text);
    },
  });

  // Auto-focus + auto-resize textarea when voice transcript arrives
  useEffect(() => {
    if (transcript && textareaRef.current) {
      textareaRef.current.focus();
      requestAnimationFrame(() => {
        const el = textareaRef.current;
        if (!el) return;
        el.style.height = "auto";
        el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
      });
    }
  }, [transcript]);

  const loadHistory = useCallback(async () => {
    setLoadingHistory(true);
    try {
      const res = await fetch(
        `/api/ai/chat-history?context=${TAB_CONTEXT_MAP[activeTab]}&limit=10`
      );
      if (res.ok) {
        const data = await res.json();
        setThreads(data.threads ?? []);
      }
    } finally {
      setLoadingHistory(false);
    }
  }, [activeTab]);

  useEffect(() => {
    if (open && showHistory) loadHistory();
  }, [open, showHistory, loadHistory]);

  const loadThread = (thread: Thread) => {
    setTabMessages((prev) => ({
      ...prev,
      [activeTab]: thread.messages.map((m) => ({
        ...m,
        timestamp: new Date(m.timestamp),
      })),
    }));
    setThreadIds((prev) => ({ ...prev, [activeTab]: thread._id }));
    setShowHistory(false);
  };

  const deleteThread = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    await csrfFetch(`/api/ai/chat-history?threadId=${id}`, { method: "DELETE" });
    setThreads((prev) => prev.filter((th) => th._id !== id));
    if (threadId === id) newConversation();
  };

  const newConversation = () => {
    setTabMessages((prev) => ({ ...prev, [activeTab]: [] }));
    setThreadIds((prev) => ({ ...prev, [activeTab]: null }));
    setTabStarted((prev) => ({ ...prev, [activeTab]: false }));
    setExtractedJob(null);
    setExtractedBulkJobs([]);
    setBulkProgress(null);
    setJobCreatedMsg("");
    setShowHistory(false);
    setInput("");
    clearTranscript();
    if (textareaRef.current) textareaRef.current.style.height = "auto";
  };

  const startBlankConversation = () => {
    setTabStarted((prev) => ({ ...prev, [activeTab]: true }));
    setShowHistory(false);
  };

  const sendMessage = useCallback(
    async (overrideContent?: string) => {
      const content = overrideContent ?? input.trim();
      if (!content || isStreaming) return;

      clearTranscript();
      setInput("");
      if (textareaRef.current) textareaRef.current.style.height = "auto";
      setExtractedJob(null);
      setExtractedBulkJobs([]);
      setBulkProgress(null);

      const userMsg: Message = {
        role: "user",
        content,
        timestamp: new Date(),
      };
      const assistantMsg: Message = {
        role: "assistant",
        content: "",
        timestamp: new Date(),
      };

      setTabMessages((prev) => ({
        ...prev,
        [activeTab]: [...(prev[activeTab] ?? []), userMsg, assistantMsg],
      }));
      setIsStreaming(true);

      const allMessages = [...messages, userMsg];

      try {
        const res = await fetch("/api/ai/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messages: allMessages.map((m) => ({
              role: m.role,
              content: m.content,
            })),
            context: TAB_CONTEXT_MAP[activeTab],
          }),
        });

        if (!res.ok || !res.body) throw new Error("Stream error");

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let accumulated = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value, { stream: true });
          accumulated += chunk;

          setTabMessages((prev) => {
            const msgs = [...(prev[activeTab] ?? [])];
            msgs[msgs.length - 1] = {
              ...msgs[msgs.length - 1],
              content: accumulated,
            };
            return { ...prev, [activeTab]: msgs };
          });
        }

        // Extract job data from job_creator tab
        if (activeTab === "job_creator") {
          // Check for bulk job data first
          const bulkMatch = accumulated.match(/<BULK_JOB_DATA>([\s\S]*?)<\/BULK_JOB_DATA>/);
          if (bulkMatch) {
            try {
              const parsed = JSON.parse(bulkMatch[1].trim());
              if (Array.isArray(parsed) && parsed.length > 0) {
                setExtractedBulkJobs(parsed.slice(0, 10));
                setExtractedJob(null);
              }
            } catch { /* ignore parse errors */ }
          } else {
            // Single job extraction
            const match = accumulated.match(/<JOB_DATA>([\s\S]*?)<\/JOB_DATA>/);
            if (match) {
              try {
                setExtractedJob(JSON.parse(match[1].trim()));
                setExtractedBulkJobs([]);
              } catch { /* ignore */ }
            }
          }
        }

        // Persist to history
        const histRes = await csrfFetch("/api/ai/chat-history", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            threadId,
            context: TAB_CONTEXT_MAP[activeTab],
            messages: [
              { role: "user", content },
              { role: "assistant", content: accumulated },
            ],
            title:
              messages.length === 0 ? content.slice(0, 50) : undefined,
          }),
        });

        if (histRes.ok) {
          const histData = await histRes.json();
          if (!threadId) {
            setThreadIds((prev) => ({
              ...prev,
              [activeTab]: histData.threadId,
            }));
          }
        }
      } catch {
        setTabMessages((prev) => {
          const msgs = [...(prev[activeTab] ?? [])];
          msgs[msgs.length - 1] = {
            ...msgs[msgs.length - 1],
            content: t("errorMessage"),
          };
          return { ...prev, [activeTab]: msgs };
        });
      } finally {
        setIsStreaming(false);
      }
    },
    [input, isStreaming, messages, activeTab, threadId, clearTranscript]
  );

  const createJobDraft = async () => {
    if (!extractedJob) return;
    setCreatingJob(true);
    setJobCreatedMsg("");
    try {
      // Sanitize extracted job before posting
      const sanitized = sanitizeExtractedJob(extractedJob);
      const res = await fetch("/api/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...sanitized, status: "draft" }),
      });
      if (res.ok) {
        const data = await res.json();
        setJobCreatedMsg(t("jobCreator.draftCreated"));
        setExtractedJob(null);
        setTimeout(() => {
          router.push(`/${locale}/employer/jobs/${data.job?._id ?? ""}/edit`);
        }, 1500);
      } else {
        const err = await res.json().catch(() => ({}));
        setJobCreatedMsg((err as { error?: string }).error ?? t("failedCreate"));
      }
    } finally {
      setCreatingJob(false);
    }
  };

  const createBulkJobDrafts = async () => {
    if (extractedBulkJobs.length === 0) return;
    setCreatingJob(true);
    setBulkProgress({ created: 0, total: extractedBulkJobs.length, errors: [] });
    const errors: string[] = [];
    let created = 0;

    for (const job of extractedBulkJobs) {
      try {
        const sanitized = sanitizeExtractedJob(job);
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

    setCreatingJob(false);
    if (errors.length === 0) {
      setJobCreatedMsg(t("bulkSuccess", { count: created }));
      setExtractedBulkJobs([]);
      setBulkProgress(null);
      setTimeout(() => {
        router.push(`/${locale}/employer/jobs`);
      }, 1500);
    } else {
      setJobCreatedMsg(t("bulkPartial", { created, total: extractedBulkJobs.length, failed: errors.length }));
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const showWelcome = !tabStarted[activeTab] && messages.length === 0 && !isStreaming;

  if (!mounted) return null;

  const panelClass = cn(
    "fixed z-[100] flex flex-col bg-background border border-border/70 shadow-2xl overflow-hidden transition-all duration-300 ease-in-out",
    minimized
      ? cn("bottom-24 h-12 w-48 rounded-full bg-gradient-to-r from-indigo-700 to-primary border-0", isRtl ? "left-6" : "right-6")
      : expanded
        ? cn("top-0 bottom-0 w-full md:w-[480px] lg:w-[520px] rounded-none",
            isRtl ? "left-0 md:rounded-r-2xl md:border-r md:border-y border-l-0" : "right-0 md:rounded-l-2xl md:border-l md:border-y border-r-0")
        : cn("bottom-3 h-[min(600px,calc(100vh-1.5rem))] w-[calc(100vw-1.5rem)] sm:h-[600px] sm:w-[420px] max-h-[90vh] rounded-2xl",
            isRtl ? "left-3 sm:left-6" : "right-3 sm:right-6",
            isRtl ? "sm:bottom-6" : "sm:bottom-6")
  );

  return createPortal(
    <>
      {/* Floating trigger button — only shown when fully closed */}
      {!open && (
        <button
          onClick={() => { setOpen(true); setMinimized(false); }}
          className={cn(
            "fixed bottom-24 z-[99] h-14 w-14 rounded-2xl bg-gradient-to-br from-primary to-indigo-600 text-white shadow-xl hover:shadow-primary/30 hover:scale-105 transition-all duration-200 flex items-center justify-center gap-1 group",
            isRtl ? "left-6" : "right-6"
          )}
          aria-label={t("openButton")}
          title={t("openButtonTooltip")}
        >
          <Sparkles className={cn("h-5 w-5 absolute top-2.5 text-white/60 group-hover:text-white/80 transition-colors", isRtl ? "left-2.5" : "right-2.5")} />
          <Bot className="h-6 w-6" />
          {/* Suggestion pulse indicator */}
          <span className={cn("absolute -top-1 flex h-3.5 w-3.5", isRtl ? "-left-1" : "-right-1")}>
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-amber-400 border-2 border-white" />
          </span>
        </button>
      )}

      {open && (
        <>
          {/* Backdrop — hidden when minimized */}
          {!minimized && (
            <div
              className={cn(
                "fixed inset-0 z-[99] transition-colors duration-300",
                expanded ? "bg-black/20 backdrop-blur-[2px]" : ""
              )}
              onClick={() => expanded ? setExpanded(false) : setOpen(false)}
              aria-hidden
            />
          )}

          {/* Minimized pill — clickable to restore */}
          {minimized && (
            <div
              className={panelClass}
              onClick={() => setMinimized(false)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => e.key === "Enter" && setMinimized(false)}
            >
              <div className="flex items-center gap-2.5 px-3 sm:px-4 h-full cursor-pointer">
                <Bot className="h-5 w-5 text-white shrink-0" />
                <span className="text-sm font-semibold text-white truncate">{t("title")}</span>
                <button
                  onClick={(e) => { e.stopPropagation(); setOpen(false); setMinimized(false); }}
                  className="ml-auto text-white/60 hover:text-white transition-colors p-0.5 rounded-full hover:bg-white/20"
                  title={t("close")}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          )}

          {/* Full panel */}
          {!minimized && (
            <div className={panelClass} onClick={(e) => e.stopPropagation()}>
            {/* ── Header ── */}
            <div className="flex items-center gap-2.5 px-3 sm:px-4 py-3 bg-gradient-to-r from-indigo-700 to-primary shrink-0">
              <div className="w-8 h-8 rounded-xl bg-white/20 flex items-center justify-center flex-shrink-0">
                <Bot className="h-4.5 w-4.5 text-white h-[18px] w-[18px]" />
              </div>
              <div className="flex-1 min-w-0">
                <h2 className="heading-label font-bold text-white leading-tight">{t("title")}</h2>
                <p className="text-xs text-white/60 truncate">
                  {isStreaming ? t("thinking") : t("hiringAssistant")}
                </p>
              </div>
              <button
                onClick={newConversation}
                className="text-white/60 hover:text-white transition-colors p-1 rounded-lg hover:bg-white/10"
                title={t("newConversation")}
                aria-label={t("newConversation")}
              >
                <Plus className="h-4 w-4" />
              </button>
              <button
                onClick={() => setShowHistory((v) => !v)}
                className={cn(
                  "text-white/60 hover:text-white transition-colors p-1 rounded-lg hover:bg-white/10",
                  showHistory && "text-white bg-white/20"
                )}
                title={t("history")}
              >
                <History className="h-4 w-4" />
              </button>
              <button
                onClick={() => {
                  setExpanded((e) => !e);
                  setMinimized(false);
                }}
                className="text-white/60 hover:text-white transition-colors p-1 rounded-lg hover:bg-white/10"
                title={expanded ? t("restore") : t("expand")}
              >
                {expanded ? (
                  <Minimize2 className="h-4 w-4" />
                ) : (
                  <Maximize2 className="h-4 w-4" />
                )}
              </button>
              <button
                onClick={() => { setMinimized(true); setExpanded(false); }}
                className="text-white/60 hover:text-white transition-colors p-1 rounded-lg hover:bg-white/10"
                title={t("minimize")}
              >
                <Minus className="h-4 w-4" />
              </button>
              <button
                onClick={() => setOpen(false)}
                className="text-white hover:bg-white/20 transition-colors p-1 rounded-full"
                title={t("close")}
              >
                <X className="h-4 w-4" />
              </button>
            </div>

                {/* ── Tab bar ── */}
                <div className="flex border-b border-border shrink-0 bg-background/95">
                  {TAB_IDS.map((tabId) => (
                    <button
                      key={tabId}
                      onClick={() => {
                        setActiveTab(tabId);
                        setShowHistory(false);
                        setExtractedJob(null);
                        setExtractedBulkJobs([]);
                        setBulkProgress(null);
                        setJobCreatedMsg("");
                      }}
                      className={cn(
                        "flex-1 py-2.5 text-xs font-semibold transition-all border-b-2 -mb-px",
                        activeTab === tabId
                          ? "border-primary text-primary"
                          : "border-transparent text-muted-foreground hover:text-foreground"
                      )}
                    >
                      {t(TAB_LABEL_KEYS[tabId])}
                    </button>
                  ))}
                </div>

                {/* ── History panel ── */}
                {showHistory && (
                  <div className="flex-1 overflow-y-auto ai-panel-scroll p-3 space-y-1">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide px-1 mb-2">
                      {t("recentConversations")}
                    </p>
                    {loadingHistory && (
                      <div className="flex justify-center py-8">
                        <Loader2 className="h-5 w-5 animate-spin text-primary" />
                      </div>
                    )}
                    {!loadingHistory && threads.length === 0 && (
                      <p className="text-sm text-center text-muted-foreground py-8">
                        {t("noHistory")}
                      </p>
                    )}
                    {threads.map((th) => (
                      <div
                        key={th._id}
                        onClick={() => loadThread(th)}
                        className="flex items-center gap-2 p-2.5 rounded-xl hover:bg-muted/60 cursor-pointer group transition-colors"
                      >
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{th.title || t("untitled")}</p>
                          <p className="text-xs text-muted-foreground">
                            {formatDate(new Date(th.updatedAt))}
                          </p>
                        </div>
                        <button
                          onClick={(e) => deleteThread(th._id, e)}
                          className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-red-500 transition-all p-1"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {!showHistory && (
                  <>
                    {/* ── Messages / Welcome ── */}
                    <div className="flex-1 overflow-y-auto ai-panel-scroll">
                      {showWelcome ? (
                        /* Welcome screen */
                        activeTab === "job_creator" ? (
                          <JobCreatorWelcome
                            onAction={(p) => sendMessage(p)}
                            onStartBlank={startBlankConversation}
                          />
                        ) : activeTab === "interview_ai" ? (
                          <InterviewWelcome
                            onAction={(p) => sendMessage(p)}
                            onStartBlank={startBlankConversation}
                          />
                        ) : (
                          <ScreeningWelcome
                            onAction={(p) => sendMessage(p)}
                            onStartBlank={startBlankConversation}
                          />
                        )
                      ) : (
                        /* Message list */
                        <div className="p-3 sm:p-4 space-y-3">
                          {messages.map((msg, i) => {
                            const msgKey = msg.id || `${i}-${msg.role}-${msg.content.substring(0, 20)}`;
                            return (
                              <MessageBubble
                                key={msgKey}
                                msg={msg}
                                isLastAssistant={
                                  msg.role === "assistant" &&
                                  i === messages.length - 1 &&
                                  isStreaming
                                }
                              />
                            );
                          })}

                          {/* Job preview card (job_creator only) */}
                          {activeTab === "job_creator" && extractedJob && (
                            <JobPreviewCard
                              job={extractedJob}
                              onCreateDraft={createJobDraft}
                              creating={creatingJob}
                              createdMsg={jobCreatedMsg}
                            />
                          )}
                          {/* Bulk job preview card (job_creator only) */}
                          {activeTab === "job_creator" && extractedBulkJobs.length > 0 && (
                            <BulkJobPreviewCard
                              jobs={extractedBulkJobs}
                              onCreateAll={createBulkJobDrafts}
                              creating={creatingJob}
                              progress={bulkProgress}
                              createdMsg={jobCreatedMsg}
                            />
                          )}
                          {jobCreatedMsg && !extractedJob && extractedBulkJobs.length === 0 && (
                            <p className="text-xs text-center text-emerald-600 font-medium py-2">
                              {jobCreatedMsg}
                            </p>
                          )}
                          <div ref={messagesEndRef} />
                        </div>
                      )}
                    </div>
                    {!showWelcome && (
                      <InputBar
                        value={input}
                        onChange={(nextValue) => {
                          if (detectedLanguage) {
                            clearTranscript();
                          }
                          setInput(nextValue);
                        }}
                        onSend={() => sendMessage()}
                        onKeyDown={handleKeyDown}
                        isStreaming={isStreaming}
                        voiceState={voiceState}
                        tabId={activeTab}
                        textareaRef={textareaRef}
                        voiceError={voiceError}
                        detectedLanguage={detectedLanguage}
                        durationMs={durationMs}
                        durationLabel={durationLabel}
                        voiceLanguage={voiceLanguage}
                        onVoiceLanguageChange={setVoiceLanguage}
                        onStartVoice={() => void startRecording()}
                        onCancelVoice={cancelRecording}
                        onSubmitVoice={submitRecording}
                        isCompact={!expanded}
                      />
                    )}
                  </>
                )}
          </div>
          )}
        </>
      )}
    </>,
    document.body
  );
}

// ─── Markdown renderer ─────────────────────────────────────────
function hasMalayalam(text: string): boolean {
  return /[\u0D00-\u0D7F]/.test(text);
}

function AIMarkdown({ content }: { content: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        h1: ({ ...props }) => <h1 className="text-base font-bold mt-3 mb-1" {...props} />,
        h2: ({ ...props }) => <h2 className="heading-label font-bold mt-3 mb-1" {...props} />,
        h3: ({ ...props }) => <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mt-3 mb-1" {...props} />,
        p: ({ ...props }) => <p className="my-1 leading-relaxed" {...props} />,
        ul: ({ ...props }) => <ul className="list-disc list-inside space-y-0.5 my-1" {...props} />,
        ol: ({ ...props }) => <ol className="list-decimal list-inside space-y-0.5 my-1" {...props} />,
        li: ({ ...props }) => <li className="leading-relaxed" {...props} />,
        strong: ({ ...props }) => <strong className="font-semibold" {...props} />,
        code: ({ ...props }) => <code className="rounded bg-black/10 px-1 font-mono text-[0.88em]" {...props} />,
        a: ({ href, ...props }) => {
          const isInternal = href?.startsWith("/");
          return (
            <a
              href={href}
              {...(!isInternal && { target: "_blank", rel: "noopener noreferrer" })}
              className="text-primary underline underline-offset-2 hover:text-primary/80"
              {...props}
            />
          );
        },
        table: ({ ...props }) => (
          <div className="overflow-x-auto rounded-lg border border-border my-2">
            <table className="w-full text-xs border-collapse" {...props} />
          </div>
        ),
        thead: ({ ...props }) => <thead className="bg-muted/50" {...props} />,
        th: ({ ...props }) => <th className="border-b border-border px-2.5 py-1.5 text-left font-semibold" {...props} />,
        td: ({ ...props }) => <td className="border-t border-border px-2.5 py-1.5" {...props} />,
        tr: ({ ...props }) => <tr {...props} />,
        blockquote: ({ ...props }) => <blockquote className="border-l-2 border-primary/40 pl-3 text-muted-foreground my-1" {...props} />,
        hr: () => <hr className="border-border my-2" />,
      }}
    >
      {content}
    </ReactMarkdown>
  );
}

// ─── Message bubble ──────────────────────────────────────────────
function MessageBubble({
  msg,
  isLastAssistant,
}: {
  msg: Message;
  isLastAssistant: boolean;
}) {
  // Strip <JOB_DATA>...</JOB_DATA> and <BULK_JOB_DATA>...</BULK_JOB_DATA> from display
  const displayContent = msg.content
    .replace(/<JOB_DATA>[\s\S]*?<\/JOB_DATA>/g, "")
    .replace(/<BULK_JOB_DATA>[\s\S]*?<\/BULK_JOB_DATA>/g, "")
    .trim();

  return (
    <div
      className={cn("flex gap-2.5", msg.role === "user" ? "justify-end" : "justify-start")}
    >
      {msg.role === "assistant" && (
        <div className="flex-shrink-0 w-7 h-7 rounded-xl bg-gradient-to-br from-primary/20 to-indigo-500/20 flex items-center justify-center mt-0.5">
          <Bot className="h-4 w-4 text-primary" />
        </div>
      )}
      <div
        className={cn(
          "max-w-[82%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed",
          msg.role === "user"
            ? "bg-gradient-to-br from-primary to-indigo-600 text-white rounded-tr-none shadow-sm"
            : "bg-muted text-foreground rounded-tl-none",
          hasMalayalam(msg.content) && "font-malayalam"
        )}
      >
        {displayContent ? (
          msg.role === "assistant" ? (
            <div className="prose-sm prose-p:my-0 prose-li:my-0">
              <AIMarkdown content={displayContent} />
              {isLastAssistant && (
                <span className="inline-block w-0.5 h-4 ml-0.5 bg-current opacity-60 animate-pulse align-middle" />
              )}
            </div>
          ) : (
            <>
              {displayContent}
              {isLastAssistant && (
                <span className="inline-block w-0.5 h-4 ml-0.5 bg-current opacity-60 animate-pulse align-middle" />
              )}
            </>
          )
        ) : (
          isLastAssistant ? (
            <span className="inline-block w-0.5 h-4 bg-current opacity-60 animate-pulse align-middle" />
          ) : (
            <span className="opacity-40">…</span>
          )
        )}
      </div>
    </div>
  );
}

// ─── Job preview card ────────────────────────────────────────────
function JobPreviewCard({
  job,
  onCreateDraft,
  creating,
  createdMsg,
}: {
  job: ExtractedJob;
  onCreateDraft: () => void;
  creating: boolean;
  createdMsg: string;
}) {
  const t = useTranslations("recruitmentAI");
  return (
    <div className="rounded-2xl border border-emerald-200 bg-emerald-50/50 space-y-3 mt-2 card-pad">
      <div className="flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-emerald-600 flex-shrink-0" />
        <h4 className="text-xs font-bold text-emerald-700 uppercase tracking-wide">
          {t("jobCreator.preview")}
        </h4>
      </div>
      <div className="space-y-1.5 text-xs">
        {job.title && (
          <Row label={t("previewLabels.title")} value={job.title} />
        )}
        {job.category && <Row label={t("previewLabels.category")} value={job.category} />}
        {job.location?.country && (
          <Row
            label={t("previewLabels.location")}
            value={`${job.location.city ? `${job.location.city}, ` : ""}${job.location.country}${job.location.isRemote ? ` (${t("previewLabels.remote")})` : ""}`}
          />
        )}
        {job.salary && (
          <Row
            label={t("previewLabels.salary")}
            value={`${job.salary.currency ?? "USD"} ${formatCount(job.salary.min)} – ${formatCount(job.salary.max)} / ${job.salary.period ?? "month"}`}
          />
        )}
        {job.employmentType && (
          <Row label={t("previewLabels.type")} value={job.employmentType.replace("_", "-")} />
        )}
        {job.workMode && <Row label={t("previewLabels.workMode")} value={job.workMode} />}
        {job.requirements?.skills?.length ? (
          <div className="flex gap-1.5 flex-wrap mt-1">
            {job.requirements.skills.slice(0, 8).map((s) => (
              <span
                key={s}
                className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 text-[11px] font-medium"
              >
                {s}
              </span>
            ))}
          </div>
        ) : null}
        {job.responsibilities?.length ? (
          <Row label={t("previewLabels.responsibilities")} value={t("previewLabels.items", { count: job.responsibilities.length })} />
        ) : null}
        {job.benefits?.length ? (
          <Row label={t("previewLabels.benefits")} value={t("previewLabels.items", { count: job.benefits.length })} />
        ) : null}
      </div>
      {createdMsg ? (
        <p className="text-xs text-emerald-600 font-medium">{createdMsg}</p>
      ) : (
        <Button
          size="dense"
          onClick={onCreateDraft}
          disabled={creating}
          className="w-full bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold"
        >
          {creating ? (
            <>
              <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
              {t("jobCreator.creating")}
            </>
          ) : (
            <>
              {t("jobCreator.createDraft")}
              <ChevronRight className="h-3.5 w-3.5 ml-1" />
            </>
          )}
        </Button>
      )}
    </div>
  );
}

// ─── Bulk job preview card ───────────────────────────────────────
function BulkJobPreviewCard({
  jobs,
  onCreateAll,
  creating,
  progress,
  createdMsg,
}: {
  jobs: ExtractedJob[];
  onCreateAll: () => void;
  creating: boolean;
  progress: { created: number; total: number; errors: string[] } | null;
  createdMsg: string;
}) {
  const t = useTranslations("recruitmentAI");
  return (
    <div className="rounded-2xl border border-blue-200 bg-blue-50/50 space-y-3 mt-2 card-pad">
      <div className="flex items-center gap-2">
        <LayoutList className="h-4 w-4 text-blue-600 flex-shrink-0" />
        <h4 className="text-xs font-bold text-blue-700 uppercase tracking-wide">
          {t("bulkPreview", { count: jobs.length })}
        </h4>
      </div>
      <div className="space-y-2 max-h-[200px] overflow-y-auto">
        {jobs.map((job, idx) => (
          <div
            key={idx}
            className="rounded-lg border border-blue-100 bg-white space-y-1 chip-pad"
          >
            <p className="text-xs font-semibold text-foreground">{job.title || `Job ${idx + 1}`}</p>
            <div className="flex flex-wrap gap-1 text-[11px] text-muted-foreground">
              {job.location?.city && <span>{job.location.city}</span>}
              {job.location?.country && <span>• {job.location.country}</span>}
              {job.employmentType && <span>• {job.employmentType.replace("_", "-")}</span>}
              {job.workMode && <span>• {job.workMode}</span>}
            </div>
            {job.requirements?.skills?.length ? (
              <div className="flex gap-1 flex-wrap">
                {job.requirements.skills.slice(0, 5).map((s) => (
                  <span
                    key={s}
                    className="px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700 text-[10px] font-medium"
                  >
                    {s}
                  </span>
                ))}
                {job.requirements.skills.length > 5 && (
                  <span className="text-[10px] text-muted-foreground">+{job.requirements.skills.length - 5}</span>
                )}
              </div>
            ) : null}
          </div>
        ))}
      </div>
      {progress && (
        <div className="space-y-1">
          <div className="w-full h-1.5 bg-blue-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-blue-600 transition-all duration-300 rounded-full"
              style={{ width: `${(progress.created / progress.total) * 100}%` }}
            />
          </div>
          <p className="text-[11px] text-blue-600">
            {t("createdProgress", { created: progress.created, total: progress.total })}
          </p>
          {progress.errors.length > 0 && (
            <div className="text-[11px] text-red-500 space-y-0.5">
              {progress.errors.map((err, i) => <p key={`${i}-${err}`}>{err}</p>)}
            </div>
          )}
        </div>
      )}
      {createdMsg ? (
        <p className="text-xs text-emerald-600 font-medium">{createdMsg}</p>
      ) : !progress ? (
        <Button
          size="dense"
          onClick={onCreateAll}
          disabled={creating}
          className="w-full bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold"
        >
          {creating ? (
            <>
              <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
              {t("jobCreator.creating")}
            </>
          ) : (
            <>
              {t("createAllDrafts", { count: jobs.length })}
              <ChevronRight className="h-3.5 w-3.5 ml-1" />
            </>
          )}
        </Button>
      ) : null}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-1.5">
      <span className="text-muted-foreground font-medium min-w-[60px]">{label}:</span>
      <span className="text-foreground">{value}</span>
    </div>
  );
}

// ─── Voice language options ────────────────────────────────────────
const VOICE_LANGUAGES: { code: string; label: string; flag: string }[] = [
  { code: "auto", label: "Auto-detect", flag: "🌐" },
  { code: "en", label: "English", flag: "🇬🇧" },
  { code: "ar", label: "Arabic", flag: "🇸🇦" },
  { code: "ml", label: "Malayalam", flag: "🇮🇳" },
  { code: "hi", label: "Hindi", flag: "🇮🇳" },
  { code: "ur", label: "Urdu", flag: "🇵🇰" },
  { code: "ta", label: "Tamil", flag: "🇮🇳" },
  { code: "te", label: "Telugu", flag: "🇮🇳" },
];

// ─── Input bar ───────────────────────────────────────────────────
interface InputBarProps {
  value: string;
  onChange: (v: string) => void;
  onSend: () => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  isStreaming: boolean;
  voiceState: VoiceInputState;
  tabId: TabId;
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  voiceError: string | null;
  detectedLanguage: string | null;
  durationMs: number;
  durationLabel: string;
  voiceLanguage: string;
  onVoiceLanguageChange: (lang: string) => void;
  onStartVoice: () => void;
  onCancelVoice: () => void;
  onSubmitVoice: () => void;
  isCompact: boolean;
}

const INPUT_PLACEHOLDER_KEYS: Record<TabId, string> = {
  job_creator: "placeholders.jobCreator",
  interview_ai: "placeholders.interview",
  screening_ai: "placeholders.screening",
};

function InputBar({
  value,
  onChange,
  onSend,
  onKeyDown,
  isStreaming,
  voiceState,
  tabId,
  textareaRef,
  voiceError,
  detectedLanguage,
  durationMs,
  durationLabel,
  voiceLanguage,
  onVoiceLanguageChange,
  onStartVoice,
  onCancelVoice,
  onSubmitVoice,
  isCompact,
}: InputBarProps) {
  const t = useTranslations("recruitmentAI");
  const [showLangPicker, setShowLangPicker] = useState(false);
  const currentLang = VOICE_LANGUAGES.find((l) => l.code === voiceLanguage) ?? VOICE_LANGUAGES[0];
  const isRecording = voiceState === "recording";
  const isVoiceProcessing = voiceState === "processing";
  const detectedLanguageLabel = getDetectedLanguageLabel(detectedLanguage);
  const isIdle = voiceState === "idle";
  const voiceTriggerLabel = currentLang.code === "auto"
    ? "AUTO"
    : `${currentLang.flag} ${currentLang.code.toUpperCase()}`;

  const autoResize = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 220)}px`;
  }, [textareaRef]);

  useEffect(() => {
    autoResize();
  }, [autoResize, value]);

  return (
    <div className="border-t border-border/70 bg-background/95 p-3 shrink-0">
      <div className="space-y-3">
        <div className="rounded-2xl border border-border/60 bg-background shadow-sm shadow-black/[0.04] chip-pad">
          <Textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => { onChange(e.target.value); autoResize(); }}
            onKeyDown={onKeyDown}
            placeholder={t(INPUT_PLACEHOLDER_KEYS[tabId])}
            className={cn(
              "resize-none text-sm flex-1 overflow-y-auto transition-[height] duration-100",
              isIdle
                ? "min-h-[56px] max-h-[220px] border-0 bg-transparent px-1.5 py-1 shadow-none focus-visible:border-transparent focus-visible:ring-0"
                : "min-h-[44px] max-h-[220px] rounded-xl border-border/60 bg-muted/20"
            )}
            rows={1}
            disabled={isStreaming || isRecording || isVoiceProcessing}
          />

          {isIdle && (
            <div className={cn(
              "mt-2 flex gap-2 border-t border-border/50 pt-2",
              isCompact ? "flex-wrap items-end" : "items-center"
            )}>
              <div className="relative">
                <button
                  onClick={() => setShowLangPicker((v) => !v)}
                  disabled={isStreaming || isVoiceProcessing}
                  className="inline-flex h-9 items-center gap-1.5 rounded-full bg-muted/70 px-3 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-40"
                  title={t("voiceLanguage")}
                >
                  <Globe className="h-3 w-3" />
                  <span>{voiceTriggerLabel}</span>
                </button>
                {showLangPicker && !isRecording && !isVoiceProcessing && (
                  <div className="absolute bottom-full left-0 mb-2 z-50 w-36 rounded-xl border border-border bg-popover shadow-lg overflow-hidden">
                    {VOICE_LANGUAGES.map((lang) => (
                      <button
                        key={lang.code}
                        onClick={() => { onVoiceLanguageChange(lang.code); setShowLangPicker(false); }}
                        className={cn(
                          "w-full flex items-center gap-2 px-3 py-2 text-xs text-left hover:bg-muted transition-colors",
                          lang.code === voiceLanguage && "bg-primary/10 text-primary font-medium"
                        )}
                      >
                        <span>{lang.flag}</span>
                        <span>{t(`voiceLanguages.${lang.code}`)}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="ml-auto flex items-center gap-2">
                <button
                  onClick={onStartVoice}
                  disabled={isStreaming || isVoiceProcessing}
                  className={cn(
                    "h-10 w-10 rounded-xl border flex items-center justify-center transition-all duration-150",
                    "border-border/60 bg-background text-muted-foreground shadow-sm shadow-black/[0.04] hover:bg-primary/10 hover:text-primary",
                    (isStreaming || isVoiceProcessing) && "opacity-50 cursor-not-allowed"
                  )}
                  title={t("startVoiceInput")}
                  aria-label={t("startVoiceInput")}
                >
                  <Mic className="h-4 w-4" />
                </button>

                <Button
                  size="icon"
                  onClick={onSend}
                  disabled={!value.trim() || isStreaming || isVoiceProcessing}
                  className="rounded-xl bg-gradient-to-br from-primary to-indigo-600 hover:from-primary/90 hover:to-indigo-600/90 shadow-sm"
                  aria-label={t("sendMessage")}
                >
                  <Send className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </div>

        {voiceState === "recording" ? (
          <div className={cn("gap-2", isCompact ? "flex flex-col" : "flex items-center") }>
            <div
              role="status"
              aria-live="polite"
              aria-atomic="true"
              className={cn(
                "flex min-w-0 items-center gap-3 rounded-xl border border-red-200 bg-red-50 text-sm text-red-700",
                isCompact ? "w-full px-3 py-2.5" : "flex-1 px-3 sm:px-4 py-2"
              )}
            >
              <span className="relative flex h-2.5 w-2.5 shrink-0" aria-hidden="true">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />
                <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-red-500" />
              </span>
              <div className="flex items-end gap-0.5 h-4" aria-hidden="true">
                {[0.45, 0.8, 1, 0.65, 0.9, 0.55, 0.75].map((height, index) => (
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
                <p className={cn("text-xs text-red-700/80", isCompact ? "mt-1 truncate" : "mt-1")}>
                  {isCompact ? t("tapSendReady") : t("tapSendReadyFull")}
                </p>
              </div>
              <span
                className="ml-auto font-mono text-sm tabular-nums"
                aria-label={`Recording length ${Math.max(1, Math.floor(durationMs / 1000))} seconds`}
              >
                {durationLabel}
              </span>
            </div>
            <div className={cn("flex gap-2", isCompact ? "w-full" : "shrink-0") }>
              <Button
                type="button"
                variant="outline"
                onClick={onCancelVoice}
                className={cn(
                  "h-10 rounded-xl border-border/60 text-muted-foreground hover:text-foreground",
                  isCompact ? "flex-1 px-3" : "px-3"
                )}
                aria-label={t("cancelVoiceInput")}
              >
                <X className="mr-1.5 h-4 w-4" /> {t("cancel")}
              </Button>
              <Button
                type="button"
                onClick={onSubmitVoice}
                className={cn("h-10 rounded-xl", isCompact ? "flex-1 px-3" : "px-3 sm:px-4")}
                aria-label={t("sendVoiceInput")}
              >
                <Send className="mr-1.5 h-4 w-4" /> {t("send")}
              </Button>
            </div>
          </div>
        ) : voiceState === "processing" ? (
          <div
            role="status"
            aria-live="polite"
            aria-atomic="true"
            className="flex items-center justify-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-3 sm:px-4 py-3 text-sm text-amber-700"
          >
            <Loader2 className="h-4 w-4 animate-spin" />
            <span className="font-medium">{t("processingVoice")}</span>
          </div>
        ) : null}
      </div>

      <div className="mt-2 min-h-5" aria-live="polite" aria-atomic="true">
        {voiceError ? (
          <p role="alert" className="text-xs text-destructive">
            {voiceError}
          </p>
        ) : voiceState === "idle" && detectedLanguageLabel ? (
          <p className="text-[11px] text-muted-foreground/80">
            {t("detectedLanguage", { lang: detectedLanguageLabel })}
          </p>
        ) : voiceState === "idle" ? (
          <p className="text-[11px] text-muted-foreground/70">
            {t("disclaimer")}
          </p>
        ) : null}
      </div>
    </div>
  );
}

function getDetectedLanguageLabel(language: string | null): string | null {
  if (!language) {
    return null;
  }

  const voiceLanguageMatch = VOICE_LANGUAGES.find((entry) => {
    const code = entry.code.toLowerCase();
    const normalizedLanguage = language.toLowerCase();
    return normalizedLanguage === code || normalizedLanguage.startsWith(`${code}-`);
  });

  return voiceLanguageMatch?.label ?? language;
}
