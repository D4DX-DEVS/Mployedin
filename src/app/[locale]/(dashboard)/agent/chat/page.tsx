"use client";

import { useState, useEffect, useRef, FormEvent } from "react";
import { ChevronLeft, Circle, Hash, Loader2, Send, Sparkles, Users } from "lucide-react";

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
    <div className="page-container agent-legacy-surface space-y-6">
      <section className="workspace-hero-surface agent-legacy-hero overflow-hidden rounded-[28px] p-6 sm:p-7">
        <div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-sky-100 bg-white/70 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-sky-700 backdrop-blur"><Sparkles className="h-3.5 w-3.5" />Agent workspace</div>
            <h1 className="mt-4 text-3xl font-semibold tracking-tight text-slate-950 sm:text-[2rem]">Team Channels</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600">Coordinate with agents, employers, and supervisors from the same modern workspace while keeping each conversation in its own channel.</p>
          </div>
          <div className="rounded-2xl border border-white/80 bg-white/80 px-4 py-3 text-left backdrop-blur sm:min-w-[260px]"><p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Presence</p><p className="mt-1 text-lg font-semibold text-slate-950">{online} online</p><p className="text-xs text-slate-500">Live channel members currently visible in your workspace.</p></div>
        </div>
      </section>

      <div className="flex h-[calc(100vh-240px)] min-h-96 gap-0 overflow-hidden rounded-[28px] border border-slate-200 bg-white/95 shadow-[0_24px_60px_-46px_rgba(15,23,42,0.35)] backdrop-blur">
        {/* Sidebar – full-screen on mobile, side panel on sm+ */}
        <aside className={`${showChannels ? "flex" : "hidden"} sm:flex w-full sm:w-60 shrink-0 flex-col border-r border-slate-200 bg-slate-50/80`}>
          <div className="border-b border-slate-200 p-4">
            <p className="mb-1 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Channels</p>
          </div>
          <nav className="flex-1 p-2 space-y-0.5 overflow-y-auto">
            {CHANNELS.map(ch => (
              <button key={ch.id} onClick={() => { setActiveChannel(ch.id); setShowChannels(false); }}
                className={`flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm transition-colors ${
                  activeChannel === ch.id
                    ? "bg-sky-600 text-white"
                    : "text-slate-700 hover:bg-white"
                }`}>
                <Hash className="h-3.5 w-3.5 shrink-0" />
                {ch.id}
              </button>
            ))}
          </nav>
          <div className="border-t border-slate-200 p-4">
            <div className="flex items-center gap-1.5 text-xs text-slate-500">
              <Circle className="h-2 w-2 fill-emerald-500 text-emerald-500" /> {online} online
            </div>
          </div>
        </aside>

        {/* Main – hidden on mobile when channels panel shown */}
        <div className={`${!showChannels ? "flex" : "hidden"} sm:flex flex-1 flex-col min-w-0`}>
          {/* Channel Header */}
          <div className="flex items-center gap-2 border-b border-slate-200 px-4 py-3">
            <button onClick={() => setShowChannels(true)} className="-ml-1 rounded-md p-1 hover:bg-slate-100 sm:hidden">
              <ChevronLeft className="h-4 w-4" />
            </button>
            <Hash className="h-4 w-4 text-slate-400" />
            <span className="text-sm font-semibold text-slate-950">{activeChannel}</span>
            <span className="hidden text-xs text-slate-500 sm:inline">—</span>
            <span className="hidden text-xs text-slate-500 sm:inline">
              {CHANNELS.find(c => c.id === activeChannel)?.description}
            </span>
          </div>

          {/* Messages */}
          <div className="flex-1 space-y-4 overflow-y-auto p-4">
            {loading ? (
              <div className="flex justify-center py-8 text-slate-500">
                <Loader2 className="h-5 w-5 animate-spin" />
              </div>
            ) : messages.length === 0 ? (
              <p className="py-8 text-center text-sm text-slate-500">
                No messages yet. Start the conversation!
              </p>
            ) : (
              messages.map(msg => (
                <div key={msg._id} className="flex items-start gap-3">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-sky-50 text-xs font-bold text-sky-700">
                    {msg.senderName?.[0]?.toUpperCase() ?? "?"}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-2 flex-wrap">
                      <span className="text-sm font-semibold text-slate-950">{msg.senderName}</span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${ROLE_COLORS[msg.senderRole] ?? "bg-muted/50 text-muted-foreground"}`}>
                        {msg.senderRole?.replace("_", " ")}
                      </span>
                      <span className="text-xs text-slate-500">{formatTime(msg.createdAt)}</span>
                    </div>
                    <p className="mt-0.5 break-words text-sm text-slate-700">{msg.content}</p>
                  </div>
                </div>
              ))
            )}
            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <form onSubmit={send} className="flex gap-2 border-t border-slate-200 px-4 py-3">
            <input
              value={text}
              onChange={e => setText(e.target.value)}
              placeholder={`Message #${activeChannel}…`}
              className="flex-1 rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-700 outline-none transition focus:border-sky-200 focus:ring-2 focus:ring-sky-100"
            />
            <button type="submit" disabled={!text.trim() || sending}
              className="shrink-0 rounded-xl bg-sky-600 px-3 text-white transition-colors hover:bg-sky-700 disabled:opacity-50">
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
