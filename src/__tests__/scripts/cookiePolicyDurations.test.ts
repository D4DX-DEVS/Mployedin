/**
 * @jest-environment node
 *
 * What the registry says about how long something is kept, and what the
 * generated Cookie Policy prints for it. A duration is shown to visitors, so it
 * must say what happens when they object, and the generator's wording maps must
 * hold exactly the durations the registry uses (it fails loudly on a missing
 * one; this also catches one nobody uses any more).
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { REGISTRY } from "@/lib/consent/registry";
import enMessages from "../../../messages/en.json";
import arMessages from "../../../messages/ar.json";
import { buildCookiePolicy, escapeHtml } from "../../../scripts/lib/cookiePolicyFromRegistry.mjs";

const row = (name: string) => {
  const found = REGISTRY.find((item) => item.name === name);
  if (!found) throw new Error(`no registry row ${name}`);
  return found;
};

function policy(locale: "en" | "ar") {
  return buildCookiePolicy({ registry: REGISTRY, messages: locale === "en" ? enMessages : arMessages, locale });
}

/** The cells of the policy row for `name`, as text. */
function cells(html: string, name: string): string[] {
  const at = html.indexOf(`<code>${escapeHtml(name)}</code>`);
  expect(at).toBeGreaterThan(-1);
  const start = html.lastIndexOf("<tr>", at);
  const end = html.indexOf("</tr>", at);
  return [...html.slice(start, end).matchAll(/<td[^>]*>(.*?)<\/td>/g)].map((match) => match[1]);
}

describe("registry durations say what happens when the visitor objects", () => {
  it("display settings kept in browser storage last for this visit only if the visitor objects", () => {
    expect(row("ui:*").duration).toBe("until removed (this visit only if you object)");
    expect(row("mployedin_display_currency").duration).toBe("until removed (this visit only if you object)");
  });

  it("the cookies already did (NEXT_LOCALE is simply not set after an objection)", () => {
    expect(row("mployedin_a11y").duration).toBe("12 months (session if not allowed)");
  });

  it("Firebase's database is described in plain words, not by a task number", () => {
    expect(row("firebaseLocalStorageDb").duration).toBe("none (held in memory only)");
    for (const item of REGISTRY) expect(item.duration).not.toMatch(/Task \d+/i);
  });

  it("the policy prints the wording in English and Arabic", () => {
    expect(cells(policy("en"), "ui:*")[3]).toBe("Until you remove it, or this visit only if you object");
    expect(cells(policy("ar"), "ui:*")[3]).toBe("حتى تحذفه، أو لهذه الزيارة فقط إذا اعترضت");
    expect(cells(policy("en"), "mployedin_display_currency")[3]).toBe("Until you remove it, or this visit only if you object");
    expect(cells(policy("en"), "firebaseLocalStorageDb")[3]).toBe("None kept (held in memory only)");
    expect(cells(policy("ar"), "firebaseLocalStorageDb")[3]).toBe("لا شيء يُحفظ (يبقى في الذاكرة فقط)");
  });
});

describe("tab-scoped rows for poster edits and the temporary-password dismissal", () => {
  it.each([
    ["poster-edit:*", "taskState"],
    ["mployedin:temp-password-notice-dismissed:*", "noticeDismissed"],
  ])("%s is listed like the job drafts: session storage, in the tab, because the user asked", (name, purposeKey) => {
    expect(row(name)).toMatchObject({
      kind: "sessionStorage",
      category: "necessary",
      basis: "user-action",
      party: "first",
      duration: "tab",
      purposeKey,
    });
  });

  it("they are not preferences, and nothing under ui:* is a poster draft or a dismissal any more", () => {
    expect(REGISTRY.filter((item) => item.category === "preferences").map((item) => item.name).sort()).toEqual(
      ["NEXT_LOCALE", "mployedin_a11y", "mployedin_display_currency", "ui:*"].sort(),
    );
  });

  it("the policy lists them under what loads or is saved only because you asked", () => {
    for (const locale of ["en", "ar"] as const) {
      const html = policy(locale);
      expect(cells(html, "poster-edit:*")[1]).toBe(locale === "en" ? "Session storage" : "تخزين الجلسة");
      expect(cells(html, "poster-edit:*")[3]).toBe(locale === "en" ? "Until you close the tab" : "حتى تغلق علامة التبويب");
      expect(cells(html, "mployedin:temp-password-notice-dismissed:*")[3]).toBe(
        locale === "en" ? "Until you close the tab" : "حتى تغلق علامة التبويب",
      );
    }
  });
});

describe("the generator's duration wording maps", () => {
  const source = readFileSync(path.join(process.cwd(), "scripts", "lib", "cookiePolicyFromRegistry.mjs"), "utf8");

  /** Keys of each `durations: { ... }` block, in file order: English first, then Arabic. */
  const blocks = [...source.matchAll(/durations:\s*\{([\s\S]*?)\n\s{4}\},/g)].map((match) =>
    [...match[1].matchAll(/^\s*(?:"([^"]+)"|([A-Za-z_]+)):/gm)].map((key) => key[1] ?? key[2]),
  );

  it("finds one block per language", () => {
    expect(blocks).toHaveLength(2);
  });

  it.each([
    ["en", 0],
    ["ar", 1],
  ])("%s: has wording for exactly the durations the registry uses, and no dead ones", (_locale, index) => {
    const used = [...new Set(REGISTRY.map((item) => item.duration))].sort();
    expect([...blocks[index]].sort()).toEqual(used);
  });
});
