import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongoose";
import User from "@/models/User";
import JobSeeker from "@/models/JobSeeker";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { checkRateLimit, RATE_LIMIT_CONFIGS } from "@/lib/security/rateLimit";
import { logActivity } from "@/lib/audit/log";
import { autoAssignDefaultPlan } from "@/lib/subscription/autoAssign";
import { sendEmail, EmailTemplates } from "@/lib/communications/email";
import { validateBody } from "@/lib/validators";
import { jobSeekerRegisterSchema } from "@/lib/validators/misc";
import { hashOtp } from "@/lib/auth/emailVerification";
import logger from "@/lib/logger";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for") ?? req.headers.get("x-real-ip") ?? "unknown";
  const { allowed } = await checkRateLimit(`auth-register:${ip}`, { ...RATE_LIMIT_CONFIGS.auth, failClosed: true });
  if (!allowed) {
    return NextResponse.json({ message: "Too many requests. Please try again later." }, { status: 429 });
  }

  try {
    await connectDB();

    const { name, email, password } = await validateBody(req, jobSeekerRegisterSchema);

    const normalizedEmail = email;

    const existing = await User.findOne({ email: normalizedEmail });
    if (existing) {
      return NextResponse.json({ message: "An account with this email already exists." }, { status: 409 });
    }

    const hashed = await bcrypt.hash(password, 12);

    // Generate email verification token
    const rawToken = crypto.randomBytes(32).toString("hex");
    const hashedToken = crypto.createHash("sha256").update(rawToken).digest("hex");
    const otp = crypto.randomInt(100000, 1000000).toString();
    const hashedOtp = hashOtp(otp);

    const user = await User.create({
      name: name.trim(),
      email: normalizedEmail,
      passwordHash: hashed,
      role: "job_seeker",
      isActive: true,
      isEmailVerified: false,
      emailVerificationToken: hashedToken,
      emailVerificationOtp: hashedOtp,
      emailVerificationExpiry: new Date(Date.now() + 24 * 60 * 60 * 1000),
    });

    // Create empty JobSeeker profile — filled in during onboarding
    await JobSeeker.create({
      userId: user._id,
      isOnboarded: false,
      skills: [],
      experience: [],
      education: [],
      languages: [],
      certifications: [],
      preferredCountries: [],
      preferredRoles: [],
      preferredLocations: [],
    });

    // Auto-assign default subscription plan (fire-and-forget — don't block registration)
    autoAssignDefaultPlan(user._id.toString(), "job_seeker").catch((err) =>
      logger.error({ err }, "[Registration] Failed to auto-assign subscription"),
    );

    await logActivity({
      actorId: user._id.toString(),
      actorRole: "job_seeker",
      action: "register.job_seeker",
      resource: "auth",
      resourceId: user._id.toString(),
      meta: { email: normalizedEmail },
      req,
    });

    // Send emails — await to prevent Next.js from terminating before delivery
    const baseUrl = process.env.NEXTAUTH_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
    const locale = req.cookies.get("NEXT_LOCALE")?.value === "ar" ? "ar" : "en";
    const verifyUrl = `${baseUrl}/${locale}/verify-email?token=${rawToken}&email=${encodeURIComponent(normalizedEmail)}`;
    const dashboardUrl = `${baseUrl}/${locale}/job-seeker/dashboard`;

    // Send both emails in parallel, but await them before responding
    const [verifyResult, welcomeResult] = await Promise.allSettled([
      sendEmail({ to: normalizedEmail, ...EmailTemplates.verifyEmailOtp(name.trim(), otp, verifyUrl), source: "registration", category: "system" }),
      sendEmail({ to: normalizedEmail, ...EmailTemplates.jobSeekerWelcome(name.trim(), dashboardUrl), source: "registration", category: "system" }),
    ]);

    if (verifyResult.status === "rejected") {
      logger.error({ reason: verifyResult.reason }, "[Registration] Failed to send verification email");
    }
    if (welcomeResult.status === "rejected") {
      logger.error({ reason: welcomeResult.reason }, "[Registration] Failed to send welcome email");
    }

    return NextResponse.json({
      success: true,
      message: "Account created successfully. Please check your email to verify your account.",
      email: normalizedEmail,
      emailSendFailed: verifyResult.status === "rejected",
    }, { status: 201 });
  } catch (err) {
    if (err instanceof NextResponse) return err;
    logger.error({ err }, "job-seeker-register error");
    return NextResponse.json({ message: "Server error." }, { status: 500 });
  }
}
