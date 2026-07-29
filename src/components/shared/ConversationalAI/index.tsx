"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { createPortal } from "react-dom";
import { usePathname, useRouter } from "next/navigation";
import { useLocale } from "next-intl";
import { cn } from "@/lib/utils";
import { Bot, X, Send, Minimize2, Maximize2, History, Plus, Trash2, UserCheck, Expand, Shrink, Mic, Loader2, ExternalLink, Users2, TrendingUp, BarChart3, MessageSquare, Briefcase, Zap, Globe } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useVoiceInput } from "@/hooks/useVoiceInput";
import { useTranslations } from "next-intl";
import { csrfFetch } from "@/lib/security/csrf-client";

interface Message {
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
}

interface Thread {
  _id: string;
  title: string;
  context: string;
  updatedAt: string;
  messages: Message[];
}

interface ProfileSummary {
  name?: string;
  skills: string[];
  experience: string;
}

// ─── Markdown renderer ─────────────────────────────────────────
function hasMalayalam(text: string): boolean {
  return /[\u0D00-\u0D7F]/.test(text);
}

/** Convert absolute mployedin.com URLs to relative paths */
function normalizeHref(href: string | undefined): string | undefined {
  if (!href) return href;
  try {
    const stripped = href.replace(/^https?:\/\/(www\.)?mployedin\.com/, "");
    if (stripped !== href) return stripped || "/";
  } catch { /* keep original */ }
  return href;
}

function AIMarkdown({ content }: { content: string }) {
  const router = useRouter();
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        h1: ({ ...props }) => <h1 className="text-base font-bold mt-3 mb-1" {...props} />,
        h2: ({ ...props }) => <h2 className="text-sm font-bold mt-3 mb-1" {...props} />,
        h3: ({ ...props }) => <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mt-3 mb-1" {...props} />,
        p: ({ ...props }) => <p className="my-1 leading-relaxed" {...props} />,
        ul: ({ ...props }) => <ul className="list-disc list-inside space-y-0.5 my-1" {...props} />,
        ol: ({ ...props }) => <ol className="list-decimal list-inside space-y-0.5 my-1" {...props} />,
        li: ({ ...props }) => <li className="leading-relaxed" {...props} />,
        strong: ({ ...props }) => <strong className="font-semibold" {...props} />,
        code: ({ ...props }) => <code className="rounded bg-black/10 px-1 font-mono text-[0.88em] dark:bg-white/10" {...props} />,
        a: ({ href: rawHref, ...props }) => {
          const href = normalizeHref(rawHref);
          const isInternal = href?.startsWith("/");
          return (
            <a
              href={href}
              {...(!isInternal && { target: "_blank", rel: "noopener noreferrer" })}
              className="text-primary underline underline-offset-2 hover:text-primary/80"
              onClick={isInternal ? (e) => {
                e.preventDefault();
                e.stopPropagation();
                if (href) router.push(href);
              } : undefined}
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

interface ConversationalAIProps {
  context?: string;
  className?: string;
}

// ─── AI_ACTION parsing helpers ──────────────────────────────────
interface AIAction {
  label: string;
  path: string;
}

const ROLE_PATH_PREFIXES: Record<string, string> = {
  admin_assist: "/admin/",
  super_agent_assist: "/super-agent/",
  agent_assist: "/agent/",
  general_assist: "/job-seeker/",
};

interface QuickPrompt {
  icon: React.ReactNode;
  label: string;
}

const CONTEXT_PROMPT_ICONS: Record<string, Record<string, React.ReactNode>> = {
  super_agent_assist: {
    underperforming: <Users2 className="h-3.5 w-3.5 shrink-0" />,
    conversions: <TrendingUp className="h-3.5 w-3.5 shrink-0" />,
    compare: <BarChart3 className="h-3.5 w-3.5 shrink-0" />,
    improve: <MessageSquare className="h-3.5 w-3.5 shrink-0" />,
  },
  general_assist: {
    findJobs: <Briefcase className="h-3.5 w-3.5 shrink-0" />,
    missingSkills: <Zap className="h-3.5 w-3.5 shrink-0" />,
    improveCv: <TrendingUp className="h-3.5 w-3.5 shrink-0" />,
    interviewPrep: <MessageSquare className="h-3.5 w-3.5 shrink-0" />,
  },
};

function parseAIActions(text: string): AIAction[] {
  const matches = [...text.matchAll(/<AI_ACTION>([\s\S]*?)<\/AI_ACTION>/g)];
  const actions: AIAction[] = [];
  for (const m of matches) {
    try {
      const parsed = JSON.parse(m[1]);
      if (parsed.label && parsed.path && typeof parsed.path === "string") {
        actions.push({ label: String(parsed.label), path: parsed.path });
      }
    } catch {
      // skip malformed actions
    }
  }
  return actions;
}

function stripAIActions(text: string): string {
  return text.replace(/<AI_ACTION>[\s\S]*?<\/AI_ACTION>/g, "").trim();
}

export function ConversationalAI({
  context = "general_assist",
  className,
}: ConversationalAIProps) {
  const pathname = usePathname();
  const router = useRouter();
  const locale = useLocale();
  const isRtl = locale === "ar";
  const t = useTranslations("ai");
  const [open, setOpen] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [threadId, setThreadIdState] = useState<string | null>(null);
  const [threads, setThreads] = useState<Thread[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [historyLoaded, setHistoryLoaded] = useState(false);

  // Persist threadId to sessionStorage so it survives remounts
  const storageKey = `ai-thread-${context}`;
  const setThreadId = useCallback((id: string | null) => {
    setThreadIdState(id);
    try {
      if (id) sessionStorage.setItem(storageKey, id);
      else sessionStorage.removeItem(storageKey);
    } catch { /* SSR or storage unavailable */ }
  }, [storageKey]);

  // Restore threadId from sessionStorage on mount
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(storageKey);
      if (saved) setThreadIdState(saved);
    } catch { /* SSR or storage unavailable */ }
  }, [storageKey]);
  const [profileSummary, setProfileSummary] = useState<ProfileSummary | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const {
    state: voiceState,
    isRecording,
    isProcessing: isVoiceProcessing,
    transcript: voiceTranscript,
    durationLabel,
    startRecording,
    cancelRecording,
    submitRecording,
    clearTranscript,
    error: voiceError,
  } = useVoiceInput({ language: "auto", mode: "explicitSend", maxDurationMs: 60000 });

  const autoResize = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 220)}px`;
  }, []);

  // Sync voice transcript into the text input
  useEffect(() => {
    if (voiceTranscript) {
      setInput(voiceTranscript);
      clearTranscript();
    }
  }, [voiceTranscript, clearTranscript]);

  useEffect(() => {
    autoResize();
  }, [autoResize, input]);

  useEffect(() => {
    if (!isRecording) {
      return;
    }

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        cancelRecording();
      }
    };

    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [cancelRecording, isRecording]);

  useEffect(() => { setMounted(true); }, []);

  // Fetch profile summary for context indicator (job seekers only)
  useEffect(() => {
    if (context !== "general_assist" && context !== "interview_prep" && context !== "cv_extraction" && context !== "job_match") return;
    fetch("/api/job-seeker/profile")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!data) return;
        const skills = data.skills ?? [];
        const yrs = data.totalExperienceYears ?? 0;
        const mos = data.totalExperienceMonths ?? 0;
        const exp = yrs || mos ? `${yrs}y${mos ? ` ${mos}m` : ""}` : "";
        setProfileSummary({ name: data.headline, skills: skills.slice(0, 4), experience: exp });
      })
      .catch(() => { /* not a job seeker or profile unavailable */ });
  }, [context]);

  useEffect(() => {
    if (messagesContainerRef.current) {
      messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight;
    }
  }, [messages]);

  const loadHistory = useCallback(async () => {
    setLoadingHistory(true);
    try {
      const res = await fetch(`/api/ai/chat-history?context=${context}&limit=10`);
      if (res.ok) {
        const data = await res.json();
        setThreads(data.threads ?? []);
      }
    } finally {
      setLoadingHistory(false);
    }
  }, [context]);

  // Auto-fetch history when panel opens (silently in background)
  // Cleanup prevents stale data on rapid open/close or context changes
  useEffect(() => {
    if (!open) {
      setHistoryLoaded(false);
      return;
    }

    let stale = false;
    loadHistory().then(() => {
      if (!stale) setHistoryLoaded(true);
    });

    return () => { stale = true; };
  }, [open, loadHistory, context]);

  // Also refresh when user toggles the History panel
  useEffect(() => {
    if (open && showHistory) loadHistory();
  }, [open, showHistory, loadHistory]);

  // Auto-load the most recent thread when history is fetched and no active conversation
  useEffect(() => {
    if (!historyLoaded || threads.length === 0) return;
    if (messages.length > 0) return; // don't override an active conversation

    // If we have a saved threadId from sessionStorage, try to load that thread
    const saved = threadId;
    if (saved) {
      const match = threads.find((t) => t._id === saved);
      if (match) {
        setMessages(match.messages.map((m) => ({ ...m, timestamp: new Date(m.timestamp) })));
        return;
      }
    }

    // Otherwise load the most recent thread (defensive sort in case API order changes)
    const sorted = [...threads].sort(
      (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    );
    const latest = sorted[0];
    setThreadId(latest._id);
    setMessages(latest.messages.map((m) => ({ ...m, timestamp: new Date(m.timestamp) })));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [historyLoaded, threads]);

  const loadThread = (thread: Thread) => {
    setThreadId(thread._id);
    setMessages(thread.messages.map((m) => ({ ...m, timestamp: new Date(m.timestamp) })));
    setShowHistory(false);
  };

  const newConversation = () => {
    setThreadId(null);
    setMessages([]);
    setShowHistory(false);
    setHistoryLoaded(false); // prevent auto-load from restoring old thread
  };

  const deleteThread = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    await csrfFetch(`/api/ai/chat-history?threadId=${id}`, { method: "DELETE" });
    setThreads((prev) => prev.filter((t) => t._id !== id));
    if (threadId === id) newConversation();
  };

  const quickPrompts: QuickPrompt[] = (() => {
    const icons = CONTEXT_PROMPT_ICONS[context];
    if (!icons) return [];
    if (context === "super_agent_assist") {
      return [
        { icon: icons.underperforming, label: t("quickPrompts.superAgent.underperforming") },
        { icon: icons.conversions, label: t("quickPrompts.superAgent.conversions") },
        { icon: icons.compare, label: t("quickPrompts.superAgent.compare") },
        { icon: icons.improve, label: t("quickPrompts.superAgent.improve") },
      ];
    }
    if (context === "general_assist") {
      return [
        { icon: icons.findJobs, label: t("quickPrompts.jobSeeker.findJobs") },
        { icon: icons.missingSkills, label: t("quickPrompts.jobSeeker.missingSkills") },
        { icon: icons.improveCv, label: t("quickPrompts.jobSeeker.improveCv") },
        { icon: icons.interviewPrep, label: t("quickPrompts.jobSeeker.interviewPrep") },
      ];
    }
    return [];
  })();

  async function sendMessage(overrideText?: string) {
    const text = overrideText ?? input;
    if (!text.trim() || isStreaming) return;

    const userMsg: Message = {
      role: "user",
      content: text.trim(),
      timestamp: new Date(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setIsStreaming(true);

    const assistantMsg: Message = {
      role: "assistant",
      content: "",
      timestamp: new Date(),
    };
    setMessages((prev) => [...prev, assistantMsg]);

    let accumulated = "";
    let currentThreadId = threadId;

    try {
      // Save user message immediately (before AI stream) to prevent data loss
      const saveUserRes = await csrfFetch("/api/ai/chat-history", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          threadId: currentThreadId,
          context,
          messages: [{ role: "user" as const, content: userMsg.content }],
          title: messages.length === 0 ? userMsg.content.slice(0, 50) : undefined,
        }),
      });
      if (saveUserRes.ok) {
        const saveData = await saveUserRes.json();
        if (!currentThreadId) {
          currentThreadId = saveData.threadId;
          setThreadId(currentThreadId);
        }
      }

      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [...messages, userMsg].map((m) => ({
            role: m.role,
            content: m.content,
          })),
          context,
          currentPage: pathname,
        }),
      });

      if (!res.ok || !res.body) throw new Error("Stream error");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();

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

      // Persist assistant response to DB (user message already saved above)
      if (!accumulated.trim()) return;

      await csrfFetch("/api/ai/chat-history", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          threadId: currentThreadId,
          context,
          messages: [{ role: "assistant" as const, content: accumulated }],
        }),
      });
    } catch {
      setMessages((prev) => {
        const copy = [...prev];
        copy[copy.length - 1] = {
          ...copy[copy.length - 1],
          content: t("errorMessage"),
        };
        return copy;
      });
    } finally {
      setIsStreaming(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }

  const isIdle = voiceState === "idle";

  if (!mounted) return null;

  return createPortal(
    <>
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className={cn(
            "fixed bottom-20 z-[100] flex h-14 w-14 items-center justify-center rounded-full shadow-lg lg:bottom-6",
            isRtl ? "left-4 lg:left-6" : "right-4 lg:right-6",
            "bg-primary text-white hover:bg-primary/90 transition-all duration-200 hover:scale-105",
            className
          )}
          aria-label={t("openAssistant")}
        >
          <Bot className="h-6 w-6" />
        </button>
      )}

      {open && (
        <>
        {/* Backdrop — click outside to close */}
        <div
          className="fixed inset-0 z-[99]"
          onClick={() => setOpen(false)}
          aria-hidden="true"
        />
        <div
          className={cn(
            "fixed z-[100] flex flex-col shadow-2xl border border-border bg-background",
            "transition-all duration-300 ease-in-out",
            // Below sm the panel spans the viewport with a small inset: a fixed
            // 380px width plus right-6 resolved to left:-20px on a 384px screen,
            // and bottom-6 put it under the mobile tab bar.
            minimized
              ? cn("bottom-24 inset-x-3 w-auto rounded-xl h-14 sm:bottom-6 sm:inset-x-auto sm:w-80", isRtl ? "sm:left-6" : "sm:right-6")
              : expanded
                ? cn("top-0 bottom-0 w-full md:w-[480px] lg:w-[520px]", isRtl ? "left-0 rounded-none md:rounded-r-2xl" : "right-0 rounded-none md:rounded-l-2xl")
                : cn(
                    "bottom-20 inset-x-3 w-auto rounded-xl h-[65vh] max-h-[520px]",
                    "sm:bottom-6 sm:inset-x-auto sm:h-[520px] sm:w-[380px]",
                    isRtl ? "sm:left-6" : "sm:right-6"
                  )
          )}
        >
          {/* Header */}
          <div className={cn(
            "flex items-center gap-2 px-4 py-3 bg-primary text-white",
            expanded && !minimized
              ? isRtl ? "rounded-none md:rounded-tr-2xl" : "rounded-none md:rounded-tl-2xl"
              : "rounded-t-xl"
          )}>
            <Bot className="h-5 w-5" />
            <div className="flex-1">
              <p className="text-sm font-semibold">{t("assistant")}</p>
              {!minimized && (
                <p className="text-xs text-white/70">
                  {isStreaming ? t("thinking") : t("readyToHelp")}
                </p>
              )}
            </div>
            {!minimized && (
              <>
                <button
                  onClick={newConversation}
                  className="text-white/70 hover:text-white transition-colors p-1 rounded-lg hover:bg-white/10"
                  title={t("newConversation")}
                >
                  <Plus className="h-4 w-4" />
                </button>
                <button
                  onClick={() => { setShowHistory((v) => !v); }}
                  className="text-white/70 hover:text-white transition-colors p-1 rounded-lg hover:bg-white/10"
                  title={t("chatHistory")}
                >
                  <History className="h-4 w-4" />
                </button>
                <button
                  onClick={() => { setExpanded((e) => !e); setMinimized(false); }}
                  className="text-white/70 hover:text-white transition-colors p-1 rounded-lg hover:bg-white/10"
                  title={expanded ? t("restore") : t("expand")}
                >
                  {expanded ? <Shrink className="h-4 w-4" /> : <Expand className="h-4 w-4" />}
                </button>
              </>
            )}
            <button onClick={() => setMinimized((m) => !m)} className="text-white/70 hover:text-white transition-colors p-1 rounded-lg hover:bg-white/10">
              {minimized ? <Maximize2 className="h-4 w-4" /> : <Minimize2 className="h-4 w-4" />}
            </button>
            <button onClick={() => { setOpen(false); setExpanded(false); setMinimized(false); }} className="text-white hover:bg-white/20 rounded-full p-1 transition-colors" title={t("close")}>
              <X className="h-5 w-5" />
            </button>
          </div>

          {!minimized && showHistory && (
            <div className="flex-1 overflow-y-auto p-3 space-y-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide px-1">
                {t("recentConversations")}
              </p>
              {loadingHistory && (
                <p className="text-sm text-center text-muted-foreground py-4">{t("loading")}</p>
              )}
              {!loadingHistory && threads.length === 0 && (
                <p className="text-sm text-center text-muted-foreground py-4">{t("noConversationsYet")}</p>
              )}
              {threads.map((th) => (
                <div
                  key={th._id}
                  onClick={() => loadThread(th)}
                  className="flex items-center gap-2 p-2 rounded-lg hover:bg-muted/60 cursor-pointer group"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{th.title || t("untitled")}</p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(th.updatedAt).toLocaleDateString()}
                    </p>
                  </div>
                  <button
                    onClick={(e) => deleteThread(th._id, e)}
                    className="shrink-0 text-muted-foreground hover:text-red-500 transition-colors p-1 rounded hover:bg-red-50 dark:hover:bg-red-950/30"
                    title={t("deleteConversation")}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {!minimized && !showHistory && (
            <>
              {/* Messages */}
              <div ref={messagesContainerRef} className="flex-1 overflow-y-auto p-4 space-y-3 ai-panel-scroll">
                {messages.length === 0 && loadingHistory && (
                  <div className="text-center text-muted-foreground text-sm mt-12">
                    <Loader2 className="h-6 w-6 mx-auto mb-2 text-primary/50 animate-spin" />
                    <p>{t("loadingConversation")}</p>
                  </div>
                )}
                {messages.length === 0 && !loadingHistory && (
                  <div className="text-center text-muted-foreground text-sm mt-8">
                    <Bot className="h-8 w-8 mx-auto mb-2 text-primary/50" />
                    <p>{t("greeting")}</p>
                    <p>{t("howCanIHelp")}</p>

                    {/* Context-aware quick prompts */}
                    {quickPrompts.length > 0 && (
                      <div className="mt-4 mx-auto max-w-[320px] grid grid-cols-1 gap-1.5 text-left">
                        {quickPrompts.map((qp) => (
                          <button
                            key={qp.label}
                            onClick={() => sendMessage(qp.label)}
                            disabled={isStreaming}
                            className="flex items-center gap-2 rounded-xl border border-border/60 bg-background/60 dark:bg-card/40 px-3 py-2 text-xs text-foreground hover:border-primary/40 hover:bg-primary/5 transition-colors text-left disabled:opacity-50"
                          >
                            <span className="text-primary">{qp.icon}</span>
                            <span className="leading-snug">{qp.label}</span>
                          </button>
                        ))}
                      </div>
                    )}

                    {profileSummary && (profileSummary.skills.length > 0 || profileSummary.experience) && (
                      <div className="mt-4 mx-auto max-w-[300px] rounded-2xl border p-4 text-left" style={{ background: '#ffffff', borderColor: '#e5e7eb' }}>
                        <div className="flex items-center gap-1.5 text-sm font-semibold mb-3" style={{ color: '#2563eb' }}>
                          <UserCheck className="h-4 w-4" />
                          {t("usingProfileData")}
                        </div>
                        {profileSummary.skills.length > 0 && (
                          <>
                            <div className="mb-3" style={{ borderTop: '1px solid #e5e7eb', paddingTop: '12px' }}>
                              <p className="text-sm font-bold mb-2" style={{ color: '#111827' }}>{t("skills")}</p>
                              <div className="flex flex-wrap gap-1.5">
                                {profileSummary.skills.map((s) => (
                                  <span key={s} className="inline-block rounded-full px-3 py-1 text-xs font-medium" style={{ background: '#f3f4f6', color: '#111827' }}>
                                    {s}
                                  </span>
                                ))}
                              </div>
                            </div>
                          </>
                        )}
                        {profileSummary.experience && (
                          <>
                            <div className="mb-3" style={{ borderTop: '1px solid #e5e7eb', paddingTop: '12px' }}>
                              <p className="text-sm font-bold mb-2" style={{ color: '#111827' }}>{t("experience")}</p>
                              <span className="inline-block rounded-full px-3 py-1 text-xs font-medium" style={{ background: '#f3f4f6', color: '#111827' }}>
                                {profileSummary.experience} {t("exp")}
                              </span>
                            </div>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                )}
                {messages.map((msg, i) => (
                  <div
                    key={i}
                    className={cn(
                      "flex gap-2.5",
                      msg.role === "user" ? "justify-end" : "justify-start"
                    )}
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
                      {msg.role === "assistant" ? (
                        <div className="prose-sm prose-p:my-0 prose-li:my-0">
                          <AIMarkdown content={stripAIActions(msg.content)} />
                          {isStreaming && i === messages.length - 1 && (
                            <span className="inline-block w-0.5 h-4 ml-0.5 bg-current opacity-60 animate-pulse align-middle" />
                          )}
                          {(() => {
                            const actions = parseAIActions(msg.content);
                            const prefix = ROLE_PATH_PREFIXES[context] ?? "/";
                            const validActions = actions.filter((a) => a.path.startsWith(prefix));
                            if (validActions.length === 0) return null;
                            return (
                              <div className="mt-2 flex flex-wrap gap-1.5">
                                {validActions.map((action, ai) => (
                                  <button
                                    key={ai}
                                    onClick={() => router.push(action.path)}
                                    className="inline-flex items-center gap-1 rounded-lg border border-primary/30 bg-primary/5 px-2.5 py-1 text-xs font-medium text-primary hover:bg-primary/10 transition-colors"
                                  >
                                    <ExternalLink className="h-3 w-3" />
                                    {action.label}
                                  </button>
                                ))}
                              </div>
                            );
                          })()}
                        </div>
                      ) : (
                        <>
                          {msg.content}
                        </>
                      )}
                    </div>
                  </div>
                ))}
                <div ref={bottomRef} />
              </div>

              {/* Input */}
              <div className="border-t border-border/70 bg-background/95 p-3 shrink-0">
                <div className="space-y-3">
                  <div className="rounded-2xl border border-border/60 bg-background p-2.5 shadow-sm shadow-black/[0.04]">
                    <Textarea
                      ref={textareaRef}
                      value={input}
                      onChange={(e) => {
                        setInput(e.target.value);
                        autoResize();
                      }}
                      onKeyDown={handleKeyDown}
                      placeholder={isRecording ? t("recording") : isVoiceProcessing ? t("transcribing") : t("placeholder")}
                      className={cn(
                        "resize-none text-sm overflow-y-auto transition-[height] duration-100",
                        isIdle
                          ? "min-h-[56px] max-h-[220px] border-0 bg-transparent px-1.5 py-1 shadow-none focus-visible:border-transparent focus-visible:ring-0"
                          : "min-h-[44px] max-h-[220px] rounded-xl border-border/60 bg-muted/20"
                      )}
                      rows={1}
                      disabled={isStreaming || isRecording || isVoiceProcessing}
                    />

                    {isRecording ? (
                      <div className="mt-2 flex flex-col gap-2">
                        <div
                          role="status"
                          aria-live="polite"
                          aria-atomic="true"
                          className="flex items-center gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700"
                        >
                          <span className="relative flex h-2.5 w-2.5 shrink-0" aria-hidden="true">
                            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />
                            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-red-500" />
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="font-medium leading-none">{t("listening")}</p>
                            <p className="mt-1 text-xs text-red-700/80">{t("tapSendWhenReady")}</p>
                          </div>
                          <span className="font-mono text-sm tabular-nums">{durationLabel}</span>
                        </div>

                        <div className="flex gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            onClick={cancelRecording}
                            className="h-10 flex-1 rounded-xl border-border/60 text-muted-foreground hover:text-foreground"
                            aria-label={t("cancelVoiceInput")}
                          >
                            <X className="mr-1.5 h-4 w-4" /> {t("cancel")}
                          </Button>
                          <Button
                            type="button"
                            onClick={submitRecording}
                            className="h-10 flex-1 rounded-xl"
                            aria-label={t("sendVoiceInput")}
                          >
                            <Send className="mr-1.5 h-4 w-4" /> {t("send")}
                          </Button>
                        </div>
                      </div>
                    ) : isVoiceProcessing ? (
                      <div
                        role="status"
                        aria-live="polite"
                        aria-atomic="true"
                        className="mt-2 flex items-center justify-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700"
                      >
                        <Loader2 className="h-4 w-4 animate-spin" />
                        <span className="font-medium">{t("processingVoice")}</span>
                      </div>
                    ) : (
                      <div className="mt-2 flex items-center gap-2 border-t border-border/50 pt-2">
                        <button
                          type="button"
                          disabled
                          className="inline-flex h-9 items-center gap-1.5 rounded-full bg-muted/70 px-3 text-[11px] font-medium text-muted-foreground"
                          aria-label={t("voiceLanguage")}
                          title={t("voiceLanguage")}
                        >
                          <Globe className="h-3 w-3" />
                          <span>AUTO</span>
                        </button>

                        <div className="ml-auto flex items-center gap-2">
                          <button
                            type="button"
                            onClick={startRecording}
                            disabled={isStreaming || isVoiceProcessing}
                            className={cn(
                              "flex h-10 w-10 items-center justify-center rounded-xl border border-border/60 bg-background text-muted-foreground shadow-sm shadow-black/[0.04] transition-all duration-150 hover:bg-primary/10 hover:text-primary",
                              (isStreaming || isVoiceProcessing) && "cursor-not-allowed opacity-50"
                            )}
                            aria-label={t("startVoiceInput")}
                            title={t("startVoiceInput")}
                          >
                            <Mic className="h-4 w-4" />
                          </button>

                          <Button
                            size="icon"
                            className="h-10 w-10 rounded-xl bg-gradient-to-br from-primary to-indigo-600 shadow-sm hover:from-primary/90 hover:to-indigo-600/90"
                            onClick={() => sendMessage()}
                            disabled={!input.trim() || isStreaming || isVoiceProcessing}
                            aria-label={t("sendMessage")}
                          >
                            <Send className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>

                  {voiceError ? (
                    <p role="alert" className="text-[11px] text-destructive">
                      {voiceError}
                    </p>
                  ) : (
                    <p className="text-[11px] text-muted-foreground/70">
                      {t("disclaimer")}
                    </p>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
        </>
      )}
    </>,
    document.body
  );
}
