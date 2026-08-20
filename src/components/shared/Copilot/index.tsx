"use client";

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { createPortal } from "react-dom";
import { usePathname } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { X, Send, Loader2, Sparkles, RotateCcw, Check, History, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { csrfFetch } from "@/lib/security/csrf-client";
import { ToolProposalCard } from "./ToolProposalCard";
import type { CopilotStreamFrame, TranscriptItem } from "./types";

let idCounter = 0;
const nextId = () => `ci-${Date.now()}-${idCounter++}`;

const CHATS_KEY = "copilot-chats";
const MAX_SAVED_CHATS = 10;

interface SavedChat {
  id: string;
  title: string;
  updatedAt: number;
  transcript: TranscriptItem[];
  history: { role: "user" | "assistant"; content: string }[];
}

function loadChats(): SavedChat[] {
  try {
    const raw = localStorage.getItem(CHATS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function persistChats(chats: SavedChat[]) {
  try {
    localStorage.setItem(CHATS_KEY, JSON.stringify(chats.slice(0, MAX_SAVED_CHATS)));
  } catch { /* ignore unavailable storage */ }
}

type SuggestionRole = "employer" | "jobSeeker" | "agent" | "superAgent" | "admin" | "default";

function roleFromPathname(pathname: string): SuggestionRole {
  if (pathname.includes("/super-agent")) return "superAgent";
  if (pathname.includes("/job-seeker")) return "jobSeeker";
  if (pathname.includes("/employer")) return "employer";
  if (pathname.includes("/agent")) return "agent";
  if (pathname.includes("/admin")) return "admin";
  return "default";
}

// ponytail: in-flight items restored from storage can never resolve — mark them settled
function settleRestoredItem(item: TranscriptItem): TranscriptItem {
  if (item.kind === "tool_call" && !item.done) return { ...item, done: true };
  if (item.kind === "proposal" && ["pending", "confirming", "cancelling"].includes(item.status)) {
    return { ...item, status: "expired" };
  }
  return item;
}

function AssistantMarkdown({ content }: { content: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        p: ({ ...props }) => <p className="my-1 leading-relaxed" {...props} />,
        ul: ({ ...props }) => <ul className="list-disc list-inside space-y-0.5 my-1" {...props} />,
        ol: ({ ...props }) => <ol className="list-decimal list-inside space-y-0.5 my-1" {...props} />,
        li: ({ ...props }) => <li className="leading-relaxed" {...props} />,
        strong: ({ ...props }) => <strong className="font-semibold" {...props} />,
        code: ({ ...props }) => <code className="rounded bg-black/10 px-1 font-mono text-[0.88em] dark:bg-white/10" {...props} />,
        a: ({ ...props }) => (
          <a className="text-primary underline underline-offset-2 hover:text-primary/80" target="_blank" rel="noopener noreferrer" {...props} />
        ),
        table: ({ ...props }) => (
          <div className="overflow-x-auto rounded-lg border border-border my-2">
            <table className="w-full text-xs border-collapse" {...props} />
          </div>
        ),
        th: ({ ...props }) => <th className="border-b border-border px-2.5 py-1.5 text-left font-semibold" {...props} />,
        td: ({ ...props }) => <td className="border-t border-border px-2.5 py-1.5" {...props} />,
      }}
    >
      {content}
    </ReactMarkdown>
  );
}

interface CopilotProps {
  className?: string;
}

export function Copilot({ className }: CopilotProps) {
  const pathname = usePathname();
  const locale = useLocale();
  const isRtl = locale === "ar";
  const usesInlineEmployerLauncher = /^\/(?:en|ar)\/employer(?:\/jobs)?\/?$/.test(pathname);
  const t = useTranslations("copilot");
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [transcript, setTranscript] = useState<TranscriptItem[]>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [fabPos, setFabPos] = useState<{ x: number; y: number } | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [savedChats, setSavedChats] = useState<SavedChat[]>([]);
  const chatIdRef = useRef(nextId());
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const historyForRequest = useRef<{ role: "user" | "assistant"; content: string }[]>([]);
  const dragRef = useRef({ dragging: false, moved: false, grabX: 0, grabY: 0 });

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    const openCopilot = () => setOpen(true);
    window.addEventListener("mployedin:open-copilot", openCopilot);
    return () => window.removeEventListener("mployedin:open-copilot", openCopilot);
  }, []);

  const clampFabPos = useCallback((x: number, y: number) => {
    const size = 48;
    const margin = 4;
    const reservedBottom = window.innerWidth < 1024 ? 72 : margin;
    return {
      x: Math.min(Math.max(x, margin), window.innerWidth - size - margin),
      y: Math.min(Math.max(y, margin), window.innerHeight - size - reservedBottom),
    };
  }, []);

  useEffect(() => {
    try {
      const saved = localStorage.getItem("copilot-fab-pos");
      if (saved) {
        const parsed = JSON.parse(saved);
        setFabPos(clampFabPos(parsed.x, parsed.y));
      }
    } catch { /* ignore malformed/unavailable storage */ }
  }, [clampFabPos]);

  // Re-clamp on viewport/orientation changes so a position saved on a wider
  // screen can't strand the button off-screen on a smaller one.
  useEffect(() => {
    const onResize = () => setFabPos((p) => (p ? clampFabPos(p.x, p.y) : p));
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [clampFabPos]);

  // Auto-save current chat into history list (opened fresh — old chats live behind the History button)
  useEffect(() => {
    if (transcript.length === 0) return;
    const others = loadChats().filter((c) => c.id !== chatIdRef.current);
    const firstUserMsg = transcript.find((it) => it.kind === "user");
    persistChats([
      {
        id: chatIdRef.current,
        title: firstUserMsg?.kind === "user" ? firstUserMsg.content.slice(0, 60) : "",
        updatedAt: Date.now(),
        transcript,
        history: historyForRequest.current,
      },
      ...others,
    ]);
  }, [transcript]);

  const handleFabPointerDown = useCallback((e: React.PointerEvent<HTMLButtonElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    dragRef.current = { dragging: true, moved: false, grabX: e.clientX - rect.left, grabY: e.clientY - rect.top };
    e.currentTarget.setPointerCapture(e.pointerId);
  }, []);

  const handleFabPointerMove = useCallback((e: React.PointerEvent<HTMLButtonElement>) => {
    if (!dragRef.current.dragging) return;
    dragRef.current.moved = true;
    setFabPos(clampFabPos(e.clientX - dragRef.current.grabX, e.clientY - dragRef.current.grabY));
  }, [clampFabPos]);

  const handleFabPointerUp = useCallback(() => {
    if (!dragRef.current.dragging) return;
    dragRef.current.dragging = false;
    setFabPos((current) => {
      try {
        if (current) localStorage.setItem("copilot-fab-pos", JSON.stringify(current));
      } catch { /* ignore unavailable storage */ }
      return current;
    });
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [transcript]);

  useEffect(() => {
    if (!open) return;

    textareaRef.current?.focus();
    const panelElement = panelRef.current;
    if (!panelElement) return;

    const focusableSelector = [
      "button:not([disabled])",
      "a[href]",
      "textarea:not([disabled])",
      "input:not([disabled])",
      "select:not([disabled])",
      '[tabindex]:not([tabindex="-1"])',
    ].join(",");

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setOpen(false);
        requestAnimationFrame(() => triggerRef.current?.focus());
        return;
      }
      if (event.key !== "Tab") return;

      const focusable = Array.from(panelElement.querySelectorAll<HTMLElement>(focusableSelector));
      if (focusable.length === 0) {
        event.preventDefault();
        panelElement.focus();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open]);

  const autoResize = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 180)}px`;
  }, []);
  useEffect(() => { autoResize(); }, [autoResize, input]);

  const updateProposal = useCallback((proposalId: string, patch: Partial<Extract<TranscriptItem, { kind: "proposal" }>>) => {
    setTranscript((prev) =>
      prev.map((it) => (it.kind === "proposal" && it.proposalId === proposalId ? { ...it, ...patch } : it))
    );
  }, []);

  const handleConfirm = useCallback(async (itemId: string) => {
    const item = transcript.find((it) => it.id === itemId);
    if (!item || item.kind !== "proposal") return;
    updateProposal(item.proposalId, { status: "confirming" });
    try {
      const res = await csrfFetch("/api/ai/copilot/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ proposalId: item.proposalId }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.ok) {
        updateProposal(item.proposalId, { status: "executed", resultMessage: data.message ?? t("actionConfirmed") });
      } else {
        updateProposal(item.proposalId, { status: "failed", resultMessage: data.error ?? data.message ?? t("actionFailed") });
      }
    } catch {
      updateProposal(item.proposalId, { status: "failed", resultMessage: t("actionFailed") });
    }
  }, [transcript, updateProposal, t]);

  const handleCancel = useCallback(async (itemId: string) => {
    const item = transcript.find((it) => it.id === itemId);
    if (!item || item.kind !== "proposal") return;
    updateProposal(item.proposalId, { status: "cancelling" });
    try {
      await csrfFetch("/api/ai/copilot/execute", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ proposalId: item.proposalId }),
      });
    } catch { /* best-effort */ }
    updateProposal(item.proposalId, { status: "cancelled" });
  }, [transcript, updateProposal]);

  const sendMessage = useCallback(async (overrideContent?: string) => {
    const content = (overrideContent ?? input).trim();
    if (!content || isStreaming) return;
    setInput("");
    setTranscript((prev) => [...prev, { id: nextId(), kind: "user", content }]);
    historyForRequest.current = [...historyForRequest.current, { role: "user", content }];
    setIsStreaming(true);

    try {
      const res = await csrfFetch("/api/ai/copilot/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: historyForRequest.current, currentPage: pathname }),
      });

      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => ({}));
        setTranscript((prev) => [...prev, { id: nextId(), kind: "error", message: data.error ?? t("errorMessage") }]);
        setIsStreaming(false);
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let assistantText = "";
      let streamingId: string | null = null;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          let frame: CopilotStreamFrame;
          try {
            frame = JSON.parse(line);
          } catch {
            continue;
          }
          if (frame.type === "text_delta") {
            const chunk = frame.content;
            if (streamingId) {
              const sid = streamingId;
              setTranscript((prev) => prev.map((it) => (it.id === sid && it.kind === "assistant_text" ? { ...it, content: it.content + chunk } : it)));
            } else {
              streamingId = nextId();
              const sid = streamingId;
              setTranscript((prev) => [...prev, { id: sid, kind: "assistant_text", content: chunk }]);
            }
          } else if (frame.type === "tool_call") {
            streamingId = null; // any interim text becomes its own bubble
            setTranscript((prev) => [...prev, { id: nextId(), kind: "tool_call", tool: frame.tool, label: frame.label }]);
          } else if (frame.type === "tool_result") {
            const { tool, ok, message } = frame;
            if (ok) {
              // Keep a compact copy of tool data in the request history so
              // follow-up questions ("shortlist the second one") still have context.
              const payload = JSON.stringify(frame.data ?? message).slice(0, 1500);
              historyForRequest.current = [...historyForRequest.current, { role: "assistant", content: `[data from ${tool}] ${payload}` }];
            }
            setTranscript((prev) => {
              const idx = prev.findLastIndex((it) => it.kind === "tool_call" && it.tool === tool && !it.done);
              const next = idx === -1 ? prev : prev.map((it, i) => (i === idx && it.kind === "tool_call" ? { ...it, done: true, ok } : it));
              // ponytail: only surface failures; successful raw tool messages stay hidden
              return ok ? next : [...next, { id: nextId(), kind: "tool_result", tool, ok, message }];
            });
          } else if (frame.type === "proposal") {
            setTranscript((prev) => [
              ...prev,
              {
                id: nextId(),
                kind: "proposal",
                proposalId: frame.proposalId,
                tool: frame.tool,
                label: frame.label,
                summary: frame.summary,
                args: frame.args,
                status: "pending",
              },
            ]);
          } else if (frame.type === "text") {
            assistantText = frame.content;
            if (assistantText) {
              if (streamingId) {
                // Replace the progressively streamed buffer with the authoritative full text.
                const sid = streamingId;
                setTranscript((prev) => prev.map((it) => (it.id === sid && it.kind === "assistant_text" ? { ...it, content: assistantText } : it)));
              } else {
                setTranscript((prev) => [...prev, { id: nextId(), kind: "assistant_text", content: assistantText }]);
              }
              historyForRequest.current = [...historyForRequest.current, { role: "assistant", content: assistantText }];
            }
            streamingId = null;
          } else if (frame.type === "error") {
            setTranscript((prev) => [...prev, { id: nextId(), kind: "error", message: frame.message }]);
          }
        }
      }
    } catch {
      setTranscript((prev) => [...prev, { id: nextId(), kind: "error", message: t("errorMessage") }]);
    } finally {
      setIsStreaming(false);
    }
  }, [input, isStreaming, pathname, t]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const resetChat = () => {
    // Current chat is already auto-saved to history — just start a fresh one
    setTranscript([]);
    historyForRequest.current = [];
    chatIdRef.current = nextId();
    setShowHistory(false);
  };

  const toggleHistory = () => {
    setShowHistory((v) => {
      const next = !v;
      if (next) setSavedChats(loadChats());
      return next;
    });
  };

  const loadChat = (chat: SavedChat) => {
    setTranscript((chat.transcript ?? []).map(settleRestoredItem));
    historyForRequest.current = chat.history ?? [];
    chatIdRef.current = chat.id;
    setShowHistory(false);
  };

  const deleteChat = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const chats = loadChats().filter((c) => c.id !== id);
    persistChats(chats);
    setSavedChats(chats);
    if (chatIdRef.current === id) {
      setTranscript([]);
      historyForRequest.current = [];
      chatIdRef.current = nextId();
    }
  };

  const hasMessages = transcript.length > 0;

  const suggestions = useMemo(() => {
    const role = roleFromPathname(pathname);
    return [1, 2, 3].map((i) => t(`suggestions.${role}${i}`));
  }, [pathname, t]);

  const panel = useMemo(() => (
    <div
      ref={panelRef}
      dir={isRtl ? "rtl" : "ltr"}
      role="dialog"
      aria-modal="true"
      aria-label={t("title")}
      tabIndex={-1}
      className={cn(
        "copilot-panel fixed z-[70] flex h-[min(640px,calc(100dvh-5.5rem))] w-[min(400px,calc(100vw-2rem))] flex-col overflow-hidden rounded-xl border border-border bg-background shadow-2xl lg:h-[min(640px,calc(100vh-2rem))]",
        className
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between gap-2 border-b border-border bg-muted/40 px-3 py-2.5">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Sparkles className="h-4 w-4" />
          </div>
          <span className="text-sm font-semibold">{t("title")}</span>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className={cn("h-7 w-7", showHistory && "bg-muted text-foreground")}
            onClick={toggleHistory}
            title={t("history")}
            aria-label={t("history")}
          >
            <History className="h-3.5 w-3.5" />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={resetChat} title={t("newChat")} aria-label={t("newChat")}>
            <RotateCcw className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => {
              setOpen(false);
              requestAnimationFrame(() => triggerRef.current?.focus());
            }}
            title={t("close")}
            aria-label={t("close")}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Transcript */}
      <div className="flex-1 space-y-3 overflow-y-auto px-3 py-3">
        {showHistory && (
          <div className="space-y-1">
            <p className="px-1 pb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("history")}</p>
            {savedChats.length === 0 && (
              <p className="py-8 text-center text-xs text-muted-foreground">{t("noHistory")}</p>
            )}
            {savedChats.map((chat) => (
              <div
                key={chat.id}
                onClick={() => loadChat(chat)}
                className="group flex cursor-pointer items-center gap-2 rounded-lg px-2 py-2 transition-colors hover:bg-muted/60"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{chat.title || t("newChat")}</p>
                  <p className="text-xs text-muted-foreground">{new Date(chat.updatedAt).toLocaleDateString()}</p>
                </div>
                <button
                  type="button"
                  onClick={(e) => deleteChat(chat.id, e)}
                  className="p-1 text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
                  aria-label={t("deleteChat")}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}

        {!showHistory && !hasMessages && (
          <div className="flex h-full flex-col items-center justify-center gap-1.5 text-center text-muted-foreground">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
              <img src="/favicon.ico" alt="" className="h-8 w-8" draggable={false} />
            </div>
            <p className="text-sm font-medium text-foreground">{t("greeting")}</p>
            <p className="text-xs">{t("howCanIHelp")}</p>
            <div className="mt-3 flex w-full flex-col gap-1.5">
              {suggestions.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => sendMessage(s)}
                  className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-start text-xs text-foreground transition-colors hover:bg-muted"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {!showHistory && transcript.map((item) => {
          if (item.kind === "user") {
            return (
              <div key={item.id} className="flex justify-end">
                <div className="max-w-[85%] rounded-2xl rounded-br-sm bg-primary px-3 py-2 text-sm text-primary-foreground">
                  {item.content}
                </div>
              </div>
            );
          }
          if (item.kind === "assistant_text") {
            return (
              <div key={item.id} className="flex justify-start">
                <div className="max-w-[90%] rounded-2xl rounded-bl-sm bg-muted px-3 py-2 text-sm text-foreground">
                  <AssistantMarkdown content={item.content} />
                </div>
              </div>
            );
          }
          if (item.kind === "tool_call") {
            return (
              <div key={item.id} className="flex items-center gap-1.5 pl-1 text-xs text-muted-foreground">
                {item.done ? (
                  <Check className={cn("h-3 w-3", item.ok === false ? "text-destructive" : "text-primary")} />
                ) : (
                  <Loader2 className="h-3 w-3 animate-spin" />
                )}
                {item.label}
              </div>
            );
          }
          if (item.kind === "tool_result") {
            return (
              <div key={item.id} className={cn("pl-1 text-xs", item.ok ? "text-muted-foreground" : "text-destructive")}>
                {item.message}
              </div>
            );
          }
          if (item.kind === "proposal") {
            return <ToolProposalCard key={item.id} item={item} onConfirm={handleConfirm} onCancel={handleCancel} />;
          }
          if (item.kind === "error") {
            return (
              <div key={item.id} className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
                {item.message}
              </div>
            );
          }
          return null;
        })}

        {!showHistory && isStreaming && (
          <div className="flex items-center gap-1.5 pl-1 text-xs text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" />
            {t("thinking")}
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="border-t border-border p-2.5">
        <div className="flex items-end gap-2 rounded-lg border border-input bg-background px-2 py-1.5 focus-within:ring-1 focus-within:ring-ring">
          <Textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={t("placeholder")}
            rows={1}
            className="min-h-8 flex-1 resize-none border-0 bg-transparent p-1 text-sm shadow-none focus-visible:ring-0"
          />
          <Button
            size="icon"
            className="h-8 w-8 shrink-0"
            disabled={!input.trim() || isStreaming}
            onClick={() => sendMessage()}
            aria-label={t("send")}
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
        <p className="mt-1.5 text-center text-[10px] text-muted-foreground">{t("disclaimer")}</p>
      </div>
    </div>
  ), [transcript, input, isStreaming, isRtl, hasMessages, t, handleConfirm, handleCancel, suggestions, sendMessage, showHistory, savedChats]);

  if (!mounted) return null;

  return createPortal(
    <>
      {!open && (
        <button
          ref={triggerRef}
          type="button"
          onClick={() => { if (!dragRef.current.moved) setOpen(true); }}
          onPointerDown={handleFabPointerDown}
          onPointerMove={handleFabPointerMove}
          onPointerUp={handleFabPointerUp}
          style={fabPos ? { left: fabPos.x, top: fabPos.y, right: "auto", bottom: "auto" } : undefined}
          className={cn(
            "fixed z-[70] flex h-12 w-12 touch-none items-center justify-center rounded-full bg-white shadow-lg transition-transform hover:scale-105 active:scale-95",
            usesInlineEmployerLauncher && "hidden lg:flex",
            !fabPos && "copilot-fab"
          )}
          aria-label={t("openCopilot")}
        >
          <img src="/favicon.ico" alt="" className="h-8 w-8" draggable={false} />
        </button>
      )}
      {open && panel}
    </>,
    document.body
  );
}
