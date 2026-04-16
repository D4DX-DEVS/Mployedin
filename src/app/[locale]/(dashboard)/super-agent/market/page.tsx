"use client";

import { useState } from "react";
import { TrendingUp, Send, Loader2, BarChart3, DollarSign, Users, Briefcase, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  SuperAgentPageIntro,
  SuperAgentSection,
} from "@/components/features/super-agent/WorkspacePage";

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
    <div className="page-container space-y-6">
      <SuperAgentPageIntro
        title="AI Market Intelligence"
        description="Ask for live Gulf recruitment insight, capture demand signals, and translate the result into regional operating decisions from the same modern workspace."
        summaryTitle="AI scope"
        summaryDescription="Queries still flow through the same market report endpoint with the existing Gulf-region context."
      />

      <SuperAgentSection
        eyebrow="Ask AI"
        title="Search the Gulf recruitment market in plain language"
        description="Use a direct question or tap a quick prompt to generate a market summary, insight cards, and recommendations."
      >
        <div className="space-y-4">
          <label className="text-sm font-medium text-slate-800">Ask anything about the Gulf recruitment market</label>
          <div className="flex flex-col gap-2 lg:flex-row">
            <div className="relative min-w-0 flex-1">
              <Sparkles className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-sky-500" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && runQuery("")}
                placeholder="e.g. Which skills are in shortage for construction roles in UAE?"
                className="h-11 rounded-xl border-slate-200 bg-slate-50 pl-9 text-sm shadow-none"
              />
            </div>
            <Button onClick={() => runQuery("")} disabled={loading || !query.trim()} className="h-11 gap-2 rounded-xl bg-slate-950 px-4 text-white hover:bg-slate-800 disabled:opacity-60">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              Analyse
            </Button>
          </div>

          <div className="flex flex-wrap gap-2">
            {QUICK_QUERIES.map((q, i) => (
              <button
                key={i}
                onClick={() => { setQuery(q); runQuery(q); }}
                className="rounded-full border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600 transition-colors hover:border-sky-200 hover:bg-sky-50 hover:text-sky-700"
              >
                {q.length > 58 ? `${q.slice(0, 58)}...` : q}
              </button>
            ))}
          </div>
        </div>
      </SuperAgentSection>

      {error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-600">{error}</div>
      ) : null}

      {loading ? (
        <div className="rounded-[28px] border border-slate-200 bg-white/95 p-5 shadow-[0_24px_60px_-46px_rgba(15,23,42,0.35)]">
          <div className="flex items-center gap-3 text-slate-500">
            <Loader2 className="h-5 w-5 animate-spin text-sky-600" />
            <span className="text-sm">Analysing Gulf market data...</span>
          </div>
        </div>
      ) : null}

      {report ? (
        <div className="space-y-6">
          <SuperAgentSection eyebrow="Summary" title="Market summary" description="A concise output from the AI report service for the question you asked.">
            <div className="space-y-3 text-sm leading-6 text-slate-600">
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                <BarChart3 className="h-4 w-4 text-sky-600" />
                Market Summary
              </div>
              <p>{report.summary}</p>
              {report.generatedAt ? <p className="text-xs text-slate-500">Generated: {new Date(report.generatedAt).toLocaleString("en-AE")}</p> : null}
            </div>
          </SuperAgentSection>

          {report.insights.length > 0 ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {report.insights.map((insight, i) => {
                const icons: Record<string, React.ReactNode> = {
                  salary: <DollarSign className="h-4 w-4" />,
                  demand: <Users className="h-4 w-4" />,
                  jobs: <Briefcase className="h-4 w-4" />,
                };

                return (
                  <div key={i} className="rounded-[24px] border border-slate-200 bg-white/95 p-5 shadow-[0_24px_60px_-46px_rgba(15,23,42,0.24)]">
                    <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                      {icons[insight.category] ?? <TrendingUp className="h-4 w-4" />}
                      <span className="capitalize">{insight.category}</span>
                    </div>
                    <p className="mt-4 text-sm font-semibold text-slate-950">{insight.title}</p>
                    <p className="mt-2 text-2xl font-semibold tracking-tight text-sky-700">{insight.value}</p>
                    {insight.trend ? <p className="mt-2 text-xs text-slate-500">{insight.trend}</p> : null}
                  </div>
                );
              })}
            </div>
          ) : null}

          {report.recommendations.length > 0 ? (
            <SuperAgentSection eyebrow="Recommendations" title="Strategic recommendations" description="Use these AI suggestions as prompts for regional hiring and market planning.">
              <ul className="space-y-3">
                {report.recommendations.map((rec, i) => (
                  <li key={i} className="flex items-start gap-3 text-sm leading-6 text-slate-600">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-sky-100 text-xs font-semibold text-sky-700">{i + 1}</span>
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
