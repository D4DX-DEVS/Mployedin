import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongoose";
import User from "@/models/User";
import Agent from "@/models/Agent";
import bcrypt from "bcryptjs";
import { logActivity } from "@/lib/audit/log";
import { checkRateLimit, RATE_LIMIT_CONFIGS } from "@/lib/security/rateLimit";
import { validateBody } from "@/lib/validators";
import { agentRegisterSchema } from "@/lib/validators/misc";
import crypto from "crypto";
import { sendEmail, EmailTemplates } from "@/lib/communications/email";
import { hashOtp } from "@/lib/auth/emailVerification";
import logger from "@/lib/logger";
import { getClientIp } from "@/lib/security/clientIp";

/* ------------------------------------------------------------------ */
/*  POST /api/auth/agent-register — Agent self-registration            */
/* ------------------------------------------------------------------ */

export async function POST(req: NextRequest) {
  const ip = getClientIp(req.headers);
  const { allowed } = await checkRateLimit(`auth-register:${ip}`, { ...RATE_LIMIT_CONFIGS.auth, failClosed: true });
  if (!allowed) {
    return NextResponse.json({ message: "Too many requests. Please try again later." }, { status: 429 });
  }

  await connectDB();

  // Schema validation (was a hand-rolled regex — inconsistent with the other
  // registration endpoints and missed length caps on optional fields).
  let parsed: import("zod").infer<typeof agentRegisterSchema>;
  try {
    parsed = await validateBody(req, agentRegisterSchema);
  } catch (err) {
    if (err instanceof NextResponse) return err;
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
  const {
    fullName, email, phone, password,
    country, city, specialization, languages,
    referralCode,
  } = parsed;

  /* Check for existing user */
  const existing = await User.findOne({ email: email.toLowerCase() });
  if (existing) {
    return NextResponse.json({ error: "An account with this email already exists" }, { status: 409 });
  }

  /* Hash password */
  const hashedPassword = await bcrypt.hash(password, 12);

  /* Generate email verification token + OTP */
  const rawToken = crypto.randomBytes(32).toString("hex");
  const hashedToken = crypto.createHash("sha256").update(rawToken).digest("hex");
  const otp = crypto.randomInt(100000, 1000000).toString();
  const hashedOtp = hashOtp(otp);

  /* Create user account (inactive until admin approves) */
  const user = await User.create({
    name: fullName.trim(),
    email: email.toLowerCase().trim(),
    phone: phone?.trim() ?? "",
    passwordHash: hashedPassword,
    role: "agent",
    isActive: false,
    isEmailVerified: false,
    emailVerificationToken: hashedToken,
    emailVerificationOtp: hashedOtp,
    emailVerificationExpiry: new Date(Date.now() + 24 * 60 * 60 * 1000),
    country,
    city,
    referredBy: referralCode || undefined,
  });

  /* Create agent profile */
  await Agent.create({
    userId: user._id,
    commissionRate: 10,
    specialization: specialization || "general",
    languages: languages ? languages.split(",").map((l: string) => l.trim()) : [],
    performance: {
      leadsGenerated: 0,
      employersCreated: 0,
      vacanciesPosted: 0,
      jobSeekersSubmitted: 0,
      interviewsScheduled: 0,
      placementsCompleted: 0,
    },
  });

  /* Log activity */
  await logActivity({
    actorId: String(user._id),
    actorRole: "agent",
    action: "register",
    resource: "agent",
    meta: {
      fullName, email: email.toLowerCase(), country, specialization,
      selfRegistered: true,
    },
    req,
  });

  /* Send verification email (non-blocking — registration already succeeded) */
  const baseUrl = process.env.NEXTAUTH_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const locale = req.cookies.get("NEXT_LOCALE")?.value === "ar" ? "ar" : "en";
  const verifyUrl = `${baseUrl}/${locale}/verify-email?token=${rawToken}&email=${encodeURIComponent(email.toLowerCase().trim())}`;
  await sendEmail({
    to: email.toLowerCase().trim(),
    ...EmailTemplates.verifyEmailOtp(fullName.trim(), otp, verifyUrl),
    source: "registration",
    category: "system",
  }).catch((err) => logger.error({ err, userId: String(user._id) }, "failed to send agent verification email"));

  return NextResponse.json({
    success: true,
    message: "Account created. Please verify your email and wait for admin approval.",
    userId: user._id,
  });
}
