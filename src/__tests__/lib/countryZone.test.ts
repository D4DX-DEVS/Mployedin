import {
  timeZoneForCountry,
  timeZoneForLocationText,
  digestTimeZoneFor,
  localHourIn,
  isDigestHourFor,
  DIGEST_LOCAL_HOUR,
} from "@/lib/datetime/countryZone";
import { FALLBACK_TIME_ZONE } from "@/lib/datetime/zone";

describe("timeZoneForCountry", () => {
  it.each([
    ["UAE", "Asia/Dubai"],
    ["United Arab Emirates", "Asia/Dubai"],
    ["Saudi Arabia", "Asia/Riyadh"],
    ["KSA", "Asia/Riyadh"],
    ["Oman", "Asia/Muscat"],
    ["Bahrain", "Asia/Bahrain"],
    ["India", "Asia/Kolkata"],
    ["Sri Lanka", "Asia/Colombo"],
    ["United Kingdom", "Europe/London"],
  ])("places %s in %s", (country, zone) => {
    expect(timeZoneForCountry(country)).toBe(zone);
  });

  it("accepts the region code jobs are filed under", () => {
    expect(timeZoneForCountry("IN")).toBe("Asia/Kolkata");
    expect(timeZoneForCountry("AE")).toBe("Asia/Dubai");
  });

  it("strips the qualifiers live records carry", () => {
    expect(timeZoneForCountry("Saudi Arabia (Transferable Iqama)")).toBe("Asia/Riyadh");
    expect(timeZoneForCountry("Oman (Muscat)")).toBe("Asia/Muscat");
    expect(timeZoneForCountry("  india  ")).toBe("Asia/Kolkata");
  });

  it("returns null rather than guessing for a country it cannot place", () => {
    expect(timeZoneForCountry("Atlantis")).toBeNull();
    expect(timeZoneForCountry("")).toBeNull();
    expect(timeZoneForCountry(null)).toBeNull();
  });

  it("only returns zones this runtime actually knows", () => {
    // A typo in the map would throw a RangeError inside a cron batch, and the
    // map is the kind of table that grows by copy-paste.
    for (const country of ["UAE", "Saudi Arabia", "Oman", "India", "Sri Lanka", "USA"]) {
      const zone = timeZoneForCountry(country) as string;
      expect(() => new Intl.DateTimeFormat("en", { timeZone: zone }).format(new Date())).not.toThrow();
    }
  });
});

describe("timeZoneForLocationText", () => {
  // Every one of these is a real value from the live seeker collection.
  it.each([
    ["Riyadh, Saudi Arabia", "Asia/Riyadh"],
    ["Dubai, UAE", "Asia/Dubai"],
    ["Malappuram, India", "Asia/Kolkata"],
    ["Muscat, Oman", "Asia/Muscat"],
    ["N/A, Oman (Muscat)", "Asia/Muscat"],
    ["Jeddah, Saudi Arabia, Saudi Arabia (Transferable Iqama)", "Asia/Riyadh"],
    ["Malda, West Bengal, India", "Asia/Kolkata"],
    ["Kanjirappally, Kottayam, Kerala, Oman", "Asia/Muscat"],
    ["Iringavoor, Malappuram, UAE (Currently), India (Home)", "Asia/Kolkata"],
    ["Batticaloa, Sri Lanka", "Asia/Colombo"],
    ["London, United Kingdom", "Europe/London"],
    ["Palakkad, India..", "Asia/Kolkata"],
  ])("reads the country off the end of %s", (text, zone) => {
    expect(timeZoneForLocationText(text)).toBe(zone);
  });

  it("falls back to the whole string when there is no comma", () => {
    expect(timeZoneForLocationText("Saudi Arabia")).toBe("Asia/Riyadh");
  });

  it("refuses to pick a side when the line names two countries", () => {
    expect(timeZoneForLocationText("Dubai (Previous) / Oman, UAE / Oman")).toBeNull();
  });

  it("returns null for a city-only line", () => {
    expect(timeZoneForLocationText("Malappuram Kerala")).toBeNull();
    expect(timeZoneForLocationText("")).toBeNull();
    expect(timeZoneForLocationText(null)).toBeNull();
  });
});

describe("digestTimeZoneFor", () => {
  it("prefers a real browser-detected profile zone over the location text", () => {
    expect(
      digestTimeZoneFor({ profileTimeZone: "Europe/Berlin", currentLocation: "Dubai, UAE" }),
    ).toBe("Europe/Berlin");
  });

  it("uses the location when no profile zone is stored", () => {
    expect(digestTimeZoneFor({ profileTimeZone: null, currentLocation: "Riyadh, Saudi Arabia" })).toBe(
      "Asia/Riyadh",
    );
  });

  it("ignores a stored profile zone that is not a real zone", () => {
    expect(
      digestTimeZoneFor({ profileTimeZone: "Mars/Olympus", currentLocation: "Muscat, Oman" }),
    ).toBe("Asia/Muscat");
  });

  it("falls back when the profile states nothing usable", () => {
    expect(digestTimeZoneFor({})).toBe(FALLBACK_TIME_ZONE);
    expect(digestTimeZoneFor({ currentLocation: "Malappuram Kerala" })).toBe(FALLBACK_TIME_ZONE);
  });
});

describe("localHourIn", () => {
  // 2026-06-15T05:00:00Z — a summer date, so the DST zones are at their offset.
  const instant = new Date("2026-06-15T05:00:00Z");

  it.each([
    ["Asia/Dubai", 9], // UTC+4
    ["Asia/Riyadh", 8], // UTC+3
    ["Asia/Kolkata", 10], // UTC+5:30
    ["UTC", 5],
  ])("reads %s as hour %i", (zone, hour) => {
    expect(localHourIn(zone, instant)).toBe(hour);
  });

  it("reads midnight as 0, not 24", () => {
    expect(localHourIn("UTC", new Date("2026-06-15T00:30:00Z"))).toBe(0);
  });

  it("does not throw on an unknown zone", () => {
    expect(() => localHourIn("Mars/Olympus", instant)).not.toThrow();
    expect(localHourIn("Mars/Olympus", instant)).toBe(localHourIn(FALLBACK_TIME_ZONE, instant));
  });
});

describe("isDigestHourFor", () => {
  /** The UTC instant at which each cohort's clock reads the send hour. */
  const at = (iso: string) => new Date(iso);

  it("releases the Gulf cohorts at their own 9am, not each other's", () => {
    // 05:00Z is 09:00 in Dubai/Muscat and 08:00 in Riyadh.
    const dubaiMorning = at("2026-06-15T05:00:00Z");
    expect(isDigestHourFor({ currentLocation: "Dubai, UAE" }, dubaiMorning)).toBe(true);
    expect(isDigestHourFor({ currentLocation: "Muscat, Oman" }, dubaiMorning)).toBe(true);
    expect(isDigestHourFor({ currentLocation: "Riyadh, Saudi Arabia" }, dubaiMorning)).toBe(false);

    // 06:00Z is 09:00 in Riyadh and 10:00 in Dubai.
    const riyadhMorning = at("2026-06-15T06:00:00Z");
    expect(isDigestHourFor({ currentLocation: "Riyadh, Saudi Arabia" }, riyadhMorning)).toBe(true);
    expect(isDigestHourFor({ currentLocation: "Dubai, UAE" }, riyadhMorning)).toBe(false);
  });

  it("releases India in its own morning", () => {
    // India is UTC+5:30, so the hourly cron hits local hour 9 at 04:00Z (09:30).
    expect(isDigestHourFor({ currentLocation: "Kozhikode, India" }, at("2026-06-15T04:00:00Z"))).toBe(
      true,
    );
    expect(isDigestHourFor({ currentLocation: "Kozhikode, India" }, at("2026-06-15T03:00:00Z"))).toBe(
      false,
    );
  });

  it("never fires in the middle of anyone's night", () => {
    // The bug this replaces: one UTC hour for everyone. Walk a full day and
    // assert each cohort is released exactly once, in the morning.
    for (const location of [
      "Dubai, UAE",
      "Riyadh, Saudi Arabia",
      "Muscat, Oman",
      "Kozhikode, India",
      "Manama, Bahrain",
    ]) {
      const hits: number[] = [];
      for (let utcHour = 0; utcHour < 24; utcHour++) {
        const now = at(`2026-06-15T${String(utcHour).padStart(2, "0")}:00:00Z`);
        if (isDigestHourFor({ currentLocation: location }, now)) hits.push(utcHour);
      }
      expect(hits).toHaveLength(1);
      expect(localHourIn(digestTimeZoneFor({ currentLocation: location }), at(`2026-06-15T${String(hits[0]).padStart(2, "0")}:00:00Z`))).toBe(
        DIGEST_LOCAL_HOUR,
      );
    }
  });

  it("puts a seeker we cannot place on the fallback zone's morning", () => {
    // 05:00Z is 09:00 in Asia/Dubai, the fallback.
    expect(isDigestHourFor({}, at("2026-06-15T05:00:00Z"))).toBe(true);
    expect(isDigestHourFor({}, at("2026-06-15T09:00:00Z"))).toBe(false);
  });
});
