"use client";

import { useState, useRef, useEffect, useCallback, Fragment } from "react";
import { createPortal } from "react-dom";
import { useParams, useRouter } from "next/navigation";
import {
  Bot,
  X,
  Minus,
  Maximize2,
  Minimize2,
  Send,
  Mic,
  MicOff,
  History,
  Plus,
  Trash2,
  Loader2,
  Sparkles,
  ChevronRight,
  Paperclip,
  Globe,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { VoiceInputStatus } from "@/components/shared/VoiceInputStatus";
import { Textarea } from "@/components/ui/textarea";
import { useVoiceInput } from "@/hooks/useVoiceInput";
import {
  JobCreatorWelcome,
  InterviewWelcome,
  ScreeningWelcome,
} from "./tabs/WelcomeScreens";

// ─── Types ──────────────────────────────────────────────────────
interface Message {
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
}

interface ExtractedJob {
  title?: string;
  category?: string;
  description?: string;
  location?: { country?: string; city?: string; isRemote?: boolean };
  requirements?: {
    skills?: string[];
    experienceMin?: number;
    experienceMax?: number;
    education?: string;
  };
  salary?: { min?: number; max?: number; currency?: string; period?: string };
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

  return {
    ...job,
    description,
    location: { country, city, isRemote },
    salary: job.salary
      ? { ...job.salary, period: period as "monthly" | "yearly" | "lpa" }
      : job.salary,
    tags,
  };
}

const TABS: { id: TabId; label: string }[] = [
  { id: "job_creator", label: "Job Creator AI" },
  { id: "interview_ai", label: "Interview AI" },
  { id: "screening_ai", label: "Screening AI" },
];

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

  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const [activeTab, setActiveTab] = useState<TabId>("job_creator");
  const [showHistory, setShowHistory] = useState(false);

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
  const [creatingJob, setCreatingJob] = useState(false);
  const [jobCreatedMsg, setJobCreatedMsg] = useState("");
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

  // Voice input — language is user-selectable (not just URL locale)
  const {
    isRecording,
    isProcessing: isVoiceProcessing,
    startRecording,
    stopRecording,
    transcript,
    clearTranscript,
    error: voiceError,
  } = useVoiceInput({
    language: voiceLanguage,
    maxDurationMs: 30000,
    onTranscript: (text) => {
      setInput((prev) => prev ? `${prev} ${text}` : text);
    },
  });

  // Auto-focus textarea when voice transcript arrives
  useEffect(() => {
    if (transcript && textareaRef.current) {
      textareaRef.current.focus();
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
    await fetch(`/api/ai/chat-history?threadId=${id}`, { method: "DELETE" });
    setThreads((prev) => prev.filter((t) => t._id !== id));
    if (threadId === id) newConversation();
  };

  const newConversation = () => {
    setTabMessages((prev) => ({ ...prev, [activeTab]: [] }));
    setThreadIds((prev) => ({ ...prev, [activeTab]: null }));
    setExtractedJob(null);
    setJobCreatedMsg("");
    setShowHistory(false);
  };

  const sendMessage = useCallback(
    async (overrideContent?: string) => {
      const content = overrideContent ?? input.trim();
      if (!content || isStreaming) return;

      clearTranscript();
      setInput("");
      setExtractedJob(null);

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
          const match = accumulated.match(/<JOB_DATA>([\s\S]*?)<\/JOB_DATA>/);
          if (match) {
            try {
              setExtractedJob(JSON.parse(match[1].trim()));
            } catch { /* ignore */ }
          }
        }

        // Persist to history
        const histRes = await fetch("/api/ai/chat-history", {
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
            content: "Sorry, something went wrong. Please try again.",
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
        setJobCreatedMsg("Draft created! Redirecting to edit page...");
        setExtractedJob(null);
        setTimeout(() => {
          router.push(`/${locale}/employer/jobs/${data.job?._id ?? ""}/edit`);
        }, 1500);
      } else {
        const err = await res.json().catch(() => ({}));
        setJobCreatedMsg((err as { error?: string }).error ?? "Failed to create job draft. Please try again.");
      }
    } finally {
      setCreatingJob(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const toggleVoice = () => {
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  };

  const showWelcome = messages.length === 0 && !isStreaming;

  if (!mounted) return null;

  const panelClass = cn(
    "fixed z-[100] flex flex-col bg-background border border-border/70 shadow-2xl overflow-hidden transition-all duration-300 ease-in-out",
    minimized
      ? "bottom-6 right-6 h-12 w-48 rounded-full bg-gradient-to-r from-indigo-700 to-primary border-0"
      : expanded
        ? "top-0 right-0 bottom-0 w-full md:w-[480px] lg:w-[520px] rounded-none md:rounded-l-2xl md:border-l md:border-y border-r-0"
        : "bottom-6 right-6 h-[600px] w-[420px] max-h-[90vh] rounded-2xl"
  );

  return createPortal(
    <>
      {/* Floating trigger button — only shown when fully closed */}
      {!open && (
        <button
          onClick={() => { setOpen(true); setMinimized(false); }}
          className="fixed bottom-6 right-6 z-[99] h-14 w-14 rounded-2xl bg-gradient-to-br from-primary to-indigo-600 text-white shadow-xl hover:shadow-primary/30 hover:scale-105 transition-all duration-200 flex items-center justify-center gap-1 group"
          aria-label="Open Recruitment AI"
          title="Ask AI to create jobs, screen candidates, or prepare interviews"
        >
          <Sparkles className="h-5 w-5 absolute top-2.5 right-2.5 text-white/60 group-hover:text-white/80 transition-colors" />
          <Bot className="h-6 w-6" />
          {/* Suggestion pulse indicator */}
          <span className="absolute -top-1 -right-1 flex h-3.5 w-3.5">
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
              <div className="flex items-center gap-2.5 px-4 h-full cursor-pointer">
                <Bot className="h-5 w-5 text-white shrink-0" />
                <span className="text-sm font-semibold text-white truncate">Recruitment AI</span>
                <button
                  onClick={(e) => { e.stopPropagation(); setOpen(false); setMinimized(false); }}
                  className="ml-auto text-white/60 hover:text-white transition-colors p-0.5 rounded-full hover:bg-white/20"
                  title="Close"
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
            <div className="flex items-center gap-2.5 px-4 py-3 bg-gradient-to-r from-indigo-700 to-primary shrink-0">
              <div className="w-8 h-8 rounded-xl bg-white/20 flex items-center justify-center flex-shrink-0">
                <Bot className="h-4.5 w-4.5 text-white h-[18px] w-[18px]" />
              </div>
              <div className="flex-1 min-w-0">
                <h2 className="text-sm font-bold text-white leading-tight">Recruitment AI</h2>
                <p className="text-xs text-white/60 truncate">
                  {isStreaming ? "Thinking…" : "Your hiring assistant"}
                </p>
              </div>
              <button
                onClick={newConversation}
                className="text-white/60 hover:text-white transition-colors p-1 rounded-lg hover:bg-white/10"
                title="New conversation"
              >
                <Plus className="h-4 w-4" />
              </button>
              <button
                onClick={() => setShowHistory((v) => !v)}
                className={cn(
                  "text-white/60 hover:text-white transition-colors p-1 rounded-lg hover:bg-white/10",
                  showHistory && "text-white bg-white/20"
                )}
                title="History"
              >
                <History className="h-4 w-4" />
              </button>
              <button
                onClick={() => {
                  setExpanded((e) => !e);
                  setMinimized(false);
                }}
                className="text-white/60 hover:text-white transition-colors p-1 rounded-lg hover:bg-white/10"
                title={expanded ? "Restore" : "Expand"}
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
                title="Minimize"
              >
                <Minus className="h-4 w-4" />
              </button>
              <button
                onClick={() => setOpen(false)}
                className="text-white hover:bg-white/20 transition-colors p-1 rounded-full"
                title="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

                {/* ── Tab bar ── */}
                <div className="flex border-b border-border shrink-0 bg-background/95">
                  {TABS.map((tab) => (
                    <button
                      key={tab.id}
                      onClick={() => {
                        setActiveTab(tab.id);
                        setShowHistory(false);
                        setExtractedJob(null);
                        setJobCreatedMsg("");
                      }}
                      className={cn(
                        "flex-1 py-2.5 text-xs font-semibold transition-all border-b-2 -mb-px",
                        activeTab === tab.id
                          ? "border-primary text-primary"
                          : "border-transparent text-muted-foreground hover:text-foreground"
                      )}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>

                {/* ── History panel ── */}
                {showHistory && (
                  <div className="flex-1 overflow-y-auto ai-panel-scroll p-3 space-y-1">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide px-1 mb-2">
                      Recent Conversations
                    </p>
                    {loadingHistory && (
                      <div className="flex justify-center py-8">
                        <Loader2 className="h-5 w-5 animate-spin text-primary" />
                      </div>
                    )}
                    {!loadingHistory && threads.length === 0 && (
                      <p className="text-sm text-center text-muted-foreground py-8">
                        No conversations yet
                      </p>
                    )}
                    {threads.map((t) => (
                      <div
                        key={t._id}
                        onClick={() => loadThread(t)}
                        className="flex items-center gap-2 p-2.5 rounded-xl hover:bg-muted/60 cursor-pointer group transition-colors"
                      >
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{t.title || "Untitled"}</p>
                          <p className="text-xs text-muted-foreground">
                            {new Date(t.updatedAt).toLocaleDateString()}
                          </p>
                        </div>
                        <button
                          onClick={(e) => deleteThread(t._id, e)}
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
                          <JobCreatorWelcome onAction={(p) => sendMessage(p)} />
                        ) : activeTab === "interview_ai" ? (
                          <InterviewWelcome onAction={(p) => sendMessage(p)} />
                        ) : (
                          <ScreeningWelcome onAction={(p) => sendMessage(p)} />
                        )
                      ) : (
                        /* Message list */
                        <div className="p-4 space-y-3">
                          {messages.map((msg, i) => (
                            <MessageBubble
                              key={i}
                              msg={msg}
                              isLastAssistant={
                                msg.role === "assistant" &&
                                i === messages.length - 1 &&
                                isStreaming
                              }
                            />
                          ))}

                          {/* Job preview card (job_creator only) */}
                          {activeTab === "job_creator" && extractedJob && (
                            <JobPreviewCard
                              job={extractedJob}
                              onCreateDraft={createJobDraft}
                              creating={creatingJob}
                              createdMsg={jobCreatedMsg}
                            />
                          )}
                          {jobCreatedMsg && !extractedJob && (
                            <p className="text-xs text-center text-emerald-600 font-medium py-2">
                              {jobCreatedMsg}
                            </p>
                          )}
                          <div ref={messagesEndRef} />
                        </div>
                      )}
                    </div>

                    {/* ── Input bar ── */}
                    <InputBar
                      value={input}
                      onChange={setInput}
                      onSend={() => sendMessage()}
                      onKeyDown={handleKeyDown}
                      isStreaming={isStreaming}
                      isRecording={isRecording}
                      isVoiceProcessing={isVoiceProcessing}
                      onToggleVoice={toggleVoice}
                      tabId={activeTab}
                      textareaRef={textareaRef}
                      voiceError={voiceError}
                      voiceLanguage={voiceLanguage}
                      onVoiceLanguageChange={setVoiceLanguage}
                    />
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
function renderInline(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**"))
      return <strong key={i} className="font-semibold">{part.slice(2, -2)}</strong>;
    if (part.startsWith("*") && part.endsWith("*"))
      return <em key={i}>{part.slice(1, -1)}</em>;
    if (part.startsWith("`") && part.endsWith("`"))
      return <code key={i} className="rounded bg-black/10 px-1 font-mono text-[0.88em] dark:bg-white/10">{part.slice(1, -1)}</code>;
    return part;
  });
}

function renderMarkdown(text: string) {
  const blocks = text.split(/\n{2,}/);
  return blocks.map((block, bi) => {
    const indent = bi > 0 ? "mt-2" : "";
    // Numbered list block
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
    // Bullet list block
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
    // Normal paragraph with inline \n as <br />
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

// ─── Message bubble ──────────────────────────────────────────────
function MessageBubble({
  msg,
  isLastAssistant,
}: {
  msg: Message;
  isLastAssistant: boolean;
}) {
  // Strip <JOB_DATA>...</JOB_DATA> from display
  const displayContent = msg.content
    .replace(/<JOB_DATA>[\s\S]*?<\/JOB_DATA>/g, "")
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
            : "bg-muted text-foreground rounded-tl-none"
        )}
      >
        {displayContent ? (
          msg.role === "assistant" ? (
            <div className="prose-sm prose-p:my-0 prose-li:my-0">
              {renderMarkdown(displayContent)}
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
  return (
    <div className="rounded-2xl border border-emerald-200 bg-emerald-50/50 dark:border-emerald-900/40 dark:bg-emerald-950/20 p-4 space-y-3 mt-2">
      <div className="flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-emerald-600 flex-shrink-0" />
        <h4 className="text-xs font-bold text-emerald-700 dark:text-emerald-400 uppercase tracking-wide">
          Job Preview
        </h4>
      </div>
      <div className="space-y-1.5 text-xs">
        {job.title && (
          <Row label="Title" value={job.title} />
        )}
        {job.category && <Row label="Category" value={job.category} />}
        {job.location?.country && (
          <Row
            label="Location"
            value={`${job.location.city ? `${job.location.city}, ` : ""}${job.location.country}${job.location.isRemote ? " (Remote)" : ""}`}
          />
        )}
        {job.salary && (
          <Row
            label="Salary"
            value={`${job.salary.currency ?? "USD"} ${job.salary.min?.toLocaleString()} – ${job.salary.max?.toLocaleString()} / ${job.salary.period ?? "month"}`}
          />
        )}
        {job.requirements?.skills?.length ? (
          <div className="flex gap-1.5 flex-wrap mt-1">
            {job.requirements.skills.slice(0, 8).map((s) => (
              <span
                key={s}
                className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300 text-[11px] font-medium"
              >
                {s}
              </span>
            ))}
          </div>
        ) : null}
      </div>
      {createdMsg ? (
        <p className="text-xs text-emerald-600 font-medium">{createdMsg}</p>
      ) : (
        <Button
          size="sm"
          onClick={onCreateDraft}
          disabled={creating}
          className="w-full h-8 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold"
        >
          {creating ? (
            <>
              <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
              Creating…
            </>
          ) : (
            <>
              Create Job Draft
              <ChevronRight className="h-3.5 w-3.5 ml-1" />
            </>
          )}
        </Button>
      )}
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
  isRecording: boolean;
  isVoiceProcessing: boolean;
  onToggleVoice: () => void;
  tabId: TabId;
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  voiceError: string | null;
  voiceLanguage: string;
  onVoiceLanguageChange: (lang: string) => void;
}

const INPUT_PLACEHOLDERS: Record<TabId, string> = {
  job_creator:
    'e.g. "MERN developer, 5 yrs exp, salary 50000 Rs" or use voice',
  interview_ai: "Describe a role or ask for interview questions…",
  screening_ai: "Describe a job or paste candidate details to screen…",
};

function InputBar({
  value,
  onChange,
  onSend,
  onKeyDown,
  isStreaming,
  isRecording,
  isVoiceProcessing,
  onToggleVoice,
  tabId,
  textareaRef,
  voiceError,
  voiceLanguage,
  onVoiceLanguageChange,
}: InputBarProps) {
  const [showLangPicker, setShowLangPicker] = useState(false);
  const currentLang = VOICE_LANGUAGES.find((l) => l.code === voiceLanguage) ?? VOICE_LANGUAGES[0];

  return (
    <div className="border-t border-border/70 bg-background/95 p-3 shrink-0">
      <div className="flex gap-2 items-end">
        {/* Attachment (placeholder — future feature) */}
        <button
          className="text-muted-foreground hover:text-foreground transition-colors p-1.5 rounded-lg hover:bg-muted flex-shrink-0 mb-0.5"
          title="Attach file (coming soon)"
          disabled
        >
          <Paperclip className="h-4 w-4" />
        </button>

        {/* Text input */}
        <Textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={INPUT_PLACEHOLDERS[tabId]}
          className="min-h-[40px] max-h-[120px] resize-none text-sm flex-1 bg-muted/30 border-border/50 focus:border-primary/50 rounded-xl"
          rows={1}
          disabled={isStreaming || isRecording || isVoiceProcessing}
        />

        {/* Voice language picker + mic button */}
        <div className="flex-shrink-0 flex flex-col items-center gap-0.5 relative">
          {/* Language selector — shown above mic */}
          <div className="relative">
            <button
              onClick={() => setShowLangPicker((v) => !v)}
              disabled={isRecording || isVoiceProcessing}
              className="flex items-center gap-0.5 text-[10px] text-muted-foreground hover:text-foreground transition-colors px-1 py-0.5 rounded hover:bg-muted disabled:opacity-40"
              title="Voice language"
            >
              <Globe className="h-2.5 w-2.5" />
              <span>{currentLang.flag} {currentLang.code.toUpperCase()}</span>
            </button>
            {showLangPicker && !isRecording && (
              <div className="absolute bottom-full right-0 mb-1 z-50 w-36 rounded-xl border border-border bg-popover shadow-lg overflow-hidden">
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
                    <span>{lang.label}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Mic button */}
          <button
            onClick={onToggleVoice}
            disabled={isStreaming || isVoiceProcessing}
            className={cn(
              "w-9 h-9 rounded-xl border flex items-center justify-center transition-all duration-150",
              isRecording
                ? "border-red-200 bg-red-50 text-red-600 hover:bg-red-100"
                : isVoiceProcessing
                  ? "border-amber-200 bg-amber-50 text-amber-600"
                  : "border-border/60 bg-background text-muted-foreground shadow-sm shadow-black/[0.04] hover:bg-primary/10 hover:text-primary",
              (isStreaming || isVoiceProcessing) && !isRecording && "opacity-50 cursor-not-allowed"
            )}
            title={isVoiceProcessing ? `Processing voice input (${currentLang.label})` : isRecording ? `Stop voice input (${currentLang.label})` : `Start voice input (${currentLang.label})`}
            aria-label={isVoiceProcessing ? "Processing voice input" : isRecording ? "Stop voice input" : "Start voice input"}
            aria-pressed={isRecording}
          >
            {isVoiceProcessing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : isRecording ? (
              <MicOff className="h-4 w-4" />
            ) : (
              <Mic className="h-4 w-4" />
            )}
          </button>
        </div>

        {/* Send button */}
        <Button
          size="icon"
          onClick={onSend}
          disabled={!value.trim() || isStreaming || isRecording || isVoiceProcessing}
          className="flex-shrink-0 w-9 h-9 rounded-xl bg-gradient-to-br from-primary to-indigo-600 hover:from-primary/90 hover:to-indigo-600/90 shadow-sm self-end"
          aria-label="Send message"
        >
          <Send className="h-4 w-4" />
        </Button>
      </div>

      <VoiceInputStatus
        className="mt-2"
        isRecording={isRecording}
        isProcessing={isVoiceProcessing}
        error={voiceError}
        recordingText={`Recording ${currentLang.label} - tap the mic to stop.`}
        idleText="AI can make mistakes. Check important info."
      />
    </div>
  );
}
