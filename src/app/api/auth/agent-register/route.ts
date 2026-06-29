import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongoose";
import User from "@/models/User";
import Agent from "@/models/Agent";
import bcrypt from "bcryptjs";
import { logActivity } from "@/lib/audit/log";
import { checkRateLimit, RATE_LIMIT_CONFIGS } from "@/lib/security/rateLimit";

/* ------------------------------------------------------------------ */
/*  POST /api/auth/agent-register — Agent self-registration            */
/* ------------------------------------------------------------------ */

export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for") ?? req.headers.get("x-real-ip") ?? "unknown";
  const { allowed } = await checkRateLimit(`auth-register:${ip}`, RATE_LIMIT_CONFIGS.auth);
  if (!allowed) {
    return NextResponse.json({ message: "Too many requests. Please try again later." }, { status: 429 });
  }

  await connectDB();

  const body = await req.json();
  const {
    fullName, email, phone, password,
    country, city, experience, specialization, languages,
    referralCode,
  } = body;

  /* Validate required fields */
  if (!fullName || !email || !password) {
    return NextResponse.json({ error: "Full name, email, and password are required" }, { status: 400 });
  }

  if (typeof email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "Invalid email address" }, { status: 400 });
  }

  if (typeof password !== "string" || password.length < 8) {
    return NextResponse.json({ error: "Password must be at least 8 characters" }, { status: 400 });
  }

  /* Check for existing user */
  const existing = await User.findOne({ email: email.toLowerCase() });
  if (existing) {
    return NextResponse.json({ error: "An account with this email already exists" }, { status: 409 });
  }

  /* Hash password */
  const hashedPassword = await bcrypt.hash(password, 12);

  /* Create user account (inactive until admin approves) */
  const user = await User.create({
    name: fullName.trim(),
    email: email.toLowerCase().trim(),
    phone: phone?.trim() ?? "",
    passwordHash: hashedPassword,
    role: "agent",
    isActive: false,
    isEmailVerified: false,
    country,
    city,
    referralCode: referralCode || undefined,
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

  /* TODO: Send verification email via Inngest or direct mailer */

  return NextResponse.json({
    success: true,
    message: "Account created. Please verify your email and wait for admin approval.",
    userId: user._id,
  });
}
