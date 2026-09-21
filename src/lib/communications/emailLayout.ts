/**
 * Shared, dark-mode-safe chrome for transactional email.
 *
 * Gmail's dark mode rewrites *text* colours but cannot invert a CSS
 * `background: linear-gradient(...)`. The brand header used both, so on Android
 * and iOS Gmail the gradient stayed blue while "MPLOYEDIN" and its subtitle
 * were darkened to near-black against it — the header read as a blue box with
 * barely-visible text. Handing Gmail a background that is *already* dark, via a
 * real `bgcolor` attribute on a table cell rather than a CSS gradient, leaves
 * the block alone and keeps white text white in both schemes.
 *
 * Tables and attributes, not divs and shorthand CSS: Outlook's Word renderer
 * drops `border-radius` and most background shorthands outright.
 */

const BRAND_DARK = "#0a2a6e";

/** Escape text destined for an HTML attribute or text node. */
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * The logo used in email. A white-knockout of `public/logo.png`, because the
 * brand logo is dark navy and would disappear against the dark header.
 *
 * Mail clients never invert *images* — only text and background colours — so a
 * white mark on an explicitly dark header is the one combination that survives
 * both light and dark mode. Its `alt` is the wordmark, so the header still
 * reads when images are blocked (Outlook and Gmail both do this by default for
 * unknown senders).
 */
const EMAIL_LOGO_PATH = "/logo-email-white.png";
const LOGO_WIDTH = 168;
const LOGO_HEIGHT = 58;

function resolveBaseUrl(baseUrl?: string): string {
  const raw = baseUrl ?? process.env.NEXT_PUBLIC_APP_URL ?? "https://mployedin.com";
  return raw.replace(/\/+$/, "");
}

/**
 * The MPLOYEDIN header block.
 *
 * @param subtitle optional line under the logo ("Your Daily Digest"). Omit it
 *                 for emails that carry their own title in the body.
 * @param opts.baseUrl absolute origin for the logo. Email cannot reference
 *                 relative paths — the image must be fetchable from the open
 *                 internet — so this defaults to NEXT_PUBLIC_APP_URL.
 */
export function emailHeader(subtitle?: string, opts: { baseUrl?: string } = {}): string {
  const base = resolveBaseUrl(opts.baseUrl);
  const subtitleRow = subtitle
    ? `
            <div style="color: #dbeafe; font-size: 14px; line-height: 20px; margin-top: 10px; font-family: Arial, sans-serif;">${escapeHtml(subtitle)}</div>`
    : "";

  return `
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse: collapse; background-color: ${BRAND_DARK};">
        <tr>
          <td bgcolor="${BRAND_DARK}" align="center" style="background-color: ${BRAND_DARK}; padding: 24px; border-radius: 8px 8px 0 0;">
            <img src="${base}${EMAIL_LOGO_PATH}" width="${LOGO_WIDTH}" height="${LOGO_HEIGHT}" alt="MPLOYEDIN" style="width: ${LOGO_WIDTH}px; height: ${LOGO_HEIGHT}px; display: block; margin: 0 auto; border: 0; color: #ffffff; font-size: 22px; font-weight: 700; letter-spacing: 1px; font-family: Arial, sans-serif;">${subtitleRow}
          </td>
        </tr>
      </table>`;
}

/**
 * The shared footer: why this arrived, how to stop it, and who sent it.
 *
 * @param opts.reason  one line explaining why this specific email was sent
 * @param opts.unsubRef `?ref=` tag so unsubscribes can be attributed
 */
export function emailFooter(opts: {
  locale: string;
  baseUrl?: string;
  reason: string;
  unsubRef: string;
}): string {
  const base = resolveBaseUrl(opts.baseUrl);
  const isAr = opts.locale === "ar";
  const year = new Date().getFullYear();

  return `
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse: collapse; background-color: #f9fafb; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px;">
        <tr>
          <td align="center" style="padding: 16px 24px; font-family: Arial, sans-serif;">
            <div style="color: #9ca3af; font-size: 12px; line-height: 18px;">${escapeHtml(opts.reason)}</div>
            <div style="margin-top: 6px; font-size: 12px; line-height: 18px;">
              <a href="${base}/${opts.locale}/job-seeker/settings/notifications" style="color: #6b7280;">${isAr ? "إدارة التفضيلات" : "Manage preferences"}</a>
              <span style="color: #d1d5db;">&nbsp;·&nbsp;</span>
              <a href="${base}/api/unsubscribe?ref=${encodeURIComponent(opts.unsubRef)}" style="color: #6b7280;">${isAr ? "إلغاء الاشتراك" : "Unsubscribe"}</a>
            </div>
            <div style="margin-top: 10px; color: #b6bcc6; font-size: 11px; line-height: 16px;">
              ${isAr ? "أُرسل هذا البريد تلقائياً — يُرجى عدم الرد عليه." : "This email was sent automatically — please don't reply."}
              <br>&copy; ${year} MPLOYEDIN
            </div>
          </td>
        </tr>
      </table>`;
}

/**
 * A horizontal progress bar.
 *
 * Replaces a `conic-gradient` ring whose centring relied on `display: flex` —
 * Gmail strips both, so the ring vanished, the white inner circle collapsed to
 * a block in the top-left of its 80px box, and the percentage floated in the
 * empty space beside it. Nested tables with fixed widths are the one progress
 * indicator every mail client renders the same way.
 *
 * @param percent 0–100; clamped and rounded.
 */
export function emailProgressBar(percent: number, opts: { rtl?: boolean } = {}): string {
  const pct = Math.max(0, Math.min(100, Math.round(percent)));
  const align = opts.rtl ? "right" : "left";
  // A zero-width cell still paints its border in some clients, so the filled
  // cell is omitted entirely at 0 rather than rendered at 0%.
  const fill =
    pct > 0
      ? `
              <td bgcolor="#0D6FD8" width="${pct}%" style="width: ${pct}%; background-color: #0D6FD8; font-size: 0; line-height: 0; height: 10px; border-radius: 5px;">&nbsp;</td>`
      : "";
  const rest = 100 - pct;
  const track =
    rest > 0
      ? `
              <td width="${rest}%" style="width: ${rest}%; font-size: 0; line-height: 0; height: 10px;">&nbsp;</td>`
      : "";

  return `
        <div style="color: #0D6FD8; font-size: 28px; line-height: 34px; font-weight: 700; font-family: Arial, sans-serif; text-align: center;">${pct}%</div>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" align="${align}" style="border-collapse: collapse; margin: 10px 0 0; background-color: #e5e7eb; border-radius: 5px;">
          <tr>
            <td style="padding: 0;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse: collapse;">
                <tr>${opts.rtl ? track + fill : fill + track}
                </tr>
              </table>
            </td>
          </tr>
        </table>`;
}
