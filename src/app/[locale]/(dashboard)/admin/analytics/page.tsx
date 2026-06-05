"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Textarea } from "@/components/ui/textarea";
import { MarkdownRenderer } from "@/components/shared/MarkdownRenderer";
import { BarChart3, Download, FileSpreadsheet, FileText, Loader2, Sparkles, TrendingUp } from "lucide-react";
import { toast } from "sonner";
import { exportExcelRows } from "@/lib/export";

type ReportRow = {
  section: string;
  kind: "heading" | "bullet" | "paragraph";
  content: string;
};

const REPORT_TITLE = "Analytics Report";

function getExportFileBaseName(): string {
  return `admin-analytics-${new Date().toISOString().split("T")[0]}`;
}

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  window.setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 100);
}

function cleanMarkdownText(text: string): string {
  return text
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/^```+|```+$/g, "")
    .trim();
}

function parseReportRows(content: string): ReportRow[] {
  const rows: ReportRow[] = [];
  let currentSection = REPORT_TITLE;

  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();

    if (!trimmed || /^(?:---+|\*\*\*+|(?:\*\s*){3,}|___+)$/.test(trimmed)) {
      continue;
    }

    const headingMatch = trimmed.match(/^#{1,6}\s+(.+)/);
    if (headingMatch) {
      currentSection = cleanMarkdownText(headingMatch[1]);
      rows.push({ section: currentSection, kind: "heading", content: currentSection });
      continue;
    }

    const bulletMatch = trimmed.match(/^(?:[-*•]|\d+\.)\s+(.+)/);
    if (bulletMatch) {
      rows.push({ section: currentSection, kind: "bullet", content: cleanMarkdownText(bulletMatch[1]) });
      continue;
    }

    rows.push({ section: currentSection, kind: "paragraph", content: cleanMarkdownText(trimmed) });
  }

  return rows.length > 0
    ? rows
    : [{ section: REPORT_TITLE, kind: "paragraph" as const, content: content.trim() }].filter((row) => row.content.length > 0);
}

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
  const [exporting, setExporting] = useState<"excel" | "pdf" | null>(null);
  const [activeTemplate, setActiveTemplate] = useState<string | null>(null);
  const activeRequestRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => {
      activeRequestRef.current?.abort();
    };
  }, []);

  const generate = async (q: string) => {
    if (!q.trim()) return;
    activeRequestRef.current?.abort();
    const controller = new AbortController();
    activeRequestRef.current = controller;
    setLoading(true);
    setResult("");
    setActiveTemplate(q);
    try {
      const res = await fetch("/api/ai/report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: q, scope: "admin" }),
        signal: controller.signal,
      });
      if (res.ok) {
        const data = await res.json();
        setResult(data.report ?? data.content ?? JSON.stringify(data, null, 2));
      } else {
        const errData = await res.json().catch(() => ({})) as { error?: string };
        const statusMsg = res.status === 429 ? "Rate limit exceeded. Please wait and try again."
          : res.status === 401 ? "Authentication required. Please re-login."
          : res.status === 403 ? "Insufficient permissions for AI analytics."
          : errData.error ?? `Server error (${res.status}). Check AI API key configuration.`;
        setResult(`⚠️ ${statusMsg}`);
      }
    } catch (error: unknown) {
      if (error instanceof Error && error.name === "AbortError") {
        return;
      }

      const msg = error instanceof Error ? error.message : "Unknown error";
      setResult(`⚠️ Report generation failed: ${msg}. Verify GEMINI_API_KEY is configured in environment variables.`);
    } finally {
      if (activeRequestRef.current === controller) {
        activeRequestRef.current = null;
        setLoading(false);
      }
    }
  };

  const exportExcel = async () => {
    if (!result.trim()) return;

    setExporting("excel");

    try {
      const rows = parseReportRows(result);
      exportExcelRows([
        ["Report", "Section", "Type", "Content"],
        ...rows.map((row) => [REPORT_TITLE, row.section, row.kind, row.content]),
      ], `${getExportFileBaseName()}.xls`, REPORT_TITLE);
    } catch {
      toast.error("Failed to export analytics as Excel.");
    } finally {
      setExporting(null);
    }
  };

  const exportPdf = async () => {
    if (!result.trim()) return;

    setExporting("pdf");

    try {
      const rows = parseReportRows(result);
      const [{ jsPDF }, { default: autoTable }] = await Promise.all([
        import("jspdf"),
        import("jspdf-autotable"),
      ]);

      const doc = new jsPDF({ unit: "pt", format: "a4" });
      const pageWidth = typeof doc.internal.pageSize.getWidth === "function"
        ? doc.internal.pageSize.getWidth()
        : 595;

      doc.setFont("helvetica", "bold");
      doc.setFontSize(18);
      doc.text(REPORT_TITLE, 40, 48);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      doc.text(`Generated ${new Date().toLocaleString("en-AE")}`, 40, 66);

      autoTable(doc, {
        startY: 82,
        head: [["Section", "Type", "Content"]],
        body: rows.map((row) => [row.section, row.kind, row.content]),
        theme: "grid",
        styles: {
          fontSize: 9,
          cellPadding: 6,
          overflow: "linebreak",
          valign: "top",
        },
        headStyles: {
          fillColor: [14, 165, 233],
          textColor: [255, 255, 255],
        },
        columnStyles: {
          0: { cellWidth: 120 },
          1: { cellWidth: 70 },
          2: { cellWidth: Math.max(pageWidth - 230, 200) },
        },
      });

      doc.save(`${getExportFileBaseName()}.pdf`);
    } catch {
      toast.error("Failed to export analytics as PDF.");
    } finally {
      setExporting(null);
    }
  };

  return (
    <div className="page-container space-y-4">
      {/* ── Hero Section ── */}
      <section className="workspace-hero-surface overflow-hidden rounded-[28px] p-6 sm:p-7">
        <div className="workspace-glass-panel inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-primary">
          <Sparkles className="h-3.5 w-3.5" />
          Admin workspace
        </div>
        <h1 className="mt-4 text-3xl font-semibold tracking-tight text-foreground sm:text-[2rem]">Analytics</h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
          AI-powered analytics — launch one-click reports or compose custom queries for deep platform insights.
        </p>
      </section>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <section className="workspace-panel-surface rounded-[28px] p-5 sm:p-6" aria-label="Analytics templates">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Prompt library</p>
            <h2 className="mt-2 text-xl font-semibold tracking-tight text-foreground">Start from a prompt template that matches the workday</h2>
            <p className="mt-1 text-sm text-muted-foreground">Launch one click reports for growth, revenue, geography, agent performance, and employer activity.</p>
          </div>

          <div className="mt-6 grid gap-3 md:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
            {ANALYTICS_QUERIES.map((item) => (
              <button
                key={item.label}
                aria-label={item.label}
                onClick={() => {
                  setQuery(item.query);
                  generate(item.query);
                }}
                disabled={loading}
                className={[
                  "group rounded-[24px] border border-slate-200/80 bg-white p-4 text-left shadow-[0_16px_28px_-28px_rgba(15,23,42,0.1)] transition-all disabled:cursor-not-allowed disabled:opacity-60",
                  activeTemplate === item.query && result
                    ? "border-sky-300 bg-sky-50/70 shadow-[0_22px_40px_-34px_rgba(2,132,199,0.18)]"
                    : "hover:-translate-y-0.5 hover:border-slate-300 hover:bg-slate-50",
                ].join(" ")}
              >
                <div className="inline-flex rounded-2xl bg-sky-100 p-2.5 text-sky-700">
                  <BarChart3 className="h-4 w-4" />
                </div>
                <p className="mt-4 text-[15px] font-semibold text-foreground transition-colors group-hover:text-sky-700">{item.label}</p>
                <p className="mt-2 text-sm leading-6 text-slate-600">{item.query}</p>
              </button>
            ))}
          </div>
        </section>

        <section className="workspace-panel-surface rounded-[28px] p-5 sm:p-6" aria-label="Custom analytics query">
          <div className="flex items-center gap-2 text-primary">
            <Sparkles className="h-4 w-4" />
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em]">Compose insight</p>
          </div>
          <h2 className="mt-3 text-xl font-semibold tracking-tight text-foreground">Custom Analytics Query</h2>
          <p className="mt-1 text-sm text-muted-foreground">Write a targeted question for the AI analyst. Press Ctrl + Enter to run without leaving the editor flow.</p>

          <div className="mt-6 space-y-4">
            <label htmlFor="admin-analytics-query" className="sr-only">Custom analytics query</label>
            <Textarea
              id="admin-analytics-query"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                  e.preventDefault();
                  generate(query);
                }
              }}
              placeholder="Ask anything about your platform data…"
              className="min-h-[180px] rounded-[24px] border-slate-200 bg-white px-4 py-3 text-sm leading-6 shadow-none"
            />

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-muted-foreground">Best for comparisons, trend summaries, funnel quality checks, and executive reporting notes.</p>
              <div className="flex gap-2 self-start sm:self-auto">
                <Button
                  type="button"
                  variant="outline"
                  className="rounded-xl border-border/80 bg-white hover:bg-slate-50"
                  onClick={() => {
                    setQuery("");
                    setResult("");
                    setActiveTemplate(null);
                  }}
                  disabled={loading || (!query && !activeTemplate)}
                >
                  Clear
                </Button>
                <Button
                  type="button"
                  className="rounded-xl"
                  onClick={() => generate(query)}
                  disabled={!query.trim() || loading}
                >
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <TrendingUp className="h-4 w-4" />}
                  Generate report
                </Button>
              </div>
            </div>
          </div>
        </section>
      </div>

      <section className="workspace-panel-surface rounded-[28px] p-5 sm:p-6" aria-label="Analytics report">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Report output</p>
            <h2 className="mt-2 text-xl font-semibold tracking-tight text-foreground">Analytics Report</h2>
            <p className="mt-1 text-sm text-muted-foreground">Generated insights appear here and can be exported as an Excel workbook or PDF briefing.</p>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="outline"
                className="rounded-xl border-border/80 bg-white hover:bg-slate-50"
                disabled={!result || exporting !== null}
              >
                {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                Export
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuLabel>Export report</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => { void exportExcel(); }} disabled={exporting !== null}>
                <FileSpreadsheet className="h-4 w-4" />
                Export as Excel
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => { void exportPdf(); }} disabled={exporting !== null}>
                <FileText className="h-4 w-4" />
                Export as PDF
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <div className="mt-6 rounded-[24px] border border-slate-200/80 bg-white p-4">
          {loading ? (
            <div className="space-y-3" aria-label="Generating analytics report">
              <div className="sr-only" role="status" aria-live="polite">Generating analytics report</div>
              <div className="h-4 w-40 animate-pulse rounded-full bg-secondary" />
              <div className="h-4 w-full animate-pulse rounded-full bg-secondary" />
              <div className="h-4 w-[92%] animate-pulse rounded-full bg-secondary" />
              <div className="h-4 w-[84%] animate-pulse rounded-full bg-secondary" />
            </div>
          ) : result ? (
            <div className="max-h-[520px] overflow-y-auto rounded-[20px] text-sm leading-7 text-foreground">
              <MarkdownRenderer content={result} />
            </div>
          ) : (
            <div className="flex min-h-[220px] flex-col items-center justify-center rounded-[20px] border border-dashed border-slate-200 bg-slate-50/80 px-6 text-center">
              <div className="rounded-2xl bg-sky-100 p-3 text-sky-700">
                <BarChart3 className="h-5 w-5" />
              </div>
              <p className="mt-4 text-base font-semibold text-foreground">No analytics report yet</p>
              <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">Choose one of the prompt templates or write a custom question to generate an AI-ready summary for the admin team.</p>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
