"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { PageHero } from "@/components/shared/PageHero";
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
import { toUserFacingError } from "@/lib/errors/user-facing";

type ReportRow = {
  section: string;
  kind: "heading" | "bullet" | "paragraph";
  content: string;
};


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

function parseReportRows(content: string, reportTitle: string): ReportRow[] {
  const rows: ReportRow[] = [];
  let currentSection = reportTitle;

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
    : [{ section: reportTitle, kind: "paragraph" as const, content: content.trim() }].filter((row) => row.content.length > 0);
}

const ANALYTICS_QUERIES_KEYS = [
  { labelKey: "platformGrowthThisMonth", queryKey: "platformGrowthQuery" },
  { labelKey: "topPerformingAgents", queryKey: "topPerformingAgentsQuery" },
  { labelKey: "jobCategoryTrends", queryKey: "jobCategoryTrendsQuery" },
  { labelKey: "revenueCommissionSummary", queryKey: "revenueCommissionSummaryQuery" },
  { labelKey: "employerActivityReport", queryKey: "employerActivityReportQuery" },
  { labelKey: "geographicDistribution", queryKey: "geographicDistributionQuery" },
];

export default function AdminAnalyticsPage() {
  const t = useTranslations("adminAnalytics");
  const [query, setQuery] = useState("");
  const [result, setResult] = useState("");
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState<"excel" | "pdf" | null>(null);
  const [activeTemplate, setActiveTemplate] = useState<string | null>(null);
  const activeRequestRef = useRef<AbortController | null>(null);

  const ANALYTICS_QUERIES = ANALYTICS_QUERIES_KEYS.map((item) => ({
    label: t(item.labelKey),
    query: t(item.queryKey),
  }));

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
        body: JSON.stringify({ query: q, scope: "platform" }),
        signal: controller.signal,
      });
      if (res.ok) {
        const data = await res.json();
        setResult(data.report ?? data.content ?? JSON.stringify(data, null, 2));
      } else {
        const statusMsg = res.status === 429 ? t("rateLimitExceeded")
          : res.status === 401 ? t("authenticationRequired")
          : res.status === 403 ? t("insufficientPermissions")
          : t("serverError");
        setResult(`⚠️ ${statusMsg}`);
      }
    } catch (error: unknown) {
      if (error instanceof Error && error.name === "AbortError") {
        return;
      }

      setResult(`⚠️ ${toUserFacingError(error, { fallback: t("reportGenerationFailed") }).message}`);
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
      const reportTitle = t("reportOutputTitle");
      const rows = parseReportRows(result, reportTitle);
      exportExcelRows([
        ["Report", "Section", "Type", "Content"],
        ...rows.map((row) => [reportTitle, row.section, row.kind, row.content]),
      ], `${getExportFileBaseName()}.xls`, reportTitle);
    } catch {
      toast.error(t("exportFailedExcel"));
    } finally {
      setExporting(null);
    }
  };

  const exportPdf = async () => {
    if (!result.trim()) return;

    setExporting("pdf");

    try {
      const reportTitle = t("reportOutputTitle");
      const rows = parseReportRows(result, reportTitle);
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
      doc.text(reportTitle, 40, 48);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      doc.text(t("generatedDateLabel", { date: new Date().toLocaleString("en-AE") }), 40, 66);

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
      toast.error(t("exportFailedPdf"));
    } finally {
      setExporting(null);
    }
  };

  return (
    <div className="page-container">
      <PageHero
        title={t("analyticsTitle")}
        description={t("analyticsDescription")}
        eyebrow={t("adminWorkspace")}
      />

      <div className="grid gap-3 sm:gap-6 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <section className="workspace-panel-surface rounded-3xl panel-body" aria-label={t("a11yAnalyticsTemplates")}>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{t("promptLibrary")}</p>
            <h2 className="mt-2 text-xl font-semibold tracking-tight text-foreground">{t("promptLibraryTitle")}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{t("promptLibraryDescription")}</p>
          </div>

          <div className="mt-6 grid gap-2.5 sm:gap-3 md:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
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
                  "group flex items-start gap-3 rounded-2xl border border-border/80 bg-card p-3 text-left shadow-[0_16px_28px_-28px_rgba(15,23,42,0.1)] transition-all disabled:cursor-not-allowed disabled:opacity-60 sm:rounded-3xl sm:p-4",
                  activeTemplate === item.query && result
                    ? "border-sky-300 bg-sky-50/70 shadow-[0_22px_40px_-34px_rgba(2,132,199,0.18)]"
                    : "hover:-translate-y-0.5 hover:border-border hover:bg-muted",
                ].join(" ")}
              >
                <div className="inline-flex shrink-0 rounded-xl bg-sky-100 p-2 text-sky-700 sm:rounded-2xl sm:p-2.5">
                  <BarChart3 className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-foreground transition-colors group-hover:text-sky-700 sm:text-[15px]">{item.label}</p>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground sm:mt-2 sm:text-sm sm:leading-6">{item.query}</p>
                </div>
              </button>
            ))}
          </div>
        </section>

        <section className="workspace-panel-surface rounded-3xl panel-body" aria-label={t("a11yCustomAnalyticsQuery")}>
          <div className="flex items-center gap-2 text-primary">
            <Sparkles className="h-4 w-4" />
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em]">{t("composeInsight")}</p>
          </div>
          <h2 className="mt-3 text-xl font-semibold tracking-tight text-foreground">{t("customAnalyticsQuery")}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{t("customAnalyticsDescription")}</p>

          <div className="mt-6 space-y-4">
            <label htmlFor="admin-analytics-query" className="sr-only">{t("customAnalyticsQueryLabel")}</label>
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
              placeholder={t("customAnalyticsPlaceholder")}
              className="min-h-[180px] rounded-3xl border-border bg-card px-4 py-3 text-sm leading-6 shadow-none"
            />

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-muted-foreground">{t("customAnalyticsBestFor")}</p>
              <div className="flex gap-2 self-start sm:self-auto">
                <Button
                  type="button"
                  variant="outline"
                  className="rounded-xl border-border/80 bg-card hover:bg-muted"
                  onClick={() => {
                    setQuery("");
                    setResult("");
                    setActiveTemplate(null);
                  }}
                  disabled={loading || (!query && !activeTemplate)}
                >
                  {t("clearButton")}
                </Button>
                <Button
                  type="button"
                  className="rounded-xl"
                  onClick={() => generate(query)}
                  disabled={!query.trim() || loading}
                >
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <TrendingUp className="h-4 w-4" />}
                  {t("generateReportButton")}
                </Button>
              </div>
            </div>
          </div>
        </section>
      </div>

      <section className="workspace-panel-surface rounded-3xl panel-body" aria-label={t("a11yAnalyticsReport")}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{t("reportOutput")}</p>
            <h2 className="mt-2 text-xl font-semibold tracking-tight text-foreground">{t("reportOutputTitle")}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{t("reportOutputDescription")}</p>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="outline"
                className="rounded-xl border-border/80 bg-card hover:bg-muted"
                disabled={!result || exporting !== null}
              >
                {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                {t("exportButton")}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuLabel>{t("exportReport")}</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => { void exportExcel(); }} disabled={exporting !== null}>
                <FileSpreadsheet className="h-4 w-4" />
                {t("exportAsExcel")}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => { void exportPdf(); }} disabled={exporting !== null}>
                <FileText className="h-4 w-4" />
                {t("exportAsPdf")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <div className="mt-6 rounded-3xl border border-border/80 bg-card p-4">
          {loading ? (
            <div className="space-y-3" aria-label={t("generatingAnalytics")}>
              <div className="sr-only" role="status" aria-live="polite">{t("generatingAnalyticsStatus")}</div>
              <div className="h-4 w-40 animate-pulse rounded-full bg-secondary" />
              <div className="h-4 w-full animate-pulse rounded-full bg-secondary" />
              <div className="h-4 w-[92%] animate-pulse rounded-full bg-secondary" />
              <div className="h-4 w-[84%] animate-pulse rounded-full bg-secondary" />
            </div>
          ) : result ? (
            <div className="max-h-[520px] overflow-y-auto rounded-3xl text-sm leading-7 text-foreground">
              <MarkdownRenderer content={result} />
            </div>
          ) : (
            <div className="flex min-h-[220px] flex-col items-center justify-center rounded-3xl border border-dashed border-border bg-muted/80 px-6 text-center">
              <div className="rounded-2xl bg-sky-100 p-3 text-sky-700">
                <BarChart3 className="h-5 w-5" />
              </div>
              <p className="mt-4 text-base font-semibold text-foreground">{t("noAnalyticsReport")}</p>
              <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">{t("noAnalyticsReportDescription")}</p>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
