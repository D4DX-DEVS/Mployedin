import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import fs from "fs";
import path from "path";
import {
  resolveBillTo,
  resolveLineItems,
  resolveTotalRows,
  invoiceFacts,
  paymentState,
  type PresentableInvoice,
  type BillToFallback,
  type InvoiceFactKey,
  type TotalRow,
} from "./presentation";
import type { ResolvedIssuer } from "./issuer";

/**
 * The invoice document, as printed.
 *
 * What each block contains is decided in `presentation.ts`, which the employer
 * dialog reads too — so a subscription invoice that shows a plan and a service
 * period on screen prints the same plan and service period here, and a bill-to
 * block that resolves on screen cannot print as an empty "—".
 */
export type PdfInvoice = PresentableInvoice & {
  issuedByLabel?: string;
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

function safeDate(value?: Date | string | null): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function fmt(amount: number, currency: string): string {
  return `${currency} ${amount.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

const FACT_LABELS: Record<InvoiceFactKey, string> = {
  plan: "Plan",
  billingCycle: "Billing Cycle",
  servicePeriod: "Service Period",
  renewalType: "Type",
  job: "Job",
  category: "Category",
  currency: "Currency",
  paymentTerms: "Payment Terms",
};

/** English labels for the totals ladder; the dialog translates the same keys. */
function totalRowLabel(row: TotalRow): string {
  switch (row.key) {
    case "subtotal":
      return "Subtotal";
    case "discount":
      return row.meta?.discountPercent
        ? `Discount (${row.meta.discountPercent}%)`
        : "Discount";
    case "tax": {
      const name = row.meta?.taxType ?? "Tax";
      return row.meta?.taxPercent ? `${name} (${row.meta.taxPercent}%)` : name;
    }
    case "serviceCharge":
      return "Service Charge";
    case "paid":
      return "Paid";
    case "balance":
      return "Balance Due";
    case "total":
    default:
      return "Total";
  }
}

let cachedLogoBase64: string | null | undefined;

function getLogoBase64(): string | null {
  if (cachedLogoBase64 !== undefined) return cachedLogoBase64;
  try {
    const logoPath = path.join(process.cwd(), "public", "logo.png");
    const logoData = fs.readFileSync(logoPath);
    cachedLogoBase64 = `data:image/png;base64,${logoData.toString("base64")}`;
  } catch {
    cachedLogoBase64 = null;
  }
  return cachedLogoBase64;
}

export function generateInvoicePdf(
  invoice: PdfInvoice,
  options: GeneratePdfOptions | ViewerRole = {},
): Buffer {
  // Callers used to pass the viewer role positionally.
  const opts: GeneratePdfOptions = typeof options === "string" ? { viewerRole: options } : options;
  const viewerRole = opts.viewerRole ?? "employer";
  const issuer = opts.issuer;

  const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth(); // ~595pt
  const pageHeight = doc.internal.pageSize.getHeight(); // ~842pt
  const margin = 36;
  const contentWidth = pageWidth - margin * 2;
  const bottomLimit = pageHeight - 56;
  let y = margin;

  const brandBlue: [number, number, number] = [40, 69, 149]; // #284595
  const brandDark: [number, number, number] = [30, 47, 108]; // #1e2f6c
  const brandCyan: [number, number, number] = [75, 186, 221]; // #4BBADD
  const mutedText: [number, number, number] = [110, 116, 130];
  const bodyText: [number, number, number] = [50, 50, 50];

  const currency = invoice.currency || "AED";
  const state = paymentState(invoice);
  const billTo = resolveBillTo(invoice, opts.billToFallback);
  const items = resolveLineItems(invoice);
  const facts = invoiceFacts(invoice, { formatDate: (d) => safeDate(d) });
  const commissions = invoice.commissions ?? [];

  /** Start a new page when the next block would run off the bottom. */
  const ensureSpace = (needed: number) => {
    if (y + needed > bottomLimit) {
      doc.addPage();
      y = margin;
    }
  };

  // ── Header: logo + INVOICE + number ─────────────────────────────────────
  const logoBase64 = getLogoBase64();
  if (logoBase64) {
    doc.addImage(logoBase64, "PNG", margin, y, 120, 30);
  } else {
    doc.setFontSize(16);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...brandDark);
    doc.text(issuer?.legalName ?? "mployedin", margin, y + 18);
  }

  doc.setFontSize(20);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...brandBlue);
  doc.text("INVOICE", pageWidth - margin, y + 16, { align: "right" });
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...mutedText);
  doc.text(invoice.invoiceNumber ?? "—", pageWidth - margin, y + 29, { align: "right" });
  y += 40;

  doc.setFillColor(...brandBlue);
  doc.rect(margin, y, contentWidth, 3, "F");
  y += 16;

  // ── Status stamp ────────────────────────────────────────────────────────
  // Drawn before the body so the content sits on top of it. A void or paid
  // invoice used to print identically to a live one, which is how a voided
  // document can end up being paid.
  if (state.stamp) {
    const stampText = state.stamp.toUpperCase();
    const stampColor: [number, number, number] =
      state.stamp === "paid" ? [206, 232, 213] : state.stamp === "void" ? [214, 214, 218] : [247, 214, 214];
    doc.saveGraphicsState();
    doc.setFont("helvetica", "bold");
    doc.setFontSize(74);
    doc.setTextColor(...stampColor);
    doc.text(stampText, pageWidth / 2, pageHeight / 2, {
      align: "center",
      angle: 28,
      baseline: "middle",
    });
    doc.restoreGraphicsState();
  }

  // ── FROM | BILL TO ──────────────────────────────────────────────────────
  const midX = margin + contentWidth * 0.52;
  const colTop = y;
  const leftColWidth = contentWidth * 0.48 - 10;
  const rightColWidth = pageWidth - margin - midX;

  const columnHeading = (text: string, x: number, atY: number) => {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(...brandBlue);
    doc.text(text, x, atY);
  };

  /** Write wrapped lines and return the y position after them. */
  const writeLines = (lines: string[], x: number, startY: number, maxWidth: number): number => {
    let ly = startY;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(...bodyText);
    for (const line of lines) {
      const wrapped = doc.splitTextToSize(line, maxWidth);
      doc.text(wrapped, x, ly);
      ly += wrapped.length * 11;
    }
    return ly;
  };

  // FROM
  let ly = colTop;
  if (issuer) {
    columnHeading("FROM", margin, ly);
    ly += 13;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(...brandDark);
    const nameLines = doc.splitTextToSize(issuer.legalName, leftColWidth);
    doc.text(nameLines, margin, ly);
    ly += nameLines.length * 11;

    const fromLines = [
      ...issuer.addressLines,
      issuer.country,
      issuer.taxRegNo ? `Tax Reg. No: ${issuer.taxRegNo}` : undefined,
      issuer.email,
      issuer.phone,
      issuer.website,
    ].filter((l): l is string => Boolean(l));
    ly = writeLines(fromLines, margin, ly, leftColWidth);
  }
  const leftEndY = ly;

  // BILL TO
  let ry = colTop;
  columnHeading("BILL TO", midX, ry);
  ry += 13;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(...brandDark);
  if (billTo.companyName) {
    const cn = doc.splitTextToSize(billTo.companyName, rightColWidth);
    doc.text(cn, midX, ry);
    ry += cn.length * 11;
  } else {
    // No payer details on record — say so rather than printing a bare dash.
    doc.setFont("helvetica", "italic");
    doc.setFontSize(8.5);
    doc.setTextColor(...mutedText);
    doc.text("Details not on record", midX, ry);
    ry += 11;
  }

  const billLines = [
    billTo.contactPerson,
    billTo.email,
    billTo.phone,
    ...billTo.lines,
    billTo.taxId ? `Tax ID: ${billTo.taxId}` : undefined,
  ].filter((l): l is string => Boolean(l));
  ry = writeLines(billLines, midX, ry, rightColWidth);

  y = Math.max(leftEndY, ry) + 12;

  // ── Invoice meta band ───────────────────────────────────────────────────
  // Invoice number, dates, status and the category-specific facts — the plan,
  // billing cycle and service period a subscription invoice carries, or the
  // job a recruitment invoice was raised against.
  const metaPairs: Array<[string, string]> = [
    ["Invoice No", invoice.invoiceNumber ?? "—"],
    ["Issue Date", safeDate(invoice.issuedAt ?? invoice.createdAt)],
    ["Due Date", safeDate(invoice.dueDate)],
    ["Status", (invoice.status ?? "—").replace(/_/g, " ").toUpperCase()],
    ...facts
      .filter((f) => f.key !== "currency")
      .map((f): [string, string] => [FACT_LABELS[f.key], f.value]),
  ];
  if (invoice.issuedByLabel) metaPairs.push(["Issued By", invoice.issuedByLabel]);

  const metaCols = 3;
  const metaColWidth = contentWidth / metaCols;
  const metaRows = Math.ceil(metaPairs.length / metaCols);
  const metaRowHeight = 24;
  const metaHeight = metaRows * metaRowHeight + 8;

  ensureSpace(metaHeight + 20);
  doc.setFillColor(246, 248, 252);
  doc.roundedRect(margin, y, contentWidth, metaHeight, 4, 4, "F");

  metaPairs.forEach((pair, i) => {
    const col = i % metaCols;
    const row = Math.floor(i / metaCols);
    const cellX = margin + col * metaColWidth + 8;
    const cellY = y + 14 + row * metaRowHeight;
    const cellW = metaColWidth - 16;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(6.5);
    doc.setTextColor(...mutedText);
    doc.text(pair[0].toUpperCase(), cellX, cellY);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(...bodyText);
    const value = doc.splitTextToSize(pair[1], cellW)[0] ?? "—";
    doc.text(value, cellX, cellY + 10);
  });
  y += metaHeight + 16;

  // ── Line items ──────────────────────────────────────────────────────────
  autoTable(doc, {
    startY: y,
    head: [["#", "Description", "Qty", "Unit Price", "Amount"]],
    body: items.map((item, i) => [
      String(i + 1),
      item.description,
      String(item.quantity),
      fmt(item.unitPrice, currency),
      fmt(item.amount, currency),
    ]),
    theme: "grid",
    headStyles: {
      fillColor: brandBlue,
      textColor: 255,
      fontSize: 8.5,
      cellPadding: 5,
      fontStyle: "bold",
    },
    bodyStyles: { fontSize: 8, cellPadding: 5, textColor: [40, 40, 40] },
    alternateRowStyles: { fillColor: [245, 248, 255] },
    columnStyles: {
      0: { cellWidth: 20, halign: "center" },
      1: { cellWidth: "auto" },
      2: { cellWidth: 28, halign: "center" },
      3: { cellWidth: 72, halign: "right" },
      4: { cellWidth: 72, halign: "right" },
    },
    margin: { left: margin, right: margin },
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  y = (doc as any).lastAutoTable?.finalY ?? y + 50;
  y += 14;

  // ── Totals ──────────────────────────────────────────────────────────────
  const totalsX = pageWidth - margin - 190;
  const valX = pageWidth - margin;

  const addTotalRow = (
    label: string,
    value: string,
    variant: "plain" | "total" | "payable" = "plain",
  ) => {
    ensureSpace(18);
    if (variant === "total") {
      doc.setFillColor(...brandBlue);
      doc.rect(totalsX - 6, y - 9, valX - totalsX + 12, 16, "F");
      doc.setTextColor(255, 255, 255);
    } else if (variant === "payable") {
      doc.setFillColor(255, 244, 230);
      doc.rect(totalsX - 6, y - 9, valX - totalsX + 12, 16, "F");
      doc.setTextColor(150, 80, 10);
    } else {
      doc.setTextColor(...bodyText);
    }
    doc.setFont("helvetica", variant === "plain" ? "normal" : "bold");
    doc.setFontSize(variant === "plain" ? 8.5 : 9.5);
    doc.text(label, totalsX, y);
    doc.text(value, valX, y, { align: "right" });
    y += variant === "plain" ? 13 : 19;
  };

  // `balance` is re-stated below as Amount Payable, which also covers invoices
  // with no payment yet — those never reached a balance row at all before.
  for (const row of resolveTotalRows(invoice).filter((r) => r.key !== "balance")) {
    addTotalRow(
      `${totalRowLabel(row)}:`,
      `${row.negative ? "- " : ""}${fmt(row.amount, currency)}`,
      row.key === "total" ? "total" : "plain",
    );
  }

  if (state.hasBalance) {
    addTotalRow("Amount Payable:", fmt(state.balanceDue, currency), "payable");
  }

  // ── Commission summary (internal staff only) ────────────────────────────
  if (commissions.length > 0) {
    ensureSpace(24 + commissions.length * 11);
    y += 6;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);
    doc.setTextColor(...brandBlue);
    doc.text("Commission Summary", margin, y);
    y += 11;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...bodyText);
    for (const comm of commissions) {
      const roleLabel = comm.role === "agent" ? "Agent" : "Super Agent";
      const detailStr = ["admin", "super_agent", "agent"].includes(viewerRole)
        ? `: ${comm.rate}% = ${fmt(comm.amount, currency)}`
        : "";
      doc.text(`${roleLabel}${detailStr}`, margin + 6, y);
      y += 11;
    }
  }

  // ── Payment instructions ────────────────────────────────────────────────
  // Only when money is actually owed, and only once bank details are on file.
  if (state.hasBalance && issuer?.bank && issuer.hasBankDetails) {
    const bank = issuer.bank;
    const bankPairs: Array<[string, string]> = [
      ["Bank", bank.bankName],
      ["Account Name", bank.accountName],
      ["Account Number", bank.accountNumber],
      ["IBAN", bank.iban],
      ["SWIFT/BIC", bank.swift],
      ["Branch", bank.branch],
    ].filter((p): p is [string, string] => Boolean(p[1]));

    const bankCols = 2;
    const bankRows = Math.ceil(bankPairs.length / bankCols);
    const reference = `Please quote ${invoice.invoiceNumber ?? "the invoice number"} as the payment reference.`;
    const instructionText = bank.instructions ?? reference;
    const boxHeight = 30 + bankRows * 22 + 14;

    ensureSpace(boxHeight + 14);
    y += 8;
    doc.setDrawColor(210, 220, 240);
    doc.setFillColor(248, 250, 255);
    doc.roundedRect(margin, y, contentWidth, boxHeight, 4, 4, "FD");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);
    doc.setTextColor(...brandBlue);
    doc.text("PAYMENT INSTRUCTIONS", margin + 10, y + 16);

    const bankColWidth = (contentWidth - 20) / bankCols;
    bankPairs.forEach((pair, i) => {
      const col = i % bankCols;
      const row = Math.floor(i / bankCols);
      const cellX = margin + 10 + col * bankColWidth;
      const cellY = y + 32 + row * 22;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(6.5);
      doc.setTextColor(...mutedText);
      doc.text(pair[0].toUpperCase(), cellX, cellY);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8.5);
      doc.setTextColor(...bodyText);
      doc.text(doc.splitTextToSize(pair[1], bankColWidth - 10)[0] ?? "", cellX, cellY + 10);
    });

    doc.setFont("helvetica", "italic");
    doc.setFontSize(7.5);
    doc.setTextColor(...mutedText);
    doc.text(
      doc.splitTextToSize(instructionText, contentWidth - 20),
      margin + 10,
      y + 32 + bankRows * 22 + 4,
    );
    y += boxHeight + 12;
  }

  // ── Notes ───────────────────────────────────────────────────────────────
  if (invoice.notes) {
    const noteLines = doc.splitTextToSize(invoice.notes, contentWidth - 50);
    ensureSpace(noteLines.length * 10 + 18);
    y += 4;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);
    doc.setTextColor(...brandDark);
    doc.text("Notes:", margin, y);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...bodyText);
    doc.setFontSize(8);
    doc.text(noteLines, margin + 44, y);
    y += noteLines.length * 10;
  }

  // ── Footer on every page ────────────────────────────────────────────────
  const footerNote =
    issuer?.footerNote ?? "This is a computer-generated invoice. No signature required.";
  const pageCount = doc.getNumberOfPages();
  for (let p = 1; p <= pageCount; p += 1) {
    doc.setPage(p);
    const footerY = pageHeight - 28;
    doc.setFillColor(...brandCyan);
    doc.rect(margin, footerY - 8, contentWidth, 1.5, "F");
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(140, 140, 140);
    doc.text(invoice.invoiceNumber ?? "", margin, footerY + 3);
    doc.text(footerNote, pageWidth / 2, footerY + 3, { align: "center" });
    doc.text(`Page ${p} of ${pageCount}`, pageWidth - margin, footerY + 3, { align: "right" });
  }

  return Buffer.from(doc.output("arraybuffer"));
}
