"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { TrendingUp, Send, Loader2, BarChart3, DollarSign, Users, Briefcase, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import {
  SuperAgentPageIntro,
  SuperAgentSection,
} from "@/components/features/super-agent/WorkspacePage";

const getQuickQueries = (t: any) => [
  t("query1"),
  t("query2"),
  t("query3"),
  t("query4"),
  t("query5"),
  t("query6"),
  t("query7"),
  t("query8"),
  t("query9"),
  t("query10"),
  t("query11"),
  t("query12"),
];

interface Insight {
  title: string;
  value: string;
  trend?: string;
  category: string;
}

interface MarketReport {
  summary: string;
  insights: Insight[];
  recommendations: string[];
  generatedAt: string;
}

export default function MarketIntelligencePage() {
  const t = useTranslations("superAgentMarket");
  const tc = useTranslations("common");
  const [query, setQuery] = useState("");
  const [showAllSuggestions, setShowAllSuggestions] = useState(false);
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState<MarketReport | null>(null);
  const [error, setError] = useState("");

  const runQuery = async (q: string) => {
    const text = q || query;
    if (!text.trim()) return;
    setLoading(true);
    setError("");
    setReport(null);

    try {
      const res = await fetch("/api/ai/report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: text,
          scope: "market",
          context: "Global recruitment market covering Gulf (UAE, KSA, Qatar, Oman, Kuwait, Bahrain), South Asia (India, Pakistan, Bangladesh, Sri Lanka, Nepal), Southeast Asia (Philippines, Indonesia, Malaysia), and other international labour markets",
        }),
      });

      if (!res.ok) { setError(t("failedToGenerateIntelligence")); return; }

      const raw = await res.text();
      try {
        const cleaned = raw.replace(/```json\n?|```\n?/g, "").trim();
        const parsed = JSON.parse(cleaned);
        setReport({
          ...parsed,
          insights: Array.isArray(parsed.insights) ? parsed.insights : [],
          recommendations: Array.isArray(parsed.recommendations) ? parsed.recommendations : [],
        });
      } catch {
        setReport({
          summary: raw.slice(0, 600),
          insights: [],
          recommendations: [],
          generatedAt: new Date().toISOString(),
        });
      }
    } catch {
      setError(t("networkError"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="page-container">
      <SuperAgentPageIntro
        title={t("pageTitle")}
        description={t("pageDescription")}
        summaryTitle={t("summaryTitle")}
        summaryDescription={t("summaryDescription")}
      />

      <SuperAgentSection
        eyebrow={t("askAiEyebrow")}
        title={t("sectionTitle")}
        description={t("sectionDescription")}
      >
        <div className="space-y-4">
          <label htmlFor="market-query" className="text-sm font-medium text-foreground">{t("queryLabel")}</label>
          <div className="flex flex-col gap-2 lg:flex-row">
            <div className="relative min-w-0 flex-1">
              <Sparkles className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-primary" />
              <Input
                id="market-query"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && runQuery("")}
                placeholder={t("inputPlaceholder")}
                className="h-11 rounded-xl bg-background/85 pl-9 text-sm shadow-none"
              />
            </div>
            <Button onClick={() => runQuery("")} disabled={loading || !query.trim()} className="h-11 gap-2 rounded-xl px-4 disabled:opacity-60">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              {t("analyseButton")}
            </Button>
          </div>

          <div className="flex flex-wrap gap-2">
            {(showAllSuggestions ? getQuickQueries(t) : getQuickQueries(t).slice(0, 4)).map((q, i) => (
              <button
                key={i}
                onClick={() => { setQuery(q); runQuery(q); }}
                className="rounded-full border border-border/70 bg-background/85 px-3 py-2 text-sm text-muted-foreground transition-colors hover:border-primary/30 hover:bg-secondary/80 hover:text-foreground"
              >
                {q.length > 58 ? `${q.slice(0, 58)}...` : q}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setShowAllSuggestions((v) => !v)}
              aria-expanded={showAllSuggestions}
              className="rounded-full border border-dashed border-border/70 px-3 py-2 text-sm font-medium text-primary transition-colors hover:bg-primary/5"
            >
              {showAllSuggestions ? "Show less" : "More suggestions"}
            </button>
          </div>
        </div>
      </SuperAgentSection>

      {error ? (
        <div className="rounded-2xl border border-destructive/30 bg-destructive/10 text-sm text-destructive card-pad">{error}</div>
      ) : null}

      {loading ? (
        <div className="space-y-3 sm:space-y-4">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="rounded-3xl border border-border/70 bg-card/95 space-y-3 panel-body">
              <Skeleton className="h-5 w-40" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-2/3" />
            </div>
          ))}
        </div>
      ) : null}

      {report ? (
        <div className="space-y-3 sm:space-y-4">
          <SuperAgentSection eyebrow={t("summaryEyebrow")} title={t("summaryHeading")} description={t("summaryCaption")}>
            <div className="space-y-3 text-sm leading-6 text-muted-foreground">
              <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <BarChart3 className="h-4 w-4 text-primary" />
                {t("marketSummaryLabel")}
              </div>
              <p>{report.summary}</p>
              {report.generatedAt ? <p className="text-xs text-muted-foreground">{t("generatedLabel")}: {new Date(report.generatedAt).toLocaleString("en-AE")}</p> : null}
            </div>
          </SuperAgentSection>

          {(report.insights ?? []).length > 0 ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {(report.insights ?? []).map((insight, i) => {
                const icons: Record<string, React.ReactNode> = {
                  salary: <DollarSign className="h-4 w-4" />,
                  demand: <Users className="h-4 w-4" />,
                  jobs: <Briefcase className="h-4 w-4" />,
                };

                return (
                  <div key={i} className="rounded-3xl border border-border/70 bg-card/95 shadow-[0_24px_60px_-46px_rgba(15,23,42,0.24)] panel-body">
                    <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                      {icons[insight.category] ?? <TrendingUp className="h-4 w-4" />}
                      <span className="capitalize">{insight.category}</span>
                    </div>
                    <p className="mt-4 text-sm font-semibold text-foreground">{insight.title}</p>
                    <p className="mt-2 text-2xl font-semibold tracking-tight text-primary">{insight.value}</p>
                    {insight.trend ? <p className="mt-2 text-xs text-muted-foreground">{insight.trend}</p> : null}
                  </div>
                );
              })}
            </div>
          ) : null}

          {(report.recommendations ?? []).length > 0 ? (
            <SuperAgentSection eyebrow={t("recommendationsEyebrow")} title={t("recommendationsHeading")} description={t("recommendationsCaption")}>
              <ul className="space-y-3">
                {(report.recommendations ?? []).map((rec, i) => (
                  <li key={i} className="flex items-start gap-3 text-sm leading-6 text-muted-foreground">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/12 text-xs font-semibold text-primary">{i + 1}</span>
                    {rec}
                  </li>
                ))}
              </ul>
            </SuperAgentSection>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
