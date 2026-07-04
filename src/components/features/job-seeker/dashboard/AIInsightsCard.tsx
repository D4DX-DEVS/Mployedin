"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Sparkles, Lightbulb, AlertTriangle, Rocket, BarChart3, Loader2, RefreshCw } from "lucide-react";

interface Insight {
  type: "tip" | "alert" | "opportunity" | "metric";
  title: string;
  message: string;
  action: string;
}

const typeConfig = {
  tip: { icon: Lightbulb, tone: "dashboard-tone-primary" },
  alert: { icon: AlertTriangle, tone: "dashboard-tone-warning" },
  opportunity: { icon: Rocket, tone: "dashboard-tone-success" },
  metric: { icon: BarChart3, tone: "dashboard-tone-metric" },
};

export function AIInsightsCard() {
  const t = useTranslations("jobSeekerAiInsightsCard");
  const [insights, setInsights] = useState<Insight[]>([]);
  const [loading, setLoading] = useState(true);

  const loadInsights = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/ai/daily-insights");
      if (res.ok) {
        const data = await res.json();
        setInsights(data.insights ?? []);
      }
    } catch {}
    setLoading(false);
  };

  useEffect(() => {
    loadInsights();
  }, []);

  if (loading) {
    return (
      <div className="card-base flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (insights.length === 0) {
    return (
      <div className="card-base p-6 text-center">
        <Sparkles className="mx-auto h-8 w-8 text-muted-foreground/40" />
        <p className="mt-2 text-sm text-muted-foreground">
          {t("noInsightsAvailable")}
        </p>
      </div>
    );
  }

  return (
    <div className="card-base p-6">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold">{t("aiInsights")}</h3>
        </div>
        <button
          onClick={loadInsights}
          disabled={loading}
          className="flex items-center gap-1 text-xs text-primary transition-colors hover:text-primary/70 disabled:opacity-50"
        >
          <RefreshCw className="h-3 w-3" />
          {t("refresh")}
        </button>
      </div>

      <div className="space-y-3">
        {insights.map((insight, i) => {
          const config = typeConfig[insight.type] ?? typeConfig.tip;
          const Icon = config.icon;

          return (
            <div
              key={i}
              className={`rounded-lg border p-4 transition-all duration-150 hover:-translate-y-0.5 hover:shadow-sm ${config.tone}`}
            >
              <div className="flex items-start gap-3">
                <div className="mt-0.5 rounded-lg border border-border/40 bg-background/80 p-1.5">
                  <Icon className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold">
                    {insight.title}
                  </p>
                  <p className="mt-0.5 text-xs text-foreground/80">
                    {insight.message}
                  </p>
                  {insight.action && (
                    <p className="mt-1 text-xs font-medium text-foreground/60">
                      → {insight.action}
                    </p>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
