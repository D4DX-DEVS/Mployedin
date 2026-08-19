"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Bot, RotateCcw, Trash2, ChevronRight, Loader2, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/hooks/useConfirm";
import { relativeTime } from "@/lib/relativeTime";

interface ChatThreadSummary {
  _id: string;
  title: string;
  messageCount: number;
  preview: string;
  hasExtractedJob: boolean;
  updatedAt: string;
}

interface AIChatDraftsCardProps {
  locale: string;
  variant?: "card" | "banner";
}

/**
 * "Resume AI chat" card — surfaces unfinished AI job-creator conversations.
 *
 * The chat page POSTs the full transcript to `/api/ai/chat/drafts` after each
 * completed assistant reply (mirrors ChatGPT's save cadence), so the
 * conversation survives close-tab / browser crash / logout / next-day on any
 * device. Click-through goes back to the chat page with `?resume=<id>`, which
 * rehydrates the full message history + extracted draft.
 *
 * Self-hides client-side when no drafts exist (zero DOM cost otherwise).
 */
export function AIChatDraftsCard({ locale, variant = "card" }: AIChatDraftsCardProps) {
  const t = useTranslations("employerDashboard.aiChatDrafts");
  const router = useRouter();
  const { confirm: confirmDialog, ConfirmDialogNode } = useConfirm();

  const [drafts, setDrafts] = useState<ChatThreadSummary[] | null>(null);
  const [discardingId, setDiscardingId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/ai/chat/drafts", { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as { threads?: ChatThreadSummary[] };
        if (!cancelled) setDrafts(data.threads ?? []);
      } catch {
        if (!cancelled) setDrafts([]);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  if (!drafts || drafts.length === 0) return null;

  const continueHref = (id: string) => `/${locale}/employer/jobs/ai-create?resume=${id}`;

  const handleDiscard = async (draft: ChatThreadSummary) => {
    const ok = await confirmDialog({
      title: t("discardConfirmTitle"),
      message: t("discardConfirmMessage", { title: draft.title }),
      confirmLabel: t("discardConfirmAction"),
      variant: "destructive",
    });
    if (!ok) return;

    setDiscardingId(draft._id);
    try {
      const res = await fetch(`/api/ai/chat/drafts/${draft._id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("discard failed");
      setDrafts((prev) => (prev ?? []).filter((d) => d._id !== draft._id));
      toast.success(t("discardSuccess"));
    } catch {
      toast.error(t("discardFailed"));
    } finally {
      setDiscardingId(null);
    }
  };

  // ── Banner variant ──────────────────────────────────────────────────────
  if (variant === "banner") {
    return (
      <div className="rounded-2xl border border-sky-200 bg-sky-50/80 p-4 dark:border-sky-500/30 dark:bg-sky-500/10">
        {ConfirmDialogNode}
        <div className="flex flex-wrap items-center gap-3">
          <Bot className="h-5 w-5 flex-shrink-0 text-sky-600 dark:text-sky-400" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-foreground">
              {t("bannerTitle", { count: drafts.length })}
            </p>
            <p className="truncate text-xs text-muted-foreground">
              {drafts.map((d) => d.title).join("  •  ")}
            </p>
          </div>
          {drafts.slice(0, 2).map((d) => (
            <Button
              key={d._id}
              size="sm"
              variant="outline"
              className="gap-1.5"
              onClick={() => router.push(continueHref(d._id))}
            >
              <RotateCcw className="h-3.5 w-3.5" />
              {t("continue")}
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          ))}
        </div>
      </div>
    );
  }

  // ── Card variant (employer dashboard) ───────────────────────────────────
  return (
    <section className="workspace-panel-surface panel-body flex flex-col rounded-[24px]">
      {ConfirmDialogNode}
      <div className="mb-3 flex items-center gap-2.5">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-sky-50 text-sky-600 dark:bg-sky-500/15 dark:text-sky-300">
          <Bot className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-foreground">{t("cardTitle")}</h3>
          <p className="truncate text-xs text-muted-foreground">{t("cardSubtitle")}</p>
        </div>
      </div>

      {/* ponytail: compact inline rows — meta on one line, hides on narrow to keep height down */}
      {/* One per row — 2-up orphaned the third draft and truncated every title. */}
      <ul className="space-y-1.5">
        {drafts.slice(0, 3).map((d) => (
          <li
            key={d._id}
            className="group flex items-center gap-1.5 rounded-xl border border-border/60 bg-background/70 px-2 py-1 transition-all hover:border-sky-400/40 hover:shadow-sm sm:gap-2 sm:px-2.5 sm:py-1.5"
          >
            <Link href={continueHref(d._id)} className="flex min-w-0 flex-1 items-center gap-1.5 sm:gap-2.5">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-sky-100 text-sky-600 dark:bg-sky-500/20 dark:text-sky-300 sm:h-7 sm:w-7">
                <Bot className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
              </span>
              <div className="flex min-w-0 flex-1 items-center gap-2">
                <p className="truncate text-xs font-medium text-foreground sm:text-sm">{d.title}</p>
                <div className="flex shrink-0 items-center gap-1.5 text-[11px] text-muted-foreground">
                  {d.hasExtractedJob && (
                    <span className="hidden items-center gap-1 rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300 sm:inline-flex">
                      {t("draftReady")}
                    </span>
                  )}
                  <span className="hidden items-center gap-1 whitespace-nowrap sm:inline-flex">
                    <Clock className="h-3 w-3" />
                    {relativeTime(d.updatedAt, locale)}
                  </span>
                </div>
              </div>
              <span className="hidden shrink-0 items-center gap-1.5 rounded-lg bg-sky-50 px-2.5 py-1 text-xs font-semibold text-sky-700 transition-colors group-hover:bg-sky-100 dark:bg-sky-500/15 dark:text-sky-300 sm:inline-flex">
                <RotateCcw className="h-3.5 w-3.5" />
                {t("continueChat")}
              </span>
            </Link>
            <button
              type="button"
              disabled={discardingId === d._id}
              onClick={() => handleDiscard(d)}
              aria-label={t("discardAriaLabel")}
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive disabled:opacity-50 sm:h-7 sm:w-7"
            >
              {discardingId === d._id ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Trash2 className="h-3.5 w-3.5" />
              )}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
