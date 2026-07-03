"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { ChevronLeft, Circle, Hash, Loader2, Send, Sparkles, Users } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

interface Message {
  _id: string;
  senderId: string;
  senderName: string;
  senderRole: string;
  channel: string;
  content: string;
  createdAt: string;
}

const CHANNELS = (t: ReturnType<typeof useTranslations>) => [
  { id: "general", label: "# general", icon: Hash, description: t("generalDescription") },
  { id: "employers", label: "# employers", icon: Hash, description: t("employersDescription") },
  { id: "leads", label: "# leads", icon: Hash, description: t("leadsDescription") },
  { id: "agents", label: "# agents", icon: Users, description: t("agentsDescription") },
];

const ROLE_COLORS: Record<string, string> = {
  agent: "workspace-tone-sky",
  super_agent: "workspace-tone-violet",
  employer: "workspace-tone-amber",
  admin: "workspace-tone-rose",
};

function formatTime(iso: string) {
  return new Intl.DateTimeFormat("en", { hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
}

export default function AgentChatPage() {
  const t = useTranslations("agentChat");
  const channels = CHANNELS(t);
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
    } catch {
      // Keep the current view stable if polling fails.
    }
  };

  useEffect(() => {
    setLoading(true);
    fetchMessages().finally(() => setLoading(false));
    pollRef.current = setInterval(fetchMessages, 30_000);

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [activeChannel]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const send = async (event: FormEvent) => {
    event.preventDefault();
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
    <div className="page-container agent-legacy-surface flex flex-col space-y-6">
      <section className="workspace-hero-surface agent-legacy-hero overflow-hidden rounded-[28px] p-6 sm:p-7">
        <div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
          <div className="max-w-3xl">
            <div className="workspace-glass-panel inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-primary">
              <Sparkles className="h-3.5 w-3.5" />
              {t("agentWorkspaceBadge")}
            </div>
            <h1 className="mt-4 text-3xl font-semibold tracking-tight text-foreground sm:text-[2rem]">{t("teamChannelsHeading")}</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
              {t("teamChannelsDescription")}
            </p>
          </div>

          <div className="workspace-glass-panel rounded-2xl px-4 py-3 text-left sm:min-w-[260px]">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{t("presenceLabel")}</p>
            <p className="mt-1 text-lg font-semibold text-foreground">{t("onlineCount", { count: online })}</p>
            <p className="text-xs text-muted-foreground">{t("presenceDescription")}</p>
          </div>
        </div>
      </section>

      <div className="workspace-panel-surface flex min-h-96 flex-1 gap-0 overflow-hidden rounded-[28px]">
        <aside className={`${showChannels ? "flex" : "hidden"} workspace-subtle-surface sm:flex w-full sm:w-60 shrink-0 flex-col border-r border-border`}>
          <div className="border-b border-border p-4">
            <p className="mb-1 text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">{t("channelsLabel")}</p>
          </div>

          <nav className="flex-1 space-y-0.5 overflow-y-auto p-2">
            {channels.map((channel) => (
              <button
                key={channel.id}
                onClick={() => {
                  setActiveChannel(channel.id);
                  setShowChannels(false);
                }}
                className={`flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm transition-colors ${
                  activeChannel === channel.id
                    ? "workspace-tone-sky"
                    : "text-foreground/80 hover:bg-background/80"
                }`}
              >
                <Hash className="h-3.5 w-3.5 shrink-0" />
                {channel.id}
              </button>
            ))}
          </nav>

          <div className="border-t border-border p-4">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Circle className="h-2 w-2 fill-emerald-500 text-emerald-500" />
              {t("onlineCount", { count: online })}
            </div>
          </div>
        </aside>

        <div className={`${!showChannels ? "flex" : "hidden"} sm:flex min-w-0 flex-1 flex-col`}>
          <div className="flex items-center gap-2 border-b border-border px-4 py-3">
            <button onClick={() => setShowChannels(true)} className="-ml-1 rounded-md p-1 hover:bg-secondary sm:hidden">
              <ChevronLeft className="h-4 w-4" />
            </button>
            <Hash className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-semibold text-foreground">{activeChannel}</span>
            <span className="hidden text-xs text-muted-foreground sm:inline">-</span>
            <span className="hidden text-xs text-muted-foreground sm:inline">
              {channels.find((channel) => channel.id === activeChannel)?.description}
            </span>
          </div>

          <div className="flex-1 space-y-4 overflow-y-auto p-4">
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex items-start gap-3">
                  <Skeleton className="h-8 w-8 shrink-0 rounded-full" />
                  <div className="min-w-0 flex-1 space-y-2">
                    <Skeleton className="h-3 w-32" />
                    <Skeleton className={`h-4 ${i % 2 === 0 ? "w-2/3" : "w-1/2"}`} />
                  </div>
                </div>
              ))
            ) : messages.length === 0 ? (
              <p className="workspace-empty-state rounded-2xl py-8 text-center text-sm text-muted-foreground">
                {t("noMessagesEmpty")}
              </p>
            ) : (
              messages.map((message) => (
                <div key={message._id} className="flex items-start gap-3">
                  <div className="workspace-tone-sky flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold">
                    {message.senderName?.[0]?.toUpperCase() ?? "?"}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline gap-2">
                      <span className="text-sm font-semibold text-foreground">{message.senderName}</span>
                      <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${ROLE_COLORS[message.senderRole] ?? "bg-muted/50 text-muted-foreground"}`}>
                        {message.senderRole?.replace("_", " ")}
                      </span>
                      <span className="text-xs text-muted-foreground">{formatTime(message.createdAt)}</span>
                    </div>
                    <p className="mt-0.5 break-words text-sm text-foreground/85">{message.content}</p>
                  </div>
                </div>
              ))
            )}

            <div ref={bottomRef} />
          </div>

          <form onSubmit={send} className="flex gap-2 border-t border-border px-4 py-3">
            <input
              value={text}
              onChange={(event) => setText(event.target.value)}
              placeholder={t("messageInputPlaceholder", { channel: activeChannel })}
              className="flex-1 rounded-xl border border-border bg-background/80 px-4 py-2.5 text-sm text-foreground outline-none transition focus:border-ring focus:ring-2 focus:ring-ring/20"
            />
            <button
              type="submit"
              disabled={!text.trim() || sending}
              className="shrink-0 rounded-xl bg-primary px-3 text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
            >
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
