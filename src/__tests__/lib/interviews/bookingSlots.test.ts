/**
 * @jest-environment node
 *
 * The booking modal turns "the day the employer clicked" plus a start time
 * into one {date,time} payload per selected candidate. Both halves have to
 * stay in the employer's own zone: deriving the date via toISOString() moves
 * the booking to the previous day for every UTC+ zone (Dubai, Riyadh, India),
 * which is the whole market.
 */
import { bookingSlots } from "@/lib/interviews/bookingSlots";

describe("bookingSlots", () => {
  it("keeps the picked day in the employer's zone, not UTC", () => {
    // Local midnight — what a calendar day cell produces.
    const picked = new Date(2026, 8, 21);
    const [slot] = bookingSlots(picked, "10:00", 30, 1);

    expect(slot.date).toBe("2026-09-21");
    expect(slot.time).toBe("10:00");
  });

  it("ignores any time already on the picked date", () => {
    // The default selectedDate is `new Date()`, so it carries a clock time.
    const picked = new Date(2026, 8, 21, 17, 45, 12);
    const [slot] = bookingSlots(picked, "09:05", 30, 1);

    expect(slot.date).toBe("2026-09-21");
    expect(slot.time).toBe("09:05");
  });

  it("staggers bulk bookings by the interview duration", () => {
    const picked = new Date(2026, 8, 21);
    const slots = bookingSlots(picked, "10:00", 30, 3);

    expect(slots).toEqual([
      { date: "2026-09-21", time: "10:00" },
      { date: "2026-09-21", time: "10:30" },
      { date: "2026-09-21", time: "11:00" },
    ]);
  });

  it("rolls the date forward when a staggered slot crosses midnight", () => {
    const picked = new Date(2026, 8, 21);
    const slots = bookingSlots(picked, "23:30", 60, 2);

    expect(slots).toEqual([
      { date: "2026-09-21", time: "23:30" },
      { date: "2026-09-22", time: "00:30" },
    ]);
  });

  it("rolls the month and year over too", () => {
    const picked = new Date(2026, 11, 31);
    const slots = bookingSlots(picked, "23:45", 30, 2);

    expect(slots).toEqual([
      { date: "2026-12-31", time: "23:45" },
      { date: "2027-01-01", time: "00:15" },
    ]);
  });
});
