"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Send, Loader2, MessageSquare, AlertTriangle, MoreVertical, Trash2, Eraser } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { conversationKeys } from "@/hooks/useConversations";
import { useConfirm } from "@/hooks/useConfirm";

interface DMMessage {
  _id: string;
  conversationId: string;
  senderId: string;
  content: string;
  createdAt: string;
  readAt?: string;
}

interface Participant {
  userId: string;
  name: string;
  role: string;
  avatar?: string;
}

interface Conversation {
  _id: string;
  participants: string[];
  participantDetails: Participant[];
  lastMessage?: string;
  lastMessageAt?: string;
  unreadCounts?: Record<string, number>;
}

interface Props {
  conversation: Conversation;
  currentUserId: string;
  /** Called after the conversation is deleted so the parent can clear selection */
  onDeleteConversation?: () => void;
  /** Called when a real conversation is created from a pending new-chat */
  onConversationCreated?: (convId: string) => void;
}

const POLL_INTERVAL = 5000; // 5 seconds

export function DirectMessageChat({ conversation, currentUserId, onDeleteConversation, onConversationCreated }: Props) {
  const queryClient = useQueryClient();
  const { confirm, ConfirmDialogNode } = useConfirm();
  const [messages, setMessages] = useState<DMMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const userSentRef = useRef(false);
  // Track the real conversation ID (may differ from props if conversation was pending)
  const realConvIdRef = useRef<string | null>(null);

  const isPending = conversation._id.startsWith("pending-");
  const convId = realConvIdRef.current ?? (isPending ? null : conversation._id);

  const otherParticipant = conversation.participantDetails.find(
    (p) => p.userId !== currentUserId
  );

  // Load message history
  const loadMessages = useCallback(async (isInitial = false) => {
    const activeConvId = realConvIdRef.current ?? (conversation._id.startsWith("pending-") ? null : conversation._id);
    if (!activeConvId) {
      // Pending new chat — no messages to load
      if (isInitial) setLoading(false);
      return;
    }
    if (isInitial) {
      setLoading(true);
      setError("");
    }
    try {
      const res = await fetch(`/api/dm/${activeConvId}/messages`);
      if (res.ok) {
        const data = await res.json();
        const fetched: DMMessage[] = data.messages ?? [];
        setMessages((prev) => {
          // Merge with any optimistic messages already in state
          const optimistic = prev.filter((m) => m._id.startsWith("opt-"));
          const fetchedIds = new Set(fetched.map((m) => m._id));
          const kept = optimistic.filter((m) => !fetchedIds.has(m._id));
          const next = [...fetched, ...kept];

          // Skip update if message list hasn't actually changed
          if (
            next.length === prev.length &&
            next.every((m, i) => m._id === prev[i]?._id)
          ) {
            return prev;
          }
          return next;
        });
        // Mark as read and refresh conversation list so unread badges clear
        fetch(`/api/dm/${activeConvId}/read`, { method: "PATCH" })
          .then(() => queryClient.invalidateQueries({ queryKey: conversationKeys.lists() }))
          .catch(() => {});
      } else if (isInitial) {
        setError("Failed to load messages.");
      }
    } finally {
      if (isInitial) setLoading(false);
    }
  }, [conversation._id, queryClient]);

  // Initial load
  useEffect(() => {
    loadMessages(true);
  }, [loadMessages]);

  // Poll for new messages every 5 seconds
  useEffect(() => {
    pollingRef.current = setInterval(() => {
      loadMessages(false);
    }, POLL_INTERVAL);

    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, [loadMessages]);

  // Scroll to bottom only on initial load or when user sends a message
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    if (userSentRef.current) {
      container.scrollTop = container.scrollHeight;
      userSentRef.current = false;
    }
  }, [messages]);

  // Scroll to bottom after initial load completes
  useEffect(() => {
    if (!loading) {
      const container = scrollContainerRef.current;
      if (container) {
        container.scrollTop = container.scrollHeight;
      }
    }
  }, [loading]);

  const sendMessage = useCallback(async () => {
    const content = input.trim();
    if (!content || sending) return;

    setSending(true);
    setInput("");
    userSentRef.current = true;

    // Optimistic update
    const optimistic: DMMessage = {
      _id: `opt-${Date.now()}`,
      conversationId: convId ?? "pending",
      senderId: currentUserId,
      content,
      createdAt: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, optimistic]);

    try {
      // If this is a pending new chat, create the conversation first
      let targetConvId = convId;
      if (!targetConvId) {
        const recipientId = conversation.participants.find((p) => p !== currentUserId);
        if (!recipientId) throw new Error("No recipient found");

        const createRes = await fetch("/api/dm", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ recipientId }),
        });
        if (!createRes.ok) {
          const err = await createRes.json().catch(() => ({}));
          throw new Error((err as { error?: string }).error ?? "Failed to create conversation");
        }
        const createData = await createRes.json();
        targetConvId = createData.conversation._id;
        realConvIdRef.current = targetConvId!;
        onConversationCreated?.(targetConvId!);
      }

      const res = await fetch(`/api/dm/${targetConvId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });

      if (res.ok) {
        const data = await res.json();
        setMessages((prev) =>
          prev.map((m) => (m._id === optimistic._id ? { ...data.message, createdAt: data.message.createdAt } : m))
        );
      } else {
        setMessages((prev) => prev.filter((m) => m._id !== optimistic._id));
        setError("Failed to send message.");
      }
    } catch {
      setMessages((prev) => prev.filter((m) => m._id !== optimistic._id));
      setError("Failed to send message.");
    } finally {
      setSending(false);
      textareaRef.current?.focus();
    }
  }, [input, sending, convId, currentUserId, conversation.participants, onConversationCreated]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const clearChat = useCallback(async () => {
    if (!convId) return; // No conversation to clear
    const ok = await confirm({
      title: "Clear Chat",
      message: "This will permanently delete all messages in this conversation. The conversation will remain.",
      confirmLabel: "Clear Messages",
      variant: "destructive",
    });
    if (!ok) return;

    try {
      const res = await fetch(`/api/dm/${convId}/manage`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "clear" }),
      });
      if (res.ok) {
        setMessages([]);
        queryClient.invalidateQueries({ queryKey: conversationKeys.lists() });
      } else {
        setError("Failed to clear chat.");
      }
    } catch {
      setError("Failed to clear chat.");
    }
  }, [convId, confirm, queryClient]);

  const deleteChat = useCallback(async () => {
    if (!convId) {
      // Pending chat with no messages — just navigate back
      onDeleteConversation?.();
      return;
    }
    const ok = await confirm({
      title: "Delete Conversation",
      message: "This will permanently delete this conversation and all messages. This action cannot be undone.",
      confirmLabel: "Delete",
      variant: "destructive",
    });
    if (!ok) return;

    try {
      const res = await fetch(`/api/dm/${convId}/manage`, {
        method: "DELETE",
      });
      if (res.ok) {
        queryClient.invalidateQueries({ queryKey: conversationKeys.lists() });
        onDeleteConversation?.();
      } else {
        setError("Failed to delete conversation.");
      }
    } catch {
      setError("Failed to delete conversation.");
    }
  }, [convId, confirm, queryClient, onDeleteConversation]);

  return (
    <div className="flex flex-col h-full">
      {ConfirmDialogNode}
      {/* Chat header */}
      <div className="px-4 py-3 border-b flex items-center gap-3 shrink-0 bg-card">
        <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0 overflow-hidden">
          {otherParticipant?.avatar ? (
            <img
              src={otherParticipant.avatar}
              alt=""
              className="w-full h-full object-cover"
            />
          ) : (
            <span className="text-sm font-bold text-primary">
              {otherParticipant?.name?.[0]?.toUpperCase() ?? "?"}
            </span>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm truncate">{otherParticipant?.name ?? "Unknown"}</p>
          <p className="text-xs text-muted-foreground capitalize">{otherParticipant?.role?.replace("_", " ") ?? ""}</p>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0">
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            <DropdownMenuItem onClick={clearChat} className="gap-2 text-muted-foreground">
              <Eraser className="h-3.5 w-3.5" />
              Clear Chat
            </DropdownMenuItem>
            <DropdownMenuItem onClick={deleteChat} className="gap-2 text-destructive focus:text-destructive">
              <Trash2 className="h-3.5 w-3.5" />
              Delete Chat
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Messages */}
      <div ref={scrollContainerRef} className="flex-1 overflow-y-auto p-4 space-y-3">
        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-12 text-center">
            <MessageSquare className="h-8 w-8 text-muted-foreground/30" />
            <p className="text-sm text-muted-foreground">No messages yet. Say hello!</p>
          </div>
        ) : (
          messages.map((msg) => {
            const isMine = msg.senderId === currentUserId;
            return (
              <div key={msg._id} className={cn("flex", isMine ? "justify-end" : "justify-start")}>
                <div
                  className={cn(
                    "max-w-[75%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed",
                    isMine
                      ? "bg-primary text-primary-foreground rounded-tr-none"
                      : "bg-muted text-foreground rounded-tl-none"
                  )}
                >
                  <p className="whitespace-pre-wrap break-words">{msg.content}</p>
                  <p className={cn("text-[10px] mt-1 opacity-60", isMine ? "text-right" : "")}>
                    {new Date(msg.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    {isMine && msg.readAt && " ✓✓"}
                  </p>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="px-4 py-2 flex items-center gap-2 text-xs text-destructive bg-destructive/10 shrink-0">
          <AlertTriangle className="h-3.5 w-3.5" />
          {error}
        </div>
      )}

      {/* Input */}
      <div className="border-t p-3 shrink-0 bg-card">
        <div className="flex gap-2 items-end">
          <Textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a message… (Enter to send, Shift+Enter for new line)"
            className="min-h-[40px] max-h-[120px] resize-none text-sm flex-1 bg-muted/30 rounded-xl"
            rows={1}
            disabled={sending}
          />
          <Button
            size="icon"
            onClick={sendMessage}
            disabled={!input.trim() || sending}
            className="w-9 h-9 rounded-xl shrink-0 self-end"
          >
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </div>
      </div>
    </div>
  );
}
