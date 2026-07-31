"use client";

import { useCallback } from "react";
import type { ExportColumn } from "@/lib/export";

interface UseTableExportOptions<T extends Record<string, unknown>> {
  data: T[];
  columns: ExportColumn<T>[];
  filename?: string;
  title?: string;
  /** Optional narrower column set for PDF — wide tables become unreadable in A4 */
  pdfColumns?: ExportColumn<T>[];
}

interface UseTableExportReturn {
  handleExportCsv: () => void;
  handleExportExcel: () => void;
  handleExportPdf: () => void;
}

export function useTableExport<T extends Record<string, unknown>>({
  data,
  columns,
  filename = "export",
  title = "Export",
  pdfColumns,
}: UseTableExportOptions<T>): UseTableExportReturn {
  const handleExportCsv = useCallback(() => {
    import("@/lib/export").then(({ exportCSV }) =>
      exportCSV(data, columns, `${filename}.csv`),
    );
  }, [data, columns, filename]);

  const handleExportExcel = useCallback(() => {
    import("@/lib/export").then(({ exportExcel }) =>
      exportExcel(data, columns, `${filename}.xls`, title),
    );
  }, [data, columns, filename, title]);

  const handleExportPdf = useCallback(() => {
    import("@/lib/export").then(({ exportPdf }) =>
      exportPdf(data, pdfColumns ?? columns, `${filename}.pdf`, title),
    );
  }, [data, columns, pdfColumns, filename, title]);

  return { handleExportCsv, handleExportExcel, handleExportPdf };
}
