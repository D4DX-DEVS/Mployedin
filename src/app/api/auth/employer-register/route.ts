import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongoose";
import User from "@/models/User";
import Employer from "@/models/Employer";
import { CompanyUser, getDefaultPermissions } from "@/models/CompanyUser";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { checkRateLimit, RATE_LIMIT_CONFIGS } from "@/lib/security/rateLimit";
import { logActivity } from "@/lib/audit/log";
import { sendEmail, EmailTemplates } from "@/lib/communications/email";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  // Rate limit registration attempts
  const ip = req.headers.get("x-forwarded-for") ?? req.headers.get("x-real-ip") ?? "unknown";
  const { allowed } = checkRateLimit(`auth-register:${ip}`, RATE_LIMIT_CONFIGS.auth);
  if (!allowed) {
    return NextResponse.json(
      { message: "Too many requests. Please try again later." },
      { status: 429 }
    );
  }

  try {
    await connectDB();

    const form = await req.formData();
    const get = (k: string) => (form.get(k) as string | null) ?? "";

    // Step 1 — company fields
    const companyName = get("companyName");
    const industry = get("industry");
    const size = get("size");
    const website = get("website");
    const country = get("country");
    const city = get("city");

    // Step 2 — verification
    const verificationLevel = get("verificationLevel") || "basic";

    // Step 3 — contact
    const contactName = get("contactName");
    const contactEmail = get("contactEmail").toLowerCase().trim();
    const contactTitle = get("contactTitle");
    const contactPhone = get("contactPhone");
    const password = get("password");

    if (!companyName || !contactEmail || !password || !contactName) {
      return NextResponse.json({ message: "Required fields missing." }, { status: 400 });
    }

    // Check duplicate
    const existing = await User.findOne({ email: contactEmail });
    if (existing) {
      return NextResponse.json({ message: "Email already registered." }, { status: 409 });
    }

    const hashed = await bcrypt.hash(password, 12);

    // Generate email verification token
    const rawToken = crypto.randomBytes(32).toString("hex");
    const hashedToken = crypto.createHash("sha256").update(rawToken).digest("hex");

    // Create user
    const user = await User.create({
      name: contactName,
      email: contactEmail,
      passwordHash: hashed,
      role: "employer",
      isActive: true,
      isEmailVerified: false,
      emailVerificationToken: hashedToken,
    });

    // Create employer profile
    const employer = await Employer.create({
      userId: user._id,
      companyName,
      industry,
      size,
      website,
      country,
      city,
      contactTitle,
      contactPhone,
      verificationLevel,
      verificationStatus: verificationLevel === "basic" ? "verified" : "pending",
    });

    // Auto-create CompanyUser with owner role
    await CompanyUser.create({
      companyId: employer._id,
      userId: user._id,
      email: contactEmail,
      companyRole: "owner",
      permissions: getDefaultPermissions("owner"),
      invitedBy: user._id,
      invitedAt: new Date(),
      acceptedAt: new Date(),
      status: "active",
    });

    await logActivity({
      actorId: user._id.toString(),
      actorRole: "employer",
      action: "register.employer",
      resource: "auth",
      resourceId: user._id.toString(),
      meta: { companyName, email: contactEmail },
      req,
    });

    // Send verification email (fire-and-forget — don't block registration)
    const baseUrl = process.env.NEXTAUTH_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
    const verifyUrl = `${baseUrl}/en/verify-email?token=${rawToken}`;
    sendEmail({ to: contactEmail, ...EmailTemplates.verifyEmail(contactName, verifyUrl) }).catch((err) =>
      console.error("[Registration] Failed to send verification email:", err)
    );

    return NextResponse.json({ success: true, message: "Registration successful. Please check your email to verify your account." }, { status: 201 });
  } catch (err) {
    console.error("employer-register error:", err);
    return NextResponse.json({ message: "Server error." }, { status: 500 });
  }
}
