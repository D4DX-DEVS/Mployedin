/**
 * @jest-environment node
 *
 * Two different iCalendar documents come out of the same data and they are not
 * interchangeable:
 *
 *   - the subscribable feed is `METHOD:PUBLISH` — a read-only mirror of a
 *     calendar, with no attendees to reply on its behalf;
 *   - the emailed attachment is `METHOD:REQUEST` — an invitation addressed to
 *     one person, which their client may update and cancel.
 *
 * Putting REQUEST on a subscription feed is wrong per RFC 5546 and some
 * clients mishandle it, so the builder takes a mode rather than being edited
 * in place.
 */
import { buildInviteIcs, type InviteInput } from "@/lib/interviews/icalInvite";

const BASE: InviteInput = {
  interviewId: "64b000000000000000000099",
  jobTitle: "Full Stack Developer",
  candidateName: "Sara Kapoor",
  candidateEmail: "sara@example.com",
  organizerName: "Acme Hiring",
  organizerEmail: "hiring@acme.test",
  scheduledAt: new Date("2026-10-05T06:00:00Z"),
  duration: 45,
  type: "video",
  meetLink: "https://meet.example.com/abc",
  location: null,
  sequence: 0,
  cancelled: false,
  responseUrl: "https://app.test/en/interview-response/TOKEN",
};

const lines = (ics: string) => ics.split("\r\n");
/** RFC 5545 continuation: CRLF + one space. Every real client unfolds first. */
const unfold = (ics: string) => ics.replace(/\r\n /g, "");
const unfolded = (ics: string) => unfold(ics).split("\r\n");
const has = (ics: string, prefix: string) => unfolded(ics).some((l) => l.startsWith(prefix));
const valueOf = (ics: string, prefix: string) => unfolded(ics).find((l) => l.startsWith(prefix)) ?? "";

describe("buildInviteIcs", () => {
  it("is an invitation, not a published feed", () => {
    const ics = buildInviteIcs(BASE);
    expect(has(ics, "METHOD:REQUEST")).toBe(true);
    expect(has(ics, "METHOD:PUBLISH")).toBe(false);
  });

  it("addresses the candidate so their client can offer a reply", () => {
    const attendee = valueOf(buildInviteIcs(BASE), "ATTENDEE");
    expect(attendee).toContain("mailto:sara@example.com");
    expect(attendee).toContain("PARTSTAT=NEEDS-ACTION");
    expect(attendee).toContain("RSVP=TRUE");
  });

  it("names the organizer", () => {
    expect(valueOf(buildInviteIcs(BASE), "ORGANIZER")).toContain("mailto:hiring@acme.test");
  });

  it("carries the response link in the body, so the answer reaches the app", () => {
    expect(unfold(buildInviteIcs(BASE))).toContain("https://app.test/en/interview-response/TOKEN");
  });

  it("uses UTC timestamps", () => {
    expect(valueOf(buildInviteIcs(BASE), "DTSTART")).toBe("DTSTART:20261005T060000Z");
    expect(valueOf(buildInviteIcs(BASE), "DTEND")).toBe("DTEND:20261005T064500Z");
  });

  it("keeps a stable UID so an update replaces rather than duplicates", () => {
    const first = valueOf(buildInviteIcs(BASE), "UID");
    const later = valueOf(buildInviteIcs({ ...BASE, sequence: 3, scheduledAt: new Date() }), "UID");
    expect(first).toBe(later);
  });

  it("raises SEQUENCE so a client accepts the newer version", () => {
    expect(valueOf(buildInviteIcs(BASE), "SEQUENCE")).toBe("SEQUENCE:0");
    expect(valueOf(buildInviteIcs({ ...BASE, sequence: 4 }), "SEQUENCE")).toBe("SEQUENCE:4");
  });

  it("cancels with STATUS:CANCELLED and METHOD:CANCEL", () => {
    const ics = buildInviteIcs({ ...BASE, cancelled: true, sequence: 1 });
    expect(has(ics, "STATUS:CANCELLED")).toBe(true);
    expect(has(ics, "METHOD:CANCEL")).toBe(true);
    expect(has(ics, "METHOD:REQUEST")).toBe(false);
  });

  it("escapes characters that would otherwise break the file", () => {
    const ics = buildInviteIcs({ ...BASE, jobTitle: "Dev, Senior; Remote" });
    expect(unfold(ics)).toContain("Dev\\, Senior\\; Remote");
  });

  it("folds lines to the 75-octet limit", () => {
    const ics = buildInviteIcs({ ...BASE, jobTitle: "x".repeat(300) });
    for (const line of lines(ics)) {
      expect(Buffer.byteLength(line, "utf8")).toBeLessThanOrEqual(75);
    }
  });

  it("puts a physical location in LOCATION and a video link in the body", () => {
    const onsite = buildInviteIcs({
      ...BASE,
      type: "offline",
      meetLink: null,
      location: "Level 4, Acme Tower",
    });
    expect(valueOf(onsite, "LOCATION")).toContain("Level 4");
    expect(valueOf(buildInviteIcs(BASE), "LOCATION")).toContain("meet.example.com");
  });

  it("omits ATTENDEE when there is no candidate email to address", () => {
    const ics = buildInviteIcs({ ...BASE, candidateEmail: null });
    expect(has(ics, "ATTENDEE")).toBe(false);
    expect(has(ics, "METHOD:REQUEST")).toBe(true);
  });
});
