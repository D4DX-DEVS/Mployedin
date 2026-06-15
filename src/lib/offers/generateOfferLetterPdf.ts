import { jsPDF } from "jspdf";
import fs from "fs";
import path from "path";

/**
 * Offer-letter PDF generator (FG-6).
 *
 * Renders a clean, single-page offer letter from an Offer record, including the
 * company header, the headline terms (salary, start date), benefits/notes, and
 * a signature block that reflects the candidate's captured e-signature when the
 * offer has been accepted. Mirrors the styling conventions of the invoice PDF.
 */

export interface OfferLetterData {
  companyName: string;
  candidateName: string;
  jobTitle: string;
  salary: { amount: number; currency: string; period: string };
  startDate?: Date | string | null;
  benefits?: string;
  notes?: string;
  expiresAt?: Date | string | null;
  createdAt?: Date | string | null;
  status: string;
  signature?: { fullName?: string; signedAt?: Date | string | null };
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

function safeDate(value?: Date | string | null): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" });
}

export function generateOfferLetterPdf(data: OfferLetterData): Buffer {
  const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 48;
  const contentWidth = pageWidth - margin * 2;
  let y = margin;

  const brandDark: [number, number, number] = [30, 47, 108];
  const ink: [number, number, number] = [40, 44, 56];
  const muted: [number, number, number] = [110, 116, 128];

  // ── Header ──────────────────────────────────────────────
  const logo = getLogoBase64();
  if (logo) {
    doc.addImage(logo, "PNG", margin, y, 120, 30);
  } else {
    doc.setFontSize(16);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...brandDark);
    doc.text("mployedin", margin, y + 18);
  }

  doc.setFontSize(20);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...brandDark);
  doc.text("OFFER LETTER", pageWidth - margin, y + 16, { align: "right" });
  y += 56;

  doc.setDrawColor(...brandDark);
  doc.setLineWidth(1);
  doc.line(margin, y, pageWidth - margin, y);
  y += 28;

  // ── Date + Company ──────────────────────────────────────
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...muted);
  doc.text(safeDate(data.createdAt ?? new Date()), margin, y);
  y += 24;

  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...ink);
  doc.text(`Dear ${data.candidateName},`, margin, y);
  y += 24;

  doc.setFontSize(11);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...ink);
  const intro =
    `${data.companyName} is delighted to offer you the position of ${data.jobTitle}. ` +
    `We were impressed with your background and believe you will be a great addition to our team. ` +
    `The key terms of your offer are set out below.`;
  const introLines = doc.splitTextToSize(intro, contentWidth);
  doc.text(introLines, margin, y);
  y += introLines.length * 15 + 16;

  // ── Terms ───────────────────────────────────────────────
  const rows: Array<[string, string]> = [
    ["Position", data.jobTitle],
    [
      "Compensation",
      `${data.salary.currency} ${data.salary.amount.toLocaleString("en-US")} / ${data.salary.period}`,
    ],
    ["Start date", safeDate(data.startDate)],
    ["Offer valid until", safeDate(data.expiresAt)],
  ];

  const labelW = 150;
  for (const [label, value] of rows) {
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...muted);
    doc.text(label, margin, y);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...ink);
    doc.text(String(value), margin + labelW, y);
    y += 20;
  }
  y += 8;

  if (data.benefits) {
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...muted);
    doc.text("Benefits", margin, y);
    y += 16;
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...ink);
    const lines = doc.splitTextToSize(data.benefits, contentWidth);
    doc.text(lines, margin, y);
    y += lines.length * 14 + 12;
  }

  if (data.notes) {
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...muted);
    doc.text("Additional notes", margin, y);
    y += 16;
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...ink);
    const lines = doc.splitTextToSize(data.notes, contentWidth);
    doc.text(lines, margin, y);
    y += lines.length * 14 + 12;
  }

  y += 12;
  doc.setFontSize(11);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...ink);
  const closing = "We look forward to welcoming you aboard.";
  doc.text(closing, margin, y);
  y += 40;

  // ── Signature block ─────────────────────────────────────
  doc.setDrawColor(...muted);
  doc.setLineWidth(0.7);
  const sigLineY = y + 28;
  doc.line(margin, sigLineY, margin + 220, sigLineY);

  doc.setFontSize(10);
  doc.setTextColor(...muted);
  doc.text("Candidate signature", margin, sigLineY + 14);

  const accepted = data.status === "accepted" && Boolean(data.signature?.fullName);
  if (accepted) {
    doc.setFontSize(16);
    doc.setFont("times", "italic");
    doc.setTextColor(...brandDark);
    doc.text(String(data.signature?.fullName ?? ""), margin + 6, sigLineY - 6);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(...muted);
    doc.text(`Signed electronically on ${safeDate(data.signature?.signedAt)}`, margin, sigLineY + 30);
  } else {
    doc.setFontSize(9);
    doc.setTextColor(...muted);
    doc.text("Awaiting candidate acceptance", margin, sigLineY + 30);
  }

  // Company signatory
  doc.setDrawColor(...muted);
  doc.line(pageWidth - margin - 220, sigLineY, pageWidth - margin, sigLineY);
  doc.setFontSize(10);
  doc.setTextColor(...muted);
  doc.text(`For and on behalf of ${data.companyName}`, pageWidth - margin - 220, sigLineY + 14);

  const buffer = Buffer.from(doc.output("arraybuffer"));
  return buffer;
}
