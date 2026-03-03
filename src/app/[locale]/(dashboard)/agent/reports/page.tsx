"use client";

import { useState } from "react";
import { PageHeader } from "@/components/shared/PageHeader";
import { BarChart3, Loader2, Download, Sparkles } from "lucide-react";

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
    <div className="page-container">
      <PageHeader
        title="AI Reports"
        description="Ask questions about your performance or request custom reports"
      />

      {/* Quick templates */}
      <div className="card-base space-y-3">
        <p className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Quick Reports</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {REPORT_TEMPLATES.map((t) => (
            <button
              key={t.label}
              onClick={() => { setQuery(t.query); generateReport(t.query); }}
              disabled={loading}
              className="text-left p-3 rounded-lg border text-sm hover:bg-muted/40 hover:border-primary/40 transition-all disabled:opacity-50"
            >
              <BarChart3 className="h-3.5 w-3.5 text-primary mb-1" />
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Custom query */}
      <div className="card-base space-y-3">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          <p className="text-sm font-semibold">Custom Report</p>
        </div>
        <textarea
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          rows={3}
          placeholder="e.g. Show me my top 5 leads by deal value with their contact history…"
          className="textarea-field w-full"
        />
        <button
          onClick={() => generateReport()}
          disabled={!query.trim() || loading}
          className="btn-primary disabled:opacity-50 flex items-center gap-2"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          {loading ? "Generating…" : "Generate Report"}
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/30 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* Result */}
      {result && (
        <div className="card-base space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-primary">Report Generated at {result.generatedAt}</p>
            <button
              onClick={downloadReport}
              className="btn-outline flex items-center gap-1.5 px-3 py-1.5 text-xs"
            >
              <Download className="h-3.5 w-3.5" />
              Export
            </button>
          </div>
          <div className="bg-muted/30 rounded-lg p-4 text-sm whitespace-pre-wrap leading-relaxed">
            {result.content}
          </div>
        </div>
      )}
    </div>
  );
}
