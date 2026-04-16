"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { createPortal } from "react-dom";
import { usePathname, useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { Bot, X, Send, Minimize2, Maximize2, History, Plus, Trash2, UserCheck, Expand, Shrink, Mic, MicOff, Loader2, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useVoiceInput } from "@/hooks/useVoiceInput";

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

function AIMarkdown({ content }: { content: string }) {
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
  const [open, setOpen] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [threadId, setThreadId] = useState<string | null>(null);
  const [threads, setThreads] = useState<Thread[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [profileSummary, setProfileSummary] = useState<ProfileSummary | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);

  const {
    isRecording,
    isProcessing: isVoiceProcessing,
    transcript: voiceTranscript,
    startRecording,
    stopRecording,
    clearTranscript,
  } = useVoiceInput({ language: "auto", mode: "autoSubmitOnStop", maxDurationMs: 60000 });

  // Sync voice transcript into the text input
  useEffect(() => {
    if (voiceTranscript) {
      setInput(voiceTranscript);
      clearTranscript();
    }
  }, [voiceTranscript, clearTranscript]);

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

  useEffect(() => {
    if (open && showHistory) loadHistory();
  }, [open, showHistory, loadHistory]);

  const loadThread = (thread: Thread) => {
    setThreadId(thread._id);
    setMessages(thread.messages.map((m) => ({ ...m, timestamp: new Date(m.timestamp) })));
    setShowHistory(false);
  };

  const newConversation = () => {
    setThreadId(null);
    setMessages([]);
    setShowHistory(false);
  };

  const deleteThread = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    await fetch(`/api/ai/chat-history?threadId=${id}`, { method: "DELETE" });
    setThreads((prev) => prev.filter((t) => t._id !== id));
    if (threadId === id) newConversation();
  };

  async function sendMessage() {
    if (!input.trim() || isStreaming) return;

    const userMsg: Message = {
      role: "user",
      content: input.trim(),
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

    try {
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

      // Persist conversation to DB (only if AI returned a non-empty response)
      if (!accumulated.trim()) return;

      const newMessages = [
        { role: "user" as const, content: userMsg.content },
        { role: "assistant" as const, content: accumulated },
      ];

      const historyRes = await fetch("/api/ai/chat-history", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          threadId,
          context,
          messages: newMessages,
          title: messages.length === 0 ? userMsg.content.slice(0, 50) : undefined,
        }),
      });

      if (historyRes.ok) {
        const historyData = await historyRes.json();
        if (!threadId) setThreadId(historyData.threadId);
      }
    } catch {
      setMessages((prev) => {
        const copy = [...prev];
        copy[copy.length - 1] = {
          ...copy[copy.length - 1],
          content: "Sorry, something went wrong. Please try again.",
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

  if (!mounted) return null;

  return createPortal(
    <>
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className={cn(
            "fixed bottom-6 right-6 z-[100] flex h-14 w-14 items-center justify-center rounded-full shadow-lg",
            "bg-primary text-white hover:bg-primary/90 transition-all duration-200 hover:scale-105",
            className
          )}
          aria-label="Open AI Assistant"
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
            expanded
              ? "top-0 right-0 bottom-0 w-full md:w-[480px] lg:w-[520px] rounded-none md:rounded-l-2xl"
              : "bottom-6 right-6 rounded-xl",
            minimized ? "h-14 w-80" : !expanded ? "h-[520px] w-[380px]" : ""
          )}
        >
          {/* Header */}
          <div className={cn(
            "flex items-center gap-2 px-4 py-3 bg-primary text-white",
            expanded ? "rounded-none md:rounded-tl-2xl" : "rounded-t-xl"
          )}>
            <Bot className="h-5 w-5" />
            <div className="flex-1">
              <p className="text-sm font-semibold">AI Assistant</p>
              {!minimized && (
                <p className="text-xs text-white/70">
                  {isStreaming ? "Thinking…" : "Ready to help"}
                </p>
              )}
            </div>
            {!minimized && (
              <>
                <button
                  onClick={newConversation}
                  className="text-white/70 hover:text-white transition-colors p-1 rounded-lg hover:bg-white/10"
                  title="New conversation"
                >
                  <Plus className="h-4 w-4" />
                </button>
                <button
                  onClick={() => { setShowHistory((v) => !v); }}
                  className="text-white/70 hover:text-white transition-colors p-1 rounded-lg hover:bg-white/10"
                  title="Chat history"
                >
                  <History className="h-4 w-4" />
                </button>
                <button
                  onClick={() => { setExpanded((e) => !e); setMinimized(false); }}
                  className="text-white/70 hover:text-white transition-colors p-1 rounded-lg hover:bg-white/10"
                  title={expanded ? "Restore" : "Expand"}
                >
                  {expanded ? <Shrink className="h-4 w-4" /> : <Expand className="h-4 w-4" />}
                </button>
              </>
            )}
            <button onClick={() => setMinimized((m) => !m)} className="text-white/70 hover:text-white transition-colors p-1 rounded-lg hover:bg-white/10">
              {minimized ? <Maximize2 className="h-4 w-4" /> : <Minimize2 className="h-4 w-4" />}
            </button>
            <button onClick={() => { setOpen(false); setExpanded(false); }} className="text-white hover:bg-white/20 rounded-full p-1 transition-colors" title="Close">
              <X className="h-5 w-5" />
            </button>
          </div>

          {!minimized && showHistory && (
            <div className="flex-1 overflow-y-auto p-3 space-y-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide px-1">
                Recent Conversations
              </p>
              {loadingHistory && (
                <p className="text-sm text-center text-muted-foreground py-4">Loading…</p>
              )}
              {!loadingHistory && threads.length === 0 && (
                <p className="text-sm text-center text-muted-foreground py-4">No conversations yet</p>
              )}
              {threads.map((t) => (
                <div
                  key={t._id}
                  onClick={() => loadThread(t)}
                  className="flex items-center gap-2 p-2 rounded-lg hover:bg-muted/60 cursor-pointer group"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{t.title || "Untitled"}</p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(t.updatedAt).toLocaleDateString()}
                    </p>
                  </div>
                  <button
                    onClick={(e) => deleteThread(t._id, e)}
                    className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-red-500 transition-opacity"
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
                {messages.length === 0 && (
                  <div className="text-center text-muted-foreground text-sm mt-8">
                    <Bot className="h-8 w-8 mx-auto mb-2 text-primary/50" />
                    <p>Hi! I&apos;m your AI assistant.</p>
                    <p>How can I help you today?</p>
                    {profileSummary && (profileSummary.skills.length > 0 || profileSummary.experience) && (
                      <div className="mt-4 mx-auto max-w-[300px] rounded-2xl border p-4 text-left" style={{ background: '#ffffff', borderColor: '#e5e7eb' }}>
                        <div className="flex items-center gap-1.5 text-sm font-semibold mb-3" style={{ color: '#2563eb' }}>
                          <UserCheck className="h-4 w-4" />
                          Using your profile data
                        </div>
                        {profileSummary.skills.length > 0 && (
                          <>
                            <div className="mb-3" style={{ borderTop: '1px solid #e5e7eb', paddingTop: '12px' }}>
                              <p className="text-sm font-bold mb-2" style={{ color: '#111827' }}>Skills:</p>
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
                              <p className="text-sm font-bold mb-2" style={{ color: '#111827' }}>Experience:</p>
                              <span className="inline-block rounded-full px-3 py-1 text-xs font-medium" style={{ background: '#f3f4f6', color: '#111827' }}>
                                {profileSummary.experience} exp
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
              <div className="border-t border-border p-3 flex gap-2 items-end">
                <Textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={isRecording ? "Recording…" : isVoiceProcessing ? "Transcribing…" : "Ask me anything…"}
                  className="min-h-[40px] max-h-[120px] resize-none text-sm"
                  rows={1}
                  disabled={isStreaming || isRecording || isVoiceProcessing}
                />
                <button
                  type="button"
                  onClick={isRecording ? stopRecording : startRecording}
                  disabled={isVoiceProcessing || isStreaming}
                  className={cn(
                    "h-10 w-10 shrink-0 rounded-lg flex items-center justify-center transition-colors",
                    isRecording
                      ? "bg-red-500 hover:bg-red-600 text-white animate-pulse"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-40"
                  )}
                  title={isRecording ? "Stop recording" : "Voice input"}
                >
                  {isVoiceProcessing ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : isRecording ? (
                    <MicOff className="h-4 w-4" />
                  ) : (
                    <Mic className="h-4 w-4" />
                  )}
                </button>
                <Button
                  size="icon"
                  className="h-10 w-10 shrink-0 bg-primary hover:bg-primary/90"
                  onClick={sendMessage}
                  disabled={!input.trim() || isStreaming}
                >
                  <Send className="h-4 w-4" />
                </Button>
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
