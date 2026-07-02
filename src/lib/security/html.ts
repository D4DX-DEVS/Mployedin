/**
 * HTML sanitization helpers built on isomorphic-dompurify (works on both the
 * server and the browser). Use these whenever user- or AI-generated content is
 * rendered via dangerouslySetInnerHTML or stored as rich text, to prevent
 * stored/reflected XSS.
 */
import DOMPurify from "isomorphic-dompurify";

/** Formatting tags considered safe for user/AI rich text. */
// Keep in sync with the server-side policy in sanitize-html.ts — CMS content
// (blog posts, static pages) legitimately contains <img>.
const ALLOWED_TAGS = [
  "a", "b", "i", "em", "strong", "u", "s", "p", "br", "ul", "ol", "li",
  "blockquote", "code", "pre", "h1", "h2", "h3", "h4", "h5", "h6",
  "span", "div", "table", "thead", "tbody", "tr", "th", "td", "hr", "img",
];

const ALLOWED_ATTR = ["href", "title", "target", "rel", "class", "src", "alt", "width", "height"];

/**
 * Sanitize an HTML string for safe rendering via dangerouslySetInnerHTML.
 * Strips scripts, event handlers, iframes, and other dangerous markup while
 * keeping common formatting tags.
 */
export function sanitizeHtml(dirty: string | null | undefined): string {
  if (!dirty) return "";
  return DOMPurify.sanitize(dirty, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    // Block javascript:/data: URIs and unknown protocols.
    ALLOWED_URI_REGEXP: /^(?:https?|mailto|tel):/i,
    // Non-URI attrs the strict regexp above would otherwise strip.
    ADD_URI_SAFE_ATTR: ["width", "height"],
    ADD_ATTR: ["target"],
  });
}

/**
 * Strip ALL HTML, returning plain text. Use for fields that must never contain
 * markup (names, titles, single-line notes).
 */
export function stripHtml(dirty: string | null | undefined): string {
  if (!dirty) return "";
  return DOMPurify.sanitize(dirty, { ALLOWED_TAGS: [], ALLOWED_ATTR: [] });
}
