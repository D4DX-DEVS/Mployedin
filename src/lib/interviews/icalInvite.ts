/**
 * The emailed `.ics` invitation — RFC 5545/5546 `METHOD:REQUEST`.
 *
 * Distinct from `icalFeed`, which builds the subscribable `METHOD:PUBLISH`
 * document. A feed is a read-only mirror of a calendar; an invitation is
 * addressed to one person and may be updated or withdrawn. Publishing REQUEST
 * on a subscription URL is wrong per RFC 5546 and some clients mishandle it,
 * which is why these are two builders rather than one with a flag bolted on.
 *
 * The `ATTENDEE` line makes Gmail and Outlook offer Yes/No/Maybe. Those
 * buttons send an iTIP reply to the ORGANIZER mailbox, which this app does not
 * read — so `responseUrl` is carried prominently in the description, and that
 * link is what actually records `candidateResponse`. Treat the mail-client
 * buttons as a convenience for the reader's own calendar, never as the source
 * of truth.
 */

export interface InviteInput {
  interviewId: string;
  jobTitle: string;
  candidateName: string;
  candidateEmail: string | null;
  organizerName: string;
  organizerEmail: string;
  scheduledAt: Date;
  duration: number;
  type: string;
  meetLink: string | null;
  location: string | null;
  /** Raised on every material change; a client ignores an update that does not. */
  sequence: number;
  cancelled: boolean;
  /** Public token URL where the answer is actually recorded. */
  responseUrl: string | null;
  instructions?: string | null;
}

/** RFC 5545 §3.3.11 — escape the characters that carry structure. */
function escapeText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

function utcStamp(date: Date): string {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

/**
 * RFC 5545 §3.1 — no line may exceed 75 octets. Continuations begin with a
 * single space, and the split has to be counted in bytes, not characters, or a
 * multi-byte name (every Arabic one, for instance) silently overflows.
 */
function fold(line: string): string[] {
  if (Buffer.byteLength(line, "utf8") <= 75) return [line];

  const out: string[] = [];
  let current = "";
  let limit = 75;

  for (const char of line) {
    if (Buffer.byteLength(current + char, "utf8") > limit) {
      out.push(current);
      current = " ";
      limit = 75;
    }
    current += char;
  }
  if (current.trim()) out.push(current);
  return out;
}

export function buildInviteIcs(input: InviteInput): string {
  const start = input.scheduledAt;
  const end = new Date(start.getTime() + input.duration * 60_000);

  const description = [
    `${input.jobTitle} interview with ${input.organizerName}.`,
    input.meetLink ? `Join: ${input.meetLink}` : "",
    input.location ? `Location: ${input.location}` : "",
    input.instructions ? `Instructions: ${input.instructions}` : "",
    // The line that matters: mail-client RSVP does not reach this app.
    input.responseUrl ? `Confirm, decline or ask for another time: ${input.responseUrl}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const location = input.type === "video" ? (input.meetLink ?? "") : (input.location ?? "");

  const raw: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//MPLOYEDIN//Interview Scheduler//EN",
    "CALSCALE:GREGORIAN",
    input.cancelled ? "METHOD:CANCEL" : "METHOD:REQUEST",
    "BEGIN:VEVENT",
    // Stable across every update and the cancellation, so clients replace the
    // event rather than stacking copies of it.
    `UID:interview-${input.interviewId}@mployedin.com`,
    `DTSTAMP:${utcStamp(new Date())}`,
    `DTSTART:${utcStamp(start)}`,
    `DTEND:${utcStamp(end)}`,
    `SEQUENCE:${input.sequence}`,
    `SUMMARY:${escapeText(`Interview: ${input.jobTitle}`)}`,
    `DESCRIPTION:${escapeText(description)}`,
    `ORGANIZER;CN=${escapeText(input.organizerName)}:mailto:${input.organizerEmail}`,
  ];

  if (input.candidateEmail) {
    raw.push(
      `ATTENDEE;CN=${escapeText(input.candidateName)};ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=TRUE:mailto:${input.candidateEmail}`,
    );
  }

  if (location) raw.push(`LOCATION:${escapeText(location)}`);
  raw.push(`STATUS:${input.cancelled ? "CANCELLED" : "CONFIRMED"}`);
  raw.push("END:VEVENT", "END:VCALENDAR");

  return raw.flatMap(fold).join("\r\n");
}
