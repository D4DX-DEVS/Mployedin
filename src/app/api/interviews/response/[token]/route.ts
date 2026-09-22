import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { connectDB } from "@/lib/db/mongoose";
import Interview from "@/models/Interview";
import { notify } from "@/lib/notifications/trigger";
import { withRateLimit } from "@/lib/security/rateLimit";
import { RESPONSE_TOKEN_RE } from "@/lib/interviews/responseToken";
import logger from "@/lib/logger";

/**
 * Public interview response, reached from the invitation email.
 *
 * Unauthenticated by design — the secret token in the path is the credential,
 * the same arrangement as the subscribable calendar feed. It exists so the
 * invitation does not have to rely on mail-client RSVP, whose iTIP reply would
 * land in a mailbox this app does not read.
 *
 * Only POST mutates. The GET a mail scanner performs on the link hits the
 * page, which renders buttons and writes nothing, so a delivered invitation is
 * never auto-accepted by a security crawler.
 */

const responseSchema = z
  .object({
    response: z.enum(["confirmed", "declined", "reschedule_requested"]),
    note: z.string().max(500).trim().optional(),
  })
  .strict();

/** Statuses a candidate may still answer. */
const ANSWERABLE = ["scheduled", "rescheduled", "confirmed"];

interface TokenInterview {
  _id: unknown;
  employerId?: unknown;
  scheduledAt: Date | string;
  status: string;
  candidateResponse?: string;
}

/**
 * One reply for "no such token" and "interview is gone".
 * Distinguishing them would let someone probe which tokens exist.
 */
const notFound = () => NextResponse.json({ error: "Interview not found" }, { status: 404 });

/**
 * Read-only preview for the public page.
 *
 * Safe for a mail scanner to fetch: it writes nothing, and it returns only
 * what the candidate already knows from the invitation — never the token, and
 * no ids that would work anywhere else.
 */
async function getHandler(_req: NextRequest, ...args: unknown[]) {
  const { params } = args[0] as { params: Promise<{ token: string }> };
  const { token } = await params;
  if (!RESPONSE_TOKEN_RE.test(token)) return notFound();

  await connectDB();

  const interview = await Interview.findOne({ responseToken: token })
    .select("scheduledAt duration status type location meetLink candidateResponse jobId")
    .populate("jobId", "title")
    .lean<(TokenInterview & {
      duration?: number;
      type?: string;
      location?: string;
      meetLink?: string;
      jobId?: { title?: string };
    }) | null>();
  if (!interview) return notFound();

  const inFuture = new Date(interview.scheduledAt).getTime() >= Date.now();

  return NextResponse.json({
    jobTitle: interview.jobId?.title ?? null,
    scheduledAt: new Date(interview.scheduledAt).toISOString(),
    duration: interview.duration ?? 30,
    type: interview.type ?? "video",
    location: interview.location ?? null,
    currentResponse: interview.candidateResponse ?? "pending",
    answerable: ANSWERABLE.includes(interview.status) && inFuture,
  });
}

async function handler(req: NextRequest, ...args: unknown[]) {
  const { params } = args[0] as { params: Promise<{ token: string }> };
  const { token } = await params;

  // Shape-check before the query: the token is a raw path segment.
  if (!RESPONSE_TOKEN_RE.test(token)) return notFound();

  let body: z.infer<typeof responseSchema>;
  try {
    body = responseSchema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "We couldn't read that response. Please try again." }, { status: 400 });
  }

  if (body.response === "reschedule_requested" && !body.note) {
    return NextResponse.json(
      { error: "Please tell the employer why you need a different time." },
      { status: 400 },
    );
  }

  await connectDB();

  const interview = await Interview.findOne({ responseToken: token })
    .select("+responseToken employerId scheduledAt status candidateResponse")
    .lean<TokenInterview | null>();
  if (!interview) return notFound();

  if (!ANSWERABLE.includes(interview.status)) {
    return NextResponse.json(
      { error: "This interview can no longer be answered. Please contact the employer." },
      { status: 409 },
    );
  }

  if (new Date(interview.scheduledAt).getTime() < Date.now()) {
    return NextResponse.json(
      { error: "This interview has already taken place." },
      { status: 409 },
    );
  }

  const set: Record<string, unknown> = {
    candidateResponse: body.response,
    candidateResponseAt: new Date(),
  };
  // Mirrors the authenticated route: confirming also advances the interview.
  if (body.response === "confirmed") set.status = "confirmed";
  if (body.response === "reschedule_requested") set.candidateRescheduleNote = body.note;

  await Interview.updateOne({ _id: interview._id }, { $set: set });

  if (interview.employerId) {
    const { Employer } = await import("@/models/Employer");
    const employer = await Employer.findById(interview.employerId).select("userId").lean();
    if (employer?.userId) {
      const label =
        body.response === "confirmed"
          ? "confirmed"
          : body.response === "declined"
            ? "declined"
            : "requested a reschedule for";
      await notify({
        userId: String(employer.userId),
        type: "interview_update",
        title:
          body.response === "confirmed"
            ? "Interview Confirmed"
            : body.response === "declined"
              ? "Interview Declined"
              : "Reschedule Requested",
        message: `A candidate has ${label} their interview.${body.note ? ` Note: ${body.note}` : ""}`,
        link: `/en/employer/interviews`,
        sendEmail: true,
        metadata: { interviewId: String(interview._id), response: body.response },
      }).catch((err) => {
        logger.error({ err, interviewId: String(interview._id) }, "Failed to notify employer of interview response");
      });
    }
  }

  return NextResponse.json({ ok: true, response: body.response });
}

// Unauthenticated and linked from email, so limits are per-IP. The read is
// looser because every scanner that touches the link will perform one.
export const GET = withRateLimit(getHandler, { limit: 60, windowSec: 3600, prefix: "interview-response-read" });
export const POST = withRateLimit(handler, { limit: 10, windowSec: 3600, prefix: "interview-response" });
