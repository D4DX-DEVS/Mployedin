import "server-only";
import JSZip from "jszip";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { createTranslator, type AbstractIntlMessages } from "next-intl";
import { registerInvoiceFonts, hasArabic } from "@/lib/pdf/invoiceFonts";
import { exportTables, toCsv, type ExportTable, type Translate } from "./exportTables";
import type { StaffReport } from "./types";

/** Rows per list in the PDF (plan default; the summary is never cut); the CSV carries every row the report holds. */
export const PDF_ROWS_PER_TABLE = 20;

export async function reportTranslator(locale: string): Promise<Translate> {
  const lang = locale === "ar" ? "ar" : "en";
  const messages = (lang === "ar"
    ? (await import("../../../../messages/ar.json")).default
    : (await import("../../../../messages/en.json")).default) as unknown as AbstractIntlMessages;
  const t = createTranslator({
    locale: lang,
    messages,
    namespace: "adminStaffReport",
    onError: () => undefined,
    getMessageFallback: ({ namespace, key }) => `${namespace ? `${namespace}.` : ""}${key}`,
  });
  return (key, values) => (t as unknown as (k: string, v?: Record<string, string | number>) => string)(key, values);
}

export function fileBase(report: StaffReport): string {
  const who = report.identity.name.replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "").slice(0, 40) || "report";
  return `${who}-${report.range.from ?? "all"}-to-${report.range.to}`;
}

export async function reportCsvZip(report: StaffReport, t: Translate): Promise<Buffer> {
  const zip = new JSZip();
  exportTables(report, t).forEach((table, i) => {
    zip.file(`${String(i + 1).padStart(2, "0")}-${table.key}.csv`, toCsv(table));
  });
  return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
}

const NAVY: [number, number, number] = [30, 47, 108];
const MUTED: [number, number, number] = [113, 113, 122];

export function reportPdf(report: StaffReport, t: Translate, locale: string): Buffer {
  const rtl = locale === "ar";
  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
  const fonts = registerInvoiceFonts(doc);
  const pageW = doc.internal.pageSize.getWidth();
  const margin = 36;
  const fontFor = (s: string) => (fonts.arabic && hasArabic(s) ? fonts.arabic : fonts.latin);
  const text = (s: string, y: number, size: number, color: [number, number, number], bold = false) => {
    doc.setFont(fontFor(s), bold ? "bold" : "normal");
    doc.setFontSize(size);
    doc.setTextColor(...color);
    doc.text(s, rtl ? pageW - margin : margin, y, { align: rtl ? "right" : "left" });
  };

  const title = report.kind === "super_agent" ? t("export.titleSa") : t("export.titleAgent");
  text(title, margin + 4, 16, NAVY, true);
  text(report.identity.name, margin + 24, 12, [24, 24, 27], true);
  text(`${t("export.range")}: ${report.range.from ?? t("range.all")} – ${report.range.to}  ·  ${t("export.generated")}: ${report.generatedAt.slice(0, 10)}`, margin + 40, 9, MUTED);

  let y = margin + 56;
  for (const table of exportTables(report, t)) {
    // The summary is the report itself: never cut it. Only the long lists are capped.
    const rows = table.key === "summary" ? table.rows : table.rows.slice(0, PDF_ROWS_PER_TABLE);
    const more = table.total > rows.length ? `  (${t("showingFirst", { shown: rows.length, total: table.total })})` : "";
    if (y > doc.internal.pageSize.getHeight() - 90) { doc.addPage(); y = margin; }
    text(`${table.title}${more}`, y, 11, NAVY, true);
    autoTable(doc, {
      startY: y + 6,
      head: [orient(table.columns, rtl)],
      body: rows.length ? rows.map((r) => orient(r, rtl)) : [orient([t("none"), ...table.columns.slice(1).map(() => "")], rtl)],
      margin: { left: margin, right: margin },
      styles: { font: fonts.latin, fontSize: 7.5, cellPadding: 4, halign: rtl ? "right" : "left", overflow: "linebreak" },
      headStyles: { fillColor: [244, 246, 251], textColor: MUTED, fontStyle: "bold" },
      didParseCell: (data) => {
        if (fonts.arabic && hasArabic(data.cell.text.join(" "))) data.cell.styles.font = fonts.arabic;
      },
    });
    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 22;
  }
  return Buffer.from(doc.output("arraybuffer"));
}

/** Arabic reads right to left: columns run from the right edge. */
function orient(row: string[], rtl: boolean): string[] {
  return rtl ? [...row].reverse() : row;
}

export type { ExportTable };
