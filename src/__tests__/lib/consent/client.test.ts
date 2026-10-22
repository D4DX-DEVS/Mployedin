import { readConsent, writeConsent, withdrawCleanup, CONSENT_EVENT } from "@/lib/consent/client";

beforeEach(() => {
  document.cookie.split(";").forEach((c) => (document.cookie = c.split("=")[0].trim() + "=; Max-Age=0; path=/"));
  localStorage.clear(); sessionStorage.clear();
});

it("no cookie -> null", () => expect(readConsent()).toBeNull());

it("write sets mpl_consent with an id and fires the event", () => {
  const spy = jest.fn();
  window.addEventListener(CONSENT_EVENT, spy);
  const s = writeConsent({ preferences: true, media: false });
  expect(readConsent()).toEqual(s);
  expect(s.id).toMatch(/^[0-9a-f-]{36}$/);
  expect(document.cookie).toContain("mpl_consent=");
  expect(spy).toHaveBeenCalled();
  window.removeEventListener(CONSENT_EVENT, spy);
});

it("write removes the legacy cookie-consent localStorage key", () => {
  localStorage.setItem("cookie-consent", "accepted");
  writeConsent({ preferences: false, media: false });
  expect(localStorage.getItem("cookie-consent")).toBeNull();
});

it("withdrawing preferences deletes preference keys, keeps necessary ones", async () => {
  document.cookie = "NEXT_LOCALE=ar; path=/";
  localStorage.setItem("mployedin_display_currency", "GBP");
  localStorage.setItem("ui:commandmenu-x", "1");
  localStorage.setItem("mployedin_last_activity", "1");
  localStorage.setItem("mployedin_remember_email", "a@b.c");
  sessionStorage.setItem("job-draft-u1", "{}");
  const prev = writeConsent({ preferences: true, media: true });
  await withdrawCleanup(prev, writeConsent({ preferences: false, media: true }));
  expect(document.cookie).not.toContain("NEXT_LOCALE");
  expect(localStorage.getItem("mployedin_display_currency")).toBeNull();
  expect(localStorage.getItem("ui:commandmenu-x")).toBeNull();
  expect(localStorage.getItem("mployedin_last_activity")).toBe("1");
  expect(localStorage.getItem("mployedin_remember_email")).toBe("a@b.c");
  expect(sessionStorage.getItem("job-draft-u1")).toBe("{}");
});

it("withdrawal keeps the necessary keys (last activity, remember email, job drafts)", async () => {
  localStorage.setItem("mployedin_last_activity", "123");
  localStorage.setItem("mployedin_remember_email", "x@y.z");
  sessionStorage.setItem("job-draft-abc", "{\"title\":\"t\"}");
  const prev = writeConsent({ preferences: true, media: false });
  await withdrawCleanup(prev, writeConsent({ preferences: false, media: false }));
  expect(localStorage.getItem("mployedin_last_activity")).toBe("123");
  expect(localStorage.getItem("mployedin_remember_email")).toBe("x@y.z");
  expect(sessionStorage.getItem("job-draft-abc")).toBe("{\"title\":\"t\"}");
});

// document.cookie is an accessor on the prototype that owns it (not Document.prototype in jsdom); spy on that owner.
function cookieSetSpy() {
  let o: object | null = document;
  while (o && !Object.getOwnPropertyDescriptor(o, "cookie")) o = Object.getPrototypeOf(o);
  return jest.spyOn(o as Document, "cookie", "set");
}

it("withdrawal rewrites mployedin_a11y as a session cookie (no Max-Age/Expires) and keeps it", async () => {
  document.cookie = "mployedin_a11y=large; Max-Age=31536000; path=/";
  const prev = writeConsent({ preferences: true, media: false });
  const next = writeConsent({ preferences: false, media: false });
  const set = cookieSetSpy();
  let calls: unknown[][] = [];
  try {
    await withdrawCleanup(prev, next);
  } finally {
    calls = set.mock.calls; // mockRestore() clears mock.calls, so copy first
    set.mockRestore();
  }
  const writes = calls.map((c) => String(c[0])).filter((w) => w.startsWith("mployedin_a11y="));
  expect(writes.length).toBeGreaterThan(0);
  expect(writes[writes.length - 1]).toMatch(/^mployedin_a11y=large;/);
  expect(writes[writes.length - 1]).not.toMatch(/max-age|expires/i);
  expect(document.cookie).toContain("mployedin_a11y=large");
});

it("withdrawCleanup(null, preferences:false) deletes preference keys (first-visit Reject)", async () => {
  document.cookie = "NEXT_LOCALE=ar; path=/";
  localStorage.setItem("mployedin_display_currency", "GBP");
  localStorage.setItem("ui:commandmenu-x", "1");
  localStorage.setItem("mployedin_last_activity", "1");
  const next = writeConsent({ preferences: false, media: false });
  await withdrawCleanup(null, next);
  expect(document.cookie).not.toContain("NEXT_LOCALE");
  expect(localStorage.getItem("mployedin_display_currency")).toBeNull();
  expect(localStorage.getItem("ui:commandmenu-x")).toBeNull();
  expect(localStorage.getItem("mployedin_last_activity")).toBe("1");
});

it("withdrawCleanup with prev.preferences=false is a no-op", async () => {
  localStorage.setItem("mployedin_display_currency", "GBP");
  document.cookie = "NEXT_LOCALE=ar; path=/";
  const prev = writeConsent({ preferences: false, media: false });
  await withdrawCleanup(prev, writeConsent({ preferences: false, media: true }));
  expect(localStorage.getItem("mployedin_display_currency")).toBe("GBP");
  expect(document.cookie).toContain("NEXT_LOCALE=ar");
});

it("cleanup leaves mpl_consent untouched", async () => {
  const prev = writeConsent({ preferences: true, media: true });
  const next = writeConsent({ preferences: false, media: true });
  await withdrawCleanup(prev, next);
  expect(readConsent()).toEqual(next);
});

it("writeConsent falls back to a uuid-v4-shaped id when randomUUID is missing", () => {
  const orig = crypto.randomUUID;
  Object.defineProperty(crypto, "randomUUID", { configurable: true, value: undefined });
  try {
    const s = writeConsent({ preferences: true, media: true });
    expect(s.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(s.id).toHaveLength(36);
  } finally {
    Object.defineProperty(crypto, "randomUUID", { configurable: true, value: orig });
  }
});

it("withdrawal leaves unrelated localStorage keys alone", async () => {
  localStorage.setItem("other-app", "1");
  localStorage.setItem("ui:commandmenu-recents", "[]");
  const prev = writeConsent({ preferences: true, media: true });
  await withdrawCleanup(prev, writeConsent({ preferences: false, media: false }));
  expect(localStorage.getItem("other-app")).toBe("1");
  expect(localStorage.getItem("ui:commandmenu-recents")).toBeNull();
});

it("media-only change fires CONSENT_EVENT with media:false", async () => {
  const prev = writeConsent({ preferences: true, media: true });
  const spy = jest.fn();
  window.addEventListener(CONSENT_EVENT, spy);
  await withdrawCleanup(prev, writeConsent({ preferences: true, media: false }));
  expect(spy).toHaveBeenCalled();
  const detail = (spy.mock.calls[spy.mock.calls.length - 1][0] as CustomEvent).detail;
  expect(detail).toMatchObject({ preferences: true, media: false });
  window.removeEventListener(CONSENT_EVENT, spy);
});

// Keys that older builds stored under their pre-`ui:` names. A visitor who objects before a page has migrated
// one would otherwise keep it on the device: no REGISTRY row names it.
const LEGACY_SAMPLE = [
  "copilot-fab-pos",
  "pwa-install-dismissed",
  "mployedin:setup-guide:dismissed",
  "sa_insights_dismissed",
  "mployedin.a11y.button",
  "cvBuilder.previewHidden",
];
// The exchange-rate cache and the old poster / temporary-password copies are not preferences: they are
// deleted on every page load (CookieConsent.test.tsx), so withdrawing preferences has nothing to add.
function seedLegacy() {
  LEGACY_SAMPLE.forEach((k) => localStorage.setItem(k, "x"));
  localStorage.setItem("other-app", "1");
}

it("objecting to preferences also deletes the legacy (pre-ui:) keys", async () => {
  seedLegacy();
  const prev = writeConsent({ preferences: true, media: false });
  await withdrawCleanup(prev, writeConsent({ preferences: false, media: false }));
  LEGACY_SAMPLE.forEach((k) => expect(localStorage.getItem(k)).toBeNull());
  expect(localStorage.getItem("other-app")).toBe("1");
});

it("a first-visit Reject (no earlier choice) also deletes the legacy keys", async () => {
  seedLegacy();
  await withdrawCleanup(null, writeConsent({ preferences: false, media: false }));
  LEGACY_SAMPLE.forEach((k) => expect(localStorage.getItem(k)).toBeNull());
});

it("keeps the legacy keys when preferences are not withdrawn (the lazy migration handles those)", async () => {
  seedLegacy();
  const prev = writeConsent({ preferences: true, media: true });
  await withdrawCleanup(prev, writeConsent({ preferences: true, media: false })); // media-only change
  await withdrawCleanup(null, writeConsent({ preferences: true, media: true })); // first-visit Accept
  const already = writeConsent({ preferences: false, media: false });
  seedLegacy();
  await withdrawCleanup(already, writeConsent({ preferences: false, media: true })); // was already off
  LEGACY_SAMPLE.forEach((k) => expect(localStorage.getItem(k)).toBe("x"));
});
