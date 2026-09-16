/**
 * @jest-environment jsdom
 */
import { createHash } from "crypto";

import { getSecurityHeaders } from "@/lib/security/headers";

/**
 * Sonner injects its stylesheet at module-import time with a plain
 * `document.createElement('style')` and no nonce support whatsoever. Production
 * CSP has no 'unsafe-inline' for style elements, so the only reason those
 * toasts are styled at all is the sha256 pinned in `style-src-elem`.
 *
 * That pin is tied to the exact bytes sonner ships. Upgrade the package and the
 * CSS changes, the hash stops matching, and every toast in production silently
 * loses its styling — no build error, no test failure, nothing in the console
 * except a CSP violation nobody is watching. This test is the tripwire.
 *
 * If it fails after a sonner upgrade: recompute the hash from the value this
 * test prints and replace the stale one in `lib/security/headers.ts`.
 */
describe("sonner stylesheet CSP hash", () => {
  const styleSrcElem = () => {
    const csp = getSecurityHeaders("test-nonce")["Content-Security-Policy"];
    const directive = csp.split("; ").find((d) => d.startsWith("style-src-elem"));
    if (!directive) throw new Error("style-src-elem directive missing from CSP");
    return directive;
  };

  it("pins the hash of the stylesheet sonner actually injects", async () => {
    await import("sonner");

    const injected = Array.from(document.head.querySelectorAll("style")).find((el) =>
      el.textContent?.includes("data-sonner-toaster")
    );
    expect(injected).toBeDefined();

    const hash =
      "sha256-" + createHash("sha256").update(injected!.textContent ?? "", "utf8").digest("base64");

    expect(styleSrcElem()).toContain(hash);
  });

  it("still forbids unsafe-inline, so the hash is load-bearing", () => {
    expect(styleSrcElem()).not.toContain("unsafe-inline");
  });
});
