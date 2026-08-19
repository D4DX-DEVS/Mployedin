import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import fs from "fs";
import path from "path";

type PopulatedInvoice = {
  invoiceNumber?: string;
  issuedAt?: Date | string | null;
  createdAt?: Date | string | null;
  dueDate?: Date | string | null;
  status?: string;
  category?: string;
  issuedByLabel?: string;
  billingDetails?: {
    companyName?: string;
    contactPerson?: string;
    email?: string;
    phone?: string;
    address?: string;
    city?: string;
    state?: string;
    postalCode?: string;
    country?: string;
    taxId?: string;
  };
  employerId?: {
    companyName?: string;
    companyEmail?: string;
    phone?: string;
    country?: string;
    taxId?: string;
  } | string | null;
  jobId?: { title?: string } | string | null;
  currency?: string;
  lineItems?: Array<{
    description?: string;
    quantity?: number;
    unitPrice?: number;
    amount?: number;
  }>;
  description?: string;
  planName?: string;
  subtotal?: number;
  amount?: number;
  discountAmount?: number;
  discountPercent?: number;
  taxAmount?: number;
  taxType?: string;
  taxPercent?: number;
  serviceCharge?: number;
  totalAmount?: number;
  paidAmount?: number;
  balanceDue?: number;
  commissions?: Array<{ role: string; rate: number; amount: number }>;
  paymentTerms?: string;
  customPaymentDays?: number;
  notes?: string;
};

type ViewerRole = "admin" | "super_agent" | "agent" | "employer" | "job_seeker" | (string & {});

function safeDate(value?: Date | string | null): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function fmt(amount: number, currency: string): string {
  return `${currency} ${amount.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
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

export function generateInvoicePdf(invoice: PopulatedInvoice, viewerRole: ViewerRole = "employer"): Buffer {
  const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth(); // ~595pt
  const pageHeight = doc.internal.pageSize.getHeight(); // ~842pt
  const margin = 36;
  const contentWidth = pageWidth - margin * 2;
  const labelW = 82;
  let y = margin;

  // Rates/amounts are redacted per-row below for non-staff viewers
  const commissions = invoice.commissions ?? [];

  // ── Brand Colors ────────────────────────────────────────────────────────
  const brandBlue: [number, number, number] = [40, 69, 149]; // #284595
  const brandDark: [number, number, number] = [30, 47, 108]; // #1e2f6c
  const brandCyan: [number, number, number] = [75, 186, 221]; // #4BBADD

  // ── Logo + Header ──────────────────────────────────────────────────────
  const logoBase64 = getLogoBase64();
  if (logoBase64) {
    doc.addImage(logoBase64, "PNG", margin, y, 120, 30);
  } else {
    // Fallback: text-based logo
    doc.setFontSize(16);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...brandDark);
    doc.text("mployedin", margin, y + 18);
  }

  // "INVOICE" title right-aligned
  doc.setFontSize(20);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...brandBlue);
  doc.text("INVOICE", pageWidth - margin, y + 20, { align: "right" });
  y += 36;

  // ── Accent bar ─────────────────────────────────────────────────────────
  doc.setFillColor(...brandBlue);
  doc.rect(margin, y, contentWidth, 3, "F");
  y += 14;

  // ── Two-column: Invoice Details (left) | Bill To (right) ───────────────
  const midX = margin + contentWidth * 0.52;
  const detailsStartY = y;

  doc.setTextColor(60, 60, 60);
  doc.setFontSize(8.5);

  // Left: Invoice details
  const addField = (label: string, value: string) => {
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...brandDark);
    doc.text(label, margin, y);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(50, 50, 50);
    doc.text(value, margin + labelW, y);
    y += 13;
  };

  addField("Invoice No:", invoice.invoiceNumber ?? "—");
  addField("Issue Date:", safeDate(invoice.issuedAt ?? invoice.createdAt));
  addField("Due Date:", safeDate(invoice.dueDate));
  addField("Status:", (invoice.status ?? "—").toUpperCase());
  if (invoice.category) {
    addField("Category:", invoice.category.replace(/_/g, " ").toUpperCase());
  }
  if (invoice.issuedByLabel) {
    addField("Issued By:", invoice.issuedByLabel);
  }

  const leftEndY = y;

  // Right: Bill To
  const billing = invoice.billingDetails;
  const employer = invoice.employerId;
  let ry = detailsStartY;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(...brandBlue);
  doc.text("BILL TO", midX, ry);
  ry += 13;

  doc.setFontSize(8.5);
  const companyName =
    billing?.companyName ??
    (typeof employer === "object" && employer ? employer.companyName : undefined) ??
    "—";

  doc.setFont("helvetica", "bold");
  doc.setTextColor(...brandDark);
  doc.text(companyName, midX, ry);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(50, 50, 50);
  ry += 12;

  const billingLines: string[] = [];
  if (billing?.contactPerson) billingLines.push(billing.contactPerson);
  const emailAddr = billing?.email ?? (typeof employer === "object" && employer?.companyEmail ? employer.companyEmail : "");
  const phoneNum = billing?.phone ?? (typeof employer === "object" && employer?.phone ? employer.phone : "");
  if (emailAddr) billingLines.push(emailAddr);
  if (phoneNum) billingLines.push(phoneNum);
  if (billing?.address) billingLines.push(billing.address);
  const cityState = [billing?.city, billing?.state, billing?.postalCode].filter(Boolean).join(", ");
  if (cityState) billingLines.push(cityState);
  const country = billing?.country ?? (typeof employer === "object" && employer?.country ? employer.country : "");
  const employerTaxId = typeof employer === "object" && employer?.taxId ? employer.taxId : "";
  if (country) billingLines.push(country);
  if (billing?.taxId || employerTaxId) {
    billingLines.push(`Tax ID: ${billing?.taxId ?? employerTaxId}`);
  }

  const rightColMaxW = pageWidth - margin - midX;
  for (const line of billingLines) {
    const wrapped = doc.splitTextToSize(line, rightColMaxW);
    doc.text(wrapped, midX, ry);
    ry += wrapped.length * 11;
  }

  y = Math.max(leftEndY, ry) + 10;

  // ── Job Reference ───────────────────────────────────────────────────────
  const jobTitle =
    typeof invoice.jobId === "object" && invoice.jobId
      ? (invoice.jobId as { title?: string }).title
      : undefined;
  if (jobTitle) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);
    doc.setTextColor(...brandDark);
    doc.text("Job:", margin, y);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(50, 50, 50);
    doc.text(jobTitle, margin + labelW, y);
    y += 14;
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
    theme: "grid",
    headStyles: {
      fillColor: brandBlue,
      textColor: 255,
      fontSize: 8.5,
      cellPadding: 5,
      fontStyle: "bold",
    },
    bodyStyles: { fontSize: 8, cellPadding: 4, textColor: [40, 40, 40] },
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
  y += 12;

  // ── Totals ──────────────────────────────────────────────────────────────
  const totalsX = pageWidth - margin - 180;
  const valX = pageWidth - margin;

  const addTotalRow = (label: string, value: string, bold = false, highlight = false) => {
    if (highlight) {
      doc.setFillColor(...brandBlue);
      doc.rect(totalsX - 4, y - 9, valX - totalsX + 8, 14, "F");
      doc.setTextColor(255, 255, 255);
    } else {
      doc.setTextColor(50, 50, 50);
    }
    doc.setFont("helvetica", bold ? "bold" : "normal");
    doc.setFontSize(bold ? 9.5 : 8.5);
    doc.text(label, totalsX, y);
    doc.text(value, valX, y, { align: "right" });
    y += 13;
    if (highlight) doc.setTextColor(50, 50, 50);
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

  y += 3;
  addTotalRow("Total:", fmt(invoice.totalAmount ?? invoice.amount ?? 0, currency), true, true);
  y += 2;

  if ((invoice.paidAmount ?? 0) > 0) {
    addTotalRow("Paid:", fmt(invoice.paidAmount ?? 0, currency));
    addTotalRow("Balance Due:", fmt(invoice.balanceDue ?? 0, currency), true);
  }

  // ── Commission Summary ──────────────────────────────────────────────────
  if (commissions.length > 0) {
    y += 10;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);
    doc.setTextColor(...brandBlue);
    doc.text("Commission Summary", margin, y);
    y += 11;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(50, 50, 50);
    for (const comm of commissions) {
      const roleLabel = comm.role === "agent" ? "Agent" : "Super Agent";
      // Show rates/amounts only if viewer is internal staff
      const detailStr = ["admin", "super_agent", "agent"].includes(viewerRole)
        ? `: ${comm.rate}% = ${fmt(comm.amount, currency)}`
        : "";
      doc.text(`${roleLabel}${detailStr}`, margin + 6, y);
      y += 11;
    }
  }

  // ── Payment Terms & Notes (inline) ─────────────────────────────────────
  y += 10;
  if (invoice.paymentTerms) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);
    doc.setTextColor(...brandDark);
    doc.text("Payment Terms:", margin, y);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(50, 50, 50);
    const terms =
      invoice.paymentTerms === "custom"
        ? `Custom (${invoice.customPaymentDays ?? 0} days)`
        : invoice.paymentTerms.replace(/_/g, " ").toUpperCase();
    doc.text(terms, margin + labelW, y);
    y += 12;
  }

  if (invoice.notes) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);
    doc.setTextColor(...brandDark);
    doc.text("Notes:", margin, y);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(50, 50, 50);
    doc.setFontSize(8);
    const noteLines = doc.splitTextToSize(invoice.notes, contentWidth - 50);
    doc.text(noteLines, margin + 40, y);
    y += noteLines.length * 10;
  }

  // ── Footer (bottom accent bar + text) ──────────────────────────────────
  const footerY = pageHeight - 28;
  doc.setFillColor(...brandCyan);
  doc.rect(margin, footerY - 6, contentWidth, 1.5, "F");
  doc.setFontSize(7);
  doc.setTextColor(120, 120, 120);
  doc.text(
    "This is a computer-generated invoice. No signature required.",
    pageWidth / 2,
    footerY + 4,
    { align: "center" },
  );

  return Buffer.from(doc.output("arraybuffer"));
}
