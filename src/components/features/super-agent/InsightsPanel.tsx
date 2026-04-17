"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import {
  AlertTriangle, TrendingUp, Lightbulb, Rocket, RefreshCw, Sparkles,
  ThumbsUp, ThumbsDown, ArrowRight, Loader2, X, Eye,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useRouter } from "next/navigation";

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

const severityStyles: Record<InsightSeverity, { border: string; badge: string; badgeText: string }> = {
  critical: {
    border: "border-l-rose-500",
    badge: "bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-300",
    badgeText: "Critical",
  },
  warning: {
    border: "border-l-amber-400",
    badge: "bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300",
    badgeText: "Warning",
  },
  info: {
    border: "border-l-emerald-400",
    badge: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300",
    badgeText: "Info",
  },
};

const confidenceStyles: Record<ConfidenceLevel, string> = {
  high: "bg-sky-100 text-sky-700 dark:bg-sky-500/20 dark:text-sky-300",
  medium: "bg-violet-100 text-violet-700 dark:bg-violet-500/20 dark:text-violet-300",
  low: "bg-zinc-100 text-zinc-600 dark:bg-zinc-500/20 dark:text-zinc-400",
};

/* ────────────────────────────────────────────────────────
   Component
   ──────────────────────────────────────────────────────── */

export function SuperAgentInsightsPanel() {
  const router = useRouter();
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

    if (insight.actionType === "navigate" && insight.actionUrl) {
      router.push(insight.actionUrl);
      return;
    }

    if (insight.actionType === "assign_leads" && insight.actionPayload) {
      if (!confirm(`Assign more leads to ${insight.actionPayload.targetAgentName}?`)) return;

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
          alert("No underperforming agent found to reassign leads from.");
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
      } catch {
        // Rollback on failure
        setActionDone((prev) => { const next = new Set(prev); next.delete(key); return next; });
        alert("Failed to reassign leads");
      } finally {
        setActionLoading(null);
      }
      return;
    }

    if (insight.actionType === "send_reminder" && insight.actionPayload) {
      const ids = insight.actionPayload.agentUserIds ?? [insight.actionPayload.agentUserId];
      const names = insight.actionPayload.agentNames ?? [insight.actionPayload.agentName];
      if (!confirm(`Send performance reminder to ${Array.isArray(names) ? (names as string[]).join(", ") : names}?`)) return;

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
      } catch {
        // Rollback on failure
        setActionDone((prev) => { const next = new Set(prev); next.delete(key); return next; });
        alert("Failed to send reminder");
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
            AI Insights
          </p>
        </div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          <span className="animate-pulse">Analyzing your team…</span>
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
              AI Insights
            </p>
          </div>
          <button onClick={fetchInsights} className="text-xs text-primary hover:underline flex items-center gap-1">
            <RefreshCw className="h-3 w-3" /> Retry
          </button>
        </div>
        <p className="text-xs text-muted-foreground">Failed to load insights. Try again.</p>
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
            AI Insights
          </p>
        </div>
        <p className="text-xs text-muted-foreground">No insights available right now. Your team data will be analysed as activity grows.</p>
      </div>
    );
  }

  // ── Insight cards ──

  return (
    <div className="workspace-glass-panel rounded-2xl px-4 py-4 text-left sm:min-w-[280px] space-y-0">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            AI Insights
          </p>
        </div>
        <div className="flex items-center gap-2">
          {dismissedCount > 0 && (
            <button
              onClick={() => showDismissed ? restoreAll() : setShowDismissed(true)}
              className="text-[10px] text-muted-foreground/60 hover:text-primary transition-colors flex items-center gap-1"
            >
              <Eye className="h-3 w-3" />
              {showDismissed ? "Restore all" : `${dismissedCount} hidden`}
            </button>
          )}
          <button
            onClick={fetchInsights}
            className="text-xs text-muted-foreground hover:text-primary transition-colors flex items-center gap-1"
            title="Refresh insights"
          >
            <RefreshCw className="h-3 w-3" />
          </button>
        </div>
      </div>

      <div className="space-y-2.5 max-h-[320px] overflow-y-auto pr-1">
        {visibleInsights.map((insight, idx) => {
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
                "rounded-xl border-l-[3px] bg-background/60 dark:bg-card/40 px-3 py-2.5 transition-all duration-300",
                sev.border,
                isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2",
                isDismissed && "opacity-50"
              )}
            >
              {/* Header */}
              <div className="flex items-start gap-2 mb-1">
                <span className="mt-0.5 shrink-0 text-muted-foreground">{typeIcon[insight.type]}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-semibold text-foreground">{insight.title}</span>
                    <span className={cn("text-[10px] font-medium px-1.5 py-0.5 rounded-full", sev.badge)}>
                      {sev.badgeText}
                    </span>
                    {insight.confidence && (
                      <span className={cn("text-[9px] font-medium px-1.5 py-0.5 rounded-full", confidenceStyles[insight.confidence])}>
                        {insight.confidence}
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] leading-relaxed text-muted-foreground mt-0.5">{insight.message}</p>
                </div>
                {/* Dismiss button */}
                {!isDismissed && (
                  <button
                    onClick={() => dismissInsight(insight.id)}
                    className="shrink-0 mt-0.5 text-muted-foreground/40 hover:text-muted-foreground transition-colors"
                    title="Dismiss"
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}
              </div>

              {/* Footer: action + feedback */}
              <div className="flex items-center justify-between mt-2 pl-6">
                {insight.action && insight.actionType ? (
                  isActionComplete ? (
                    <span className="text-[10px] font-medium text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                      ✓ Done
                    </span>
                  ) : (
                    <button
                      onClick={() => handleAction(insight)}
                      disabled={isActionBusy}
                      className="text-[10px] font-medium text-primary hover:text-primary/80 transition-colors flex items-center gap-1 disabled:opacity-50"
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
                      className="text-muted-foreground/50 hover:text-emerald-500 transition-colors"
                      title="Helpful"
                    >
                      <ThumbsUp className="h-3 w-3" />
                    </button>
                    <button
                      onClick={() => handleFeedback(insight, false)}
                      className="text-muted-foreground/50 hover:text-rose-500 transition-colors"
                      title="Not helpful"
                    >
                      <ThumbsDown className="h-3 w-3" />
                    </button>
                  </div>
                ) : (
                  <span className="text-[10px] text-muted-foreground/50">Thanks!</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
