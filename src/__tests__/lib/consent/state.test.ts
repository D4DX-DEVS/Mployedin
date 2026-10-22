import { parseConsent, serializeConsent, allowed, CONSENT_VERSION } from "@/lib/consent/state";
import { REGISTRY } from "@/lib/consent/registry";

const s = (o: object) => encodeURIComponent(JSON.stringify(o));

describe("consent state", () => {
  it("null for missing, legacy or garbage", () => {
    expect(parseConsent(undefined)).toBeNull();
    expect(parseConsent("accepted")).toBeNull();
    expect(parseConsent("{bad")).toBeNull();
  });
  it("round-trips", () => {
    const v = { v: CONSENT_VERSION, id: "r1", preferences: true, media: false, at: "2026-10-20T00:00:00.000Z" };
    expect(parseConsent(serializeConsent(v))).toEqual(v);
  });
  it("older version = no choice", () => {
    expect(parseConsent(s({ v: 0, preferences: true, media: true, at: "x" }))).toBeNull();
  });
  it("coerces non-boolean flags to false and caps id length", () => {
    const p = parseConsent(s({ v: CONSENT_VERSION, id: "x".repeat(200), preferences: "yes", media: 1, at: "x" }));
    expect(p).toMatchObject({ preferences: false, media: false });
    expect(p!.id.length).toBeLessThanOrEqual(36);
  });
  it("necessary always; media never without choice", () => {
    expect(allowed(null, "necessary")).toBe(true);
    expect(allowed(null, "media")).toBe(false);
  });
  it("preferences: allowed until objected (appearance exception, D1)", () => {
    expect(allowed(null, "preferences")).toBe(true);
    const objected = { v: CONSENT_VERSION, id: "r", preferences: false, media: false, at: "x" };
    expect(allowed(objected, "preferences")).toBe(false);
    expect(allowed({ ...objected, preferences: true }, "preferences")).toBe(true);
  });
});

describe("consent registry", () => {
  it("every row has a non-empty name, owner and purposeKey, and name+kind is unique", () => {
    const seen = new Set<string>();
    for (const row of REGISTRY) {
      expect(row.name.trim().length).toBeGreaterThan(0);
      expect(row.owner.trim().length).toBeGreaterThan(0);
      expect(row.purposeKey.trim().length).toBeGreaterThan(0);
      const key = `${row.kind}::${row.name}`;
      expect(seen.has(key)).toBe(false);
      seen.add(key);
    }
  });
});
