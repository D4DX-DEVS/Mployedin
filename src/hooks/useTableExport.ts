"use client";

import { useCallback } from "react";
import type { ExportColumn } from "@/lib/export";

interface UseTableExportOptions<T extends Record<string, unknown>> {
  data: T[];
  columns: ExportColumn<T>[];
  filename?: string;
  title?: string;
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
}: UseTableExportOptions<T>): UseTableExportReturn {
  const handleExportCsv = useCallback(() => {
    import("@/lib/export").then(({ exportCSV }) =>
      exportCSV(data, columns, `${filename}.csv`),
    );
  }, [data, columns, filename]);

  const handleExportExcel = useCallback(() => {
    import("@/lib/export").then(({ exportExcel }) =>
      exportExcel(data, columns, `${filename}.xlsx`, title),
    );
  }, [data, columns, filename, title]);

  const handleExportPdf = useCallback(() => {
    import("@/lib/export").then(({ exportPdf }) =>
      exportPdf(data, columns, `${filename}.pdf`, title),
    );
  }, [data, columns, filename, title]);

  return { handleExportCsv, handleExportExcel, handleExportPdf };
}
