/**
 * @jest-environment node
 *
 * A client component is also rendered on the server (the offline page is
 * prerendered). With no window, document or navigator there is nothing to read,
 * so the answer is the default and nothing throws.
 */
import { resolveClientLocale } from "@/lib/i18n/clientLocale";

describe("resolveClientLocale without a browser", () => {
  it("is English and does not throw", () => {
    expect(typeof window).toBe("undefined");
    expect(resolveClientLocale()).toBe("en");
  });
});
