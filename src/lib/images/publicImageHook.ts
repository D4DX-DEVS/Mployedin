import { toPublicImageSrc } from "./externalAvatar";

/**
 * DOMPurify `afterSanitizeAttributes` hook for CMS rich text on public pages
 * (lib/security/html sanitizePublicHtml): every <img> keeps only a src that
 * toPublicImageSrc allows, rewritten if it has to go through our proxy, and the
 * node is removed when there is none. A third-party <img> in a blog post would
 * otherwise make the visitor's browser contact that host before any cookie choice.
 *
 * Its own module with relative imports only, so a plain Node script can load it
 * next to the real DOMPurify (Jest runs against a stand-in for DOMPurify).
 */
export function restrictImagesToPublicSources(node: Element): void {
  if (node.tagName !== "IMG") return;
  const safe = toPublicImageSrc(node.getAttribute("src"));
  if (safe) node.setAttribute("src", safe);
  else node.parentNode?.removeChild(node);
}
