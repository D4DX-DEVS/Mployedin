import { prefStorage } from "@/lib/consent/prefStorage";
import { writeConsent } from "@/lib/consent/client";

beforeEach(() => { localStorage.clear(); sessionStorage.clear(); document.cookie = "mpl_consent=; Max-Age=0; path=/"; });

it("no choice yet -> persistent (appearance exception, D1)", () => {
  prefStorage.set("mployedin_display_currency", "GBP");
  expect(localStorage.getItem("mployedin_display_currency")).toBe("GBP");
});
it("objected (Reject / Preferences off) -> sessionStorage only", () => {
  writeConsent({ preferences: false, media: false });
  prefStorage.set("mployedin_display_currency", "GBP");
  expect(localStorage.getItem("mployedin_display_currency")).toBeNull();
  expect(prefStorage.get("mployedin_display_currency")).toBe("GBP");
});
it("never throws when storage is blocked", () => {
  const orig = Storage.prototype.setItem;
  Storage.prototype.setItem = () => { throw new Error("blocked"); };
  try {
    expect(() => prefStorage.set("k", "v")).not.toThrow();
  } finally {
    Storage.prototype.setItem = orig;
  }
});
it("remove clears both storages", () => {
  localStorage.setItem("k", "1");
  sessionStorage.setItem("k", "2");
  prefStorage.remove("k");
  expect(localStorage.getItem("k")).toBeNull();
  expect(sessionStorage.getItem("k")).toBeNull();
});

describe("getWithLegacy (a key renamed to ui:<old>)", () => {
  it("returns the current key's value", () => {
    prefStorage.set("ui:x", "new");
    expect(prefStorage.getWithLegacy("ui:x", "x")).toBe("new");
  });
  it("legacy only -> migrates to the new key, removes the old one, returns the value", () => {
    localStorage.setItem("x", "old");
    expect(prefStorage.getWithLegacy("ui:x", "x")).toBe("old");
    expect(localStorage.getItem("ui:x")).toBe("old");
    expect(localStorage.getItem("x")).toBeNull();
    // second read comes from the new key; nothing left to migrate
    expect(prefStorage.getWithLegacy("ui:x", "x")).toBe("old");
  });
  it("prefers the current key over a legacy one", () => {
    prefStorage.set("ui:x", "new");
    localStorage.setItem("x", "old");
    expect(prefStorage.getWithLegacy("ui:x", "x")).toBe("new");
  });
  it("neither -> null and nothing written", () => {
    expect(prefStorage.getWithLegacy("ui:x", "x")).toBeNull();
    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);
  });
  it("preferences objected -> the migrated value lands in sessionStorage and the legacy key is still removed", () => {
    writeConsent({ preferences: false, media: false });
    localStorage.setItem("x", "old");
    expect(prefStorage.getWithLegacy("ui:x", "x")).toBe("old");
    expect(sessionStorage.getItem("ui:x")).toBe("old");
    expect(localStorage.getItem("ui:x")).toBeNull();
    expect(localStorage.getItem("x")).toBeNull();
  });
  it("works for a key built at runtime, e.g. ui:poster-edit:<id>", () => {
    localStorage.setItem("poster-edit:abc", "{}");
    expect(prefStorage.getWithLegacy("ui:poster-edit:abc", "poster-edit:abc")).toBe("{}");
    expect(localStorage.getItem("ui:poster-edit:abc")).toBe("{}");
    expect(localStorage.getItem("poster-edit:abc")).toBeNull();
  });
  it("never throws when storage is blocked", () => {
    const orig = Storage.prototype.getItem;
    Storage.prototype.getItem = () => { throw new Error("blocked"); };
    try {
      expect(prefStorage.getWithLegacy("ui:x", "x")).toBeNull();
    } finally {
      Storage.prototype.getItem = orig;
    }
  });
});
