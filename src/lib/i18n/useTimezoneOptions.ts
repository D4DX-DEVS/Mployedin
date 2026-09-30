"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";

export interface TimezoneOption {
  value: string;
  label: string;
}

// Names that reach a picker but match none of its options. Chrome on Windows
// still reports India by its old name, and the agent pickers used to offer
// "Asia/Cairo", which is not a real zone (Cairo is Africa/Cairo).
const ZONE_ALIASES: Record<string, string> = {
  "Asia/Calcutta": "Asia/Kolkata",
  "Asia/Cairo": "Africa/Cairo",
};

/** "GMT+4", "GMT+5:30" — today's offset, so summer time shows as it is. */
function gmtOffset(timeZone: string): string {
  try {
    return (
      new Intl.DateTimeFormat("en-US", { timeZone, timeZoneName: "shortOffset" })
        .formatToParts(new Date())
        .find((part) => part.type === "timeZoneName")?.value ?? ""
    );
  } catch {
    return "";
  }
}

/** "دبي (GMT+4)"; the offset is isolated so it keeps its order inside Arabic. */
function zoneLabel(city: string, timeZone: string): string {
  const offset = gmtOffset(timeZone);
  return offset ? `${city} (\u2066${offset}\u2069)` : city;
}

/**
 * Translated labels for a time-zone picker's zones, and the saved zone
 * resolved through old names. A saved zone outside the list is added at the
 * top, so the field still shows what is set rather than an empty prompt.
 */
export function useTimezoneOptions(
  zones: readonly string[],
  saved: string,
): { options: TimezoneOption[]; value: string } {
  const t = useTranslations("timezones");
  return useMemo(() => {
    const cities: Record<string, string> = {
      "Asia/Dubai": t("dubai"),
      "Asia/Riyadh": t("riyadh"),
      "Asia/Qatar": t("qatar"),
      "Asia/Kuwait": t("kuwait"),
      "Asia/Bahrain": t("bahrain"),
      "Asia/Muscat": t("muscat"),
      "Africa/Cairo": t("cairo"),
      "Asia/Karachi": t("karachi"),
      "Asia/Kolkata": t("india"),
      "Europe/London": t("london"),
      "Europe/Paris": t("paris"),
      "Europe/Berlin": t("berlin"),
      "America/New_York": t("newYork"),
      "America/Chicago": t("chicago"),
      "America/Los_Angeles": t("losAngeles"),
      "Asia/Singapore": t("singapore"),
      "Asia/Tokyo": t("tokyo"),
      "Australia/Sydney": t("sydney"),
      "Pacific/Auckland": t("auckland"),
    };
    const cityOf = (zone: string) =>
      cities[zone] ?? (zone.split("/").pop() ?? zone).replace(/_/g, " ");

    const value = ZONE_ALIASES[saved] ?? saved;
    const options = zones.map((zone) => ({ value: zone, label: zoneLabel(cityOf(zone), zone) }));
    if (value && !options.some((option) => option.value === value)) {
      options.unshift({ value, label: zoneLabel(cityOf(value), value) });
    }
    return { options, value };
  }, [t, zones, saved]);
}
