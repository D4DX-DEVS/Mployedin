/**
 * Client-side export utilities: CSV, Excel-compatible HTML, PDF (jspdf).
 */

export interface ExportColumn<T> {
  header: string;
  key: keyof T;
  formatter?: (value: T[keyof T], row: T) => string;
}

/* ── helpers ─────────────────────────────────────────── */

function resolveValue<T extends Record<string, unknown>>(
  row: T,
  col: ExportColumn<T>,
): string {
  const raw = row[col.key as string];
  if (col.formatter) return col.formatter(raw as T[keyof T], row);
  return raw == null ? "" : String(raw);
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function sanitizeSpreadsheetCell(value: string): string {
  return /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function normalizeExcelFilename(filename: string): string {
  return filename.replace(/\.xlsx$/i, ".xls") || "export.xls";
}

export function excelBlobFromRows(rows: string[][], sheetName = "Sheet1"): Blob {
  const safeSheetName = escapeHtml(sheetName.slice(0, 31) || "Sheet1");
  const tableRows = rows
    .map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(sanitizeSpreadsheetCell(cell))}</td>`).join("")}</tr>`)
    .join("");
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>td{mso-number-format:"\\@";}</style></head><body><table><caption>${safeSheetName}</caption>${tableRows}</table></body></html>`;
  return new Blob(["\uFEFF", html], { type: "application/vnd.ms-excel;charset=utf-8;" });
}

export function exportExcelRows(
  rows: string[][],
  filename = "export.xls",
  sheetName = "Sheet1",
): void {
  triggerDownload(excelBlobFromRows(rows, sheetName), normalizeExcelFilename(filename));
}

/* ── CSV ─────────────────────────────────────────────── */

export function exportCSV<T extends Record<string, unknown>>(
  data: T[],
  columns: ExportColumn<T>[],
  filename = "export.csv",
): void {
  const header = columns.map((c) => `"${c.header}"`).join(",");
  const rows = data.map((row) =>
    columns
      .map((col) => {
        const val = sanitizeSpreadsheetCell(resolveValue(row, col));
        return `"${String(val).replace(/"/g, '""')}"`;
      })
      .join(","),
  );

  const csv = [header, ...rows].join("\n");
  const blob = new Blob(["\uFEFF" + csv], {
    type: "text/csv;charset=utf-8;",
  });
  triggerDownload(blob, filename);
}

/* ── Excel-compatible HTML ───────────────────────────── */

export async function exportExcel<T extends Record<string, unknown>>(
  data: T[],
  columns: ExportColumn<T>[],
  filename = "export.xls",
  sheetName = "Sheet1",
): Promise<void> {
  exportExcelRows(
    [columns.map((column) => column.header), ...data.map((row) => columns.map((column) => resolveValue(row, column)))],
    filename,
    sheetName,
  );
}

/* ── PDF (jspdf + autotable) ─────────────────────────── */

export async function exportPdf<T extends Record<string, unknown>>(
  data: T[],
  columns: ExportColumn<T>[],
  filename = "export.pdf",
  title = "Export",
): Promise<void> {
  const { jsPDF } = await import("jspdf");
  const autoTable = (await import("jspdf-autotable")).default;

  const isLandscape = columns.length > 6;
  const doc = new jsPDF({ orientation: isLandscape ? "landscape" : "portrait" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 14;
  let y = margin;

  // ── Brand Header ────────────────────────────────────────────────────────
  // Blue accent bar
  doc.setFillColor(13, 111, 216);
  doc.rect(0, 0, pageWidth, 4, "F");

  y = 14;
  doc.setFontSize(20);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(13, 111, 216);
  doc.text("MPLOYEDIN", margin, y + 6);
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(120);
  doc.text("AI-Powered Recruitment Platform", margin, y + 12);

  // Right side: date
  doc.setFontSize(9);
  doc.setTextColor(100);
  doc.text(new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }), pageWidth - margin, y + 6, { align: "right" });
  doc.text(new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }), pageWidth - margin, y + 11, { align: "right" });

  y += 18;

  // Divider
  doc.setDrawColor(13, 111, 216);
  doc.setLineWidth(0.6);
  doc.line(margin, y, pageWidth - margin, y);
  y += 8;

  // ── Report Title ────────────────────────────────────────────────────────
  doc.setFontSize(15);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(30);
  doc.text(title, margin, y);
  y += 7;

  // ── Summary Stats ───────────────────────────────────────────────────────
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(80);
  doc.text(`Total Records: ${data.length}`, margin, y);
  y += 8;

  // ── Data Table ──────────────────────────────────────────────────────────
  const head = [columns.map((c) => c.header)];
  const body = data.map((row) => columns.map((col) => resolveValue(row, col)));

  autoTable(doc, {
    startY: y,
    head,
    body,
    theme: "grid",
    styles: {
      fontSize: 7.5,
      cellPadding: { top: 3, right: 4, bottom: 3, left: 4 },
      lineColor: [220, 225, 230],
      lineWidth: 0.3,
      textColor: [40, 40, 40],
    },
    headStyles: {
      fillColor: [13, 111, 216],
      textColor: 255,
      fontSize: 8,
      fontStyle: "bold",
      halign: "left",
      cellPadding: { top: 4, right: 4, bottom: 4, left: 4 },
    },
    alternateRowStyles: { fillColor: [247, 249, 252] },
    margin: { left: margin, right: margin },
    didDrawPage: () => {
      // Footer on every page
      const pageHeight = doc.internal.pageSize.getHeight();
      doc.setDrawColor(200);
      doc.setLineWidth(0.3);
      doc.line(margin, pageHeight - 14, pageWidth - margin, pageHeight - 14);
      doc.setFontSize(7);
      doc.setTextColor(150);
      doc.text("Confidential · Generated by MPLOYEDIN", margin, pageHeight - 9);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const pageNum = (doc as any).internal.getCurrentPageInfo().pageNumber;
      doc.text(`Page ${pageNum}`, pageWidth - margin, pageHeight - 9, { align: "right" });
    },
  });

  doc.save(filename);
}

/* ── JSON ────────────────────────────────────────────── */

export function exportJSON<T>(data: T[], filename = "export.json"): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: "application/json",
  });
  triggerDownload(blob, filename);
}

/* ── Print to PDF (legacy) ───────────────────────────── */

export function exportPrint<T extends Record<string, unknown>>(
  data: T[],
  columns: ExportColumn<T>[],
  title = "Export",
): void {
  const rows = data
    .map(
      (row) =>
        `<tr>${columns
          .map((col) => {
            const val = resolveValue(row, col);
            return `<td style="padding:6px 10px;border:1px solid #ddd;font-size:12px">${val}</td>`;
          })
          .join("")}</tr>`,
    )
    .join("");

  const html = `<!DOCTYPE html><html><head>
    <title>${title}</title>
    <style>
      body{font-family:sans-serif;padding:24px}
      h2{margin-bottom:12px}
      table{width:100%;border-collapse:collapse}
      th{background:#0D6FD8;color:white;padding:8px 10px;font-size:12px;text-align:left;border:1px solid #ccc}
    </style>
  </head><body>
    <h2>${title}</h2>
    <table>
      <thead><tr>${columns.map((c) => `<th>${c.header}</th>`).join("")}</tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <p style="font-size:10px;color:#999;margin-top:16px">Generated by MPLOYEDIN · ${new Date().toLocaleString("en-AE")}</p>
  </body></html>`;

  const win = window.open("", "_blank");
  if (!win) return;
  win.document.write(html);
  win.document.close();
  win.print();
}

/* ── Convenience formatters ──────────────────────────── */

export function fmtDate(val: unknown): string {
  if (!val) return "—";
  return new Date(String(val)).toLocaleDateString("en-AE");
}

export function fmtCurrency(val: unknown, currency = "AED"): string {
  if (!val) return "—";
  return `${Number(val).toLocaleString()} ${currency}`;
}
