/**
 * @jest-environment jsdom
 *
 * The pre-`ui:` storage names live in one module. The components that migrate a
 * key import their legacy name from it and `sweepLegacyPreferenceKeys` deletes
 * every name in it, so the migration list and the objection sweep cannot drift.
 */
import fs from "fs";
import path from "path";
import * as legacy from "@/lib/consent/legacyKeys";
import { POSTER_EDIT_PREFIX, TEMP_PASSWORD_NOTICE_PREFIX } from "@/lib/consent/deviceStorage";
import { sweepLegacyDeviceCopies, sweepLegacyPreferenceKeys } from "@/lib/consent/legacyKeys";

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});

describe("legacy key list", () => {
  it("lists exactly the preference names that Task 6 moved to ui:*", () => {
    expect([...legacy.LEGACY_PREFERENCE_KEYS].sort()).toEqual(
      [
        "copilot-fab-pos",
        "pwa-install-dismissed",
        "mployedin:setup-guide:dismissed",
        "sa_insights_dismissed",
        "mployedin.a11y.button",
        "cvBuilder.previewHidden",
      ].sort(),
    );
  });

  it("does not treat the exchange-rate cache as a preference", () => {
    expect(legacy.LEGACY_PREFERENCE_KEYS).not.toContain("mployedin_exchange_rates");
    expect(legacy.LEGACY_DEVICE_COPY_KEYS).toEqual(["mployedin_exchange_rates"]);
  });

  it("lists the poster draft and temporary-password families as device copies, not preferences", () => {
    expect([...legacy.LEGACY_DEVICE_COPY_PREFIXES].sort()).toEqual(
      ["poster-edit:", "mployedin:temp-password-notice-dismissed:"].sort(),
    );
    expect(legacy).not.toHaveProperty("LEGACY_PREFERENCE_KEY_PREFIXES");
  });

  it("derives the poster and temporary-password prefixes from the current ones, so the strings cannot drift", () => {
    expect(legacy.LEGACY_POSTER_EDIT_PREFIX).toBe(POSTER_EDIT_PREFIX);
    expect(legacy.LEGACY_TEMP_PASSWORD_NOTICE_PREFIX).toBe(TEMP_PASSWORD_NOTICE_PREFIX);
    // Derived, not retyped: neither string is written out a second time in legacyKeys.ts.
    const source = fs.readFileSync(path.join(process.cwd(), "src", "lib", "consent", "legacyKeys.ts"), "utf8");
    expect(source).not.toContain(`"${POSTER_EDIT_PREFIX}"`);
    expect(source).not.toContain(`"${TEMP_PASSWORD_NOTICE_PREFIX}"`);
  });

  it("sweeps every LEGACY_* name the module exports (a new constant cannot be left out)", () => {
    const swept: readonly string[] = [
      ...legacy.LEGACY_PREFERENCE_KEYS,
      ...legacy.LEGACY_DEVICE_COPY_KEYS,
      ...legacy.LEGACY_DEVICE_COPY_PREFIXES,
    ];
    const constants: Array<{ name: string; value: string }> = [];
    for (const [name, value] of Object.entries(legacy)) {
      if (name.startsWith("LEGACY_") && typeof value === "string") constants.push({ name, value });
    }
    expect(constants.length).toBeGreaterThanOrEqual(9);
    for (const { name, value } of constants) {
      expect({ name, covered: swept.includes(value) }).toEqual({ name, covered: true });
    }
  });

  it("has no name that is also a current ui:* key", () => {
    const all = [...legacy.LEGACY_PREFERENCE_KEYS, ...legacy.LEGACY_DEVICE_COPY_KEYS, ...legacy.LEGACY_DEVICE_COPY_PREFIXES];
    for (const name of all) expect(name.startsWith("ui:")).toBe(false);
  });
});

describe("sweepLegacyPreferenceKeys", () => {
  it("removes every exact legacy key", () => {
    for (const key of legacy.LEGACY_PREFERENCE_KEYS) localStorage.setItem(key, "x");
    sweepLegacyPreferenceKeys();
    for (const key of legacy.LEGACY_PREFERENCE_KEYS) expect(localStorage.getItem(key)).toBeNull();
  });

  it("leaves the exchange-rate cache and the poster / temporary-password copies to the device-copy sweep", () => {
    localStorage.setItem("mployedin_exchange_rates", "{}");
    localStorage.setItem("poster-edit:abc", "{}");
    localStorage.setItem("mployedin:temp-password-notice-dismissed:user-1", "1");
    sweepLegacyPreferenceKeys();
    expect(localStorage.length).toBe(3);
  });

  it("leaves unrelated keys, the current ui:* keys and sessionStorage alone", () => {
    localStorage.setItem("copilot-fab-pos", "x");
    localStorage.setItem("other-app", "1");
    localStorage.setItem("mployedin_display_currency", "GBP");
    localStorage.setItem("mployedin_last_activity", "1");
    localStorage.setItem("ui:copilot-fab-pos", "y");
    sessionStorage.setItem("copilot-fab-pos", "z");
    sweepLegacyPreferenceKeys();
    expect(localStorage.getItem("copilot-fab-pos")).toBeNull();
    expect(localStorage.getItem("other-app")).toBe("1");
    expect(localStorage.getItem("mployedin_display_currency")).toBe("GBP");
    expect(localStorage.getItem("mployedin_last_activity")).toBe("1");
    expect(localStorage.getItem("ui:copilot-fab-pos")).toBe("y");
    expect(sessionStorage.getItem("copilot-fab-pos")).toBe("z");
  });

  it("never throws when storage is blocked", () => {
    localStorage.setItem("copilot-fab-pos", "x");
    const spy = jest.spyOn(Storage.prototype, "removeItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    try {
      expect(() => sweepLegacyPreferenceKeys()).not.toThrow();
    } finally {
      spy.mockRestore();
    }
  });
});

/*
 * Old copies that are not preferences at all (a data cache, work in progress,
 * a user-id-keyed dismissal) are deleted on every load, whatever the visitor
 * chose about cookies. The current homes of poster drafts and the dismissal are
 * sessionStorage keys with the same names, so only localStorage is touched.
 */
describe("sweepLegacyDeviceCopies", () => {
  it("removes the exchange-rate cache", () => {
    localStorage.setItem("mployedin_exchange_rates", JSON.stringify({ rates: {}, storedAt: 1 }));
    sweepLegacyDeviceCopies();
    expect(localStorage.getItem("mployedin_exchange_rates")).toBeNull();
  });

  it("removes every poster draft and temporary-password dismissal in localStorage", () => {
    localStorage.setItem("poster-edit:abc", "{}");
    localStorage.setItem("poster-edit:def", "{}");
    localStorage.setItem("mployedin:temp-password-notice-dismissed:user-1", "1");
    sweepLegacyDeviceCopies();
    expect(localStorage.length).toBe(0);
  });

  it("leaves preferences, similar-looking names and the tab's own keys alone", () => {
    localStorage.setItem("poster-editor", "1"); // looks similar, is not the poster-edit:<id> family
    localStorage.setItem("copilot-fab-pos", "x"); // a preference: the preference sweep owns it
    localStorage.setItem("ui:copilot-fab-pos", "y");
    localStorage.setItem("mployedin_display_currency", "GBP");
    localStorage.setItem("mployedin_last_activity", "1");
    sessionStorage.setItem("poster-edit:abc", "{}");
    sessionStorage.setItem("mployedin:temp-password-notice-dismissed:user-1", "1");
    sessionStorage.setItem("mployedin_exchange_rates", "{}");
    sweepLegacyDeviceCopies();
    expect(Object.keys(localStorage).sort()).toEqual(
      ["copilot-fab-pos", "mployedin_display_currency", "mployedin_last_activity", "poster-editor", "ui:copilot-fab-pos"].sort(),
    );
    expect(sessionStorage.getItem("poster-edit:abc")).toBe("{}");
    expect(sessionStorage.getItem("mployedin:temp-password-notice-dismissed:user-1")).toBe("1");
    expect(sessionStorage.getItem("mployedin_exchange_rates")).toBe("{}");
  });

  it("never throws when storage is blocked", () => {
    localStorage.setItem("mployedin_exchange_rates", "{}");
    const spy = jest.spyOn(Storage.prototype, "removeItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    try {
      expect(() => sweepLegacyDeviceCopies()).not.toThrow();
    } finally {
      spy.mockRestore();
    }
  });
});

/* Every getWithLegacy call site passes a name from the module, never a literal. */
function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "__tests__" || entry.name === "node_modules") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) sourceFiles(full, out);
    else if (/\.(ts|tsx)$/.test(entry.name)) out.push(full);
  }
  return out;
}

/** The second argument of each `getWithLegacy(...)` call in `source`, as written. */
function legacyArguments(source: string): string[] {
  const found: string[] = [];
  let from = 0;
  for (;;) {
    const at = source.indexOf("getWithLegacy(", from);
    if (at === -1) return found;
    let i = at + "getWithLegacy(".length;
    const start = i;
    let depth = 1;
    let comma = -1;
    while (i < source.length && depth > 0) {
      const c = source[i];
      if (c === '"' || c === "'" || c === "`") {
        const quote = c;
        i++;
        while (i < source.length && source[i] !== quote) i += source[i] === "\\" ? 2 : 1;
      } else if (c === "(" || c === "[" || c === "{") depth++;
      else if (c === ")" || c === "]" || c === "}") depth--;
      else if (c === "," && depth === 1 && comma === -1) comma = i;
      i++;
    }
    found.push(comma === -1 ? "" : source.slice(comma + 1, i - 1).trim());
    from = start;
  }
}

describe("getWithLegacy call sites", () => {
  const root = path.join(process.cwd(), "src");
  const sites = sourceFiles(root)
    .filter((file) => !file.endsWith(path.join("lib", "consent", "prefStorage.ts")))
    .flatMap((file) => {
      const source = fs.readFileSync(file, "utf8");
      return legacyArguments(source).map((arg) => ({ file: path.relative(root, file), arg, source }));
    });

  it("finds the call sites (the scan itself works)", () => {
    expect(sites.length).toBeGreaterThanOrEqual(6);
  });

  it("does not migrate the poster drafts or the temporary-password dismissal: they are tab storage now", () => {
    const names = sites.flatMap(({ arg }) => arg.match(/\bLEGACY_[A-Z0-9_]+\b/g) ?? []);
    expect(names).not.toContain("LEGACY_POSTER_EDIT_PREFIX");
    expect(names).not.toContain("LEGACY_TEMP_PASSWORD_NOTICE_PREFIX");
    expect(names).not.toContain("LEGACY_EXCHANGE_RATES_KEY");
  });

  it("each passes a LEGACY_* name exported by the legacyKeys module, not a literal", () => {
    for (const { file, arg, source } of sites) {
      const names = arg.match(/\bLEGACY_[A-Z0-9_]+\b/g) ?? [];
      expect({ file, arg, names: names.length > 0 }).toEqual({ file, arg, names: true });
      expect({ file, imported: source.includes("@/lib/consent/legacyKeys") }).toEqual({ file, imported: true });
      for (const name of names) {
        expect({ file, name, exported: typeof (legacy as Record<string, unknown>)[name] }).toEqual({ file, name, exported: "string" });
        // Imported, not redeclared locally with its own copy of the string.
        expect({ file, name, redeclared: new RegExp(`(const|let|var)\\s+${name}\\b`).test(source) }).toEqual({ file, name, redeclared: false });
      }
    }
  });
});
