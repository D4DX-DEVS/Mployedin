"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Wand2, RotateCcw, Trash2, ChevronRight, Loader2, FileText, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/hooks/useConfirm";

interface DraftSummary {
  _id: string;
  fileName: string;
  companyName?: string;
  totalJobs: number;
  postedCount: number;
  skippedCount: number;
  remainingCount: number;
  selectedCount: number;
  createdAt: string;
  updatedAt: string;
}

interface DraftExtractionsCardProps {
  /** Active locale for href construction + relative date locale. */
  locale: string;
  /**
   * Visual variant — controls whether the component renders as a standalone
   * dashboard card (default) or as a slim banner for embedding on the jobs
   * list page above filters.
   */
  variant?: "card" | "banner";
}

function relativeTime(iso: string, locale: string): string {
  try {
    const diffMs = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diffMs / 60_000);
    if (mins < 1) return locale === "ar" ? "الآن" : "just now";
    if (mins < 60) return locale === "ar" ? `قبل ${mins} دقيقة` : `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return locale === "ar" ? `قبل ${hours} ساعة` : `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return locale === "ar" ? `قبل ${days} يوم` : `${days}d ago`;
  } catch {
    return "";
  }
}

/**
 * Draft AI Extractions card — surfaces unfinished AI extraction sessions so
 * the employer can resume posting the remaining jobs without re-running the
 * paid AI extraction step.
 *
 * Two entry points render this:
 *   - employer dashboard (`/employer`)        → variant="card"   (top urgency slot)
 *   - jobs list page     (`/employer/jobs`)   → variant="banner" (above filters)
 *
 * Both variants point the user at `?draft=<id>` on the ai-extract page, where
 * the page fetches the full draft and rehydrates the editable list.
 */
export function DraftExtractionsCard({ locale, variant = "card" }: DraftExtractionsCardProps) {
  const t = useTranslations("employerDashboard.draftExtractions");
  const router = useRouter();
  const { confirm: confirmDialog, ConfirmDialogNode } = useConfirm();

  const [drafts, setDrafts] = useState<DraftSummary[] | null>(null);
  const [discardingId, setDiscardingId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/ai/job-extract/drafts", { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as { drafts: DraftSummary[] };
        if (!cancelled) setDrafts(data.drafts ?? []);
      } catch {
        if (!cancelled) setDrafts([]); // silent — card simply doesn't render
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Don't render while loading (prevents flashing an empty card), and hide
  // entirely when there's nothing pending — this card is a contextual nudge,
  // not a permanent surface.
  if (!drafts || drafts.length === 0) return null;

  const continueHref = (id: string) => `/${locale}/employer/jobs/ai-extract?draft=${id}`;

  const handleDiscard = async (draft: DraftSummary) => {
    const ok = await confirmDialog({
      title: t("discardConfirmTitle"),
      message: t("discardConfirmMessage", {
        fileName: draft.fileName,
        remaining: draft.remainingCount,
      }),
      confirmLabel: t("discardConfirmAction"),
      variant: "destructive",
    });
    if (!ok) return;

    setDiscardingId(draft._id);
    try {
      const res = await fetch(`/api/ai/job-extract/drafts/${draft._id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("discard failed");
      setDrafts((prev) => (prev ?? []).filter((d) => d._id !== draft._id));
      toast.success(t("discardSuccess"));
    } catch {
      toast.error(t("discardFailed"));
    } finally {
      setDiscardingId(null);
    }
  };

  // ── Banner variant (jobs list page) ─────────────────────────────────────
  if (variant === "banner") {
    return (
      <div className="rounded-2xl border border-amber-200 bg-amber-50/80 p-4 dark:border-amber-500/30 dark:bg-amber-500/10">
        {ConfirmDialogNode}
        <div className="flex flex-wrap items-center gap-3">
          <Wand2 className="h-5 w-5 flex-shrink-0 text-amber-600 dark:text-amber-400" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-foreground">
              {t("bannerTitle", { count: drafts.length })}
            </p>
            <p className="truncate text-xs text-muted-foreground">
              {drafts
                .map((d) => `${d.fileName} · ${t("remaining", { count: d.remainingCount })}`)
                .join("  •  ")}
            </p>
          </div>
          {drafts.slice(0, 3).map((d) => (
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
    <section className="workspace-panel-surface flex flex-col rounded-[24px] p-5">
      {ConfirmDialogNode}
      <div className="mb-4 flex items-center gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-violet-50 text-violet-600 dark:bg-violet-500/15 dark:text-violet-300">
          <Wand2 className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-foreground">{t("cardTitle")}</h3>
          <p className="truncate text-xs text-muted-foreground">{t("cardSubtitle")}</p>
        </div>
      </div>

      <ul className="space-y-2">
        {drafts.slice(0, 5).map((d) => (
          <li
            key={d._id}
            className="group flex items-center gap-2 rounded-2xl border border-border/60 bg-background/70 p-2.5 transition-all hover:-translate-y-px hover:border-violet-400/40 hover:shadow-sm"
          >
            <Link href={continueHref(d._id)} className="flex min-w-0 flex-1 items-center gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-violet-100 text-violet-600 dark:bg-violet-500/20 dark:text-violet-300">
                <FileText className="h-4 w-4" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-foreground">{d.fileName}</p>
                <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground">
                  <span>{t("jobsRemaining", { remaining: d.remainingCount, total: d.totalJobs })}</span>
                  <span className="inline-flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {relativeTime(d.updatedAt, locale)}
                  </span>
                </div>
              </div>
              <span className="hidden shrink-0 items-center gap-1.5 rounded-lg bg-violet-50 px-2.5 py-1 text-xs font-semibold text-violet-700 transition-colors group-hover:bg-violet-100 dark:bg-violet-500/15 dark:text-violet-300 sm:inline-flex">
                <RotateCcw className="h-3.5 w-3.5" />
                {t("continue")}
              </span>
            </Link>
            <button
              type="button"
              disabled={discardingId === d._id}
              onClick={() => handleDiscard(d)}
              aria-label={t("discardAriaLabel")}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
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
