/**
 * @jest-environment node
 *
 * src/lib/consent/registry.json is the JSON copy of registry.ts that the
 * Cookie Policy script reads (plain Node cannot import the .ts). It is written
 * by `npm run consent:export`; this is the guard that it was re-exported after
 * the last registry change.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { REGISTRY } from "@/lib/consent/registry";
import {
  loadRegistryFromSource,
  serializeRegistry,
} from "../../../scripts/lib/consentRegistryExport.mjs";

const ROOT = path.resolve(__dirname, "../../..");
const TS_PATH = path.join(ROOT, "src/lib/consent/registry.ts");
const JSON_PATH = path.join(ROOT, "src/lib/consent/registry.json");

describe("registry.json", () => {
  it("equals the export of registry.ts (run `npm run consent:export` after changing the registry)", () => {
    // A Windows checkout with core.autocrlf turns the file's LF into CRLF; the content is what matters.
    const onDisk = readFileSync(JSON_PATH, "utf8").replace(/\r\n/g, "\n");
    expect(onDisk).toBe(serializeRegistry(REGISTRY));
  });

  it("parses to exactly the rows REGISTRY holds, in the same order", () => {
    const parsed = JSON.parse(readFileSync(JSON_PATH, "utf8"));
    expect(parsed).toEqual(JSON.parse(JSON.stringify(REGISTRY)));
    expect(parsed).toHaveLength(REGISTRY.length);
  });

  it("the export script's loader reads the same rows from registry.ts as the app does", () => {
    const rows = loadRegistryFromSource(readFileSync(TS_PATH, "utf8"));
    expect(rows).toEqual(REGISTRY);
  });
});

describe("serializeRegistry", () => {
  const row = {
    purposeKey: "auth",
    owner: "auth",
    duration: "session",
    party: "first",
    basis: "strictly-necessary",
    category: "necessary",
    kind: "cookie",
    name: "x",
  };

  it("writes keys in a fixed order whatever order the source object used", () => {
    const text = serializeRegistry([row]);
    const keys = Object.keys(JSON.parse(text)[0]);
    expect(keys).toEqual(["name", "kind", "category", "basis", "party", "duration", "owner", "purposeKey"]);
  });

  it("puts `legal` last, only when present, and keeps unknown future keys (sorted) instead of dropping them", () => {
    const text = serializeRegistry([{ ...row, legal: "pending", zeta: 1, alpha: 2 }]);
    expect(Object.keys(JSON.parse(text)[0])).toEqual([
      "name", "kind", "category", "basis", "party", "duration", "owner", "purposeKey", "legal", "alpha", "zeta",
    ]);
  });

  it("uses two-space indent and ends with exactly one newline", () => {
    const text = serializeRegistry([row]);
    expect(text.endsWith("}\n]\n")).toBe(true);
    expect(text).toContain('\n  {\n    "name": "x"');
    expect(text.endsWith("\n\n")).toBe(false);
  });

  it("is stable: exporting twice gives the same bytes", () => {
    expect(serializeRegistry(REGISTRY)).toBe(serializeRegistry(REGISTRY));
  });
});

describe("loadRegistryFromSource", () => {
  it("evaluates a TypeScript module with an exported REGISTRY array", () => {
    const rows = loadRegistryFromSource(
      'import type { Foo } from "./foo";\nexport const REGISTRY: Array<{ name: string }> = [{ name: "a" }];\n',
    );
    expect(rows).toEqual([{ name: "a" }]);
  });

  it("throws when the module has no REGISTRY array", () => {
    expect(() => loadRegistryFromSource("export const OTHER = 1;")).toThrow(/REGISTRY/);
  });

  it("throws, rather than reaching for the filesystem, if the source imports a value", () => {
    expect(() => loadRegistryFromSource('import fs from "node:fs"; export const REGISTRY = [fs];')).toThrow();
  });
});
