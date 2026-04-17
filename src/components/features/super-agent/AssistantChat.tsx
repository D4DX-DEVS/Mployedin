"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  Sparkles, X, Send, Minimize2, Maximize2, Plus,
  Loader2, Users2, TrendingUp, BarChart3, MessageSquare,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

/* ────────────────────────────────────────────────────────
   Types
   ──────────────────────────────────────────────────────── */

interface Message {
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
}

/* ────────────────────────────────────────────────────────
   Markdown renderer
   ──────────────────────────────────────────────────────── */

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
        blockquote: ({ ...props }) => <blockquote className="border-l-2 border-primary/40 pl-3 text-muted-foreground my-1" {...props} />,
        hr: () => <hr className="border-border my-2" />,
      }}
    >
      {content}
    </ReactMarkdown>
  );
}

/* ────────────────────────────────────────────────────────
   Suggested prompts
   ──────────────────────────────────────────────────────── */

const SUGGESTED_PROMPTS = [
  { icon: <Users2 className="h-3.5 w-3.5" />, label: "Who is underperforming and why?" },
  { icon: <TrendingUp className="h-3.5 w-3.5" />, label: "Why did conversions drop this week?" },
  { icon: <BarChart3 className="h-3.5 w-3.5" />, label: "Compare my agents' performance" },
  { icon: <MessageSquare className="h-3.5 w-3.5" />, label: "Suggest actions to improve the team" },
];

/* ────────────────────────────────────────────────────────
   Component
   ──────────────────────────────────────────────────────── */

export function SuperAgentAssistant() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [threadId, setThreadId] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);

  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { setMounted(true); }, []);

  // Auto-scroll on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 120)}px`;
    }
  }, [input]);

  // ── Send message ──

  const sendMessage = useCallback(async (text?: string) => {
    const msg = (text ?? input).trim();
    if (!msg || isStreaming) return;

    const userMsg: Message = { role: "user", content: msg, timestamp: new Date() };
    const assistantMsg: Message = { role: "assistant", content: "", timestamp: new Date() };

    setMessages((prev) => [...prev, userMsg, assistantMsg]);
    setInput("");
    setIsStreaming(true);

    try {
      const allMessages = [...messages, userMsg].map((m) => ({
        role: m.role,
        content: m.content,
      }));

      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: allMessages,
          context: "super_agent_assist",
          currentPage: window.location.pathname,
        }),
      });

      if (!res.ok || !res.body) {
        setMessages((prev) => {
          const copy = [...prev];
          copy[copy.length - 1] = {
            ...copy[copy.length - 1],
            content: "Sorry, I couldn't process that. Please try again.",
          };
          return copy;
        });
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let accumulated = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        accumulated += chunk;

        // Parse AI_ACTION tags for navigation
        const cleaned = accumulated.replace(
          /<AI_ACTION>[\s\S]*?<\/AI_ACTION>/g,
          ""
        );

        setMessages((prev) => {
          const copy = [...prev];
          copy[copy.length - 1] = { ...copy[copy.length - 1], content: cleaned };
          return copy;
        });
      }

      // Handle AI_ACTION tags
      const actionMatches = accumulated.matchAll(/<AI_ACTION>([\s\S]*?)<\/AI_ACTION>/g);
      for (const match of actionMatches) {
        try {
          const action = JSON.parse(match[1]);
          if (action.type === "navigate" && action.path?.startsWith("/super-agent/")) {
            // Append action button text
            setMessages((prev) => {
              const copy = [...prev];
              const lastMsg = copy[copy.length - 1];
              copy[copy.length - 1] = {
                ...lastMsg,
                content: lastMsg.content + `\n\n[${action.label ?? "Go to page"} →](${action.path})`,
              };
              return copy;
            });
          }
        } catch { /* skip malformed */ }
      }

      // Save thread
      try {
        const threadMessages = [...messages, userMsg, { role: "assistant" as const, content: accumulated }];
        const payload: Record<string, unknown> = {
          context: "super_agent_assist",
          messages: threadMessages.map((m) => ({ role: m.role, content: m.content })),
        };
        if (threadId) payload.threadId = threadId;

        const histRes = await fetch("/api/ai/chat-history", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (histRes.ok) {
          const histData = await histRes.json();
          if (histData.threadId) setThreadId(histData.threadId);
        }
      } catch { /* silent */ }
    } catch {
      setMessages((prev) => {
        const copy = [...prev];
        copy[copy.length - 1] = {
          ...copy[copy.length - 1],
          content: "Connection error. Please check your network and try again.",
        };
        return copy;
      });
    } finally {
      setIsStreaming(false);
    }
  }, [input, isStreaming, messages, threadId]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const handleNewChat = () => {
    setMessages([]);
    setThreadId(null);
  };

  if (!mounted) return null;

  // ── Floating button ──

  const fab = (
    <button
      onClick={() => { setOpen(true); setMinimized(false); }}
      className={cn(
        "fixed bottom-6 right-6 z-[100] flex items-center gap-2 rounded-full px-4 py-3 shadow-lg",
        "bg-gradient-to-r from-primary to-indigo-600 text-white",
        "hover:shadow-xl hover:scale-105 transition-all duration-200",
        open && "hidden"
      )}
    >
      <Sparkles className="h-5 w-5" />
      <span className="text-sm font-medium hidden sm:inline">AI Advisor</span>
    </button>
  );

  // ── Minimized pill ──

  const minimizedPill = minimized && open && (
    <button
      onClick={() => setMinimized(false)}
      className="fixed bottom-6 right-6 z-[100] flex items-center gap-2 rounded-full bg-gradient-to-r from-primary to-indigo-600 px-4 py-2.5 text-white shadow-lg hover:shadow-xl transition-all"
    >
      <Sparkles className="h-4 w-4" />
      <span className="text-xs font-medium">AI Advisor</span>
      <Maximize2 className="h-3.5 w-3.5 ml-1" />
    </button>
  );

  // ── Chat panel ──

  const panel = open && !minimized && (
    <div className="fixed bottom-6 right-6 z-[100] flex flex-col w-[calc(100vw-2rem)] sm:w-[420px] max-h-[calc(100vh-6rem)] rounded-2xl border border-border bg-background shadow-2xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-primary to-indigo-600 text-white">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4" />
          <span className="text-sm font-semibold">Team AI Advisor</span>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={handleNewChat} className="p-1.5 hover:bg-white/20 rounded-lg transition-colors" title="New chat">
            <Plus className="h-4 w-4" />
          </button>
          <button onClick={() => setMinimized(true)} className="p-1.5 hover:bg-white/20 rounded-lg transition-colors" title="Minimize">
            <Minimize2 className="h-4 w-4" />
          </button>
          <button onClick={() => setOpen(false)} className="p-1.5 hover:bg-white/20 rounded-lg transition-colors" title="Close">
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 min-h-[200px] max-h-[400px]">
        {messages.length === 0 ? (
          /* Welcome screen */
          <div className="space-y-4 py-4">
            <div className="text-center">
              <div className="mx-auto w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center mb-2">
                <Sparkles className="h-5 w-5 text-primary" />
              </div>
              <p className="text-sm font-medium text-foreground">How can I help with your team?</p>
              <p className="text-xs text-muted-foreground mt-1">
                I have access to your agents&apos; live performance data.
              </p>
            </div>
            <div className="space-y-1.5">
              {SUGGESTED_PROMPTS.map((p) => (
                <button
                  key={p.label}
                  onClick={() => sendMessage(p.label)}
                  className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-left text-xs text-foreground/80 bg-muted/40 hover:bg-muted/70 transition-colors"
                >
                  <span className="shrink-0 text-muted-foreground">{p.icon}</span>
                  {p.label}
                </button>
              ))}
            </div>
          </div>
        ) : (
          /* Message bubbles */
          messages.map((m, i) => (
            <div
              key={i}
              className={cn(
                "flex",
                m.role === "user" ? "justify-end" : "justify-start"
              )}
            >
              <div
                className={cn(
                  "max-w-[85%] rounded-2xl px-3.5 py-2 text-xs leading-relaxed",
                  m.role === "user"
                    ? "bg-gradient-to-br from-primary to-indigo-600 text-white rounded-br-md"
                    : "bg-muted/60 text-foreground rounded-bl-md dark:bg-card/60"
                )}
              >
                {m.role === "assistant" ? (
                  m.content ? (
                    <div className="prose prose-xs dark:prose-invert max-w-none">
                      <AIMarkdown content={m.content} />
                    </div>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-muted-foreground">
                      <Loader2 className="h-3 w-3 animate-spin" />
                      Thinking…
                    </span>
                  )
                ) : (
                  m.content
                )}
              </div>
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="border-t border-border px-3 py-2.5 bg-background">
        <div className="flex items-end gap-2">
          <Textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask about your team..."
            disabled={isStreaming}
            rows={1}
            className="min-h-[36px] max-h-[120px] resize-none rounded-xl border-muted bg-muted/40 text-xs placeholder:text-muted-foreground/60 focus-visible:ring-1 focus-visible:ring-primary"
          />
          <Button
            onClick={() => sendMessage()}
            disabled={isStreaming || !input.trim()}
            size="icon"
            className="h-9 w-9 shrink-0 rounded-xl bg-primary hover:bg-primary/90"
          >
            {isStreaming ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </div>
      </div>
    </div>
  );

  return createPortal(
    <>
      {fab}
      {minimizedPill}
      {panel}
    </>,
    document.body
  );
}
