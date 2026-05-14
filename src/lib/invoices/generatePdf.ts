/**
 * Server-side invoice PDF generation using jsPDF + jspdf-autotable.
 *
 * Generates a professional invoice PDF buffer that can be returned
 * as a download or attached to an email.
 */

import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import type { IInvoice } from "@/models/Invoice";

/** Populated invoice with employer/agent/job references resolved */
export interface PopulatedInvoice
  extends Omit<IInvoice, "employerId" | "agentId" | "jobId"> {
  employerId?: {
    _id: unknown;
    companyName?: string;
    companyEmail?: string;
    phone?: string;
    address?: string;
    country?: string;
    taxId?: string;
  } | null;
  agentId?: { _id: unknown; userId?: unknown; commissionRate?: number } | null;
  jobId?: { _id: unknown; title?: string } | null;
}

function fmt(n: number, currency: string): string {
  return `${currency} ${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function safeDate(d: Date | string | undefined): string {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function generateInvoicePdf(invoice: PopulatedInvoice): Buffer {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 15;
  let y = margin;

  // ── Header ──────────────────────────────────────────────────────────────
  doc.setFontSize(22);
  doc.setFont("helvetica", "bold");
  doc.text("INVOICE", margin, y + 8);

  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(100);
  doc.text("Mployedin", pageWidth - margin, y + 2, { align: "right" });
  doc.text("www.mployedin.com", pageWidth - margin, y + 7, { align: "right" });
  y += 16;

  // ── Line ────────────────────────────────────────────────────────────────
  doc.setDrawColor(41, 128, 185);
  doc.setLineWidth(0.8);
  doc.line(margin, y, pageWidth - margin, y);
  y += 8;

  // ── Invoice details (left) & Billing (right) ───────────────────────────
  doc.setTextColor(0);
  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.text("Invoice Number:", margin, y);
  doc.setFont("helvetica", "normal");
  doc.text(invoice.invoiceNumber ?? "—", margin + 35, y);
  y += 5;

  doc.setFont("helvetica", "bold");
  doc.text("Issue Date:", margin, y);
  doc.setFont("helvetica", "normal");
  doc.text(safeDate(invoice.issuedAt ?? invoice.createdAt), margin + 35, y);
  y += 5;

  doc.setFont("helvetica", "bold");
  doc.text("Due Date:", margin, y);
  doc.setFont("helvetica", "normal");
  doc.text(safeDate(invoice.dueDate), margin + 35, y);
  y += 5;

  doc.setFont("helvetica", "bold");
  doc.text("Status:", margin, y);
  doc.setFont("helvetica", "normal");
  doc.text((invoice.status ?? "—").toUpperCase(), margin + 35, y);
  y += 5;

  if (invoice.category) {
    doc.setFont("helvetica", "bold");
    doc.text("Category:", margin, y);
    doc.setFont("helvetica", "normal");
    doc.text(invoice.category.replace(/_/g, " ").toUpperCase(), margin + 35, y);
    y += 5;
  }

  // Billing details (right column)
  const billing = invoice.billingDetails;
  const employer = invoice.employerId;
  const rightX = pageWidth / 2 + 10;
  let ry = y - 25; // align with left column start

  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text("Bill To:", rightX, ry);
  ry += 5;
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");

  const companyName =
    billing?.companyName ??
    (typeof employer === "object" && employer ? employer.companyName : undefined) ??
    "—";
  doc.text(companyName, rightX, ry);
  ry += 4;

  if (billing?.contactPerson) {
    doc.text(billing.contactPerson, rightX, ry);
    ry += 4;
  }
  if (billing?.email || (typeof employer === "object" && employer?.companyEmail)) {
    doc.text(billing?.email ?? employer?.companyEmail ?? "", rightX, ry);
    ry += 4;
  }
  if (billing?.phone || (typeof employer === "object" && employer?.phone)) {
    doc.text(billing?.phone ?? employer?.phone ?? "", rightX, ry);
    ry += 4;
  }
  if (billing?.address) {
    doc.text(billing.address, rightX, ry);
    ry += 4;
  }
  const cityState = [billing?.city, billing?.state, billing?.postalCode]
    .filter(Boolean)
    .join(", ");
  if (cityState) {
    doc.text(cityState, rightX, ry);
    ry += 4;
  }
  if (billing?.country || (typeof employer === "object" && employer?.country)) {
    doc.text(billing?.country ?? employer?.country ?? "", rightX, ry);
    ry += 4;
  }
  if (billing?.taxId || (typeof employer === "object" && employer?.taxId)) {
    doc.text(`Tax ID: ${billing?.taxId ?? employer?.taxId ?? ""}`, rightX, ry);
    ry += 4;
  }

  y = Math.max(y, ry) + 8;

  // ── Job Reference ───────────────────────────────────────────────────────
  const jobTitle =
    typeof invoice.jobId === "object" && invoice.jobId
      ? (invoice.jobId as { title?: string }).title
      : undefined;
  if (jobTitle) {
    doc.setFont("helvetica", "bold");
    doc.text("Job:", margin, y);
    doc.setFont("helvetica", "normal");
    doc.text(jobTitle, margin + 35, y);
    y += 8;
  }

  // ── Line Items Table ────────────────────────────────────────────────────
  const currency = invoice.currency || "AED";
  const lineRows = (invoice.lineItems ?? []).map((item, i) => [
    String(i + 1),
    item.description || "—",
    String(item.quantity ?? 1),
    fmt(item.unitPrice ?? 0, currency),
    fmt(item.amount ?? 0, currency),
  ]);

  if (lineRows.length === 0) {
    lineRows.push([
      "1",
      invoice.description || invoice.planName || "Service",
      "1",
      fmt(invoice.subtotal ?? invoice.amount ?? 0, currency),
      fmt(invoice.subtotal ?? invoice.amount ?? 0, currency),
    ]);
  }

  autoTable(doc, {
    startY: y,
    head: [["#", "Description", "Qty", "Unit Price", "Amount"]],
    body: lineRows,
    theme: "striped",
    headStyles: { fillColor: [41, 128, 185], textColor: 255, fontSize: 9 },
    bodyStyles: { fontSize: 8 },
    columnStyles: {
      0: { cellWidth: 10, halign: "center" },
      1: { cellWidth: "auto" },
      2: { cellWidth: 15, halign: "center" },
      3: { cellWidth: 35, halign: "right" },
      4: { cellWidth: 35, halign: "right" },
    },
    margin: { left: margin, right: margin },
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  y = (doc as any).lastAutoTable?.finalY ?? y + 30;
  y += 8;

  // ── Totals ──────────────────────────────────────────────────────────────
  const totalsX = pageWidth - margin - 75;
  const valX = pageWidth - margin;

  const addTotalRow = (label: string, value: string, bold = false) => {
    doc.setFont("helvetica", bold ? "bold" : "normal");
    doc.setFontSize(bold ? 10 : 9);
    doc.text(label, totalsX, y);
    doc.text(value, valX, y, { align: "right" });
    y += 5;
  };

  addTotalRow("Subtotal:", fmt(invoice.subtotal ?? 0, currency));

  if (invoice.discountAmount && invoice.discountAmount > 0) {
    addTotalRow(
      `Discount (${invoice.discountPercent ?? 0}%):`,
      `- ${fmt(invoice.discountAmount, currency)}`,
    );
  }
  if (invoice.taxAmount && invoice.taxAmount > 0) {
    const taxLabel = invoice.taxType !== "none" ? invoice.taxType?.toUpperCase() : "Tax";
    addTotalRow(
      `${taxLabel} (${invoice.taxPercent ?? 0}%):`,
      fmt(invoice.taxAmount, currency),
    );
  }
  if (invoice.serviceCharge && invoice.serviceCharge > 0) {
    addTotalRow("Service Charge:", fmt(invoice.serviceCharge, currency));
  }

  y += 2;
  doc.setDrawColor(41, 128, 185);
  doc.line(totalsX, y, valX, y);
  y += 6;
  addTotalRow("Total:", fmt(invoice.totalAmount ?? invoice.amount ?? 0, currency), true);

  if ((invoice.paidAmount ?? 0) > 0) {
    y += 2;
    addTotalRow("Paid:", fmt(invoice.paidAmount ?? 0, currency));
    addTotalRow("Balance Due:", fmt(invoice.balanceDue ?? 0, currency), true);
  }

  // ── Payment Terms ──────────────────────────────────────────────────────
  y += 10;
  if (invoice.paymentTerms) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.text("Payment Terms:", margin, y);
    doc.setFont("helvetica", "normal");
    const terms =
      invoice.paymentTerms === "custom"
        ? `Custom (${invoice.customPaymentDays ?? 0} days)`
        : invoice.paymentTerms.replace(/_/g, " ").toUpperCase();
    doc.text(terms, margin + 35, y);
    y += 6;
  }

  // ── Notes ──────────────────────────────────────────────────────────────
  if (invoice.notes) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.text("Notes:", margin, y);
    y += 4;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    const lines = doc.splitTextToSize(invoice.notes, pageWidth - margin * 2);
    doc.text(lines, margin, y);
    y += lines.length * 4 + 4;
  }

  // ── Footer ─────────────────────────────────────────────────────────────
  const footerY = doc.internal.pageSize.getHeight() - 12;
  doc.setFontSize(7);
  doc.setTextColor(150);
  doc.text(
    "This is a computer-generated invoice. No signature required.",
    pageWidth / 2,
    footerY,
    { align: "center" },
  );
  doc.text(
    `Generated on ${new Date().toLocaleDateString("en-GB")}`,
    pageWidth / 2,
    footerY + 4,
    { align: "center" },
  );

  return Buffer.from(doc.output("arraybuffer"));
}
