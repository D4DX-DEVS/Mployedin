"use client";

import { useState } from "react";
import { ArrowRight, BarChart3, Download, Loader2, Sparkles } from "lucide-react";
import { MarkdownRenderer } from "@/components/shared/MarkdownRenderer";

const REPORT_TEMPLATES = [
  { label: "This week's activity summary", query: "Summarize my leads activity and conversions for this week" },
  { label: "Top conversion opportunities", query: "Which of my leads have the highest conversion potential and why?" },
  { label: "Follow-up priority list", query: "Which leads need follow up today based on last contact date and stage?" },
  { label: "Monthly performance overview", query: "Give me a full performance overview for last month including leads, placements, and commissions" },
];

interface ReportResult {
  content: string;
  generatedAt: string;
}

export default function AgentReportsPage() {
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ReportResult | null>(null);
  const [error, setError] = useState("");

  const generateReport = async (reportQuery?: string) => {
    const q = reportQuery ?? query;
    if (!q.trim()) return;
    setLoading(true);
    setError("");
    setResult(null);
    try {
      const res = await fetch("/api/ai/report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: q, scope: "agent" }),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setResult({ content: data.report ?? data.content ?? JSON.stringify(data), generatedAt: new Date().toLocaleTimeString() });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to generate report");
    } finally {
      setLoading(false);
    }
  };

  const downloadReport = () => {
    if (!result) return;
    const blob = new Blob([result.content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `agent-report-${new Date().toISOString().split("T")[0]}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="page-container agent-legacy-surface space-y-6">
      <section className="workspace-hero-surface overflow-hidden rounded-[28px] p-6 sm:p-7">
        <div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
          <div className="max-w-3xl">
            <div className="workspace-glass-panel inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-primary"><Sparkles className="h-3.5 w-3.5" />Agent workspace</div>
            <h1 className="mt-4 text-3xl font-semibold tracking-tight text-foreground sm:text-[2rem]">AI Reports</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">Generate targeted performance reports, follow-up plans, and conversion analysis without leaving the agent workspace.</p>
          </div>
          <div className="workspace-glass-panel rounded-2xl px-4 py-3 text-left sm:min-w-[260px]"><p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Reporting</p><p className="mt-1 text-lg font-semibold text-foreground">{result ? "1 latest report" : "Ready on demand"}</p><p className="text-xs text-muted-foreground">Use templates or freeform prompts to generate new summaries.</p></div>
        </div>
      </section>

      <section className="workspace-panel-surface rounded-[28px] p-5 sm:p-6">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Quick reports</p>
        <h2 className="mt-2 text-xl font-semibold tracking-tight text-foreground">Start from a prompt template that matches the workday</h2>
        <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
          {REPORT_TEMPLATES.map((t) => (
            <button
              key={t.label}
              onClick={() => { setQuery(t.query); generateReport(t.query); }}
              disabled={loading}
              className="workspace-subtle-surface rounded-2xl p-4 text-left text-sm transition-all hover:-translate-y-0.5 hover:border-primary/25 hover:bg-card hover:shadow-[0_20px_44px_-36px_rgba(2,132,199,0.45)] disabled:opacity-50"
            >
              <BarChart3 className="mb-2 h-4 w-4 text-primary" />
              <div className="font-semibold text-foreground">{t.label}</div>
              <div className="mt-1 text-xs leading-5 text-muted-foreground">{t.query}</div>
            </button>
          ))}
        </div>
      </section>

      <section className="workspace-panel-surface space-y-4 rounded-[28px] p-5 sm:p-6">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          <p className="text-sm font-semibold text-foreground">Custom report</p>
        </div>
        <textarea
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          rows={3}
          placeholder="e.g. Show me my top 5 leads by deal value with their contact history…"
          className="w-full rounded-2xl border border-border bg-secondary/65 px-4 py-3 text-sm text-foreground outline-none transition focus:border-primary/30 focus:ring-2 focus:ring-primary/10"
        />
        <button
          onClick={() => generateReport()}
          disabled={!query.trim() || loading}
          className="inline-flex h-11 items-center gap-2 rounded-xl bg-sky-600 px-4 text-sm font-semibold text-white transition-colors hover:bg-sky-700 disabled:opacity-50"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          {loading ? "Generating…" : "Generate Report"}
        </button>
      </section>

      {error && (
        <div className="rounded-2xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {result && (
        <section className="workspace-panel-surface space-y-4 rounded-[28px] p-5 sm:p-6">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-primary">Report Generated at {result.generatedAt}</p>
            <button
              onClick={downloadReport}
              className="inline-flex items-center gap-1.5 rounded-xl border border-border px-3 py-2 text-xs font-semibold text-muted-foreground transition-colors hover:border-primary/25 hover:text-primary"
            >
              <Download className="h-3.5 w-3.5" />
              Export
            </button>
          </div>
          <div className="workspace-subtle-surface rounded-2xl p-4">
            <MarkdownRenderer content={result.content} />
          </div>
          <div className="inline-flex items-center gap-2 text-xs font-medium text-muted-foreground"><ArrowRight className="h-3.5 w-3.5 text-primary" />Use Export if you need a saved copy for handoff.</div>
        </section>
      )}
    </div>
  );
}
