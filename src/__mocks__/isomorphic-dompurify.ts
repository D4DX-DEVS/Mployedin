/**
 * Jest mock for isomorphic-dompurify.
 *
 * The real package pulls in jsdom + html-encoding-sniffer, which ship native
 * ESM that Jest cannot parse, breaking any test that imports a component using
 * src/lib/security/html.ts. Most tests do not assert on the sanitizer's output,
 * so a lightweight passthrough that strips the obviously dangerous markup is
 * enough to keep component tests running without weakening real runtime behavior.
 *
 * addHook/removeHook are supported for `afterSanitizeAttributes` only, and only
 * for <img> tags: each is shown to the hook as a small element stand-in
 * (tagName, getAttribute, setAttribute, parentNode.removeChild), which is all
 * lib/security/html's public-image hook uses. The real thing is checked against
 * the real DOMPurify by a script outside Jest.
 */
type Hook = (node: Element) => void;
const afterAttributeHooks: Hook[] = [];

const attrPattern = (name: string): RegExp =>
  new RegExp(String.raw`(\s${name}\s*=\s*)("([^"]*)"|'([^']*)'|([^\s>]+))`, "i");

function applyImageHooks(html: string): string {
  if (afterAttributeHooks.length === 0) return html;
  return html.replace(/<img\b[^>]*>/gi, (tag) => {
    let current = tag;
    let removed = false;
    const node = {
      tagName: "IMG",
      getAttribute: (name: string) => {
        const match = attrPattern(name).exec(current);
        return match ? (match[3] ?? match[4] ?? match[5] ?? "") : null;
      },
      setAttribute: (name: string, value: string) => {
        const attr = attrPattern(name);
        current = attr.test(current)
          ? current.replace(attr, (_all, lead: string) => `${lead}"${value}"`)
          : current.replace(/<img\b/i, `<img ${name}="${value}"`);
      },
      parentNode: { removeChild: () => (removed = true) },
    } as unknown as Element;
    for (const hook of afterAttributeHooks) {
      hook(node);
      if (removed) return "";
    }
    return current;
  });
}

function sanitize(dirty: string | null | undefined): string {
  if (!dirty) return "";
  const cleaned = String(dirty)
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "");
  return applyImageHooks(cleaned);
}

function addHook(entryPoint: string, hook: Hook): void {
  if (entryPoint === "afterSanitizeAttributes") afterAttributeHooks.push(hook);
}

function removeHook(entryPoint: string, hook?: Hook): void {
  if (entryPoint !== "afterSanitizeAttributes") return;
  const at = hook ? afterAttributeHooks.lastIndexOf(hook) : afterAttributeHooks.length - 1;
  if (at >= 0) afterAttributeHooks.splice(at, 1);
}

const DOMPurify = { sanitize, addHook, removeHook };

export default DOMPurify;
