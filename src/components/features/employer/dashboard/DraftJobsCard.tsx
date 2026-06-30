"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { FilePenLine, RotateCcw, Trash2, ChevronRight, Loader2, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/hooks/useConfirm";

interface DraftJobSummary {
  _id: string;
  title: string;
  category?: string;
  updatedAt: string;
}

interface DraftJobsCardProps {
  locale: string;
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
 * "Continue editing" card — surfaces the employer's in-progress job drafts
 * (status === "draft") so they can resume after a close/Back/logout/logout/
 * browser-crash.
 *
 * Backed by the EXISTING auto-draft plumbing: `JobFormWizard.saveDraftBeacon`
 * already writes a real `Job { status: "draft" }` via `navigator.sendBeacon`
 * on quit, and `useJobFormDraft.autosaveLocal` writes to localStorage on
 * every keystroke. This card just reads those drafts back and promotes them
 * to the dashboard.
 *
 * Two entry points:
 *   - employer dashboard → variant="card"   (top urgency slot under SmartHeader)
 *   - jobs list page     → variant="banner" (above filters)
 * Self-hides client-side when no drafts exist (zero DOM cost otherwise).
 */
export function DraftJobsCard({ locale, variant = "card" }: DraftJobsCardProps) {
  const t = useTranslations("employerDashboard.draftJobs");
  const router = useRouter();
  const { confirm: confirmDialog, ConfirmDialogNode } = useConfirm();

  const [drafts, setDrafts] = useState<DraftJobSummary[] | null>(null);
  const [discardingId, setDiscardingId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // ?myJobs=1 scopes to the employer; status=draft filters; limit=3 caps
        // the dashboard surface. The existing GET /api/jobs route already
        // supports all three.
        const res = await fetch("/api/jobs?myJobs=1&status=draft&limit=3", { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as { jobs?: DraftJobSummary[] };
        if (!cancelled) setDrafts(data.jobs ?? []);
      } catch {
        if (!cancelled) setDrafts([]);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  if (!drafts || drafts.length === 0) return null;

  const continueHref = (id: string) => `/${locale}/employer/jobs/${id}/edit`;

  const handleDiscard = async (draft: DraftJobSummary) => {
    const ok = await confirmDialog({
      title: t("discardConfirmTitle"),
      message: t("discardConfirmMessage", { title: draft.title }),
      confirmLabel: t("discardConfirmAction"),
      variant: "destructive",
    });
    if (!ok) return;

    setDiscardingId(draft._id);
    try {
      const res = await fetch(`/api/jobs/${draft._id}`, { method: "DELETE" });
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
          <FilePenLine className="h-5 w-5 flex-shrink-0 text-amber-600 dark:text-amber-400" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-foreground">
              {t("bannerTitle", { count: drafts.length })}
            </p>
            <p className="truncate text-xs text-muted-foreground">
              {drafts.map((d) => d.title).join("  •  ")}
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
    <section className="rounded-[28px] border border-amber-200 bg-gradient-to-br from-amber-50/80 via-background to-background p-5 shadow-sm dark:border-amber-500/30 dark:from-amber-500/10">
      {ConfirmDialogNode}
      <div className="mb-4 flex items-center gap-2">
        <FilePenLine className="h-4 w-4 text-amber-600 dark:text-amber-400" />
        <div>
          <h3 className="text-sm font-semibold text-foreground">{t("cardTitle")}</h3>
          <p className="text-xs text-muted-foreground">{t("cardSubtitle")}</p>
        </div>
      </div>

      <ul className="space-y-2.5">
        {drafts.slice(0, 3).map((d) => (
          <li
            key={d._id}
            className="flex flex-wrap items-center gap-3 rounded-2xl border border-border/70 bg-background/80 p-3.5"
          >
            <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-600 dark:bg-amber-500/20 dark:text-amber-300">
              <FilePenLine className="h-4 w-4" />
            </div>

            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-foreground">{d.title}</p>
              <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                {d.category && <span>{d.category}</span>}
                <span className="inline-flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {t("lastEdited")} {relativeTime(d.updatedAt, locale)}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-1.5">
              <Button
                size="sm"
                className="h-8 gap-1.5 bg-amber-600 text-white hover:bg-amber-700"
                asChild
              >
                <Link href={continueHref(d._id)}>
                  <RotateCcw className="h-3.5 w-3.5" />
                  {t("continueEditing")}
                </Link>
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                disabled={discardingId === d._id}
                onClick={() => handleDiscard(d)}
                aria-label={t("discardAriaLabel")}
              >
                {discardingId === d._id ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Trash2 className="h-3.5 w-3.5" />
                )}
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
