"use client";

import { useState } from "react";
import { TrendingUp, Send, Loader2, BarChart3, DollarSign, Users, Briefcase } from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";

const QUICK_QUERIES = [
  "What are the top 5 most in-demand job categories in UAE right now?",
  "What is the average salary range for software engineers in KSA?",
  "Which nationalities are most sought-after for hospitality roles in Qatar?",
  "What is the current visa processing time trend for employment visas?",
  "Which sectors are showing the highest growth in Gulf recruitment?",
  "What skills have the highest demand-supply gap in GCC?",
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
  const [query, setQuery] = useState("");
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
          context: "Gulf region recruitment market — UAE, KSA, Qatar, Oman, Kuwait, Bahrain",
        }),
      });

      if (!res.ok) { setError("Failed to generate market intelligence."); return; }

      const raw = await res.text();
      try {
        const cleaned = raw.replace(/```json\n?|```\n?/g, "").trim();
        const parsed = JSON.parse(cleaned);
        setReport(parsed);
      } catch {
        setReport({
          summary: raw.slice(0, 600),
          insights: [],
          recommendations: [],
          generatedAt: new Date().toISOString(),
        });
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="AI Market Intelligence"
        description="Real-time Gulf recruitment market insights powered by AI"
      />

      {/* Query Input */}
      <div className="card-base space-y-4">
        <label className="text-sm font-medium">Ask anything about the Gulf recruitment market</label>
        <div className="flex gap-2">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && runQuery("")}
            placeholder="e.g. Which skills are in shortage for construction roles in UAE?"
            className="flex-1 input-field"
          />
          <button onClick={() => runQuery("")} disabled={loading || !query.trim()}
            className="btn-primary flex items-center gap-2 disabled:opacity-60">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            Analyse
          </button>
        </div>

        {/* Quick Query Chips */}
        <div className="flex flex-wrap gap-2">
          {QUICK_QUERIES.map((q, i) => (
            <button key={i} onClick={() => { setQuery(q); runQuery(q); }}
              className="text-xs px-3 py-1.5 rounded-full border border-border hover:border-primary hover:text-primary transition-all">
              {q.length > 50 ? q.slice(0, 50) + "…" : q}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {loading && (
        <div className="card-base flex items-center gap-3 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
          <span className="text-sm">Analysing Gulf market data…</span>
        </div>
      )}

      {report && (
        <div className="space-y-4">
          {/* Summary */}
          <div className="card-base space-y-2">
            <h3 className="text-sm font-semibold flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-primary" /> Market Summary
            </h3>
            <p className="text-sm text-foreground leading-relaxed">{report.summary}</p>
            {report.generatedAt && (
              <p className="text-xs text-muted-foreground">
                Generated: {new Date(report.generatedAt).toLocaleString("en-AE")}
              </p>
            )}
          </div>

          {/* Insights Grid */}
          {report.insights.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {report.insights.map((insight, i) => {
                const icons: Record<string, React.ReactNode> = {
                  salary: <DollarSign className="h-4 w-4" />,
                  demand: <Users className="h-4 w-4" />,
                  jobs: <Briefcase className="h-4 w-4" />,
                };
                return (
                  <div key={i} className="card-base space-y-1">
                    <div className="flex items-center gap-1.5 text-muted-foreground text-xs">
                      {icons[insight.category] ?? <TrendingUp className="h-4 w-4" />}
                      <span className="capitalize">{insight.category}</span>
                    </div>
                    <p className="text-sm font-semibold">{insight.title}</p>
                    <p className="text-lg font-bold text-primary">{insight.value}</p>
                    {insight.trend && <p className="text-xs text-muted-foreground">{insight.trend}</p>}
                  </div>
                );
              })}
            </div>
          )}

          {/* Recommendations */}
          {report.recommendations.length > 0 && (
            <div className="card-base space-y-3">
              <h3 className="text-sm font-semibold">Strategic Recommendations</h3>
              <ul className="space-y-2">
                {report.recommendations.map((rec, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm">
                    <span className="h-5 w-5 rounded-full bg-primary/10 text-primary text-xs flex items-center justify-center shrink-0 font-semibold">
                      {i + 1}
                    </span>
                    {rec}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
