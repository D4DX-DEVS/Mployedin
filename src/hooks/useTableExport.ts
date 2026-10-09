"use client";

import { useCallback, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import type { ExportColumn } from "@/lib/export";

interface UseTableExportOptions<T extends Record<string, unknown>> {
  data: T[];
  columns: ExportColumn<T>[];
  filename?: string;
  title?: string;
  /** Optional narrower column set for PDF — wide tables become unreadable in A4 */
  pdfColumns?: ExportColumn<T>[];
  /**
   * BUG-004: when supplied, exports resolve the FULL filtered result set
   * through this fetcher instead of just the rows on screen. Pages pass a
   * closure over their current filters that pages through the list API.
   */
  fetchAll?: () => Promise<T[]>;
  /** Called when a full export fails, so the page can toast instead of silently exporting a partial page. */
  onExportError?: (err: unknown) => void;
}

interface UseTableExportReturn {
  handleExportCsv: () => void;
  handleExportExcel: () => void;
  handleExportPdf: () => void;
  /** True while a full-result export is being fetched. */
  exporting: boolean;
}

export function useTableExport<T extends Record<string, unknown>>({
  data,
  columns,
  filename = "export",
  title = "Export",
  pdfColumns,
  fetchAll,
  onExportError,
}: UseTableExportOptions<T>): UseTableExportReturn {
  const [exporting, setExporting] = useState(false);
  const tc = useTranslations("common");

  const resolveRows = useCallback(async (): Promise<T[]> => {
    if (!fetchAll) return data;
    setExporting(true);
    try {
      return await fetchAll();
    } catch (err) {
      if (onExportError) onExportError(err);
      else toast.error(tc("exportFullFailed"));
      // Fall back to the visible page rather than exporting nothing — the
      // error toast tells the user it is partial.
      return data;
    } finally {
      setExporting(false);
    }
  }, [data, fetchAll, onExportError, tc]);

  const handleExportCsv = useCallback(() => {
    void resolveRows().then((rows) =>
      import("@/lib/export").then(({ exportCSV }) =>
        exportCSV(rows, columns, `${filename}.csv`),
      ),
    );
  }, [resolveRows, columns, filename]);

  const handleExportExcel = useCallback(() => {
    void resolveRows().then((rows) =>
      import("@/lib/export").then(({ exportExcel }) =>
        exportExcel(rows, columns, `${filename}.xlsx`, title),
      ),
    );
  }, [resolveRows, columns, filename, title]);

  const handleExportPdf = useCallback(() => {
    void resolveRows().then((rows) =>
      import("@/lib/export").then(({ exportPdf }) =>
        exportPdf(rows, pdfColumns ?? columns, `${filename}.pdf`, title),
      ),
    );
  }, [resolveRows, columns, pdfColumns, filename, title]);

  return { handleExportCsv, handleExportExcel, handleExportPdf, exporting };
}
