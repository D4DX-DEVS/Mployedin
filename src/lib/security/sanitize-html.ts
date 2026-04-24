// Tags and attributes allowed in rich-text content (job descriptions, blog posts, static pages, FAQs).
// Intentionally excludes <script>, <iframe>, <object>, <embed>, event handlers, and javascript: hrefs.
const ALLOWED_TAGS = new Set([
  "p", "br", "strong", "b", "em", "i", "u", "s", "strike",
  "blockquote", "ul", "ol", "li",
  "h1", "h2", "h3", "h4", "h5", "h6",
  "a", "img", "code", "pre", "span", "div", "hr",
  "table", "thead", "tbody", "tr", "th", "td",
]);

const ALLOWED_ATTR = new Set(["href", "src", "alt", "title", "class", "target", "rel", "width", "height"]);

// Regex patterns for sanitization
const TAG_RE = /<\/?([a-zA-Z][a-zA-Z0-9]*)\b([^>]*)>/g;
const ATTR_RE = /([a-zA-Z][a-zA-Z0-9-]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]*))/g;
// Block dangerous attribute values (javascript:, data:, vbscript:, on*)
const DANGEROUS_ATTR_NAME = /^on/i;
const DANGEROUS_ATTR_VALUE = /^\s*(javascript|data|vbscript)\s*:/i;

function sanitizeAttrs(tagName: string, attrsStr: string): string {
  const result: string[] = [];
  let match: RegExpExecArray | null;
  ATTR_RE.lastIndex = 0;
  while ((match = ATTR_RE.exec(attrsStr)) !== null) {
    const name = match[1].toLowerCase();
    const value = match[2] ?? match[3] ?? match[4] ?? "";
    if (!ALLOWED_ATTR.has(name)) continue;
    if (DANGEROUS_ATTR_NAME.test(name)) continue;
    if (DANGEROUS_ATTR_VALUE.test(value)) continue;
    // Force target="_blank" to also have rel="noopener noreferrer"
    result.push(`${name}="${value.replace(/"/g, "&quot;")}"`);
  }
  // Add rel="noopener noreferrer" to <a target="_blank">
  if (tagName === "a") {
    const hasTarget = result.some(a => a.startsWith("target="));
    const hasRel = result.some(a => a.startsWith("rel="));
    if (hasTarget && !hasRel) result.push('rel="noopener noreferrer"');
  }
  return result.length ? " " + result.join(" ") : "";
}

/**
 * Strips dangerous HTML from a rich-text string.
 * Pure TypeScript implementation — no external DOM library required.
 * Returns an empty string when input is falsy.
 */
export function sanitizeHtml(dirty: string | undefined | null): string {
  if (!dirty) return "";

  return dirty.replace(TAG_RE, (full, tagName: string, attrsStr: string) => {
    const tag = tagName.toLowerCase();
    if (!ALLOWED_TAGS.has(tag)) return "";
    const isClosing = full.startsWith("</");
    if (isClosing) return `</${tag}>`;
    const attrs = sanitizeAttrs(tag, attrsStr);
    // Self-closing tags
    if (tag === "br" || tag === "hr" || tag === "img") return `<${tag}${attrs}>`;
    return `<${tag}${attrs}>`;
  });
}
