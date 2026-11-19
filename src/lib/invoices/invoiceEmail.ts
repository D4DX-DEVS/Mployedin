import { escapeHtml } from "@/lib/security/html-escape";
import { paymentState, type PresentableInvoice } from "./presentation";
import { safeDate, isCollectible } from "./pdfLabels";

export type InvoiceEmailInput = {
  invoice: PresentableInvoice;
  companyName: string;
  issuerName?: string;
  issuerEmail?: string;
  /** True when the PDF carries bank details (issuer settings filled in). */
  hasBankDetails?: boolean;
};

export type InvoiceEmail = { subject: string; html: string };

function money(amount: number): string {
  return amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/**
 * The email that carries an invoice PDF. Matches the PDF: same navy band,
 * same "amount due" headline (the balance, not the gross total once part of
 * it is paid). Every typed value is escaped where it enters the HTML.
 */
export function buildInvoiceEmail({ invoice, companyName, issuerName, issuerEmail, hasBankDetails }: InvoiceEmailInput): InvoiceEmail {
  const state = paymentState(invoice);
  const invNumber = invoice.invoiceNumber ?? "Invoice";
  const currency = invoice.currency ?? "AED";
  const from = issuerName ?? "Mployedin";

  const safe = {
    companyName: escapeHtml(companyName),
    invNumber: escapeHtml(invNumber),
    currency: escapeHtml(currency),
    from: escapeHtml(from),
    email: issuerEmail ? escapeHtml(issuerEmail) : undefined,
  };

  const owed = isCollectible(invoice.status, state);
  const headlineLabel = owed ? "Amount due" : "Invoice total";
  const headlineAmount = `${safe.currency} ${money(owed ? state.balanceDue : state.totalAmount)}`;
  const dueText = invoice.dueDate ? safeDate(invoice.dueDate) : "Upon receipt";
  const overdue = owed && state.overdueDays > 0;

  const row = (label: string, value: string) => `
          <tr>
            <td style="padding:10px 0;border-bottom:1px solid #eceef3;color:#71717a;font-size:13px;">${label}</td>
            <td style="padding:10px 0;border-bottom:1px solid #eceef3;color:#18181b;font-size:13px;text-align:right;font-weight:600;">${value}</td>
          </tr>`;

  const rows = [
    row("Invoice number", safe.invNumber),
    row("Issue date", safeDate(invoice.issuedAt ?? invoice.createdAt)),
    row("Due date", overdue ? `<span style="color:#b91c1c;">${dueText} · overdue</span>` : dueText),
    row("Invoice total", `${safe.currency} ${money(state.totalAmount)}`),
    state.paidAmount > 0 ? row("Already paid", `${safe.currency} ${money(state.paidAmount)}`) : "",
  ].join("");

  const html = `
<div style="background:#f4f6fb;padding:32px 16px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;">
  <div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e4e4e7;">
    <div style="background:#1e2f6c;padding:28px 32px;">
      <div style="color:#b4c0e4;font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;">${headlineLabel}</div>
      <div style="color:#ffffff;font-size:30px;font-weight:700;margin-top:6px;">${headlineAmount}</div>
      <div style="width:28px;height:3px;background:#4bbadd;margin-top:12px;border-radius:2px;"></div>
    </div>
    <div style="padding:28px 32px;color:#3f3f46;font-size:14px;line-height:1.6;">
      <p style="margin:0 0 12px;">Dear ${safe.companyName},</p>
      <p style="margin:0 0 20px;">Please find attached invoice <strong>${safe.invNumber}</strong> from ${safe.from}.${owed && hasBankDetails ? " Bank details for payment are in the attached PDF." : ""}</p>
      <table role="presentation" style="width:100%;border-collapse:collapse;">${rows}
      </table>
      <p style="margin:24px 0 0;color:#71717a;font-size:13px;">Questions about this invoice? ${safe.email ? `Contact <a href="mailto:${safe.email}" style="color:#284595;">${safe.email}</a>.` : "Contact our billing team."}</p>
    </div>
    <div style="padding:16px 32px;background:#fafafa;border-top:1px solid #eceef3;color:#a1a1aa;font-size:11px;">
      This is an automated message from ${safe.from}.
    </div>
  </div>
</div>`;

  return { subject: `Invoice ${invNumber} from ${from}`, html };
}
