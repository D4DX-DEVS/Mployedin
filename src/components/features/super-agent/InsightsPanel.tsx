"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useTranslations } from "next-intl";
import {
  AlertTriangle, TrendingUp, Lightbulb, Rocket, RefreshCw, Sparkles,
  ThumbsUp, ThumbsDown, ArrowRight, Loader2, X, Eye,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useConfirm } from "@/hooks/useConfirm";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

/* ────────────────────────────────────────────────────────
   Types
   ──────────────────────────────────────────────────────── */

type InsightSeverity = "critical" | "warning" | "info";
type InsightType = "alert" | "metric" | "tip" | "opportunity";
type ActionType = "assign_leads" | "send_reminder" | "navigate" | "generate_report";
type ConfidenceLevel = "high" | "medium" | "low";

interface Insight {
  id: string;
  severity: InsightSeverity;
  type: InsightType;
  title: string;
  message: string;
  confidence?: ConfidenceLevel;
  cause?: string;
  agentIds?: string[];
  action?: string;
  actionType?: ActionType;
  actionUrl?: string;
  actionPayload?: Record<string, unknown>;
}

const DISMISSED_KEY = "sa_insights_dismissed";

/* ────────────────────────────────────────────────────────
   Icon + Tone maps
   ──────────────────────────────────────────────────────── */

const typeIcon: Record<InsightType, React.ReactNode> = {
  alert: <AlertTriangle className="h-4 w-4" />,
  metric: <TrendingUp className="h-4 w-4" />,
  tip: <Lightbulb className="h-4 w-4" />,
  opportunity: <Rocket className="h-4 w-4" />,
};

const severityStyles: Record<
  InsightSeverity,
  { border: string; badge: string; badgeText: string; iconChip: string }
> = {
  critical: {
    border: "border-l-rose-500",
    badge: "bg-rose-100 text-rose-700",
    badgeText: "Critical",
    iconChip: "bg-rose-100 text-rose-600",
  },
  warning: {
    border: "border-l-amber-400",
    badge: "bg-amber-100 text-amber-700",
    badgeText: "Warning",
    iconChip: "bg-amber-100 text-amber-600",
  },
  info: {
    border: "border-l-emerald-400",
    badge: "bg-emerald-100 text-emerald-700",
    badgeText: "Info",
    iconChip: "bg-emerald-100 text-emerald-600",
  },
};

// Confidence is a separate signal from severity, so it reads as a subtle
// dot + label rather than a second colored pill competing with the badge.
const confidenceStyles: Record<ConfidenceLevel, { dot: string; label: string }> = {
  high: { dot: "bg-sky-500", label: "High" },
  medium: { dot: "bg-violet-500", label: "Medium" },
  low: { dot: "bg-zinc-400", label: "Low" },
};

/* ────────────────────────────────────────────────────────
   Component
   ──────────────────────────────────────────────────────── */

interface SuperAgentInsightsPanelProps {
  /** Start expanded. For the insights page, where this panel is the content;
   *  elsewhere it collapses to a one-line summary above the page's own table. */
  defaultExpanded?: boolean;
  /** Render as a single button (for a page hero) that opens the insights in a
   *  dialog, instead of occupying a block on the page. */
  asDialog?: boolean;
}

export function SuperAgentInsightsPanel({ defaultExpanded = false, asDialog = false }: SuperAgentInsightsPanelProps = {}) {
  const t = useTranslations("insightsPanel");
  const router = useRouter();
  const { confirm, ConfirmDialogNode } = useConfirm();
  const [insights, setInsights] = useState<Insight[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [visibleCount, setVisibleCount] = useState(0);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [actionDone, setActionDone] = useState<Set<string>>(new Set());
  const [feedbackGiven, setFeedbackGiven] = useState<Set<string>>(new Set());
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(() => {
    if (typeof window === "undefined") return new Set();
    try {
      const stored = localStorage.getItem(DISMISSED_KEY);
      return stored ? new Set(JSON.parse(stored)) : new Set();
    } catch { return new Set(); }
  });
  const [showDismissed, setShowDismissed] = useState(false);
  // ponytail: mobile collapses to a summary row; no bottom sheet until someone asks
  const [mobileOpen, setMobileOpen] = useState(defaultExpanded);
  const [dialogOpen, setDialogOpen] = useState(false);

  const persistDismissed = useCallback((ids: Set<string>) => {
    try { localStorage.setItem(DISMISSED_KEY, JSON.stringify([...ids])); } catch { /* noop */ }
  }, []);

  const dismissInsight = useCallback((id: string) => {
    setDismissedIds((prev) => {
      const next = new Set(prev).add(id);
      persistDismissed(next);
      return next;
    });
  }, [persistDismissed]);

  const restoreAll = useCallback(() => {
    setDismissedIds(new Set());
    persistDismissed(new Set());
    setShowDismissed(false);
  }, [persistDismissed]);

  const visibleInsights = useMemo(
    () => showDismissed ? insights : insights.filter((i) => !dismissedIds.has(i.id)),
    [insights, dismissedIds, showDismissed]
  );
  const dismissedCount = useMemo(
    () => insights.filter((i) => dismissedIds.has(i.id)).length,
    [insights, dismissedIds]
  );

  const fetchInsights = useCallback(async () => {
    setLoading(true);
    setError(false);
    setVisibleCount(0);
    try {
      const res = await fetch("/api/super-agent/insights");
      if (!res.ok) throw new Error("Failed");
      const data = await res.json();
      setInsights(data.insights ?? []);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchInsights(); }, [fetchInsights]);

  // Staggered reveal animation
  useEffect(() => {
    if (loading || visibleInsights.length === 0) return;
    let i = 0;
    const interval = setInterval(() => {
      i++;
      setVisibleCount(i);
      if (i >= visibleInsights.length) clearInterval(interval);
    }, 150);
    return () => clearInterval(interval);
  }, [loading, visibleInsights]);

  // ── Action handlers ──

  const handleAction = async (insight: Insight) => {
    if (!insight.actionType) return;
    const key = insight.id;

    // In dialog mode, close this popup first. `useConfirm` renders its own
    // Radix Dialog, and opening it from inside this one nests two dialogs —
    // they fight over the focus trap. Closing first also reads better: you
    // picked an action, the list gets out of the way, the confirm appears.
    if (asDialog) setDialogOpen(false);

    if (insight.actionType === "navigate" && insight.actionUrl) {
      router.push(insight.actionUrl);
      return;
    }

    if (insight.actionType === "assign_leads" && insight.actionPayload) {
      const ok = await confirm({
        title: "Assign leads",
        message: `Assign more leads to ${insight.actionPayload.targetAgentName}?`,
        confirmLabel: "Assign leads",
        variant: "default",
      });
      if (!ok) return;

      // Optimistic: mark done immediately
      setActionDone((prev) => new Set(prev).add(key));
      setActionLoading(key);

      try {
        const fromAgent = insights
          .filter((i) => i.agentIds?.length && i.severity === "critical" && i.type === "alert")
          .flatMap((i) => i.agentIds ?? [])
          .find((id) => id !== insight.actionPayload?.targetAgentUserId);

        if (!fromAgent) {
          // Rollback
          setActionDone((prev) => { const next = new Set(prev); next.delete(key); return next; });
          toast.error(t("noUnderperformingAgent"));
          return;
        }

        const res = await fetch("/api/super-agent/actions/assign-leads", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            fromAgentUserId: fromAgent,
            toAgentUserId: insight.actionPayload.targetAgentUserId,
            maxLeads: 5,
          }),
        });
        if (!res.ok) throw new Error();
        toast.success(t("leadsReassignedSuccessfully"));
      } catch {
        // Rollback on failure
        setActionDone((prev) => { const next = new Set(prev); next.delete(key); return next; });
        toast.error(t("failedToReassignLeads"));
      } finally {
        setActionLoading(null);
      }
      return;
    }

    if (insight.actionType === "send_reminder" && insight.actionPayload) {
      const ids = insight.actionPayload.agentUserIds ?? [insight.actionPayload.agentUserId];
      const names = insight.actionPayload.agentNames ?? [insight.actionPayload.agentName];
      const recipients = Array.isArray(names) ? (names as string[]) : [String(names)];
      const ok = await confirm({
        title: "Send performance reminder",
        message:
          recipients.length === 1
            ? `Send a performance reminder to ${recipients[0]}?`
            : `Send a performance reminder to ${recipients.length} agents (${recipients.join(", ")})?`,
        confirmLabel: "Send reminder",
        variant: "default",
      });
      if (!ok) return;

      // Optimistic: mark done immediately
      setActionDone((prev) => new Set(prev).add(key));
      setActionLoading(key);

      try {
        const res = await fetch("/api/super-agent/actions/send-reminder", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ agentUserIds: Array.isArray(ids) ? ids : [ids] }),
        });
        if (!res.ok) throw new Error();
        toast.success(
          recipients.length === 1 ? "Reminder sent." : `Reminders sent to ${recipients.length} agents.`
        );
      } catch {
        // Rollback on failure
        setActionDone((prev) => { const next = new Set(prev); next.delete(key); return next; });
        toast.error(t("failedToSendReminder"));
      } finally {
        setActionLoading(null);
      }
      return;
    }
  };

  // ── Feedback handler ──

  const handleFeedback = async (insight: Insight, helpful: boolean) => {
    const key = insight.id;
    if (feedbackGiven.has(key)) return;
    setFeedbackGiven((prev) => new Set(prev).add(key));
    try {
      await fetch("/api/super-agent/insights/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          insightTitle: insight.title,
          insightSeverity: insight.severity,
          insightType: insight.type,
          helpful,
        }),
      });
    } catch {
      // silent fail
    }
  };

  // ── Loading state ──

  if (loading) {
    return (
      <div className="workspace-glass-panel rounded-2xl px-4 py-5 text-left sm:min-w-[280px]">
        <div className="flex items-center gap-2 mb-3">
          <Sparkles className="h-4 w-4 text-primary animate-pulse" />
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            {t("aiInsights")}
          </p>
        </div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          <span className="animate-pulse">{t("analyzingTeam")}</span>
        </div>
      </div>
    );
  }

  // ── Error state ──

  if (error) {
    return (
      <div className="workspace-glass-panel rounded-2xl px-4 py-5 text-left sm:min-w-[280px]">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              {t("aiInsights")}
            </p>
          </div>
          <button onClick={fetchInsights} className="text-xs text-primary hover:underline flex items-center gap-1 max-sm:min-h-11 max-sm:px-2 max-sm:-my-1" aria-label={t("retry")}>
            <RefreshCw className="h-3 w-3" /> {t("retry")}
          </button>
        </div>
        <p className="text-xs text-muted-foreground">{t("failedToLoadInsights")}</p>
      </div>
    );
  }

  // ── Empty state ──

  if (insights.length === 0) {
    return (
      <div className="workspace-glass-panel rounded-2xl px-4 py-5 text-left sm:min-w-[280px]">
        <div className="flex items-center gap-2 mb-2">
          <Sparkles className="h-4 w-4 text-primary" />
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            {t("aiInsights")}
          </p>
        </div>
        <p className="text-xs text-muted-foreground">{t("noInsightsAvailable")}</p>
      </div>
    );
  }

  // ── Insight cards ──

  // Shared by both modes: the block layout and the dialog render the same cards.
  const renderCards = () =>
        visibleInsights.map((insight, idx) => {
          const sev = severityStyles[insight.severity];
          const isVisible = idx < visibleCount;
          const isFeedbackSent = feedbackGiven.has(insight.id);
          const isActionBusy = actionLoading === insight.id;
          const isActionComplete = actionDone.has(insight.id);
          const isDismissed = dismissedIds.has(insight.id);

          return (
            <div
              key={insight.id}
              className={cn(
                "rounded-xl border border-l-[3px] border-border/50 bg-background/70 px-3 py-2.5 shadow-sm transition-all duration-300 hover:bg-background hover:shadow-md",
                sev.border,
                isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2",
                isDismissed && "opacity-50"
              )}
            >
              {/* Header */}
              <div className="flex items-start gap-2.5 mb-1">
                <span className={cn("mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg", sev.iconChip)}>
                  {typeIcon[insight.type]}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-[13px] font-semibold leading-tight text-foreground">{insight.title}</span>
                    <span className={cn("text-[11px] font-semibold px-1.5 py-0.5 rounded-full", sev.badge)}>
                      {sev.badgeText}
                    </span>
                  </div>
                  {insight.confidence && (
                    <span className="mt-1 inline-flex items-center gap-1 text-[11px] font-medium text-muted-foreground/80">
                      <span className={cn("h-1.5 w-1.5 rounded-full", confidenceStyles[insight.confidence].dot)} />
                      {confidenceStyles[insight.confidence].label} confidence
                    </span>
                  )}
                  <p className="text-[11px] leading-relaxed text-muted-foreground mt-1">{insight.message}</p>
                </div>
                {/* Dismiss button */}
                {!isDismissed && (
                  <button
                    onClick={() => dismissInsight(insight.id)}
                    className="shrink-0 -mr-0.5 mt-0.5 rounded-md p-0.5 text-muted-foreground/40 transition-colors hover:bg-muted hover:text-muted-foreground max-sm:min-h-11 max-sm:min-w-11 max-sm:flex max-sm:items-center max-sm:justify-center max-sm:-mr-2.5 max-sm:-mt-0.5"
                    title={t("a11yDismiss")}
                    aria-label={t("a11yDismiss")}
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}
              </div>

              {/* Footer: action + feedback */}
              <div className="flex items-center justify-between mt-2 pl-[38px]">
                {insight.action && insight.actionType ? (
                  isActionComplete ? (
                    <span className="text-[11px] font-medium text-emerald-600 flex items-center gap-1">
                      ✓ {t("done")}
                    </span>
                  ) : (
                    <button
                      onClick={() => handleAction(insight)}
                      disabled={isActionBusy}
                      className="text-[11px] font-medium text-primary hover:text-primary/80 transition-colors flex items-center gap-1 disabled:opacity-50 max-sm:min-h-11 max-sm:px-2 max-sm:-my-1"
                    >
                      {isActionBusy ? (
                        <Loader2 className="h-2.5 w-2.5 animate-spin" />
                      ) : (
                        <ArrowRight className="h-2.5 w-2.5" />
                      )}
                      {insight.action}
                    </button>
                  )
                ) : (
                  <span />
                )}

                {!isFeedbackSent ? (
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => handleFeedback(insight, true)}
                      className="text-muted-foreground/50 hover:text-emerald-500 transition-colors max-sm:min-h-11 max-sm:min-w-11 max-sm:flex max-sm:items-center max-sm:justify-center max-sm:-mr-1 max-sm:-my-1"
                      title={t("helpful")}
                      aria-label={t("helpful")}
                    >
                      <ThumbsUp className="h-3 w-3" />
                    </button>
                    <button
                      onClick={() => handleFeedback(insight, false)}
                      className="text-muted-foreground/50 hover:text-rose-500 transition-colors max-sm:min-h-11 max-sm:min-w-11 max-sm:flex max-sm:items-center max-sm:justify-center max-sm:-ml-1 max-sm:-my-1"
                      title={t("notHelpful")}
                      aria-label={t("notHelpful")}
                    >
                      <ThumbsDown className="h-3 w-3" />
                    </button>
                  </div>
                ) : (
                  <span className="text-[11px] text-muted-foreground/50">{t("thanks")}</span>
                )}
              </div>
            </div>
          );
        });

  const severitySummary = (["critical", "warning", "info"] as InsightSeverity[])
    .map((sv) => [sv, visibleInsights.filter((i) => i.severity === sv).length] as const)
    .filter(([, n]) => n > 0)
    .map(([sv, n]) => `${n} ${severityStyles[sv].badgeText.toLowerCase()}`)
    .join(" · ");

  // Hero-button mode: one control, insights open in a dialog. Nothing on the
  // page between the heading and the table it belongs to.
  if (asDialog) {
    if (visibleInsights.length === 0) return null;
    return (
      <>
        {ConfirmDialogNode}
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <button
              type="button"
              className="inline-flex h-10 shrink-0 items-center gap-2 rounded-xl border border-border bg-background/80 px-3 text-sm font-medium text-foreground transition-colors hover:border-primary/30 hover:bg-secondary/70"
            >
              <Sparkles className="h-4 w-4 text-primary" />
              {visibleInsights.length}
              {/* Phones: icon + count only, so the header's title row keeps
                  room for the page title and the primary action. */}
              <span className="max-sm:sr-only">{t("aiInsights")}</span>
              {severitySummary && (
                <span className="hidden text-[11px] font-normal text-muted-foreground sm:inline">
                  {severitySummary}
                </span>
              )}
            </button>
          </DialogTrigger>
          <DialogContent className="max-h-[85vh] max-w-3xl overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-primary" />
                {t("aiInsights")}
              </DialogTitle>
            </DialogHeader>
            {/* Restore + refresh belong here too. Without them a dismissed
                insight could not be brought back from this page at all —
                dismissals persist in localStorage. */}
            <div className="-mt-1 flex items-center justify-end gap-3">
              {dismissedCount > 0 && (
                <button
                  onClick={() => showDismissed ? restoreAll() : setShowDismissed(true)}
                  className="flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-primary max-sm:min-h-11 max-sm:min-w-11 max-sm:px-2 max-sm:-my-1"
                  aria-label={showDismissed ? t("restoreAll") : t("hidden")}
                >
                  <Eye className="h-3 w-3" />
                  {showDismissed ? t("restoreAll") : `${dismissedCount} ${t("hidden")}`}
                </button>
              )}
              <button
                onClick={fetchInsights}
                title={t("refreshInsights")}
                className="flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-primary max-sm:min-h-11 max-sm:min-w-11 max-sm:flex max-sm:items-center max-sm:justify-center max-sm:-m-1"
                aria-label={t("refreshInsights")}
              >
                <RefreshCw className="h-3 w-3" />
              </button>
            </div>
            <div className="grid gap-2.5 sm:grid-cols-2">
              {renderCards()}
            </div>
          </DialogContent>
        </Dialog>
      </>
    );
  }

  return (
    <>
      {ConfirmDialogNode}
      <div className={cn("text-left w-full space-y-0 sm:workspace-glass-panel sm:rounded-2xl sm:px-4 sm:py-4", mobileOpen && "workspace-glass-panel rounded-xl px-3 py-3")}>
      <div className={cn("flex-nowrap items-center justify-between gap-2 mb-2.5 sm:mb-3", mobileOpen ? "flex" : "hidden")}>
        <div className="flex min-w-0 items-center gap-1.5 sm:gap-2">
          <Sparkles className="h-3.5 w-3.5 shrink-0 text-primary sm:h-4 sm:w-4" />
          <p className="truncate text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground sm:text-[11px] sm:tracking-[0.18em]">
            {t("aiInsights")}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {dismissedCount > 0 && (
            <button
              onClick={() => showDismissed ? restoreAll() : setShowDismissed(true)}
              className="whitespace-nowrap text-[11px] text-muted-foreground/60 hover:text-primary transition-colors flex items-center gap-1 max-sm:min-h-11 max-sm:min-w-11 max-sm:px-2 max-sm:-my-1"
              aria-label={showDismissed ? t("restoreAll") : t("hidden")}
            >
              <Eye className="h-3 w-3" />
              {showDismissed ? t("restoreAll") : `${dismissedCount} ${t("hidden")}`}
            </button>
          )}
          <button
            onClick={fetchInsights}
            className="text-xs text-muted-foreground hover:text-primary transition-colors flex items-center gap-1 max-sm:min-h-11 max-sm:min-w-11 max-sm:flex max-sm:items-center max-sm:justify-center max-sm:-m-1"
            title={t("refreshInsights")}
            aria-label={t("refreshInsights")}
          >
            <RefreshCw className="h-3 w-3" />
          </button>
        </div>
      </div>

      {/* Summary bar at every width, not just phones. The grid was `sm:grid`,
          so on desktop four insight cards sat permanently above the page's
          actual table. This is an attention layer — it says how much needs
          attention and opens on demand. */}
      {!mobileOpen && visibleInsights.length > 0 && (
        <button
          onClick={() => setMobileOpen(true)}
          aria-expanded={false}
          aria-label={t("aiInsights")}
          className="flex w-full items-center justify-between rounded-lg border border-border/50 bg-background/70 text-left chip-pad max-sm:min-h-11"
        >
          <span className="flex items-center gap-2 text-[13px] font-semibold text-foreground">
            <Sparkles className="h-3.5 w-3.5 text-primary" />
            {visibleInsights.length} {t("aiInsights")}
          </span>
          <span className="text-[11px] text-muted-foreground">
            {(["critical", "warning", "info"] as InsightSeverity[])
              .map((sv) => [sv, visibleInsights.filter((i) => i.severity === sv).length] as const)
              .filter(([, n]) => n > 0)
              .map(([sv, n]) => `${n} ${severityStyles[sv].badgeText.toLowerCase()}`)
              .join(" · ")} ›
          </span>
        </button>
      )}

      <div className={cn(
        "gap-2 sm:gap-2.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4",
        mobileOpen ? "grid" : "hidden"
      )}>
        {renderCards()}
      </div>
      </div>
    </>
  );
}
