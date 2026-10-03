import { isWithinServiceWindow } from "@/lib/communications/whatsapp/window";

const now = new Date("2026-09-29T12:00:00Z");
describe("isWithinServiceWindow", () => {
  it("is false with no inbound message", () => {
    expect(isWithinServiceWindow(undefined, now)).toBe(false);
    expect(isWithinServiceWindow(null, now)).toBe(false);
  });
  it("is true inside 24 hours and false after", () => {
    expect(isWithinServiceWindow(new Date("2026-09-28T12:00:01Z"), now)).toBe(true);
    expect(isWithinServiceWindow("2026-09-28T11:59:59Z", now)).toBe(false);
  });
});
