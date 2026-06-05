/**
 * Jest mock for isomorphic-dompurify.
 *
 * The real package pulls in jsdom + html-encoding-sniffer, which ship native
 * ESM that Jest cannot parse, breaking any test that imports a component using
 * src/lib/security/html.ts. No test asserts on the sanitizer's output, so a
 * lightweight passthrough that strips the obviously dangerous markup is enough
 * to keep component tests running without weakening real runtime behavior.
 */
function sanitize(dirty: string | null | undefined): string {
  if (!dirty) return "";
  return String(dirty)
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "");
}

const DOMPurify = { sanitize };

export default DOMPurify;
