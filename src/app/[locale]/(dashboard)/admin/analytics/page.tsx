"use client";

import { useState } from "react";
import { PageHeader } from "@/components/shared/PageHeader";
import { BarChart3, TrendingUp, Loader2, Sparkles, Download } from "lucide-react";

const ANALYTICS_QUERIES = [
  { label: "Platform growth this month", query: "Show platform user growth, job postings, and placements for this month compared to last month" },
  { label: "Top performing agents", query: "List the top 10 agents by placements and commissions earned this quarter" },
  { label: "Job category trends", query: "What are the most in-demand job categories and which had the highest application rates?" },
  { label: "Revenue & commission summary", query: "Provide a financial summary: total commissions paid, pending, and projected for this month" },
  { label: "Employer activity report", query: "Which employers posted the most jobs and have the highest candidate conversion rates?" },
  { label: "Geographic distribution", query: "Show user and job distribution by country/emirate across the Gulf region" },
];

export default function AdminAnalyticsPage() {
  const [query, setQuery] = useState("");
  const [result, setResult] = useState("");
  const [loading, setLoading] = useState(false);
  const [activeTemplate, setActiveTemplate] = useState<string | null>(null);

  const generate = async (q: string) => {
    if (!q.trim()) return;
    setLoading(true);
    setResult("");
    setActiveTemplate(q);
    try {
      const res = await fetch("/api/ai/report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: q, scope: "admin" }),
      });
      if (res.ok) {
        const data = await res.json();
        setResult(data.report ?? data.content ?? JSON.stringify(data, null, 2));
      } else {
        setResult("Failed to generate report. Check AI configuration.");
      }
    } finally {
      setLoading(false);
    }
  };

  const download = () => {
    const blob = new Blob([result], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `admin-analytics-${new Date().toISOString().split("T")[0]}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Analytics & Insights"
        description="AI-powered platform analytics — ask anything about your data"
      />

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
        {ANALYTICS_QUERIES.map((q) => (
          <button
            key={q.label}
            onClick={() => { setQuery(q.query); generate(q.query); }}
            disabled={loading}
            className={`text-left p-3 rounded-lg border text-sm transition-all disabled:opacity-50 ${
              activeTemplate === q.query && result
                ? "border-primary bg-primary/5"
                : "hover:border-primary/40 hover:bg-muted/30"
            }`}
          >
            <BarChart3 className="h-4 w-4 text-primary mb-1" />
            <p className="font-medium text-sm">{q.label}</p>
          </button>
        ))}
      </div>

      <div className="card-base space-y-3">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          <p className="text-sm font-semibold">Custom Analytics Query</p>
        </div>
        <div className="flex gap-2">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && generate(query)}
            placeholder="Ask anything about your platform data…"
            className="flex-1 h-10 rounded-lg border px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
          <button
            onClick={() => generate(query)}
            disabled={!query.trim() || loading}
            className="px-4 h-10 rounded-lg bg-primary text-white text-sm font-semibold hover:bg-primary/90 disabled:opacity-50 flex items-center gap-2"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <TrendingUp className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {result && (
        <div className="card-base space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-primary">Analytics Report</p>
            <button
              onClick={download}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs hover:bg-muted/40"
            >
              <Download className="h-3.5 w-3.5" /> Export
            </button>
          </div>
          <div className="bg-muted/30 rounded-lg p-4 text-sm whitespace-pre-wrap leading-relaxed max-h-[500px] overflow-y-auto">
            {result}
          </div>
        </div>
      )}
    </div>
  );
}
