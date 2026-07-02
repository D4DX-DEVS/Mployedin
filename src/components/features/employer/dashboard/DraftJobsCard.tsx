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
  /** Reports draft count after each fetch/discard so a parent layout can react (e.g. hide or resize a shared grid). */
  onCountChange?: (count: number) => void;
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
export function DraftJobsCard({ locale, variant = "card", onCountChange }: DraftJobsCardProps) {
  const t = useTranslations("employerDashboard.draftJobs");
  const router = useRouter();
  const { confirm: confirmDialog, ConfirmDialogNode } = useConfirm();

  const [drafts, setDrafts] = useState<DraftJobSummary[] | null>(null);
  const [discardingId, setDiscardingId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // ?myJobs=true scopes to the employer; status=draft filters; limit=3 caps
        // the dashboard surface. The existing GET /api/jobs route already
        // supports all three. (Route matches the literal "true" — "1" silently
        // falls through to the public active-jobs listing.)
        const res = await fetch("/api/jobs?myJobs=true&status=draft&limit=3", { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as { jobs?: DraftJobSummary[] };
        if (!cancelled) setDrafts(data.jobs ?? []);
      } catch {
        if (!cancelled) setDrafts([]);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (drafts !== null) onCountChange?.(drafts.length);
  }, [drafts, onCountChange]);

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
      <div className="workspace-glass-panel flex h-full flex-col gap-3 rounded-2xl border border-amber-200/60 p-4 dark:border-amber-500/30">
        {ConfirmDialogNode}
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-600 dark:bg-amber-500/20 dark:text-amber-300">
            <FilePenLine className="h-4 w-4" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-foreground">
              {t("bannerTitle", { count: drafts.length })}
            </p>
            <p className="truncate text-xs text-muted-foreground">
              {drafts.map((d) => d.title).join("  •  ")}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {drafts.slice(0, 3).map((d) => (
            <Button
              key={d._id}
              size="sm"
              variant="outline"
              className="h-8 gap-1.5 rounded-lg border-amber-200 bg-background/70 text-xs text-amber-700 hover:bg-amber-50 dark:border-amber-500/30 dark:text-amber-300 dark:hover:bg-amber-950/40"
              onClick={() => router.push(continueHref(d._id))}
            >
              <RotateCcw className="h-3.5 w-3.5" />
              {d.title.length > 18 ? `${d.title.slice(0, 18)}…` : d.title}
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
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-600 dark:bg-amber-500/15 dark:text-amber-300">
          <FilePenLine className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-foreground">{t("cardTitle")}</h3>
          <p className="truncate text-xs text-muted-foreground">{t("cardSubtitle")}</p>
        </div>
      </div>

      <ul className="space-y-2">
        {drafts.slice(0, 3).map((d) => (
          <li
            key={d._id}
            className="group flex items-center gap-2 rounded-2xl border border-border/60 bg-background/70 p-2.5 transition-all hover:-translate-y-px hover:border-amber-400/40 hover:shadow-sm"
          >
            <Link href={continueHref(d._id)} className="flex min-w-0 flex-1 items-center gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-600 dark:bg-amber-500/20 dark:text-amber-300">
                <FilePenLine className="h-4 w-4" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-foreground">{d.title}</p>
                <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground">
                  {d.category && <span>{d.category}</span>}
                  <span className="inline-flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {relativeTime(d.updatedAt, locale)}
                  </span>
                </div>
              </div>
              <span className="hidden shrink-0 items-center gap-1.5 rounded-lg bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700 transition-colors group-hover:bg-amber-100 dark:bg-amber-500/15 dark:text-amber-300 sm:inline-flex">
                <RotateCcw className="h-3.5 w-3.5" />
                {t("continueEditing")}
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
