/**
 * @jest-environment node
 */
import { responseTimeParts } from "@/lib/gdpr/responseTime";

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

describe("responseTimeParts", () => {
  it("has nothing to show before any request was handled", () => {
    expect(responseTimeParts(null)).toBeNull();
  });

  it("shows minutes under an hour, never zero", () => {
    expect(responseTimeParts(12 * MINUTE)).toEqual({ unit: "minutes", value: "12" });
    expect(responseTimeParts(5 * 1000)).toEqual({ unit: "minutes", value: "1" });
  });

  it("shows hours to one decimal under a day", () => {
    expect(responseTimeParts(8.4 * HOUR)).toEqual({ unit: "hours", value: "8.4" });
    expect(responseTimeParts(2 * HOUR)).toEqual({ unit: "hours", value: "2" });
  });

  it("rolls over to the next unit instead of printing 60 min or 24 hrs", () => {
    expect(responseTimeParts(59.8 * MINUTE)).toEqual({ unit: "hours", value: "1" });
    expect(responseTimeParts(23.97 * HOUR)).toEqual({ unit: "days", value: "1" });
  });

  it("shows days to one decimal from a day up", () => {
    expect(responseTimeParts(30 * HOUR)).toEqual({ unit: "days", value: "1.3" });
    expect(responseTimeParts(12 * DAY)).toEqual({ unit: "days", value: "12" });
  });
});
