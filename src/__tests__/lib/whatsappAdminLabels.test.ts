/**
 * @jest-environment node
 */
import { WHATSAPP_MESSAGE_STATUSES, WHATSAPP_SOURCES } from "@/models/WhatsAppMessageLog";
import { AUTOMATION_KEYS } from "@/lib/communications/whatsapp/automationDefaults";
import { BROADCAST_ROLES } from "@/lib/communications/broadcastAudience";
import type { SkipReason } from "@/lib/communications/whatsapp/notificationDelivery";
import type { WhatsAppErrorKind } from "@/lib/communications/whatsapp/errors";
import {
  AUTOMATION_ORDER, automationLabel, categoryLabel, errorKindLabel, languageLabel, qualityLabel, roleLabel, runStatusLabel, showNotConnectedStatus,
  skipReasonLabel, sourceLabel, statusLabel, templateStatusLabel, tierLabel, type Translator, type WaStatus,
} from "@/app/[locale]/(dashboard)/admin/settings/whatsapp/_components/shared";

const en = require("../../../messages/en.json") as { adminWhatsApp: Record<string, string> };
const ar = require("../../../messages/ar.json") as { adminWhatsApp: Record<string, string> };

/** Returns "«key»" and records which keys were asked for, so a label is checked by the key it picked. */
function spy() {
  const keys: string[] = [];
  const t: Translator = (key) => {
    keys.push(key);
    return `«${key}»`;
  };
  return { t, keys };
}
const keyOf = (label: string) => label.replace(/^«|»$/g, "");

// `SkipReason` and `WhatsAppErrorKind` are type-only exports (no runtime list), so the lists are hard-coded
// here as exhaustive records: adding a member to either union without adding it here fails `tsc`.
const SKIP_REASONS: Record<SkipReason, true> = {
  disabled_by_admin: true, no_phone: true, invalid_phone: true, opted_out: true, daily_cap: true, no_template_outside_window: true,
  not_verified: true,
};
const ERROR_KINDS: Record<WhatsAppErrorKind, true> = {
  outside_window: true, undeliverable: true, marketing_limit: true, user_opted_out_marketing: true, rate_limited: true,
  template_error: true, phone_not_registered: true, auth: true, account_restricted: true, unknown: true,
};

describe("WhatsApp admin label mappers", () => {
  it.each(WHATSAPP_MESSAGE_STATUSES)("statusLabel covers the message status %s", (status) => {
    const { t, keys } = spy();
    const label = statusLabel(status, t);
    expect(label).toMatch(/^«status/);
    expect(keys).toHaveLength(1);
    expect(en.adminWhatsApp[keyOf(label)]).toBeTruthy();
    expect(ar.adminWhatsApp[keyOf(label)]).toBeTruthy();
  });

  it.each(WHATSAPP_SOURCES)("sourceLabel covers the message source %s", (source) => {
    const { t } = spy();
    const label = sourceLabel(source, t);
    expect(label).toMatch(/^«source/);
    expect(en.adminWhatsApp[keyOf(label)]).toBeTruthy();
    expect(ar.adminWhatsApp[keyOf(label)]).toBeTruthy();
  });

  it.each(Object.keys(SKIP_REASONS))("skipReasonLabel has its own label for %s, not the fallback", (reason) => {
    const { t } = spy();
    const key = keyOf(skipReasonLabel(reason, t));
    expect(key).not.toBe("reasonUnknown");
    expect(en.adminWhatsApp[key]).toBeTruthy();
    expect(ar.adminWhatsApp[key]).toBeTruthy();
  });

  it("skipReasonLabel gives anything else (including the status route's null reason) the localized fallback", () => {
    const { t } = spy();
    expect(skipReasonLabel("unknown", t)).toBe("«reasonUnknown»");
    expect(skipReasonLabel("a_reason_added_later", t)).toBe("«reasonUnknown»");
  });

  it.each(Object.keys(ERROR_KINDS))("errorKindLabel has copy for the error kind %s", (kind) => {
    const { t } = spy();
    const key = keyOf(errorKindLabel(kind, t));
    expect(key).toMatch(/^errorKind/);
    expect(en.adminWhatsApp[key]).toBeTruthy();
    expect(ar.adminWhatsApp[key]).toBeTruthy();
    // Only "unknown" may map to the catch-all.
    if (kind !== "unknown") expect(key).not.toBe("errorKindUnknown");
  });

  it("errorKindLabel falls back to localized copy for a kind it does not know", () => {
    const { t } = spy();
    expect(errorKindLabel("a_kind_added_later", t)).toBe("«errorKindUnknown»");
  });

  it("every automation key has a label, in the page's order", () => {
    expect([...AUTOMATION_ORDER]).toEqual([...AUTOMATION_KEYS]);
    for (const key of AUTOMATION_KEYS) {
      const { t } = spy();
      const label = automationLabel(key, t);
      expect(label).toMatch(/^«auto/);
      expect(en.adminWhatsApp[keyOf(label)]).toBeTruthy();
      expect(ar.adminWhatsApp[keyOf(label)]).toBeTruthy();
    }
  });

  it("every broadcast role has a label", () => {
    for (const role of BROADCAST_ROLES) {
      const { t } = spy();
      const label = roleLabel(role, t);
      expect(label).toMatch(/^«role/);
      expect(en.adminWhatsApp[keyOf(label)]).toBeTruthy();
      expect(ar.adminWhatsApp[keyOf(label)]).toBeTruthy();
    }
  });

  it("run statuses map to their copy and a missing run reads as Never", () => {
    const { t } = spy();
    expect(runStatusLabel("success", t)).toBe("«runSuccess»");
    expect(runStatusLabel("partial", t)).toBe("«runPartial»");
    expect(runStatusLabel("error", t)).toBe("«runError»");
    expect(runStatusLabel(undefined, t)).toBe("«never»");
  });

  // Meta's template statuses are uppercase codes; the page never shows one raw.
  it.each([
    ["APPROVED", "tplStatusApproved"],
    ["PENDING", "tplStatusPending"],
    ["IN_APPEAL", "tplStatusPending"],
    ["REJECTED", "tplStatusRejected"],
    ["PAUSED", "tplStatusStopped"],
    ["DISABLED", "tplStatusStopped"],
    ["DELETED", "tplStatusDeleted"],
    ["PENDING_DELETION", "tplStatusDeleted"],
    ["A_STATUS_ADDED_LATER", "tplStatusOther"],
  ])("templateStatusLabel says %s in plain words", (status, key) => {
    const { t } = spy();
    expect(templateStatusLabel(status, t)).toBe(`«${key}»`);
    expect(en.adminWhatsApp[key]).toBeTruthy();
    expect(ar.adminWhatsApp[key]).toBeTruthy();
  });

  it.each([
    ["UTILITY", "categoryUtility"],
    ["MARKETING", "categoryMarketing"],
    ["AUTHENTICATION", "categoryAuthentication"],
    ["SOMETHING_NEW", "categoryOther"],
  ])("categoryLabel says %s in plain words", (category, key) => {
    const { t } = spy();
    expect(categoryLabel(category, t)).toBe(`«${key}»`);
    expect(en.adminWhatsApp[key]).toBeTruthy();
    expect(ar.adminWhatsApp[key]).toBeTruthy();
  });

  it.each([
    ["GREEN", "«qualityHigh»"],
    ["YELLOW", "«qualityMedium»"],
    ["RED", "«qualityLow»"],
    ["UNKNOWN", "«qualityUnknown»"],
    ["NA", "«qualityUnknown»"],
  ])("qualityLabel says %s in plain words", (rating, label) => {
    const { t } = spy();
    expect(qualityLabel(rating, t)).toBe(label);
  });

  it("tierLabel turns Meta's tier code into a number of people a day", () => {
    const calls: Array<[string, unknown]> = [];
    const t: Translator = (key, values) => {
      calls.push([key, values?.count]);
      return `«${key}»`;
    };
    expect(tierLabel("TIER_250", t)).toBe("«tierPeople»");
    expect(tierLabel("TIER_1K", t)).toBe("«tierPeople»");
    expect(tierLabel("TIER_100K", t)).toBe("«tierPeople»");
    expect(calls).toEqual([["tierPeople", 250], ["tierPeople", 1000], ["tierPeople", 100000]]);
    expect(tierLabel("TIER_UNLIMITED", t)).toBe("«tierUnlimited»");
    // A shape it does not know is never shown as Meta's raw code: it reads "Not known yet" instead.
    expect(tierLabel("TIER_SOMETHING", t)).toBe("«tierUnknown»");
    expect(tierLabel("TIER_SOMETHING", t)).not.toContain("TIER_");
    expect(tierLabel("", t)).toBe("«tierUnknown»");
  });

  it("languageLabel names the template language in the viewer's language, and keeps an unreadable code", () => {
    expect(languageLabel("en", "en")).toBe("English");
    expect(languageLabel("en_US", "en")).toBe("English (United States)");
    expect(languageLabel("ar", "en")).toBe("Arabic");
    expect(languageLabel("ar", "ar")).toBe("العربية");
    expect(languageLabel("not a code!", "en")).toBe("not a code!");
  });

  it("shows the 'not sent (not connected)' status only while not connected, unknown, or when such messages exist", () => {
    const status = (mode: "live" | "mock", mock: number) =>
      ({ mode, last24h: { sent: 0, delivered: 0, read: 0, failed: 0, skipped: 0, mock } }) as WaStatus;
    expect(showNotConnectedStatus(null)).toBe(true);
    expect(showNotConnectedStatus(status("mock", 0))).toBe(true);
    expect(showNotConnectedStatus(status("live", 3))).toBe(true);
    expect(showNotConnectedStatus(status("live", 0))).toBe(false);
  });
});

describe("adminWhatsApp locale parity", () => {
  it("has the same keys in English and Arabic", () => {
    expect(Object.keys(ar.adminWhatsApp).sort()).toEqual(Object.keys(en.adminWhatsApp).sort());
  });

  // A Latin example inside right-to-left text reorders its "+" and underscores unless it is isolated.
  it("isolates the Latin phone examples inside the Arabic copy (LRI \u2066 ... PDI \u2069)", () => {
    expect(ar.adminWhatsApp.testPhone).toContain("\u2066+971501234567\u2069");
    expect(ar.adminWhatsApp.testNotSent).toContain("\u2066+971\u2026\u2069");
    // The English copy carries no isolates.
    expect(en.adminWhatsApp.testPhone).not.toMatch(/[\u2066\u2069]/);
    expect(en.adminWhatsApp.testNotSent).not.toMatch(/[\u2066\u2069]/);
  });
});
