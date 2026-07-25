"use client";

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { createPortal } from "react-dom";
import { usePathname } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Bot, X, Send, Loader2, Sparkles, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { csrfFetch } from "@/lib/security/csrf-client";
import { ToolProposalCard } from "./ToolProposalCard";
import type { CopilotStreamFrame, TranscriptItem } from "./types";

let idCounter = 0;
const nextId = () => `ci-${Date.now()}-${idCounter++}`;

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
  const t = useTranslations("copilot");
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [transcript, setTranscript] = useState<TranscriptItem[]>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const historyForRequest = useRef<{ role: "user" | "assistant"; content: string }[]>([]);

  useEffect(() => setMounted(true), []);

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

  const sendMessage = useCallback(async () => {
    const content = input.trim();
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
          if (frame.type === "tool_call") {
            setTranscript((prev) => [...prev, { id: nextId(), kind: "tool_call", tool: frame.tool, label: frame.label }]);
          } else if (frame.type === "tool_result") {
            setTranscript((prev) => [...prev, { id: nextId(), kind: "tool_result", tool: frame.tool, ok: frame.ok, message: frame.message }]);
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
              setTranscript((prev) => [...prev, { id: nextId(), kind: "assistant_text", content: assistantText }]);
              historyForRequest.current = [...historyForRequest.current, { role: "assistant", content: assistantText }];
            }
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
    setTranscript([]);
    historyForRequest.current = [];
  };

  const hasMessages = transcript.length > 0;

  const panel = useMemo(() => (
    <div
      ref={panelRef}
      dir={isRtl ? "rtl" : "ltr"}
      role="dialog"
      aria-modal="true"
      aria-label={t("title")}
      tabIndex={-1}
      className={cn(
        "fixed bottom-4 right-4 z-[70] flex h-[min(640px,calc(100vh-2rem))] w-[min(400px,calc(100vw-2rem))] flex-col overflow-hidden rounded-xl border border-border bg-background shadow-2xl",
        isRtl && "left-4 right-auto",
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
        {!hasMessages && (
          <div className="flex h-full flex-col items-center justify-center gap-1.5 text-center text-muted-foreground">
            <Sparkles className="h-6 w-6 text-primary/60" />
            <p className="text-sm font-medium text-foreground">{t("greeting")}</p>
            <p className="text-xs">{t("howCanIHelp")}</p>
          </div>
        )}

        {transcript.map((item) => {
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
                <Loader2 className="h-3 w-3 animate-spin" />
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

        {isStreaming && (
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
            onClick={sendMessage}
            aria-label={t("send")}
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
        <p className="mt-1.5 text-center text-[10px] text-muted-foreground">{t("disclaimer")}</p>
      </div>
    </div>
    // eslint-disable-next-line react-hooks/exhaustive-deps
  ), [transcript, input, isStreaming, isRtl, hasMessages, t, handleConfirm, handleCancel]);

  if (!mounted) return null;

  return createPortal(
    <>
      {!open && (
        <button
          ref={triggerRef}
          type="button"
          onClick={() => setOpen(true)}
          className={cn(
            "fixed bottom-4 right-4 z-[70] flex h-12 w-12 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-transform hover:scale-105",
            isRtl && "left-4 right-auto"
          )}
          aria-label={t("openCopilot")}
        >
          <Bot className="h-5 w-5" />
        </button>
      )}
      {open && panel}
    </>,
    document.body
  );
}
