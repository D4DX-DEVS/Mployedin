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
import { relativeTime } from "@/lib/relativeTime";

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
  /** Reports draft count after each fetch/discard so a parent layout can react (e.g. hide or resize a shared grid). */
  onCountChange?: (count: number) => void;
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
export function DraftExtractionsCard({ locale, variant = "card", onCountChange }: DraftExtractionsCardProps) {
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

  useEffect(() => {
    if (drafts !== null) onCountChange?.(drafts.length);
  }, [drafts, onCountChange]);

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
      // Single row, mirrors DraftJobsCard banner — the two sit side-by-side.
      <div className="workspace-glass-panel flex h-full flex-wrap items-center gap-x-3 gap-y-2 rounded-2xl border border-violet-200/60 p-3">
        {ConfirmDialogNode}
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-violet-100 text-violet-600">
          <Wand2 className="h-4 w-4" />
        </span>
        <p className="min-w-0 truncate text-sm font-semibold text-foreground">
          {t("bannerTitle", { count: drafts.length })}
        </p>
        <div className="flex min-w-0 flex-wrap gap-2 sm:ms-auto">
          {drafts.slice(0, 3).map((d) => (
            <Button
              key={d._id}
              size="sm"
              variant="outline"
              className="h-8 gap-1.5 rounded-lg border-violet-200 bg-background/70 text-xs text-violet-700 hover:bg-violet-50"
              onClick={() => router.push(continueHref(d._id))}
            >
              <RotateCcw className="h-3.5 w-3.5" />
              {d.fileName.length > 16 ? `${d.fileName.slice(0, 16)}…` : d.fileName}
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          ))}
        </div>
      </div>
    );
  }

  // ── Card variant (employer dashboard) ───────────────────────────────────
  return (
    <section className="workspace-panel-surface panel-body flex flex-col rounded-3xl">
      {ConfirmDialogNode}
      <div className="mb-4 flex items-center gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-violet-50 text-violet-600">
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
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-violet-100 text-violet-600">
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
              <span className="hidden shrink-0 items-center gap-1.5 rounded-lg bg-violet-50 px-2.5 py-1 text-xs font-semibold text-violet-700 transition-colors group-hover:bg-violet-100 sm:inline-flex">
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
