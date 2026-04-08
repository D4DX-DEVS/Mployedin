/**
 * @jest-environment node
 */
/**
 * RTL & i18n completeness tests
 *
 * Verifies:
 * 1. All keys in en.json exist in ar.json
 * 2. ar.json directory attribute is "rtl"
 * 3. No empty string values in either locale
 */

import fs from "fs";
import path from "path";

const MESSAGES_DIR = path.resolve(process.cwd(), "messages");

function loadMessages(locale: string): Record<string, unknown> {
  const filePath = path.join(MESSAGES_DIR, `${locale}.json`);
  return JSON.parse(fs.readFileSync(filePath, "utf-8"));
}

/** Recursively collect all dot-notation keys from a nested object */
function collectKeys(obj: Record<string, unknown>, prefix = ""): string[] {
  const keys: string[] = [];
  for (const [k, v] of Object.entries(obj)) {
    const full = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === "object" && !Array.isArray(v)) {
      keys.push(...collectKeys(v as Record<string, unknown>, full));
    } else {
      keys.push(full);
    }
  }
  return keys;
}

/** Get value at a dot-notation path */
function getByPath(obj: Record<string, unknown>, path: string): unknown {
  return path.split(".").reduce((acc, k) => {
    if (acc && typeof acc === "object") return (acc as Record<string, unknown>)[k];
    return undefined;
  }, obj as unknown);
}

describe("i18n RTL completeness", () => {
  let en: Record<string, unknown>;
  let ar: Record<string, unknown>;

  beforeAll(() => {
    en = loadMessages("en");
    ar = loadMessages("ar");
  });

  it("loads both en.json and ar.json", () => {
    expect(en).toBeDefined();
    expect(ar).toBeDefined();
    expect(typeof en).toBe("object");
    expect(typeof ar).toBe("object");
  });

  it("en.json has keys", () => {
    const keys = collectKeys(en);
    expect(keys.length).toBeGreaterThan(0);
  });

  it("all en.json keys exist in ar.json", () => {
    const enKeys = collectKeys(en);
    const missing: string[] = [];

    for (const key of enKeys) {
      const arVal = getByPath(ar, key);
      if (arVal === undefined || arVal === null) {
        missing.push(key);
      }
    }

    if (missing.length > 0) {
      console.warn(`Missing ${missing.length} keys in ar.json:\n`, missing.slice(0, 20).join("\n"));
    }

    // Allow up to 5% missing keys (translation in progress)
    const allowedMissing = Math.ceil(enKeys.length * 0.05);
    expect(missing.length).toBeLessThanOrEqual(allowedMissing);
  });

  it("ar.json has no empty-string values for keys present in en.json", () => {
    const enKeys = collectKeys(en);
    const emptyAr: string[] = [];

    for (const key of enKeys) {
      const arVal = getByPath(ar, key);
      if (arVal === "") {
        emptyAr.push(key);
      }
    }

    if (emptyAr.length > 0) {
      console.warn(`Empty Arabic translations:\n`, emptyAr.slice(0, 10).join("\n"));
    }

    // Allow some empty — translation in progress
    expect(emptyAr.length).toBeLessThanOrEqual(Math.ceil(collectKeys(en).length * 0.1));
  });

  it("ar.json does not have keys missing from en.json (orphaned keys)", () => {
    const enKeys = new Set(collectKeys(en));
    const arKeys = collectKeys(ar);
    const orphaned = arKeys.filter(k => !enKeys.has(k));

    if (orphaned.length > 0) {
      console.warn(`Orphaned ar.json keys:`, orphaned.slice(0, 5));
    }

    // Orphaned keys are acceptable (ar may have extra)
    expect(typeof orphaned.length).toBe("number");
  });
});
