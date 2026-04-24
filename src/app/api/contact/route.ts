import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongoose";
import ContactSubmission from "@/models/ContactSubmission";
import { validateBody } from "@/lib/validators";
import { contactSchema } from "@/lib/validators/misc";
import { checkRateLimit } from "@/lib/security/rateLimit";
import { logActivity } from "@/lib/audit/log";

/**
 * Public contact form submission — NO AUTH required.
 * Validates input, optional reCAPTCHA, creates ContactSubmission.
 */
export async function POST(req: NextRequest) {
  try {
    // Rate limit: 5 submissions per 10 minutes per IP
    const ip = (req.headers.get("x-forwarded-for") ?? req.headers.get("x-real-ip") ?? "unknown").split(",")[0].trim();
    const { allowed } = checkRateLimit(`contact:${ip}`, { limit: 5, windowSec: 600, prefix: "contact" });
    if (!allowed) {
      return NextResponse.json({ error: "Too many submissions. Please try again later." }, { status: 429 });
    }

    await connectDB();
    const body = await validateBody(req, contactSchema);

    const { name, email, phone, subject, message, captchaToken } = body;

    // Optional reCAPTCHA v3 verification
    const captchaSecret = process.env.RECAPTCHA_SECRET_KEY;
    if (captchaSecret && captchaToken) {
      try {
        const captchaRes = await fetch("https://www.google.com/recaptcha/api/siteverify", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: `secret=${captchaSecret}&response=${captchaToken}`,
        });
        const captchaData = await captchaRes.json();
        if (!captchaData.success || (captchaData.score !== undefined && captchaData.score < 0.3)) {
          return NextResponse.json(
            { error: "CAPTCHA verification failed" },
            { status: 403 }
          );
        }
      } catch {
        // If captcha service fails, proceed — don't block legit users
        console.warn("[Contact] CAPTCHA verification failed, proceeding");
      }
    }

    const ipAddress =
      req.headers.get("x-forwarded-for") ??
      req.headers.get("x-real-ip") ??
      "unknown";

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
    console.error("[Contact] Submission error:", error);
    return NextResponse.json(
      { error: "Failed to submit your message. Please try again." },
      { status: 500 }
    );
  }
}
