"use client";

import { useCallback, useRef, useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  Bot,
  Loader2,
  Palette,
  Sparkles,
  Send,
  Check,
  User,
  Zap,
  RotateCcw,
} from "lucide-react";
import {
  useAIPosterChat,
  type AIChatRequest,
  type AIChatResponse,
  type TextZone,
} from "@/hooks/usePosterTemplates";
import { toast } from "sonner";

type SizeKey = "landscape" | "square" | "story";

interface ChatMessage {
  id: string;
  role: "user" | "ai";
  text: string;
  zones?: AIChatResponse["zones"];
  colorPalette?: string[];
  suggestedAccentColor?: string;
  applied?: boolean;
}

const QUICK_PROMPTS = [
  "Create a corporate template with title, company, salary, and CTA",
  "Design a social media template with tagline, logo, and QR code",
  "Minimal template — just title, location, and CTA",
  "Suggest color palettes for this category",
  "Full template with all fields optimized",
  "Make the layout more balanced and spacious",
];

function makeId() {
  return `zone-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
}

function msgId() {
  return `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

interface Props {
  activeSize: SizeKey;
  category: string;
  accentColor: string;
  currentZones: TextZone[];
  hasBackground: boolean;
  onSetZones: (zones: TextZone[]) => void;
  onSetAccentColor: (color: string) => void;
  onSelectZone: (id: string | null) => void;
}

export default function PosterAIAssistant({
  activeSize,
  category,
  accentColor,
  currentZones,
  hasBackground,
  onSetZones,
  onSetAccentColor,
  onSelectZone,
}: Props) {
  const chatMutation = useAIPosterChat();
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: msgId(),
      role: "ai",
      text: `Hi! I'll help you design reusable poster templates. Tell me what zones you want — e.g. "Create a corporate template with title, salary, and CTA" — and I'll generate the layout. Employers will later fill in their own job data. Pick a prompt below or type your own!`,
    },
  ]);
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  const sendMessage = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || chatMutation.isPending) return;

      setInput("");

      // Add user message
      const userMsg: ChatMessage = { id: msgId(), role: "user", text: trimmed };
      setMessages((prev) => [...prev, userMsg]);

      const request: AIChatRequest = {
        message: trimmed,
        format: activeSize,
        category,
        accentColor,
        hasBackground,
        currentZoneFields: currentZones.map((z) => z.field),
      };

      try {
        const result = await chatMutation.mutateAsync(request);

        const aiMsg: ChatMessage = {
          id: msgId(),
          role: "ai",
          text: result.reply || "Done!",
          zones: result.zones,
          colorPalette: result.colorPalette,
          suggestedAccentColor: result.suggestedAccentColor,
          applied: false,
        };
        setMessages((prev) => [...prev, aiMsg]);

        // Auto-apply zones if AI returned them
        if (result.zones && result.zones.length > 0) {
          const newZones: TextZone[] = result.zones.map((zone) => ({
            ...zone,
            id: makeId(),
          }));
          onSetZones(newZones);
          onSelectZone(null);
          setMessages((prev) =>
            prev.map((m) => (m.id === aiMsg.id ? { ...m, applied: true } : m))
          );
        }
      } catch (err) {
        setMessages((prev) => [
          ...prev,
          {
            id: msgId(),
            role: "ai",
            text: `Sorry, something went wrong: ${(err as Error).message}. Please try again.`,
          },
        ]);
      }
    },
    [
      activeSize,
      category,
      accentColor,
      hasBackground,
      currentZones,
      chatMutation,
      onSetZones,
      onSelectZone,
    ]
  );

  const handleApplyColor = useCallback(
    (color: string) => {
      onSetAccentColor(color);
      toast.success(`Accent color updated to ${color}`);
    },
    [onSetAccentColor]
  );

  const handleApplyZonesFromMessage = useCallback(
    (msg: ChatMessage) => {
      if (!msg.zones || msg.zones.length === 0) return;
      const newZones: TextZone[] = msg.zones.map((zone) => ({
        ...zone,
        id: makeId(),
      }));
      onSetZones(newZones);
      onSelectZone(null);
      setMessages((prev) =>
        prev.map((m) => (m.id === msg.id ? { ...m, applied: true } : m))
      );
      toast.success(`Applied ${newZones.length} zones to canvas`);
    },
    [onSetZones, onSelectZone]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        sendMessage(input);
      }
    },
    [input, sendMessage]
  );

  const isLoading = chatMutation.isPending;

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="shrink-0 border-b border-violet-200 bg-[linear-gradient(145deg,rgba(255,255,255,0.96),rgba(245,243,255,0.92))] p-3.5">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-violet-200 bg-violet-50 text-violet-600">
            <Bot className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-violet-600">
              AI Template Designer
            </p>
            <p className="truncate text-sm font-semibold text-slate-950">
              Powered by Gemini
            </p>
          </div>
          {messages.length > 1 && (
            <button
              type="button"
              onClick={() => {
                setMessages([
                  {
                    id: msgId(),
                    role: "ai",
                    text: "Chat cleared! Describe the template layout you need, or pick a quick prompt below.",
                  },
                ]);
              }}
              className="rounded-lg p-1.5 text-muted-foreground transition hover:bg-secondary hover:text-foreground"
              title="Clear chat"
            >
              <RotateCcw className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Messages */}
      <div
        ref={scrollRef}
        className="flex-1 space-y-3 overflow-y-auto p-3"
        style={{ minHeight: 200, maxHeight: 480 }}
      >
        {messages.map((msg) => (
          <div key={msg.id} className={`flex gap-2.5 ${msg.role === "user" ? "flex-row-reverse" : ""}`}>
            {/* Avatar */}
            <div
              className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-xs ${
                msg.role === "ai"
                  ? "border border-violet-200 bg-violet-50 text-violet-600"
                  : "border border-sky-200 bg-sky-50 text-sky-600"
              }`}
            >
              {msg.role === "ai" ? <Sparkles className="h-3.5 w-3.5" /> : <User className="h-3.5 w-3.5" />}
            </div>

            {/* Bubble */}
            <div
              className={`max-w-[85%] rounded-2xl px-3 py-2.5 text-sm leading-relaxed ${
                msg.role === "ai"
                  ? "rounded-tl-md border border-border/70 bg-background/90 text-foreground"
                  : "rounded-tr-md bg-sky-600 text-white"
              }`}
            >
              <p>{msg.text}</p>

              {/* Zone action */}
              {msg.role === "ai" && msg.zones && msg.zones.length > 0 && (
                <div className="mt-2 rounded-xl border border-violet-100 bg-violet-50/50 p-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-violet-700">
                      <Zap className="mr-1 inline h-3 w-3" />
                      {msg.zones.length} zones generated
                    </span>
                    {msg.applied ? (
                      <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600">
                        <Check className="h-3 w-3" /> Applied
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleApplyZonesFromMessage(msg)}
                        className="rounded-lg bg-violet-600 px-2.5 py-1 text-[11px] font-semibold text-white transition hover:bg-violet-700"
                      >
                        Apply to canvas
                      </button>
                    )}
                  </div>
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {msg.zones.map((z, i) => (
                      <span
                        key={`${z.field}-${i}`}
                        className="rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-violet-700"
                      >
                        {z.field}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Color palette */}
              {msg.role === "ai" && msg.colorPalette && msg.colorPalette.length > 0 && (
                <div className="mt-2 rounded-xl border border-pink-100 bg-pink-50/50 p-2">
                  <p className="text-xs font-semibold text-pink-700">
                    <Palette className="mr-1 inline h-3 w-3" />
                    Suggested colors
                  </p>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {msg.colorPalette.map((color, i) => (
                      <button
                        key={`${color}-${i}`}
                        type="button"
                        onClick={() => handleApplyColor(color)}
                        className="group flex items-center gap-1.5 rounded-lg border border-border/70 bg-white/80 px-2 py-1 transition hover:border-pink-200"
                        title={`Apply ${color}`}
                      >
                        <div
                          className="h-4 w-4 rounded border border-border shadow-inner transition group-hover:scale-110"
                          style={{ backgroundColor: color }}
                        />
                        <span className="text-[10px] font-semibold text-muted-foreground">{color}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Accent color suggestion */}
              {msg.role === "ai" && msg.suggestedAccentColor && !msg.colorPalette?.length && (
                <button
                  type="button"
                  onClick={() => handleApplyColor(msg.suggestedAccentColor!)}
                  className="mt-2 flex items-center gap-2 rounded-xl border border-border/70 bg-secondary/30 px-2.5 py-1.5 transition hover:border-violet-200"
                >
                  <div
                    className="h-5 w-5 rounded-md border border-border shadow-inner"
                    style={{ backgroundColor: msg.suggestedAccentColor }}
                  />
                  <span className="text-xs font-semibold text-foreground">
                    Apply {msg.suggestedAccentColor}
                  </span>
                </button>
              )}
            </div>
          </div>
        ))}

        {/* Typing indicator */}
        {isLoading && (
          <div className="flex items-center gap-2.5">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg border border-violet-200 bg-violet-50 text-violet-600">
              <Sparkles className="h-3.5 w-3.5" />
            </div>
            <div className="rounded-2xl rounded-tl-md border border-border/70 bg-background/90 px-3 py-2.5">
              <Loader2 className="h-4 w-4 animate-spin text-violet-600" />
            </div>
          </div>
        )}
      </div>

      {/* Quick prompts */}
      <div className="shrink-0 border-t border-border/70 bg-secondary/20 px-3 py-2">
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          Quick prompts
        </p>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {QUICK_PROMPTS.map((prompt) => (
            <button
              key={prompt}
              type="button"
              disabled={isLoading}
              onClick={() => sendMessage(prompt)}
              className="rounded-full border border-border/70 bg-background/80 px-2.5 py-1 text-[11px] font-medium text-muted-foreground transition hover:border-violet-200 hover:bg-violet-50 hover:text-violet-700 disabled:opacity-50"
            >
              {prompt.length > 45 ? prompt.slice(0, 42) + "…" : prompt}
            </button>
          ))}
        </div>
      </div>

      {/* Input */}
      <div className="shrink-0 border-t border-border/70 bg-background/95 p-3">
        <div className="flex items-end gap-2 rounded-2xl border border-border bg-secondary/30 px-3 py-2">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Describe your template layout…"
            rows={1}
            disabled={isLoading}
            className="max-h-20 min-h-[36px] flex-1 resize-none border-0 bg-transparent text-sm leading-relaxed text-foreground placeholder:text-muted-foreground focus:outline-none disabled:opacity-50"
          />
          <Button
            type="button"
            size="icon"
            disabled={isLoading || !input.trim()}
            onClick={() => sendMessage(input)}
            className="h-8 w-8 shrink-0 rounded-xl bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-40"
          >
            {isLoading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Send className="h-3.5 w-3.5" />
            )}
          </Button>
        </div>
        <p className="mt-1.5 text-center text-[10px] text-muted-foreground">
          Press Enter to send · Shift+Enter for new line
        </p>
      </div>
    </div>
  );
}
