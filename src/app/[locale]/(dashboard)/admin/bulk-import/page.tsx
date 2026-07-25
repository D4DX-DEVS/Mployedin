"use client";

import { useState, useCallback, useRef } from "react";
import { useTranslations } from "next-intl";
import { DashboardPageHeader } from "@/components/shared/DashboardPageHeader";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { SearchableSelect } from "@/components/ui/searchable-select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Upload, FileSpreadsheet, CheckCircle2, XCircle, AlertTriangle,
  Download, ArrowRight, RotateCcw, Users, Briefcase, Building2, Loader2,
} from "lucide-react";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

type ImportType = "users" | "jobs" | "employers";

interface ParsedRow {
  rowNumber: number;
  data: Record<string, string>;
  errors: string[];
  status: "valid" | "error" | "warning";
}

interface ImportResult {
  success: number;
  failed: number;
  errors: { row: number; message: string }[];
}

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const TEMPLATES: Record<ImportType, string[]> = {
  users: ["fullName", "email", "phone", "role", "country"],
  jobs: ["title", "company", "location", "type", "salary", "description"],
  employers: ["companyName", "industry", "email", "phone", "country", "website"],
};

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function AdminBulkImportPage() {
  const t = useTranslations("adminBulkImport");
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [importType, setImportType] = useState<ImportType>("users");
  const [file, setFile] = useState<File | null>(null);
  const [parsedRows, setParsedRows] = useState<ParsedRow[]>([]);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const IMPORT_TYPES = [
    { value: "users" as const, label: t("users"), icon: <Users className="h-4 w-4" /> },
    { value: "jobs" as const, label: t("jobs"), icon: <Briefcase className="h-4 w-4" /> },
    { value: "employers" as const, label: t("employers"), icon: <Building2 className="h-4 w-4" /> },
  ];

  /* ---- Parse CSV ---- */
  const parseCSV = useCallback((text: string): ParsedRow[] => {
    const lines = text.split("\n").filter((l) => l.trim());
    if (lines.length < 2) return [];

    const headers = lines[0].split(",").map((h) => h.trim().replace(/"/g, ""));
    const expectedHeaders = TEMPLATES[importType];
    const rows: ParsedRow[] = [];

    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(",").map((v) => v.trim().replace(/"/g, ""));
      const data: Record<string, string> = {};
      const errors: string[] = [];

      headers.forEach((h, idx) => {
        data[h] = values[idx] ?? "";
      });

      /* Validate required fields */
      for (const field of expectedHeaders.slice(0, 3)) {
        if (!data[field]?.trim()) {
          errors.push(`Missing required field: ${field}`);
        }
      }

      /* Email validation */
      if (data.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) {
        errors.push("Invalid email format");
      }

      rows.push({
        rowNumber: i,
        data,
        errors,
        status: errors.length > 0 ? "error" : "valid",
      });
    }

    return rows;
  }, [importType]);

  const handleFileUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;

    if (!f.name.endsWith(".csv")) {
      toast.error(t("errorUploadCsv"));
      return;
    }

    if (f.size > 5 * 1024 * 1024) {
      toast.error(t("errorFileSize"));
      return;
    }

    setFile(f);
    const text = await f.text();
    const rows = parseCSV(text);
    setParsedRows(rows);
    setStep(2);
  }, [parseCSV, t]);

  /* ---- Import ---- */
  const handleImport = async () => {
    const validRows = parsedRows.filter((r) => r.status === "valid");
    if (validRows.length === 0) {
      toast.error(t("errorNoValidRows"));
      return;
    }

    setImporting(true);
    try {
      const res = await fetch("/api/admin/bulk-import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: importType, rows: validRows.map((r) => r.data) }),
      });

      if (res.ok) {
        const data = await res.json();
        setResult(data);
        setStep(3);
        toast.success(t("successImportComplete", { count: data.success }));
      } else {
        const err = await res.json();
        toast.error(err.error ?? t("errorImportFailed"));
      }
    } catch {
      toast.error(t("errorImportRequest"));
    } finally {
      setImporting(false);
    }
  };

  const downloadTemplate = () => {
    const headers = TEMPLATES[importType].join(",");
    const blob = new Blob([headers + "\n"], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${importType}-import-template.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const reset = () => {
    setStep(1);
    setFile(null);
    setParsedRows([]);
    setResult(null);
    if (fileRef.current) fileRef.current.value = "";
  };

  const validCount = parsedRows.filter((r) => r.status === "valid").length;
  const errorCount = parsedRows.filter((r) => r.status === "error").length;

  return (
    <div className="page-container">
      <DashboardPageHeader
        icon={Upload}
        eyebrow={t("title")}
        title={t("title")}
        description={t("subtitle")}
      >
        <div className="mt-3 flex flex-wrap items-center gap-3">
          {[1, 2, 3].map((s) => (
            <div key={s} className="flex items-center gap-2">
              <div className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold ${
                step >= s ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
              }`}>
                {step > s ? <CheckCircle2 className="h-4 w-4" /> : s}
              </div>
              <span className={`text-sm ${step >= s ? "text-foreground font-medium" : "text-muted-foreground"}`}>
                {s === 1 ? t("stepUpload") : s === 2 ? t("stepReview") : t("stepComplete")}
              </span>
              {s < 3 && <ArrowRight className="h-4 w-4 text-muted-foreground" />}
            </div>
          ))}
        </div>
      </DashboardPageHeader>

      {/* Step 1: Upload */}
      {step === 1 && (
        <section className="workspace-panel-surface rounded-[28px] p-6">
          <div className="space-y-6">
            {/* Type selection */}
            <div>
              <label className="mb-2 block text-sm font-medium text-foreground">{t("labelImportType")}</label>
              <div className="flex gap-3">
                {IMPORT_TYPES.map((typeOption) => (
                  <button
                    key={typeOption.value}
                    onClick={() => setImportType(typeOption.value as ImportType)}
                    className={`inline-flex items-center gap-2 rounded-xl px-4 py-3 text-sm font-medium transition-colors ${
                      importType === typeOption.value
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground hover:bg-muted/80"
                    }`}
                  >
                    {typeOption.icon} {typeOption.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Template download */}
            <div className="workspace-glass-panel rounded-2xl p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-foreground">{t("labelDownloadTemplate")}</p>
                  <p className="text-xs text-muted-foreground">{t("descDownloadTemplate", { type: importType })}</p>
                </div>
                <Button variant="outline" size="sm" onClick={downloadTemplate}>
                  <Download className="mr-1 h-3.5 w-3.5" /> {t("labelTemplate")}
                </Button>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                {t("labelExpectedColumns")}: <code className="rounded bg-muted px-1 py-0.5">{TEMPLATES[importType].join(", ")}</code>
              </p>
            </div>

            {/* File upload */}
            <div
              className="flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-muted-foreground/20 p-12 transition-colors hover:border-primary/40"
              onClick={() => fileRef.current?.click()}
            >
              <FileSpreadsheet className="h-12 w-12 text-muted-foreground/40" />
              <p className="mt-4 text-sm font-medium text-foreground">{t("labelClickUpload")}</p>
              <p className="mt-1 text-xs text-muted-foreground">{t("uploadLimits")}</p>
              <input
                ref={fileRef}
                type="file"
                accept=".csv"
                className="hidden"
                onChange={handleFileUpload}
              />
            </div>
          </div>
        </section>
      )}

      {/* Step 2: Review */}
      {step === 2 && (
        <section className="workspace-panel-surface rounded-[28px] p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-foreground">{t("headingReviewData")}</h2>
              <p className="text-sm text-muted-foreground">{file?.name} · {parsedRows.length} {t("labelRowsFound")}</p>
            </div>
            <div className="flex items-center gap-3">
              <span className="inline-flex items-center gap-1 text-sm text-emerald-600">
                <CheckCircle2 className="h-3.5 w-3.5" /> {validCount} {t("labelValid")}
              </span>
              {errorCount > 0 && (
                <span className="inline-flex items-center gap-1 text-sm text-red-600">
                  <XCircle className="h-3.5 w-3.5" /> {errorCount} {t("labelErrors")}
                </span>
              )}
            </div>
          </div>

          <div className="max-h-96 overflow-auto rounded-xl">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-16">{t("headerRow")}</TableHead>
                  <TableHead className="w-16">{t("headerStatus")}</TableHead>
                  {TEMPLATES[importType].map((h) => (
                    <TableHead key={h} className="capitalize">{h.replace(/([A-Z])/g, " $1")}</TableHead>
                  ))}
                  <TableHead>{t("headerErrors")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {parsedRows.slice(0, 100).map((row) => (
                  <TableRow key={row.rowNumber} className={row.status === "error" ? "bg-red-50/50 dark:bg-red-950/10" : ""}>
                    <TableCell className="text-xs text-muted-foreground">{row.rowNumber}</TableCell>
                    <TableCell>
                      {row.status === "valid" ? (
                        <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                      ) : (
                        <XCircle className="h-4 w-4 text-red-500" />
                      )}
                    </TableCell>
                    {TEMPLATES[importType].map((h) => (
                      <TableCell key={h} className="text-sm">{row.data[h] ?? "—"}</TableCell>
                    ))}
                    <TableCell className="text-xs text-red-600">{row.errors.join("; ") || "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div className="flex items-center justify-between pt-2">
            <Button variant="outline" onClick={reset}>
              <RotateCcw className="mr-1 h-3.5 w-3.5" /> {t("buttonStartOver")}
            </Button>
            <Button onClick={handleImport} disabled={validCount === 0 || importing}>
              {importing ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Upload className="mr-1 h-3.5 w-3.5" />}
              {t("buttonImportRecords", { count: validCount })}
            </Button>
          </div>
        </section>
      )}

      {/* Step 3: Complete */}
      {step === 3 && result && (
        <section className="workspace-panel-surface rounded-[28px] p-6">
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <CheckCircle2 className="h-16 w-16 text-emerald-500" />
            <h2 className="mt-4 text-xl font-semibold text-foreground">{t("headingImportComplete")}</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              {t("messageImportSuccess", { success: result.success, failed: result.failed })}
            </p>

            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              <div className="workspace-glass-panel rounded-2xl p-4 text-center">
                <p className="text-2xl font-semibold text-emerald-600">{result.success}</p>
                <p className="text-xs text-muted-foreground">{t("labelImported")}</p>
              </div>
              <div className="workspace-glass-panel rounded-2xl p-4 text-center">
                <p className="text-2xl font-semibold text-red-600">{result.failed}</p>
                <p className="text-xs text-muted-foreground">{t("labelFailed")}</p>
              </div>
            </div>

            {result.errors.length > 0 && (
              <div className="mt-4 w-full max-w-md text-left">
                <p className="mb-2 text-sm font-medium text-foreground">{t("labelErrorsHeading")}:</p>
                {result.errors.slice(0, 10).map((e, i) => (
                  <p key={i} className="text-xs text-red-600">{t("labelErrorItem", { row: e.row, message: e.message })}</p>
                ))}
              </div>
            )}

            <Button className="mt-6" onClick={reset}>
              <RotateCcw className="mr-1 h-3.5 w-3.5" /> {t("buttonImportMore")}
            </Button>
          </div>
        </section>
      )}
    </div>
  );
}
