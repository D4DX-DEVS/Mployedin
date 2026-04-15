import DOMPurify from "isomorphic-dompurify";

// Tags and attributes allowed in rich-text content (job descriptions, blog posts, static pages, FAQs).
// Intentionally excludes <script>, <iframe>, <object>, <embed>, event handlers, and javascript: hrefs.
const ALLOWED_TAGS = [
  "p", "br", "strong", "b", "em", "i", "u", "s", "strike",
  "blockquote", "ul", "ol", "li",
  "h1", "h2", "h3", "h4", "h5", "h6",
  "a", "img", "code", "pre", "span", "div", "hr",
  "table", "thead", "tbody", "tr", "th", "td",
];

const ALLOWED_ATTR = ["href", "src", "alt", "title", "class", "target", "rel", "width", "height"];

/**
 * Strips dangerous HTML from a rich-text string.
 * Safe to call in Next.js server routes (uses isomorphic-dompurify / jsdom).
 * Returns an empty string when input is falsy.
 */
export function sanitizeHtml(dirty: string | undefined | null): string {
  if (!dirty) return "";
  return DOMPurify.sanitize(dirty, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    FORCE_BODY: false,
  });
}
