/**
 * @jest-environment node
 */
export {};

import { hasOptedOut } from "@/lib/communications/whatsapp/optOut";

const at = (iso: string) => new Date(iso);

describe("hasOptedOut (the one WhatsApp opt-out rule)", () => {
  it("is false with no WhatsApp state or no STOP on record", () => {
    expect(hasOptedOut(undefined)).toBe(false);
    expect(hasOptedOut(null)).toBe(false);
    expect(hasOptedOut({})).toBe(false);
    expect(hasOptedOut({ optOutAt: null })).toBe(false);
    expect(hasOptedOut({ optInAt: at("2026-09-01T00:00:00Z") })).toBe(false);
  });
  it("is true for a STOP with no opt-in on record", () => {
    expect(hasOptedOut({ optOutAt: at("2026-09-01T00:00:00Z") })).toBe(true);
    expect(hasOptedOut({ optOutAt: at("2026-09-01T00:00:00Z"), optInAt: null })).toBe(true);
  });
  it("is true when the opt-in is older than the STOP", () => {
    expect(hasOptedOut({ optInAt: at("2026-09-01T00:00:00Z"), optOutAt: at("2026-09-02T00:00:00Z") })).toBe(true);
  });
  it("is false when the opt-in is strictly newer than the STOP", () => {
    expect(hasOptedOut({ optOutAt: at("2026-09-01T00:00:00Z"), optInAt: at("2026-09-02T00:00:00Z") })).toBe(false);
  });
  it("lets a tie go to the STOP", () => {
    const t = at("2026-09-01T00:00:00Z");
    expect(hasOptedOut({ optInAt: t, optOutAt: new Date(t) })).toBe(true);
  });
  it("reads ISO strings the same way as Dates", () => {
    expect(hasOptedOut({ optInAt: "2026-09-01T00:00:00.000Z", optOutAt: "2026-09-02T00:00:00.000Z" })).toBe(true);
    expect(hasOptedOut({ optOutAt: "2026-09-01T00:00:00.000Z", optInAt: "2026-09-02T00:00:00.000Z" })).toBe(false);
  });
  it("counts an unreadable date as opted out", () => {
    expect(hasOptedOut({ optOutAt: "not-a-date" })).toBe(true);
    expect(hasOptedOut({ optOutAt: "not-a-date", optInAt: at("2026-09-02T00:00:00Z") })).toBe(true);
    expect(hasOptedOut({ optOutAt: at("2026-09-01T00:00:00Z"), optInAt: "not-a-date" })).toBe(true);
  });
});
