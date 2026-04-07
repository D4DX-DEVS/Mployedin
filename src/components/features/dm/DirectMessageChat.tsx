"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useSession } from "next-auth/react";
import { Send, Loader2, MessageSquare, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { getPusherClient } from "@/lib/pusherClient";
import type { Channel } from "pusher-js";

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
}

export function DirectMessageChat({ conversation, currentUserId }: Props) {
  const [messages, setMessages] = useState<DMMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [pusherReady, setPusherReady] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const channelRef = useRef<Channel | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const otherParticipant = conversation.participantDetails.find(
    (p) => p.userId !== currentUserId
  );

  // Load message history
  const loadMessages = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/dm/${conversation._id}/messages`);
      if (res.ok) {
        const data = await res.json();
        setMessages(data.messages ?? []);
        // Mark as read
        fetch(`/api/dm/${conversation._id}/read`, { method: "PATCH" }).catch(() => {});
      } else {
        setError("Failed to load messages.");
      }
    } finally {
      setLoading(false);
    }
  }, [conversation._id]);

  useEffect(() => {
    loadMessages();
  }, [loadMessages]);

  // Scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Pusher real-time subscription
  useEffect(() => {
    const pusherKey = process.env.NEXT_PUBLIC_PUSHER_KEY;
    if (!pusherKey) return; // gracefully skip if not configured

    try {
      const pusher = getPusherClient();
      const channelName = `private-dm-${currentUserId}`;

      // Unsubscribe from previous channel if switching conversations
      if (channelRef.current) {
        channelRef.current.unbind_all();
        pusher.unsubscribe(channelRef.current.name);
      }

      const channel = pusher.subscribe(channelName);
      channelRef.current = channel;

      channel.bind("pusher:subscription_succeeded", () => setPusherReady(true));
      channel.bind("pusher:subscription_error", () => setPusherReady(false));

      channel.bind("new-message", (data: DMMessage) => {
        if (data.conversationId === conversation._id) {
          setMessages((prev) => {
            // Deduplicate by _id
            if (prev.some((m) => m._id === data._id)) return prev;
            return [...prev, data];
          });
          // Mark as read since we're actively viewing
          fetch(`/api/dm/${conversation._id}/read`, { method: "PATCH" }).catch(() => {});
        }
      });

      return () => {
        channel.unbind_all();
        pusher.unsubscribe(channelName);
        channelRef.current = null;
        setPusherReady(false);
      };
    } catch {
      // Pusher not configured — chat works via HTTP only (no real-time)
    }
  }, [currentUserId, conversation._id]);

  const sendMessage = useCallback(async () => {
    const content = input.trim();
    if (!content || sending) return;

    setSending(true);
    setInput("");

    // Optimistic update
    const optimistic: DMMessage = {
      _id: `opt-${Date.now()}`,
      conversationId: conversation._id,
      senderId: currentUserId,
      content,
      createdAt: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, optimistic]);

    try {
      const res = await fetch(`/api/dm/${conversation._id}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });

      if (res.ok) {
        const data = await res.json();
        // Replace optimistic message with real one
        setMessages((prev) =>
          prev.map((m) => (m._id === optimistic._id ? { ...data.message, createdAt: data.message.createdAt } : m))
        );
      } else {
        // Remove optimistic message on failure
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
  }, [input, sending, conversation._id, currentUserId]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Chat header */}
      <div className="px-4 py-3 border-b flex items-center gap-3 shrink-0 bg-card">
        <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
          <span className="text-sm font-bold text-primary">
            {otherParticipant?.name?.[0]?.toUpperCase() ?? "?"}
          </span>
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm truncate">{otherParticipant?.name ?? "Unknown"}</p>
          <p className="text-xs text-muted-foreground capitalize">{otherParticipant?.role?.replace("_", " ") ?? ""}</p>
        </div>
        {pusherReady && (
          <span className="flex items-center gap-1 text-[10px] text-emerald-600">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            Live
          </span>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
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
        <div ref={bottomRef} />
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
