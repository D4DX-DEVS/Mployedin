/**
 * @jest-environment jsdom
 *
 * mployedin_a11y is a preference cookie: kept for 12 months while preferences
 * are allowed (no choice yet, or accepted), a session cookie after an objection.
 * The choice itself still applies to the page either way.
 */
import { savePreferences } from "@/lib/a11y/usePreferences";
import { DEFAULT_PREFERENCES } from "@/lib/a11y/preferences";
import { writeConsent } from "@/lib/consent/client";

let writes: string[] = [];
const nativeCookie = Object.getOwnPropertyDescriptor(Document.prototype, "cookie")!;

beforeEach(() => {
  writes = [];
  Object.defineProperty(document, "cookie", {
    configurable: true,
    get: () => nativeCookie.get!.call(document),
    set: (value: string) => {
      writes.push(value);
      nativeCookie.set!.call(document, value);
    },
  });
  document.cookie = "mployedin_a11y=; Max-Age=0; Path=/";
  document.cookie = "mpl_consent=; Max-Age=0; Path=/";
  writes = [];
});
afterEach(() => {
  delete (document as unknown as { cookie?: string }).cookie;
});

const a11yWrite = () => writes.find((w) => w.startsWith("mployedin_a11y="))!;

describe("savePreferences cookie lifetime", () => {
  it("lasts 12 months when no choice was made yet (appearance exception, D1)", () => {
    savePreferences({ ...DEFAULT_PREFERENCES, textScale: 115 });
    expect(a11yWrite()).toMatch(/; Max-Age=31536000(;|$)/);
    expect(a11yWrite()).toContain("Path=/");
    expect(a11yWrite()).toContain("SameSite=Lax");
  });

  it("lasts 12 months when preferences were accepted", () => {
    writeConsent({ preferences: true, media: false });
    writes = [];
    savePreferences({ ...DEFAULT_PREFERENCES, textScale: 115 });
    expect(a11yWrite()).toMatch(/Max-Age=31536000/);
  });

  it("is a session cookie after the visitor objected to preferences", () => {
    writeConsent({ preferences: false, media: false });
    writes = [];
    savePreferences({ ...DEFAULT_PREFERENCES, textScale: 115 });
    expect(a11yWrite()).not.toMatch(/Max-Age|Expires/i);
    expect(a11yWrite()).toContain("Path=/");
    expect(a11yWrite()).toContain("SameSite=Lax");
  });

  it("still applies the choice to the page and keeps it readable for this visit", () => {
    writeConsent({ preferences: false, media: false });
    savePreferences({ ...DEFAULT_PREFERENCES, textScale: 115 });
    expect(decodeURIComponent(document.cookie)).toContain('"textScale":115');
  });
});
