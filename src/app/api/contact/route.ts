import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongoose";
import ContactSubmission from "@/models/ContactSubmission";
import { validateBody } from "@/lib/validators";
import { contactSchema } from "@/lib/validators/misc";
import { checkRateLimit } from "@/lib/security/rateLimit";
import { logActivity } from "@/lib/audit/log";
import logger from "@/lib/logger";
import { getClientIp } from "@/lib/security/clientIp";
import { verifyRecaptcha } from "@/lib/security/recaptcha";

/**
 * Public contact form submission — NO AUTH required.
 * Validates input, optional reCAPTCHA, creates ContactSubmission.
 */
export async function POST(req: NextRequest) {
  try {
    // Rate limit: 5 submissions per 10 minutes per IP
    const ip = getClientIp(req.headers);
    const { allowed } = await checkRateLimit(`contact:${ip}`, { limit: 5, windowSec: 600, prefix: "contact" });
    if (!allowed) {
      return NextResponse.json({ error: "Too many submissions. Please try again later." }, { status: 429 });
    }

    await connectDB();
    const body = await validateBody(req, contactSchema);

    const { name, email, phone, subject, message, captchaToken } = body;

    // When reCAPTCHA is configured (secret AND site key, so the form can
    // actually mint a token — JS-26) it is mandatory and fails closed. The
    // rate limit above stays the protection when it is not configured.
    const captcha = await verifyRecaptcha(captchaToken, { action: "contact", hostname: req.nextUrl.hostname });
    if (!captcha.ok) {
      const message = {
        CAPTCHA_REQUIRED: "CAPTCHA verification required",
        CAPTCHA_FAILED: "CAPTCHA verification failed",
        CAPTCHA_UNAVAILABLE: "CAPTCHA verification is temporarily unavailable",
      }[captcha.error];
      return NextResponse.json({ error: message, code: captcha.error }, { status: captcha.status });
    }

    const ipAddress = ip;

    const submission = await ContactSubmission.create({
      name: name.trim(),
      email: email.trim().toLowerCase(),
      phone: (phone ?? "").trim(),
      subject: (subject ?? "").trim(),
      message: message.trim(),
      ipAddress,
    });

    // The contact inbox is the one queue with no owner: nothing told an admin
    // an enquiry had landed, so it was found only by opening the page.
    const { notifyAdminsContactSubmission } = await import("@/lib/notifications/trigger");
    notifyAdminsContactSubmission(
      name.trim(),
      (subject ?? "").trim() || message.trim().slice(0, 60),
      submission._id.toString(),
    ).catch((err) => logger.error({ err }, "[Contact] Failed to notify admins of new submission"));

    await logActivity({
      action: "contact.submission_create",
      resource: "contact_submissions",
      resourceId: submission._id.toString(),
      meta: { email: email.trim().toLowerCase(), subject: (subject ?? "").trim() },
      req,
    });

    return NextResponse.json(
      { success: true, id: submission._id },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof NextResponse) return error;
    logger.error({ error }, "[Contact] Submission error");
    return NextResponse.json(
      { error: "Failed to submit your message. Please try again." },
      { status: 500 }
    );
  }
}
