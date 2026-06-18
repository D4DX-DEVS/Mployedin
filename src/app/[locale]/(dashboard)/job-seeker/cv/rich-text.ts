/* ── Rich-text helpers for the CV builder ──
   Descriptions are edited as constrained HTML (bold / italic / underline /
   bullet & numbered lists / links). HTML is kept LOCAL to the builder:
   - rendered (sanitized) in the live preview
   - parsed into nodes for the PDF
   - converted to plain text before saving to the shared profile
   - plain text from the profile / AI import is converted back to HTML for editing
*/

import DOMPurify from "isomorphic-dompurify";

const ALLOWED_TAGS = ["p", "br", "b", "strong", "i", "em", "u", "ul", "ol", "li", "a", "span"];
const ALLOWED_ATTR = ["href", "target", "rel"];

/** Sanitize untrusted HTML down to the small set of tags the resume supports. */
export function sanitizeHtml(html: string): string {
  if (!html) return "";
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    ALLOWED_URI_REGEXP: /^(?:https?:|mailto:|tel:)/i,
  });
}

/** Heuristic: does this string already contain rich-text markup? */
export function isHtml(value: string | undefined | null): boolean {
  if (!value) return false;
  return /<(p|br|ul|ol|li|strong|b|em|i|u|a|span)\b[^>]*>/i.test(value);
}

const ENTITIES: Record<string, string> = {
  "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'", "&apos;": "'", "&nbsp;": " ",
};

function decodeEntities(text: string): string {
  return text.replace(/&(amp|lt|gt|quot|#39|apos|nbsp);/g, (m) => ENTITIES[m] ?? m);
}

/**
 * Convert the constrained resume HTML into plain text suitable for the shared
 * profile. List items become "• " bullet lines; paragraphs / <br> become newlines.
 */
export function htmlToPlainText(html: string | undefined | null): string {
  if (!html) return "";
  if (!isHtml(html)) return html.trim();
  let text = html
    .replace(/<\s*(br)\s*\/?>/gi, "\n")
    .replace(/<\s*li[^>]*>/gi, "\u2022 ")
    .replace(/<\s*\/\s*li\s*>/gi, "\n")
    .replace(/<\s*\/\s*(p|ul|ol|div)\s*>/gi, "\n")
    .replace(/<[^>]+>/g, "");
  text = decodeEntities(text);
  return text
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").trimEnd())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * Convert plain text (from the profile or an AI import) into the resume HTML
 * format. Lines that start with a bullet marker become a <ul>; everything else
 * becomes a <p>.
 */
export function plainTextToHtml(text: string | undefined | null): string {
  if (!text) return "";
  if (isHtml(text)) return sanitizeHtml(text);

  const lines = text.split(/\r?\n/);
  const blocks: string[] = [];
  let bullets: string[] = [];

  const flushBullets = () => {
    if (bullets.length) {
      blocks.push(`<ul>${bullets.map((b) => `<li>${escapeHtml(b)}</li>`).join("")}</ul>`);
      bullets = [];
    }
  };

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) { flushBullets(); continue; }
    const bulletMatch = line.match(/^[\u2022\u2023\u25E6\u2043\u2219*\-–]\s+(.*)$/);
    if (bulletMatch) {
      bullets.push(bulletMatch[1].trim());
    } else {
      flushBullets();
      blocks.push(`<p>${escapeHtml(line)}</p>`);
    }
  }
  flushBullets();
  return blocks.join("");
}

/** A flat representation of resume rich text for renderers that can't use HTML (PDF). */
export interface RichTextSpan {
  text: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  href?: string;
}
export interface RichTextBlock {
  type: "paragraph" | "bullet" | "number";
  index?: number;
  spans: RichTextSpan[];
}

/**
 * Parse the constrained resume HTML into block + span structures the PDF
 * renderer can map to <View>/<Text>. Works without a DOM (regex tokenizer over
 * the small allowed tag set).
 */
export function parseRichText(value: string | undefined | null): RichTextBlock[] {
  if (!value) return [];
  const html = isHtml(value) ? value : plainTextToHtml(value);
  const blocks: RichTextBlock[] = [];

  const listRegex = /<(ul|ol)[^>]*>([\s\S]*?)<\/\1>/gi;
  const liRegex = /<li[^>]*>([\s\S]*?)<\/li>/gi;
  const pRegex = /<p[^>]*>([\s\S]*?)<\/p>/gi;

  // Tokenize top level by walking paragraphs and lists in order of appearance.
  const segments: { kind: "p" | "ul" | "ol"; inner: string }[] = [];
  let working = html;

  // Replace lists with placeholders so paragraph parsing doesn't grab their inner <p>.
  const lists: { kind: "ul" | "ol"; inner: string }[] = [];
  working = working.replace(listRegex, (_m, tag, inner) => {
    lists.push({ kind: (tag as string).toLowerCase() as "ul" | "ol", inner });
    return `\u0000LIST${lists.length - 1}\u0000`;
  });

  const parts = working.split(/(\u0000LIST\d+\u0000)/).filter(Boolean);
  for (const part of parts) {
    const listMatch = part.match(/^\u0000LIST(\d+)\u0000$/);
    if (listMatch) {
      const l = lists[Number(listMatch[1])];
      segments.push({ kind: l.kind, inner: l.inner });
    } else {
      let m: RegExpExecArray | null;
      pRegex.lastIndex = 0;
      let matchedP = false;
      while ((m = pRegex.exec(part)) !== null) {
        matchedP = true;
        segments.push({ kind: "p", inner: m[1] });
      }
      if (!matchedP) {
        const stripped = part.replace(/<[^>]+>/g, "").trim();
        if (stripped) segments.push({ kind: "p", inner: part });
      }
    }
  }

  for (const seg of segments) {
    if (seg.kind === "p") {
      const spans = parseSpans(seg.inner);
      if (spans.some((s) => s.text.trim())) blocks.push({ type: "paragraph", spans });
    } else {
      let m: RegExpExecArray | null;
      liRegex.lastIndex = 0;
      let idx = 1;
      while ((m = liRegex.exec(seg.inner)) !== null) {
        const spans = parseSpans(m[1]);
        if (spans.some((s) => s.text.trim())) {
          blocks.push({ type: seg.kind === "ol" ? "number" : "bullet", index: idx, spans });
          idx++;
        }
      }
    }
  }
  return blocks;
}

/** Parse inline markup (<b>/<strong>/<i>/<em>/<u>/<a>) into styled spans. */
function parseSpans(html: string): RichTextSpan[] {
  const spans: RichTextSpan[] = [];
  const stack = { bold: 0, italic: 0, underline: 0, href: [] as string[] };
  const tokenRegex = /<\/?(strong|b|em|i|u|a|br|span)[^>]*>|[^<]+/gi;
  let m: RegExpExecArray | null;

  while ((m = tokenRegex.exec(html)) !== null) {
    const token = m[0];
    if (token.startsWith("<")) {
      const closing = token.startsWith("</");
      const tag = (token.match(/<\/?(\w+)/)?.[1] ?? "").toLowerCase();
      if (tag === "br") { spans.push({ text: "\n" }); continue; }
      if (tag === "strong" || tag === "b") stack.bold += closing ? -1 : 1;
      else if (tag === "em" || tag === "i") stack.italic += closing ? -1 : 1;
      else if (tag === "u") stack.underline += closing ? -1 : 1;
      else if (tag === "a") {
        if (closing) stack.href.pop();
        else stack.href.push(token.match(/href\s*=\s*["']([^"']*)["']/i)?.[1] ?? "");
      }
    } else {
      const text = decodeEntities(token);
      if (!text) continue;
      spans.push({
        text,
        bold: stack.bold > 0 || undefined,
        italic: stack.italic > 0 || undefined,
        underline: stack.underline > 0 || undefined,
        href: stack.href.length ? stack.href[stack.href.length - 1] : undefined,
      });
    }
  }
  return spans.length ? spans : [{ text: decodeEntities(html.replace(/<[^>]+>/g, "")) }];
}
