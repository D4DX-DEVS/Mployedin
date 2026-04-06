"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";
import { Bot, X, Send, Minimize2, Maximize2, History, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

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

interface ConversationalAIProps {
  context?: string;
  className?: string;
}

export function ConversationalAI({
  context = "general_assist",
  className,
}: ConversationalAIProps) {
  const [open, setOpen] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [threadId, setThreadId] = useState<string | null>(null);
  const [threads, setThreads] = useState<Thread[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [mounted, setMounted] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setMounted(true); }, []);

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

      // Persist conversation to DB
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
            "fixed bottom-6 right-6 z-[100] flex flex-col rounded-xl shadow-2xl border border-border bg-background",
            "transition-all duration-300",
            minimized ? "h-14 w-80" : "h-[520px] w-[380px]"
          )}
        >
          {/* Header */}
          <div className="flex items-center gap-2 px-4 py-3 rounded-t-xl bg-primary text-white">
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
                  className="text-white/70 hover:text-white"
                  title="New conversation"
                >
                  <Plus className="h-4 w-4" />
                </button>
                <button
                  onClick={() => { setShowHistory((v) => !v); }}
                  className="text-white/70 hover:text-white"
                  title="Chat history"
                >
                  <History className="h-4 w-4" />
                </button>
              </>
            )}
            <button onClick={() => setMinimized((m) => !m)} className="text-white/70 hover:text-white">
              {minimized ? <Maximize2 className="h-4 w-4" /> : <Minimize2 className="h-4 w-4" />}
            </button>
            <button onClick={() => setOpen(false)} className="text-white hover:bg-white/20 rounded-full p-1 transition-colors" title="Close">
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
              <div ref={messagesContainerRef} className="flex-1 overflow-y-auto p-4 space-y-3">
                {messages.length === 0 && (
                  <div className="text-center text-muted-foreground text-sm mt-8">
                    <Bot className="h-8 w-8 mx-auto mb-2 text-primary/50" />
                    <p>Hi! I&apos;m your AI assistant.</p>
                    <p>How can I help you today?</p>
                  </div>
                )}
                {messages.map((msg, i) => (
                  <div
                    key={i}
                    className={cn(
                      "flex gap-2",
                      msg.role === "user" ? "justify-end" : "justify-start"
                    )}
                  >
                    {msg.role === "assistant" && (
                      <div className="flex-shrink-0 w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center">
                        <Bot className="h-4 w-4 text-primary" />
                      </div>
                    )}
                    <div
                      className={cn(
                        "max-w-[80%] rounded-2xl px-3 py-2 text-sm",
                        msg.role === "user"
                          ? "bg-primary text-white rounded-tr-none"
                          : "bg-muted text-foreground rounded-tl-none"
                      )}
                    >
                      {msg.content}
                      {msg.role === "assistant" && isStreaming && i === messages.length - 1 && (
                        <span className="inline-block w-1 h-4 ml-0.5 bg-primary animate-pulse" />
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
                  placeholder="Ask me anything…"
                  className="min-h-[40px] max-h-[120px] resize-none text-sm"
                  rows={1}
                  disabled={isStreaming}
                />
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
