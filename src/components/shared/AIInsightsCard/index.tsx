"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Sparkles, TrendingUp, AlertCircle, Lightbulb, RefreshCw } from "lucide-react";

interface Insight {
  type: "trend" | "alert" | "tip";
  text: string;
}

interface AIInsightsCardProps {
  role: string;
  /** Optional extra context to pass to the AI */
  context?: Record<string, unknown>;
}

const ICON_MAP = {
  trend: <TrendingUp className="h-3.5 w-3.5 text-blue-500" />,
  alert: <AlertCircle className="h-3.5 w-3.5 text-amber-500" />,
  tip: <Lightbulb className="h-3.5 w-3.5 text-emerald-500" />,
};

/**
 * Role-aware AI daily insights card.
 * Fetches from /api/ai/daily-insights once per role per session.
 */
export function AIInsightsCard({ role, context }: AIInsightsCardProps) {
  const t = useTranslations("aiInsightsCardShared");
  const [insights, setInsights] = useState<Insight[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    const cacheKey = `ai_insights_${role}_${new Date().toDateString()}`;
    const cached = sessionStorage.getItem(cacheKey);
    if (cached) {
      try { setInsights(JSON.parse(cached)); return; } catch { /* ignore */ }
    }

    const load = async () => {
      setLoading(true);
      try {
        const res = await fetch("/api/ai/daily-insights");
        if (res.ok) {
          const data = await res.json();
          // Existing API returns objects with {type, title, message}; normalise to Insight
          const raw: Array<{ type: string; message?: string; title?: string; text?: string }> =
            data.insights ?? [];
          const items: Insight[] = raw.map((i) => ({
            type: (["trend", "alert", "tip"].includes(i.type) ? i.type : "tip") as Insight["type"],
            text: i.text ?? i.message ?? i.title ?? "",
          }));
          setInsights(items);
          sessionStorage.setItem(cacheKey, JSON.stringify(items));
        }
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [role, context, refreshKey]);

  return (
    <div className="card-base space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-primary">
          <Sparkles className="h-4 w-4" />
          <span className="text-sm font-semibold">{t("aiDailyInsights")}</span>
        </div>
        <button
          onClick={() => {
            const key = `ai_insights_${role}_${new Date().toDateString()}`;
            sessionStorage.removeItem(key);
            setInsights([]);
            setRefreshKey(k => k + 1);
          }}
          title={t("refreshInsights")}
          className="p-1 rounded hover:bg-primary/10 text-muted-foreground transition-colors"
        >
          <RefreshCw className="h-3.5 w-3.5" />
        </button>
      </div>

      {loading && (
        <div className="space-y-2">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-3 rounded bg-muted animate-pulse w-full" />
          ))}
        </div>
      )}

      {!loading && insights.length === 0 && (
        <p className="text-xs text-muted-foreground">{t("noInsights")}</p>
      )}

      <ul className="space-y-2">
        {insights.map((insight, idx) => (
          <li key={idx} className="flex items-start gap-2">
            <span className="mt-0.5 shrink-0">{ICON_MAP[insight.type] ?? ICON_MAP.tip}</span>
            <p className="text-xs text-foreground leading-relaxed">{insight.text}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}
