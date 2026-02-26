import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongoose";
import User from "@/models/User";
import Employer from "@/models/Employer";
import bcrypt from "bcryptjs";
import { checkRateLimit, RATE_LIMIT_CONFIGS } from "@/lib/security/rateLimit";
import { logActivity } from "@/lib/audit/log";

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

    // Create user
    const user = await User.create({
      name: contactName,
      email: contactEmail,
      passwordHash: hashed,
      role: "employer",
      isActive: true,
    });

    // Create employer profile
    await Employer.create({
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

    await logActivity({
      actorId: user._id.toString(),
      actorRole: "employer",
      action: "register.employer",
      resource: "auth",
      resourceId: user._id.toString(),
      meta: { companyName, email: contactEmail },
      req,
    });

    return NextResponse.json({ success: true, message: "Registration successful." }, { status: 201 });
  } catch (err) {
    console.error("employer-register error:", err);
    return NextResponse.json({ message: "Server error." }, { status: 500 });
  }
}
