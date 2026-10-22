"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { BarChart3, Download, Loader2, Sparkles } from "lucide-react";
import { SuperAgentSection } from "@/components/features/super-agent/WorkspacePage";
import { MarkdownRenderer } from "@/components/shared/MarkdownRenderer";
import { formatTime } from "@/lib/ui/intlFormat";

/**
 * Written report on the team's own figures. The server scopes the data to this
 * super agent's book; `scope` in the body only picks the prompt (see
 * /api/ai/report). Questions about the outside market live on the Market tab.
 */
export function TeamAiReport() {
  const t = useTranslations("superAgentReports");
  const tc = useTranslations("common");

  const templates = [
    { label: t("teamPerformanceSummary"), query: t("teamPerformanceQuery") },
    { label: t("agentComparisonAnalysis"), query: t("agentComparisonQuery") },
    { label: t("leadPipelineHealth"), query: t("leadPipelineQuery") },
    { label: t("commissionForecast"), query: t("commissionForecastQuery") },
  ];

  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ content: string; generatedAt: string } | null>(null);
  const [error, setError] = useState("");

  const generate = async (reportQuery?: string) => {
    const q = reportQuery ?? query;
    if (!q.trim()) return;
    setLoading(true);
    setError("");
    setResult(null);
    try {
      const res = await fetch("/api/ai/report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: q, scope: "platform" }),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setResult({ content: data.report ?? data.content ?? JSON.stringify(data), generatedAt: formatTime(new Date()) });
    } catch {
      setError(t("aiErrorMessage"));
    } finally {
      setLoading(false);
    }
  };

  const download = () => {
    if (!result) return;
    const blob = new Blob([result.content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `sa-report-${new Date().toISOString().split("T")[0]}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <SuperAgentSection
      eyebrow={t("aiPoweredReports")}
      title={t("generateCustomReports")}
      description={t("generateCustomReportsDescription")}
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {templates.map((template) => (
          <button
            key={template.label}
            type="button"
            onClick={() => { setQuery(template.query); void generate(template.query); }}
            disabled={loading}
            className="workspace-subtle-surface card-pad rounded-2xl text-start text-sm transition-all hover:-translate-y-0.5 hover:border-primary/25 hover:bg-card hover:shadow-[0_20px_44px_-36px_rgba(2,132,199,0.45)] disabled:opacity-50"
          >
            <BarChart3 className="mb-2 h-4 w-4 text-primary" />
            <div className="font-semibold text-foreground">{template.label}</div>
            <div className="mt-1 text-xs leading-5 text-muted-foreground">{template.query}</div>
          </button>
        ))}
      </div>

      <div className="mt-6 space-y-4">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          <p className="text-sm font-semibold text-foreground">{t("customReport")}</p>
        </div>
        <textarea
          aria-label={t("customReport")}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          rows={3}
          placeholder={t("customReportPlaceholder")}
          className="w-full rounded-2xl border border-border bg-secondary/65 px-4 py-3 text-sm text-foreground outline-none transition focus:border-primary/30 focus:ring-2 focus:ring-primary/10"
        />
        <button
          type="button"
          onClick={() => void generate()}
          disabled={!query.trim() || loading}
          className="flex h-11 w-full items-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50 sm:inline-flex sm:w-auto"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          {loading ? tc("generating") : t("generateReport")}
        </button>
      </div>

      {error && (
        <div className="mt-4 rounded-2xl border border-destructive/30 bg-destructive/10 text-sm text-destructive chip-pad">{error}</div>
      )}

      {result && (
        <div className="mt-6 space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-primary">{t("reportGeneratedAt", { time: result.generatedAt })}</p>
            <button
              type="button"
              onClick={download}
              className="inline-flex items-center gap-1.5 rounded-xl border border-border text-xs font-semibold text-muted-foreground transition-colors hover:border-primary/25 hover:text-primary chip-pad"
            >
              <Download className="h-3.5 w-3.5" />{tc("export")}
            </button>
          </div>
          <div className="workspace-subtle-surface card-pad rounded-2xl">
            <MarkdownRenderer content={result.content} />
          </div>
        </div>
      )}
    </SuperAgentSection>
  );
}
