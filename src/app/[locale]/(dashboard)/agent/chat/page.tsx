"use client";

import { useState, useEffect, useRef, FormEvent } from "react";
import { Send, Users, Hash, Loader2, Circle, MessageSquare, ChevronLeft } from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";

interface Message {
  _id: string;
  senderId: string;
  senderName: string;
  senderRole: string;
  channel: string;
  content: string;
  createdAt: string;
}

const CHANNELS = [
  { id: "general", label: "# general", icon: Hash, description: "General team discussion" },
  { id: "employers", label: "# employers", icon: Hash, description: "Employer coordination" },
  { id: "leads", label: "# leads", icon: Hash, description: "New lead pipeline" },
  { id: "agents", label: "# agents", icon: Users, description: "Agent-only channel" },
];

const ROLE_COLORS: Record<string, string> = {
  agent: "bg-blue-100 text-blue-700",
  super_agent: "bg-purple-100 text-purple-700",
  employer: "bg-amber-100 text-amber-700",
  admin: "bg-red-100 text-red-700",
};

function formatTime(iso: string) {
  return new Intl.DateTimeFormat("en", { hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
}

export default function AgentChatPage() {
  const [activeChannel, setActiveChannel] = useState("general");
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [online] = useState(3);
  const [showChannels, setShowChannels] = useState(true);
  const bottomRef = useRef<HTMLDivElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchMessages = async () => {
    try {
      const res = await fetch(`/api/messages?channel=${activeChannel}`);
      if (res.ok) {
        const data = await res.json();
        setMessages(data.messages ?? []);
      }
    } catch { /* silent */ }
  };

  useEffect(() => {
    setLoading(true);
    fetchMessages().finally(() => setLoading(false));
    // Poll every 5 seconds
    pollRef.current = setInterval(fetchMessages, 5000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [activeChannel]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const send = async (e: FormEvent) => {
    e.preventDefault();
    if (!text.trim() || sending) return;
    setSending(true);
    try {
      await fetch("/api/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channel: activeChannel, content: text.trim() }),
      });
      setText("");
      await fetchMessages();
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-4">
      <PageHeader title="Team Channels" description="Internal messaging for agents, super agents and employers" />

      <div className="flex h-[calc(100vh-200px)] min-h-96 gap-0 rounded-xl border border-border overflow-hidden">
        {/* Sidebar – full-screen on mobile, side panel on sm+ */}
        <aside className={`${showChannels ? "flex" : "hidden"} sm:flex w-full sm:w-52 shrink-0 bg-muted/30 border-r border-border flex-col`}>
          <div className="p-3 border-b border-border">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Channels</p>
          </div>
          <nav className="flex-1 p-2 space-y-0.5 overflow-y-auto">
            {CHANNELS.map(ch => (
              <button key={ch.id} onClick={() => { setActiveChannel(ch.id); setShowChannels(false); }}
                className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors flex items-center gap-2 ${
                  activeChannel === ch.id
                    ? "bg-primary text-primary-foreground"
                    : "hover:bg-accent text-foreground"
                }`}>
                <Hash className="h-3.5 w-3.5 shrink-0" />
                {ch.id}
              </button>
            ))}
          </nav>
          <div className="p-3 border-t border-border">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Circle className="h-2 w-2 fill-emerald-500 text-emerald-500" /> {online} online
            </div>
          </div>
        </aside>

        {/* Main – hidden on mobile when channels panel shown */}
        <div className={`${!showChannels ? "flex" : "hidden"} sm:flex flex-1 flex-col min-w-0`}>
          {/* Channel Header */}
          <div className="px-4 py-3 border-b border-border flex items-center gap-2">
            <button onClick={() => setShowChannels(true)} className="sm:hidden p-1 -ml-1 rounded-md hover:bg-accent">
              <ChevronLeft className="h-4 w-4" />
            </button>
            <Hash className="h-4 w-4 text-muted-foreground" />
            <span className="font-semibold text-sm">{activeChannel}</span>
            <span className="text-xs text-muted-foreground hidden sm:inline">—</span>
            <span className="text-xs text-muted-foreground hidden sm:inline">
              {CHANNELS.find(c => c.id === activeChannel)?.description}
            </span>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {loading ? (
              <div className="flex justify-center py-8 text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin" />
              </div>
            ) : messages.length === 0 ? (
              <p className="text-center text-sm text-muted-foreground py-8">
                No messages yet. Start the conversation!
              </p>
            ) : (
              messages.map(msg => (
                <div key={msg._id} className="flex items-start gap-3">
                  <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0 text-xs font-bold text-primary">
                    {msg.senderName?.[0]?.toUpperCase() ?? "?"}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-2 flex-wrap">
                      <span className="text-sm font-semibold">{msg.senderName}</span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${ROLE_COLORS[msg.senderRole] ?? "bg-muted/50 text-muted-foreground"}`}>
                        {msg.senderRole?.replace("_", " ")}
                      </span>
                      <span className="text-xs text-muted-foreground">{formatTime(msg.createdAt)}</span>
                    </div>
                    <p className="text-sm mt-0.5 break-words">{msg.content}</p>
                  </div>
                </div>
              ))
            )}
            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <form onSubmit={send} className="px-4 py-3 border-t border-border flex gap-2">
            <input
              value={text}
              onChange={e => setText(e.target.value)}
              placeholder={`Message #${activeChannel}…`}
              className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
            />
            <button type="submit" disabled={!text.trim() || sending}
              className="btn-primary px-3 disabled:opacity-50 shrink-0">
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
