/**
 * @jest-environment node
 *
 * The Cookie Policy is generated from REGISTRY (the single list of everything
 * the site can store on a device) and the Cookie settings dialog's own message
 * strings. These are the guards that keep the page true: a row added to the
 * registry shows up in the policy, and a category that would make the
 * "no analytics or advertising cookies" sentence false stops the build of it.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { REGISTRY, type RegistryItem } from "@/lib/consent/registry";
import enMessages from "../../../messages/en.json";
import arMessages from "../../../messages/ar.json";
import {
  ALLOWED_CATEGORIES,
  ALLOWED_PAIRS,
  COOKIE_POLICY_SECTION_IDS,
  NO_ANALYTICS_SENTENCE,
  buildCookiePolicy,
  escapeHtml,
} from "../../../scripts/lib/cookiePolicyFromRegistry.mjs";
import { buildCookiePolicyReview } from "../../../scripts/lib/cookiePolicyReview.mjs";

type Locale = "en" | "ar";
const EXPECTED_SECTION_IDS = [
  "what-are-cookies",
  "strictly-necessary",
  "click-only",
  "display-settings",
  "media",
  "no-analytics",
  "change-your-choice",
  "withdrawal",
  "changes",
  "contact",
];
const MESSAGES = { en: enMessages, ar: arMessages } as const;
const LOCALES: Locale[] = ["en", "ar"];

function build(locale: Locale, registry: RegistryItem[] = REGISTRY) {
  return buildCookiePolicy({ registry, messages: MESSAGES[locale], locale }) as string;
}

function sectionIds(html: string): string[] {
  return [...html.matchAll(/<h2 id="([^"]+)"/g)].map((m) => m[1]);
}

function sectionHtml(html: string, id: string): string {
  const start = html.indexOf(`<h2 id="${id}"`);
  expect(start).toBeGreaterThanOrEqual(0);
  const next = html.indexOf("<h2 ", start + 5);
  return html.slice(start, next === -1 ? undefined : next);
}

function rowFor(html: string, name: string): string {
  const cell = `<code>${escapeHtml(name)}</code>`;
  const at = html.indexOf(cell);
  expect(at).toBeGreaterThanOrEqual(0);
  const from = html.lastIndexOf("<tr>", at);
  const to = html.indexOf("</tr>", at);
  return html.slice(from, to + 5);
}

describe("generated Cookie Policy: structure", () => {
  it.each(LOCALES)("%s: has exactly these section ids, in this order (the brief's sections plus changes)", (locale) => {
    expect(sectionIds(build(locale))).toEqual(EXPECTED_SECTION_IDS);
    expect([...COOKIE_POLICY_SECTION_IDS]).toEqual(EXPECTED_SECTION_IDS);
  });

  it("en and ar have the same number of sections and the same ids", () => {
    const en = sectionIds(build("en"));
    const ar = sectionIds(build("ar"));
    expect(en.length).toBe(10);
    expect(ar).toEqual(en);
  });

  it.each(LOCALES)("%s: is deterministic (same input, same bytes)", (locale) => {
    expect(build(locale)).toBe(build(locale));
  });

  it.each(LOCALES)("%s: only tags and attributes the CMS sanitiser keeps (no script, style, caption or inline style)", (locale) => {
    const html = build(locale);
    expect(html).not.toMatch(/<(script|style|iframe|caption|colgroup|section|details)\b/i);
    expect(html).not.toMatch(/\sstyle=/i);
    expect(html).not.toMatch(/\son[a-z]+=/i);
    const tags = new Set([...html.matchAll(/<\/?([a-z0-9]+)/gi)].map((m) => m[1].toLowerCase()));
    const allowed = new Set(["h2", "h3", "p", "ul", "li", "strong", "em", "a", "code", "table", "thead", "tbody", "tr", "th", "td", "div", "br"]);
    for (const tag of tags) expect(allowed).toContain(tag);
  });
});

describe("generated Cookie Policy: every registry row is in a table", () => {
  it.each(LOCALES)("%s: each REGISTRY name appears exactly once, with its purpose", (locale) => {
    const html = build(locale);
    const items = (MESSAGES[locale] as { consent: { items: Record<string, string> } }).consent.items;
    for (const row of REGISTRY) {
      const cell = `<code>${escapeHtml(row.name)}</code>`;
      expect(html.split(cell).length - 1).toBe(1);
      expect(rowFor(html, row.name)).toContain(escapeHtml(items[row.purposeKey]));
    }
  });

  it.each(LOCALES)("%s: the row shows the registry duration's wording, never the raw internal text", (locale) => {
    const html = build(locale);
    expect(html).not.toMatch(/Task \d+/);
    const sw = rowFor(html, "mployedin-sw");
    expect(sw).not.toContain("until uninstalled");
  });

  it.each(LOCALES)("%s: tables are split by what they are, and each row lands in exactly one section", (locale) => {
    const html = build(locale);
    const place = (name: string) => {
      const hits = COOKIE_POLICY_SECTION_IDS.filter((id: string) =>
        sectionHtml(html, id).includes(`<code>${escapeHtml(name)}</code>`),
      );
      return hits;
    };
    for (const row of REGISTRY) expect(place(row.name)).toHaveLength(1);
    expect(place("mpl_consent")).toEqual(["strictly-necessary"]);
    expect(place("authjs.*")).toEqual(["strictly-necessary"]);
    expect(place("www.google.com/recaptcha")).toEqual(["click-only"]);
    expect(place("apis.google.com")).toEqual(["click-only"]);
    expect(place("mployedin-sw")).toEqual(["click-only"]);
    expect(place("NEXT_LOCALE")).toEqual(["display-settings"]);
    expect(place("mployedin_a11y")).toEqual(["display-settings"]);
    expect(place("www.youtube-nocookie.com")).toEqual(["media"]);
  });

  it.each(LOCALES)("%s: the table has the six columns the brief asks for", (locale) => {
    const html = build(locale);
    const necessary = sectionHtml(html, "strictly-necessary");
    const header = necessary.slice(necessary.indexOf("<thead>"), necessary.indexOf("</thead>"));
    expect((header.match(/<th\b/g) ?? []).length).toBe(6);
  });

  it("en: explains * only in a table that has one, and only the kind it has", () => {
    const html = build("en");
    expect(sectionHtml(html, "display-settings")).toContain("ending in *");
    expect(sectionHtml(html, "display-settings")).not.toContain("starting with *.");
    expect(sectionHtml(html, "strictly-necessary")).toContain("ending in *");
    expect(sectionHtml(html, "strictly-necessary")).toContain("starting with *.");
    expect(sectionHtml(html, "media")).not.toContain("*");
  });

  it("en: labels the kind of each row in words a visitor reads", () => {
    const html = build("en");
    expect(rowFor(html, "mpl_consent")).toContain("Cookie");
    expect(rowFor(html, "mployedin_last_activity")).toContain("Local storage");
    expect(rowFor(html, "copilot-chats")).toContain("Session storage");
    expect(rowFor(html, "serwist-expiration")).toContain("IndexedDB");
    expect(rowFor(html, "serwist-*")).toContain("Cache");
    expect(rowFor(html, "mployedin-sw")).toContain("Service worker");
    expect(rowFor(html, "apis.google.com")).toMatch(/Host your browser contacts/);
    expect(rowFor(html, "apis.google.com")).toContain("Third party");
    expect(rowFor(html, "mpl_consent")).toContain("First party");
  });
});

describe("generated Cookie Policy: what it must not say any more", () => {
  const stripAllowed = (html: string) => html.replaceAll("analytics or advertising cookies", "");

  it.each(LOCALES)("%s: no consent-by-use sentence, and no Performance / Targeting / Advertising cookie types", (locale) => {
    const html = stripAllowed(build(locale));
    expect(html).not.toMatch(/by using our website/i);
    expect(html).not.toMatch(/performance/i);
    expect(html).not.toMatch(/targeting/i);
    expect(html).not.toMatch(/advertis/i);
  });

  it("ar: none of the old Arabic wording remains", () => {
    const html = build("ar");
    expect(html).not.toContain("باستخدام موقعنا");
    expect(html).not.toContain("الخاصة بالأداء");
    expect(html).not.toContain("الإعلانية");
    expect(html).not.toContain("مستهدفة");
  });

  it.each(LOCALES)("%s: never mentions Vimeo", (locale) => {
    expect(build(locale)).not.toMatch(/vimeo/i);
  });
});

describe("generated Cookie Policy: the no-analytics sentence stays true", () => {
  it.each(LOCALES)("%s: says it, and says it only while REGISTRY has no other category", (locale) => {
    const html = build(locale);
    expect(html).toContain(NO_ANALYTICS_SENTENCE[locale]);
    // The guard: if REGISTRY ever gains an analytics / advertising / any new
    // category, this fails until the sentence and its section are rewritten.
    const categories = new Set<string>(REGISTRY.map((row) => row.category));
    for (const category of categories) expect(ALLOWED_CATEGORIES).toContain(category);
    expect(ALLOWED_CATEGORIES).toEqual(["necessary", "preferences", "media"]);
  });

  it("en: the sentence is exactly the one the brief gives", () => {
    expect(NO_ANALYTICS_SENTENCE.en).toBe("We do not use analytics or advertising cookies.");
  });

  it.each(LOCALES)("%s: a registry with a new category cannot be turned into a policy that still says it", (locale) => {
    const withAnalytics = [
      ...REGISTRY,
      {
        name: "_ga",
        kind: "cookie",
        category: "analytics",
        basis: "consent",
        party: "third",
        duration: "12 months",
        owner: "x",
        purposeKey: "auth",
      },
    ] as unknown as RegistryItem[];
    expect(() => build(locale, withAnalytics)).toThrow(/category/i);
  });
});

describe("generated Cookie Policy: owner decisions", () => {
  it.each(LOCALES)("%s: display settings say they are kept unless you object, and name the switch from the dialog", (locale) => {
    const html = build(locale);
    const section = sectionHtml(html, "display-settings");
    const settings = MESSAGES[locale].consent.settings;
    expect(section).toContain(escapeHtml(settings.preferencesTitle));
    expect(section).toContain(escapeHtml(settings.title));
    expect(section).toContain(escapeHtml(MESSAGES[locale].landing.cookieRejectAll));
    if (locale === "en") expect(section).toMatch(/unless you object/i);
  });

  it("en: the switch is named exactly 'Remember my display settings' in Cookie settings", () => {
    const section = sectionHtml(build("en"), "display-settings");
    expect(section).toContain("Remember my display settings");
    expect(section).toContain("Cookie settings");
  });

  it.each(LOCALES)("%s: reCAPTCHA is described as loading only when a protected form is submitted", (locale) => {
    const section = sectionHtml(build(locale), "click-only");
    expect(section).toContain("reCAPTCHA");
    expect(section).toContain("Google");
    if (locale === "en") expect(section).toMatch(/does not load when you only view a page/i);
  });

  it.each(LOCALES)("%s: media section is YouTube only, off unless chosen, and links Google's controls", (locale) => {
    const section = sectionHtml(build(locale), "media");
    expect(section).toContain("YouTube");
    expect(section).toContain("youtube-nocookie.com");
    expect(section).toContain("https://myaccount.google.com/data-and-privacy");
    expect(section).toContain(escapeHtml(MESSAGES[locale].consent.settings.mediaTitle));
  });

  it("en: the job-view count is described as server-side with nothing on the device (D3)", () => {
    const section = sectionHtml(build("en"), "no-analytics");
    expect(section).toMatch(/on our own server/);
    expect(section).toMatch(/nothing on your device/i);
  });

  it.each(LOCALES)("%s: withdrawal table covers display settings, videos and the installed app, and what can't be undone", (locale) => {
    const section = sectionHtml(build(locale), "withdrawal");
    expect(section).toContain(escapeHtml(MESSAGES[locale].consent.settings.preferencesTitle));
    expect(section).toContain(escapeHtml(MESSAGES[locale].consent.settings.mediaTitle));
    expect(section).toContain("https://myaccount.google.com/data-and-privacy");
    expect((section.match(/<tr>/g) ?? []).length).toBe(4); // header + three choices
    if (locale === "en") expect(section).toMatch(/can&rsquo;t be undone/i);
  });

  it.each(LOCALES)("%s: contact section has the support address", (locale) => {
    expect(sectionHtml(build(locale), "contact")).toContain("mailto:support@mployedin.com");
  });
});

describe("generated Cookie Policy: escaping", () => {
  const hostile = '<script>alert(1)</script> & "quoted" \'single\'';

  it("escapeHtml covers & < > \" '", () => {
    expect(escapeHtml(hostile)).toBe("&lt;script&gt;alert(1)&lt;/script&gt; &amp; &quot;quoted&quot; &#39;single&#39;");
  });

  it.each(LOCALES)("%s: names, purposes, durations-by-message and switch labels are escaped", (locale) => {
    const messages = JSON.parse(JSON.stringify(MESSAGES[locale]));
    messages.consent.items.auth = hostile;
    messages.consent.settings.preferencesTitle = hostile;
    messages.consent.settings.mediaTitle = hostile;
    messages.consent.settings.title = hostile;
    messages.landing.cookieRejectAll = hostile;
    messages.landing.cookieAcceptAll = hostile;
    messages.auth.rememberMe = hostile;
    const registry = REGISTRY.map((row, i) => (i === 0 ? { ...row, name: hostile } : row));
    const html = buildCookiePolicy({ registry, messages, locale }) as string;
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("alert(1)</script>");
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(html).toContain(`<code>${escapeHtml(hostile)}</code>`);
  });
});

describe("generated Cookie Policy: fails loudly instead of printing something untrue", () => {
  const first = REGISTRY[0];

  it.each([
    [{ kind: "beacon" }, /kind "beacon"/],
    [{ basis: "legitimate-interest" }, /basis "legitimate-interest"/],
    [{ party: "second" }, /party "second"/],
    [{ category: "analytics" }, /category "analytics"/],
  ])("rejects an unknown value %j, naming the row and the field", (patch, field) => {
    const registry = [{ ...first, ...patch }, ...REGISTRY.slice(1)] as unknown as RegistryItem[];
    expect(() => build("en", registry)).toThrow(field);
    expect(() => build("en", registry)).toThrow(`"${first.name}"`);
  });

  it("rejects a duration it has no wording for (en and ar), naming it", () => {
    const registry = [{ ...first, duration: "forever and a day" }, ...REGISTRY.slice(1)];
    for (const locale of LOCALES) expect(() => build(locale, registry)).toThrow(/forever and a day/);
  });

  it("rejects a missing purpose message, naming the key", () => {
    const registry = [{ ...first, purposeKey: "doesNotExist" }, ...REGISTRY.slice(1)];
    expect(() => build("en", registry)).toThrow(/doesNotExist/);
  });

  it("rejects an unknown locale and an empty registry", () => {
    const french = "fr" as unknown as Locale;
    expect(() => buildCookiePolicy({ registry: REGISTRY, messages: enMessages, locale: french })).toThrow(/locale/i);
    expect(() => build("en", [])).toThrow();
  });

  it("rejects a registry that leaves a section's table empty", () => {
    const noMedia = REGISTRY.filter((row) => row.category !== "media");
    expect(() => build("en", noMedia)).toThrow(/media/i);
  });
});

describe("generated Cookie Policy: category and basis must agree with the prose", () => {
  const first = REGISTRY[0]; // authjs.*, necessary + strictly-necessary
  const categories = ["necessary", "preferences", "media"];
  const bases = ["strictly-necessary", "appearance", "consent", "user-action"];
  const allowed = [
    ["necessary", "strictly-necessary"],
    ["necessary", "user-action"],
    ["preferences", "appearance"],
    ["media", "consent"],
  ];
  const disallowed = categories.flatMap((category) =>
    bases.filter((basis) => !allowed.some(([c, b]) => c === category && b === basis)).map((basis) => [category, basis]),
  );

  it("the allowed pairs are exactly the four the registry uses today", () => {
    expect(
      Object.entries(ALLOWED_PAIRS).flatMap(([category, list]) => (list as string[]).map((basis) => [category, basis])),
    ).toEqual(allowed);
    const used = new Set(REGISTRY.map((row) => `${row.category}+${row.basis}`));
    expect([...used].sort()).toEqual(allowed.map(([c, b]) => `${c}+${b}`).sort());
  });

  it("the real registry passes in both languages", () => {
    for (const locale of LOCALES) expect(() => build(locale)).not.toThrow();
  });

  it.each(disallowed)("rejects category %s with basis %s, naming the row, the category and the basis", (category, basis) => {
    // e.g. a pending row reclassified to "consent", or a preferences row to "consent":
    // the prose ("we don't need your permission", "we don't ask first") would be false.
    const registry = [{ ...first, category, basis }, ...REGISTRY.slice(1)] as unknown as RegistryItem[];
    for (const locale of LOCALES) {
      expect(() => build(locale, registry)).toThrow(`"${first.name}"`);
      expect(() => build(locale, registry)).toThrow(new RegExp(`basis "${basis}"`));
      expect(() => build(locale, registry)).toThrow(new RegExp(`category "${category}"`));
    }
  });

  it("rejects a reclassified pending row and a reclassified preferences row (the two cases a reviewer raised)", () => {
    const pending = REGISTRY.find((row) => row.legal === "pending" && row.basis === "user-action");
    expect(pending).toBeDefined();
    const toConsent = REGISTRY.map((row) => (row === pending ? { ...row, basis: "consent" } : row)) as unknown as RegistryItem[];
    expect(() => build("en", toConsent)).toThrow(`"${(pending as RegistryItem).name}"`);
    expect(() => build("en", toConsent)).toThrow('basis "consent"');
    const display = REGISTRY.find((row) => row.category === "preferences") as RegistryItem;
    const prefsConsent = REGISTRY.map((row) => (row === display ? { ...row, basis: "consent" } : row)) as unknown as RegistryItem[];
    expect(() => build("en", prefsConsent)).toThrow(new RegExp(`"${display.name}".*basis "consent"`));
  });
});

describe("generated Cookie Policy: owner decision D4 (how long a choice lasts)", () => {
  it("en: says we ask again after the mpl_consent row's lifetime, taken from the registry", () => {
    const row = REGISTRY.find((r) => r.name === "mpl_consent") as RegistryItem;
    expect(row.duration).toBe("6 months");
    expect(sectionHtml(build("en"), "change-your-choice")).toContain("We ask you again after 6 months.");
  });

  it("ar: says the same, in Arabic", () => {
    expect(sectionHtml(build("ar"), "change-your-choice")).toContain("ونسألك من جديد بعد 6 أشهر.");
  });

  it.each(LOCALES)("%s: follows the registry when the lifetime changes", (locale) => {
    const registry = REGISTRY.map((row) => (row.name === "mpl_consent" ? { ...row, duration: "12 months" } : row));
    const expected = locale === "en" ? "We ask you again after 12 months." : "ونسألك من جديد بعد 12 شهرًا.";
    expect(sectionHtml(build(locale, registry), "change-your-choice")).toContain(expected);
  });

  it("fails if the choice cookie is missing or its duration is not a number of months", () => {
    const without = REGISTRY.filter((row) => row.name !== "mpl_consent");
    expect(() => build("en", without)).toThrow(/mpl_consent/);
    const session = REGISTRY.map((row) => (row.name === "mpl_consent" ? { ...row, duration: "session" } : row));
    expect(() => build("en", session)).toThrow(/mpl_consent/);
  });
});

describe("generated Cookie Policy: names of controls come from the messages, not the prose", () => {
  type Editable = { auth: Record<string, string | undefined>; consent: { settings: Record<string, string> } };
  function withMessages(locale: Locale, patch: (m: Editable) => void) {
    const messages = JSON.parse(JSON.stringify(MESSAGES[locale])) as Editable;
    patch(messages);
    return buildCookiePolicy({ registry: REGISTRY, messages, locale }) as string;
  }

  it.each(LOCALES)("%s: renaming 'Cookie settings' in the messages changes every mention in the policy", (locale) => {
    const original = MESSAGES[locale].consent.settings.title;
    const html = withMessages(locale, (m) => {
      m.consent.settings.title = "Privacy controls";
    });
    expect(html).not.toContain(original);
    expect(html).toContain("Privacy controls");
  });

  it.each(LOCALES)("%s: renaming 'Remember me' in the messages changes the sentence about it", (locale) => {
    const original = MESSAGES[locale].auth.rememberMe;
    const html = withMessages(locale, (m) => {
      m.auth.rememberMe = "Keep me signed in";
    });
    const section = sectionHtml(html, "click-only");
    const prose = section.slice(0, section.indexOf("<div"));
    expect(prose).toContain("Keep me signed in");
    expect(prose).not.toContain(original);
  });

  it("fails, naming the key, if a message the prose needs is missing", () => {
    expect(() => withMessages("en", (m) => delete m.auth.rememberMe)).toThrow(/auth\.rememberMe/);
    expect(() => withMessages("ar", (m) => delete m.auth.rememberMe)).toThrow(/auth\.rememberMe/);
  });
});

// Built in memory with the same builder scripts/write-cookie-policy-review.mjs uses: docs/ is gitignored, so the
// written file is absent on a clean checkout and in CI (reading it crashed the whole suite there).
describe("review copy: docs/legal/cookie-policy-generated.html", () => {
  const text = (buildCookiePolicyReview({ registry: REGISTRY, messagesEn: enMessages, messagesAr: arMessages }) as string).replace(/\r\n/g, "\n");

  it("is what the review script writes: the script only adds the file write", () => {
    const script = readFileSync(path.resolve(__dirname, "../../../scripts/write-cookie-policy-review.mjs"), "utf8");
    expect(script).toMatch(/buildCookiePolicyReview\(/);
    expect(script).not.toMatch(/buildCookiePolicy\(/);
  });

  it("is a complete HTML document that declares UTF-8 (Arabic prints correctly when opened)", () => {
    expect(text.startsWith("<!doctype html>")).toBe(true);
    expect(text).toContain('<meta charset="utf-8">');
    expect(text).toContain('<html>');
    expect(text.trimEnd().endsWith("</html>")).toBe(true);
  });

  it("has unique ids: the Arabic block's section ids carry an ar- prefix, the English ones do not", () => {
    const ids = [...text.matchAll(/ id="([^"]+)"/g)].map((m) => m[1]);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.filter((id) => id.startsWith("ar-"))).toEqual(EXPECTED_SECTION_IDS.map((id) => `ar-${id}`));
    expect(ids.filter((id) => !id.startsWith("ar-"))).toEqual(EXPECTED_SECTION_IDS);
  });

  it("does not leak the review-only prefix into the CMS body the generator returns", () => {
    expect(build("ar")).not.toContain('id="ar-');
    expect(sectionIds(build("ar"))).toEqual(sectionIds(build("en")));
  });
});
