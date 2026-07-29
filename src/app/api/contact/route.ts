import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongoose";
import ContactSubmission from "@/models/ContactSubmission";
import { validateBody } from "@/lib/validators";
import { contactSchema } from "@/lib/validators/misc";
import { checkRateLimit } from "@/lib/security/rateLimit";
import { logActivity } from "@/lib/audit/log";
import logger from "@/lib/logger";
import { getClientIp } from "@/lib/security/clientIp";

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

    // When reCAPTCHA is configured it is mandatory and fails closed.
    const captchaSecret = process.env.RECAPTCHA_SECRET_KEY;
    if (captchaSecret) {
      if (!captchaToken) {
        return NextResponse.json({ error: "CAPTCHA verification required" }, { status: 403 });
      }
      try {
        const params = new URLSearchParams();
        params.append("secret", captchaSecret);
        params.append("response", captchaToken);
        const captchaRes = await fetch("https://www.google.com/recaptcha/api/siteverify", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: params.toString(),
        });
        if (!captchaRes.ok) throw new Error(`CAPTCHA service returned ${captchaRes.status}`);
        const captchaData = (await captchaRes.json()) as {
          success?: boolean;
          score?: number;
          action?: string;
          hostname?: string;
        };
        const allowedHosts = (process.env.RECAPTCHA_ALLOWED_HOSTS ?? req.nextUrl.hostname)
          .split(",")
          .map((host) => host.trim().toLowerCase())
          .filter(Boolean);
        if (
          !captchaData.success ||
          (captchaData.score !== undefined && captchaData.score < 0.3) ||
          (captchaData.action !== undefined && captchaData.action !== "contact") ||
          !captchaData.hostname ||
          !allowedHosts.includes(captchaData.hostname.toLowerCase())
        ) {
          return NextResponse.json(
            { error: "CAPTCHA verification failed" },
            { status: 403 }
          );
        }
      } catch (error) {
        logger.warn({ error }, "[Contact] CAPTCHA service unavailable");
        return NextResponse.json(
          { error: "CAPTCHA verification is temporarily unavailable" },
          { status: 503 },
        );
      }
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
