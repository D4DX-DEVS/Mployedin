import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import {
  resolveBillTo,
  resolveLineItems,
  resolveTotalRows,
  invoiceFacts,
  paymentState,
  type PresentableInvoice,
  type BillToFallback,
} from "./presentation";
import type { ResolvedIssuer } from "./issuer";
import {
  statusBadge,
  isCollectible,
  factLabel,
  factValue,
  totalRowLabel,
  safeDate,
  fmtMoney,
  hireLine,
  type Rgb,
} from "./pdfLabels";
import { getLogoBase64, logoBox } from "@/lib/pdf/logo";
import { registerInvoiceFonts, hasArabic } from "@/lib/pdf/invoiceFonts";

/**
 * The invoice document, as printed.
 *
 * What each block contains is decided in `presentation.ts`, which the employer
 * dialog reads too — so a subscription invoice that shows a plan and a service
 * period on screen prints the same plan and service period here, and a bill-to
 * block that resolves on screen cannot print as an empty "—". Wording lives in
 * `pdfLabels.ts`; this file only draws.
 */
export type PdfInvoice = PresentableInvoice & {
  issuedByLabel?: string;
  paidAt?: string | Date | null;
  commissions?: Array<{ role: string; rate: number; amount: number }>;
};

type ViewerRole = "admin" | "super_agent" | "agent" | "employer" | "job_seeker" | (string & {});

export type GeneratePdfOptions = {
  viewerRole?: ViewerRole;
  /** The issuing party — printed as the FROM block and payment instructions. */
  issuer?: ResolvedIssuer;
  /** Payer details for invoices that carry neither billingDetails nor an employer link. */
  billToFallback?: BillToFallback;
};

const NAVY: Rgb = [30, 47, 108]; // #1e2f6c
const BRAND: Rgb = [40, 69, 149]; // #284595
const CYAN: Rgb = [75, 186, 221]; // #4BBADD
const INK: Rgb = [24, 24, 27];
const BODY: Rgb = [63, 63, 70];
const MUTED: Rgb = [113, 113, 122];
const HAIRLINE: Rgb = [228, 228, 231];
const TINT: Rgb = [244, 246, 251];

export function generateInvoicePdf(
  invoice: PdfInvoice,
  options: GeneratePdfOptions | ViewerRole = {},
): Buffer {
  // Callers used to pass the viewer role positionally.
  const opts: GeneratePdfOptions = typeof options === "string" ? { viewerRole: options } : options;
  const viewerRole = opts.viewerRole ?? "employer";
  const issuer = opts.issuer;

  const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
  const fonts = registerInvoiceFonts(doc);
  const pageWidth = doc.internal.pageSize.getWidth(); // ~595pt
  const pageHeight = doc.internal.pageSize.getHeight(); // ~842pt
  const margin = 40;
  const right = pageWidth - margin;
  const contentWidth = right - margin;
  const bottomLimit = pageHeight - 48; // footer hairline sits at -40
  let y = margin;

  const currency = invoice.currency || "AED";
  const state = paymentState(invoice);
  const badge = statusBadge(invoice.status, state);
  const owes = isCollectible(invoice.status, state);
  const isCreditNote = invoice.status === "credit_note";
  // Status shows once, in the pill under the number. Lateness goes under the due date,
  // and only on a document still asking for money.
  const daysLate = owes && state.stamp === "overdue" && state.overdueDays > 0 ? state.overdueDays : 0;
  const billTo = resolveBillTo(invoice, opts.billToFallback);
  const items = resolveLineItems(invoice);
  const facts = invoiceFacts(invoice, { formatDate: (d) => safeDate(d) });
  const commissions = invoice.commissions ?? [];
  const money = (n: number) => fmtMoney(n, currency);

  // ── Drawing helpers ─────────────────────────────────────────────────────
  type Style = "normal" | "bold";
  /** Pick the face per string: Arabic text needs the Arabic font to shape at all. */
  // ponytail: a line mixing Arabic and Latin letters prints in the Arabic face, which has no Latin letters (digits survive) — split runs if that shows up in real data.
  const font = (text: string, style: Style, size: number, color: Rgb) => {
    const family = fonts.arabic && hasArabic(text) ? fonts.arabic : fonts.latin;
    doc.setFont(family, style);
    doc.setFontSize(size);
    doc.setTextColor(...color);
  };
  const write = (
    text: string,
    x: number,
    atY: number,
    o: { style?: Style; size?: number; color?: Rgb; align?: "left" | "right" | "center" } = {},
  ) => {
    font(text, o.style ?? "normal", o.size ?? 9, o.color ?? BODY);
    doc.text(text, x, atY, o.align ? { align: o.align } : undefined);
  };
  /** Wrapped block; returns the y after it. */
  const writeWrapped = (text: string, x: number, atY: number, width: number, size = 9, style: Style = "normal", color: Rgb = BODY, lh = 12.5) => {
    font(text, style, size, color);
    const lines = doc.splitTextToSize(text, width) as string[];
    doc.text(lines, x, atY);
    return atY + lines.length * lh;
  };
  const label = (text: string, x: number, atY: number, align?: "left" | "right") =>
    write(text.toUpperCase(), x, atY, { style: "bold", size: 6.8, color: MUTED, align });
  const hairline = (atY: number, x1 = margin, x2 = right) => {
    doc.setDrawColor(...HAIRLINE);
    doc.setLineWidth(0.6);
    doc.line(x1, atY, x2, atY);
  };
  const ensureSpace = (needed: number) => {
    if (y + needed > bottomLimit) {
      doc.addPage();
      y = margin;
    }
  };

  // ── Header: logo | Invoice + number + status ────────────────────────────
  const logoBase64 = getLogoBase64();
  if (logoBase64) {
    const box = logoBox(100);
    doc.addImage(logoBase64, "PNG", margin, y, box.width, box.height);
  } else {
    write(issuer?.legalName ?? "mployedin", margin, y + 20, { style: "bold", size: 16, color: NAVY });
  }
  write(isCreditNote ? "Credit note" : "Invoice", right, y + 18, { style: "bold", size: 24, color: INK, align: "right" });
  write(invoice.invoiceNumber ?? "—", right, y + 33, { size: 9.5, color: MUTED, align: "right" });

  // Status pill, right-aligned under the number.
  font(badge.label, "bold", 7.5, badge.text);
  const pillW = doc.getTextWidth(badge.label.toUpperCase()) + 16;
  doc.setFillColor(...badge.fill);
  doc.roundedRect(right - pillW, y + 40, pillW, 15, 7.5, 7.5, "F");
  write(badge.label.toUpperCase(), right - pillW / 2, y + 50.3, { style: "bold", size: 7.5, color: badge.text, align: "center" });
  y += 72;

  // ── Summary band: the three numbers a payer looks for ───────────────────
  const bandH = 66;
  doc.setFillColor(...NAVY);
  doc.roundedRect(margin, y, contentWidth, bandH, 6, 6, "F");
  doc.setFillColor(...CYAN);
  doc.rect(margin + 18, y + bandH - 12, 28, 2.5, "F");

  const headline: [string, string] = isCreditNote
    ? ["Credit amount", money(state.totalAmount)]
    : owes
      ? ["Amount due", money(state.balanceDue)]
      : state.isPaid
        ? ["Amount paid", money(state.paidAmount || state.totalAmount)]
        : ["Invoice total", money(state.totalAmount)];
  const issued: [string, string] = ["Issue date", safeDate(invoice.issuedAt ?? invoice.createdAt)];
  const bandCols: Array<[string, string]> = isCreditNote
    ? [headline, issued, ["Currency", currency]]
    : [
        headline,
        state.isPaid && invoice.paidAt ? ["Paid on", safeDate(invoice.paidAt)] : ["Due date", safeDate(invoice.dueDate)],
        issued,
      ];
  const bandColW = [contentWidth * 0.46, contentWidth * 0.27, contentWidth * 0.27];
  let bx = margin + 18;
  bandCols.forEach(([k, v], i) => {
    write(k.toUpperCase(), bx, y + 22, { style: "bold", size: 6.8, color: [180, 192, 228] });
    write(v, bx, y + 42, { style: "bold", size: i === 0 ? 17 : 11, color: [255, 255, 255] });
    if (i === 1 && k === "Due date" && daysLate > 0) {
      // Solid red pill, same shape as the status pill — a clear warning on the navy band.
      const note = `${daysLate} ${daysLate === 1 ? "day" : "days"} overdue`;
      font(note, "bold", 7, [255, 255, 255]);
      const noteW = doc.getTextWidth(note) + 12;
      doc.setFillColor(220, 38, 38);
      doc.roundedRect(bx, y + 49.5, noteW, 11, 5.5, 5.5, "F");
      write(note, bx + noteW / 2, y + 57.1, { style: "bold", size: 7, color: [255, 255, 255], align: "center" });
    }
    bx += bandColW[i];
  });
  y += bandH + 26;

  // ── From | Bill to ──────────────────────────────────────────────────────
  const colW = contentWidth / 2 - 14;
  const midX = margin + contentWidth / 2 + 14;
  const colTop = y;

  let ly = colTop;
  if (issuer) {
    label("From", margin, ly);
    ly = writeWrapped(issuer.legalName, margin, ly + 15, colW, 10.5, "bold", INK, 13.5);
    const fromLines = [
      ...issuer.addressLines,
      issuer.country,
      issuer.taxRegNo ? `Tax Reg. No: ${issuer.taxRegNo}` : undefined,
      issuer.email,
      issuer.phone,
      issuer.website,
    ].filter((l): l is string => Boolean(l));
    for (const line of fromLines) ly = writeWrapped(line, margin, ly, colW, 8.5, "normal", BODY, 12);
  }

  let ry = colTop;
  label("Bill to", midX, ry);
  if (billTo.companyName) {
    ry = writeWrapped(billTo.companyName, midX, ry + 15, colW, 10.5, "bold", INK, 13.5);
  } else {
    // No payer details on record — say so rather than printing a bare dash.
    ry = writeWrapped("Details not on record", midX, ry + 15, colW, 9, "normal", MUTED);
  }
  const billLines = [
    billTo.contactPerson ? `Attn: ${billTo.contactPerson}` : undefined,
    billTo.email,
    billTo.phone,
    ...billTo.lines,
    billTo.taxId ? `Tax ID: ${billTo.taxId}` : undefined,
  ].filter((l): l is string => Boolean(l));
  for (const line of billLines) ry = writeWrapped(line, midX, ry, colW, 8.5, "normal", BODY, 12);

  y = Math.max(ly, ry) + 14;

  // ── Details: plan, period, position, terms… ─────────────────────────────
  const details: Array<[string, string]> = facts
    .filter((f) => f.key !== "currency")
    .map((f): [string, string] => [factLabel(f.key), factValue(f.key, f.value)]);
  if (invoice.issuedByLabel) details.push(["Issued by", invoice.issuedByLabel]);

  if (details.length > 0) {
    const cols = 3;
    const cellW = contentWidth / cols;
    const rows = Math.ceil(details.length / cols);
    ensureSpace(rows * 28 + 16);
    hairline(y);
    y += 16;
    details.forEach(([k, v], i) => {
      const cx = margin + (i % cols) * cellW;
      const cy = y + Math.floor(i / cols) * 28;
      label(k, cx, cy);
      font(v, "normal", 9, INK);
      doc.text((doc.splitTextToSize(v, cellW - 12) as string[])[0] ?? "—", cx, cy + 12);
    });
    y += rows * 28 + 2;
  }
  y += 8;

  // ── Line items ──────────────────────────────────────────────────────────
  // A line linked to a hire names it underneath, smaller and grey, so the employer sees
  // what each fee is for without it reading as part of the description.
  const HIRE_SIZE = 7.8;
  const HIRE_LH = 10.5;
  const hireTexts = items.map((item) => hireLine(item.hire));
  // Description column = everything the fixed Qty / Unit price / Amount columns leave, less padding.
  const descTextWidth = contentWidth - 40 - 92 - 96 - 16;
  const hireLineCount = (text: string) => {
    font(text, "normal", HIRE_SIZE, MUTED);
    return (doc.splitTextToSize(text, descTextWidth) as string[]).length;
  };
  autoTable(doc, {
    startY: y,
    head: [["Description", "Qty", "Unit price", "Amount"]],
    body: items.map((item) => [
      item.description,
      String(item.quantity),
      money(item.unitPrice),
      money(item.amount),
    ]),
    theme: "plain",
    styles: { font: fonts.latin, textColor: BODY, fontSize: 8.8, cellPadding: { top: 9, bottom: 9, left: 8, right: 8 } },
    headStyles: { fillColor: TINT, textColor: MUTED, fontStyle: "bold", fontSize: 7, cellPadding: { top: 8, bottom: 8, left: 8, right: 8 } },
    columnStyles: {
      0: { cellWidth: "auto", textColor: INK },
      1: { cellWidth: 40, halign: "center" },
      2: { cellWidth: 92, halign: "right" },
      3: { cellWidth: 96, halign: "right", fontStyle: "bold", textColor: INK },
    },
    didParseCell: (data) => {
      if (data.section === "head") {
        data.cell.text = data.cell.text.map((t) => t.toUpperCase());
        if (data.column.index >= 2) data.cell.styles.halign = "right";
        if (data.column.index === 1) data.cell.styles.halign = "center";
      }
      if (fonts.arabic && hasArabic(data.cell.text.join(" "))) data.cell.styles.font = fonts.arabic;
      // Room under the description for the hire line, which didDrawCell draws.
      const hire = data.section === "body" && data.column.index === 0 ? hireTexts[data.row.index] : null;
      if (hire) {
        const pad = data.cell.styles.cellPadding as { top: number; bottom: number; left: number; right: number };
        data.cell.styles.cellPadding = { ...pad, bottom: pad.bottom + 3 + hireLineCount(hire) * HIRE_LH };
      }
    },
    didDrawCell: (data) => {
      if (data.section !== "body") return;
      const hire = data.column.index === 0 ? hireTexts[data.row.index] : null;
      if (hire) {
        font(hire, "normal", HIRE_SIZE, MUTED);
        const lines = doc.splitTextToSize(hire, data.cell.width - 16) as string[];
        const firstBaseline = data.cell.y + data.cell.height - 9 - (lines.length - 1) * HIRE_LH - 2;
        lines.forEach((line, i) => doc.text(line, data.cell.x + 8, firstBaseline + i * HIRE_LH));
      }
      doc.setDrawColor(...HAIRLINE);
      doc.setLineWidth(0.6);
      doc.line(data.cell.x, data.cell.y + data.cell.height, data.cell.x + data.cell.width, data.cell.y + data.cell.height);
    },
    margin: { left: margin, right: margin },
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  y = ((doc as any).lastAutoTable?.finalY ?? y + 50) + 18;

  // ── Totals (right) ──────────────────────────────────────────────────────
  const totalsW = 230;
  const totalsX = right - totalsW;
  const totalRows = resolveTotalRows(invoice).filter((r) => r.key !== "balance");
  ensureSpace(totalRows.length * 18 + 50);

  for (const row of totalRows) {
    const isTotal = row.key === "total";
    if (isTotal) {
      hairline(y - 9, totalsX, right);
      y += 4;
    }
    const size = isTotal ? 11 : 9;
    const style: Style = isTotal ? "bold" : "normal";
    write(totalRowLabel(row), totalsX + 10, y, { style, size, color: isTotal ? INK : MUTED });
    write(`${row.negative ? "– " : ""}${money(row.amount)}`, right - 10, y, { style, size, color: INK, align: "right" });
    y += isTotal ? 22 : 17;
  }

  if (owes) {
    y += 2;
    doc.setFillColor(...BRAND);
    doc.roundedRect(totalsX, y - 4, totalsW, 30, 5, 5, "F");
    write("Amount due", totalsX + 10, y + 15, { style: "bold", size: 10, color: [255, 255, 255] });
    write(money(state.balanceDue), right - 10, y + 15, { style: "bold", size: 12, color: [255, 255, 255], align: "right" });
    y += 36;
  }

  y += 10;

  // ── Commission summary (internal staff only) ────────────────────────────
  if (commissions.length > 0) {
    ensureSpace(26 + commissions.length * 13);
    label("Commission summary", margin, y);
    y += 14;
    for (const comm of commissions) {
      const roleLabel = comm.role === "agent" ? "Agent" : "Super Agent";
      const detail = ["admin", "super_agent", "agent"].includes(viewerRole) ? `: ${comm.rate}% = ${money(comm.amount)}` : "";
      write(`${roleLabel}${detail}`, margin, y, { size: 8.5 });
      y += 13;
    }
    y += 6;
  }

  // ── Payment instructions ────────────────────────────────────────────────
  // Only when money is actually owed, and only once bank details are on file.
  if (owes && issuer?.bank && issuer.hasBankDetails) {
    const bank = issuer.bank;
    const bankPairs = (
      [
        ["Bank", bank.bankName],
        ["Account name", bank.accountName],
        ["Account number", bank.accountNumber],
        ["IBAN", bank.iban],
        ["SWIFT / BIC", bank.swift],
        ["Branch", bank.branch],
      ] as Array<[string, string | undefined]>
    ).filter((p): p is [string, string] => Boolean(p[1]));

    const bankRows = Math.ceil(bankPairs.length / 2);
    const instruction =
      bank.instructions ?? `Please quote ${invoice.invoiceNumber ?? "the invoice number"} as the payment reference.`;
    const boxH = 34 + bankRows * 26 + 16;
    ensureSpace(boxH + 14);

    doc.setFillColor(...TINT);
    doc.roundedRect(margin, y, contentWidth, boxH, 6, 6, "F");
    doc.setFillColor(...BRAND);
    doc.rect(margin, y + 8, 3, boxH - 16, "F");
    write("How to pay", margin + 18, y + 20, { style: "bold", size: 10, color: INK });

    const half = (contentWidth - 36) / 2;
    bankPairs.forEach(([k, v], i) => {
      const cx = margin + 18 + (i % 2) * half;
      const cy = y + 40 + Math.floor(i / 2) * 26;
      label(k, cx, cy);
      write(v, cx, cy + 12, { size: 9, color: INK });
    });
    writeWrapped(instruction, margin + 18, y + 40 + bankRows * 26 + 2, contentWidth - 36, 8, "normal", MUTED, 10);
    y += boxH + 14;
  }

  // ── Notes ───────────────────────────────────────────────────────────────
  if (invoice.notes) {
    font(invoice.notes, "normal", 8.5, BODY);
    const noteLines = doc.splitTextToSize(invoice.notes, contentWidth) as string[];
    ensureSpace(noteLines.length * 12 + 16);
    label("Notes", margin, y);
    writeWrapped(invoice.notes, margin, y + 14, contentWidth, 8.5, "normal", BODY, 12);
  }

  // ── Footer on every page ────────────────────────────────────────────────
  const footerNote = issuer?.footerNote ?? "This is a computer-generated invoice. No signature required.";
  const pageCount = doc.getNumberOfPages();
  for (let p = 1; p <= pageCount; p += 1) {
    doc.setPage(p);
    const fy = pageHeight - 30;
    hairline(fy - 10);
    write(invoice.invoiceNumber ?? "", margin, fy, { size: 7, color: MUTED });
    font(footerNote, "normal", 7, MUTED);
    const note = (doc.splitTextToSize(footerNote, contentWidth - 160) as string[])[0] ?? "";
    write(note, pageWidth / 2, fy, { size: 7, color: MUTED, align: "center" });
    write(`Page ${p} of ${pageCount}`, right, fy, { size: 7, color: MUTED, align: "right" });
  }

  return Buffer.from(doc.output("arraybuffer"));
}
