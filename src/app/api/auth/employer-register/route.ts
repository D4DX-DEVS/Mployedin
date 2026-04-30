import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongoose";
import User from "@/models/User";
import Employer from "@/models/Employer";
import Agent from "@/models/Agent";
import SuperAgent from "@/models/SuperAgent";
import ReferralLink from "@/models/ReferralLink";
import { CompanyUser, getDefaultPermissions } from "@/models/CompanyUser";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { checkRateLimit, RATE_LIMIT_CONFIGS } from "@/lib/security/rateLimit";
import { logActivity } from "@/lib/audit/log";
import { sendEmail, EmailTemplates } from "@/lib/communications/email";
import { autoAssignDefaultPlan } from "@/lib/subscription/autoAssign";
import { uploadBuffer } from "@/lib/storage/spaces";

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
    const isLocalE2eHost = ["localhost", "127.0.0.1"].includes(req.nextUrl.hostname);
    const allowE2eVerificationToken =
      (process.env.NODE_ENV === "development" || process.env.NODE_ENV === "test") &&
      isLocalE2eHost &&
      req.headers.get("x-mployedin-e2e") === "employer-register";

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

    // Step 2 — handle file uploads for Standard/Premium verification
    let tradeLicenseUrl: string | undefined;
    let mohCertUrl: string | undefined;

    if (verificationLevel !== "basic") {
      const tradeLicenseFile = form.get("tradeLicense") as File | null;
      if (tradeLicenseFile && tradeLicenseFile.size > 0) {
        const buffer = Buffer.from(await tradeLicenseFile.arrayBuffer());
        const result = await uploadBuffer(buffer, {
          folder: "documents",
          fileName: tradeLicenseFile.name,
          contentType: tradeLicenseFile.type,
          validateAs: "cv",
        });
        tradeLicenseUrl = result.url;
      }
    }

    if (verificationLevel === "premium") {
      const mohCertFile = form.get("mohCert") as File | null;
      if (mohCertFile && mohCertFile.size > 0) {
        const buffer = Buffer.from(await mohCertFile.arrayBuffer());
        const result = await uploadBuffer(buffer, {
          folder: "documents",
          fileName: mohCertFile.name,
          contentType: mohCertFile.type,
          validateAs: "cv",
        });
        mohCertUrl = result.url;
      }
    }

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

    // Create user — catch duplicate key error for race condition safety
    let user;
    try {
      user = await User.create({
        name: contactName,
        email: contactEmail,
        passwordHash: hashed,
        role: "employer",
        isActive: true,
        isEmailVerified: false,
        emailVerificationToken: hashedToken,
      });
    } catch (err: unknown) {
      if (err && typeof err === "object" && "code" in err && (err as { code: number }).code === 11000) {
        return NextResponse.json({ message: "Email already registered." }, { status: 409 });
      }
      throw err;
    }

    // Create employer profile
    const referralCode = get("referralCode");
    let referrerAgentId: string | undefined;
    let isAgentVerified = false;
    let verifiedByAgentId: string | undefined;
    let matchedReferralLink: { _id: string } | null = null;

    if (referralCode) {
      // 1. Check new ReferralLink collection first
      const rl = await ReferralLink.findOne({ code: referralCode, isActive: true });
      if (rl) {
        // Check expiry
        if (rl.expiresAt && rl.expiresAt < new Date()) {
          return NextResponse.json({ message: "This referral link has expired." }, { status: 400 });
        }
        // Check max uses
        if (rl.maxUses > 0 && rl.usedCount >= rl.maxUses) {
          return NextResponse.json({ message: "This referral link has reached its maximum usage." }, { status: 400 });
        }
        matchedReferralLink = { _id: rl._id.toString() };

        // Resolve agent/super-agent from the link
        if (rl.agentId) {
          const agentRef = await Agent.findById(rl.agentId).select("_id userId").lean();
          if (agentRef) {
            referrerAgentId = agentRef._id.toString();
            isAgentVerified = true;
            verifiedByAgentId = agentRef.userId.toString();
          }
        } else if (rl.superAgentId) {
          const saRef = await SuperAgent.findById(rl.superAgentId).select("userId").lean();
          if (saRef) {
            isAgentVerified = true;
            verifiedByAgentId = saRef.userId.toString();
          }
        }
      } else {
        // 2. Fallback: legacy referral codes on Agent/SuperAgent models
        const agentRef = await Agent.findOne({ referralCode }).select("_id userId").lean();
        if (agentRef) {
          referrerAgentId = agentRef._id.toString();
          isAgentVerified = true;
          verifiedByAgentId = agentRef.userId.toString();
          // Also match the ReferralLink doc if it exists (created by /api/referral)
          const fallbackRl = await ReferralLink.findOne({ code: referralCode });
          if (fallbackRl) matchedReferralLink = { _id: fallbackRl._id.toString() };
        } else {
          const saRef = await SuperAgent.findOne({ referralCode }).select("userId").lean();
          if (saRef) {
            isAgentVerified = true;
            verifiedByAgentId = saRef.userId.toString();
            const fallbackRl = await ReferralLink.findOne({ code: referralCode });
            if (fallbackRl) matchedReferralLink = { _id: fallbackRl._id.toString() };
          }
        }
      }
    }

    const employer = await Employer.create({
      userId: user._id,
      companyName,
      companyEmail: contactEmail,
      phone: contactPhone,
      industry,
      companySize: size,
      website,
      country,
      city,
      designation: contactTitle,
      verificationLevel: verificationLevel === "standard" ? "company" : verificationLevel,
      verificationDocs: [tradeLicenseUrl, mohCertUrl].filter(Boolean),
      ...(referrerAgentId ? { agentId: referrerAgentId } : {}),
      isAgentVerified,
      ...(verifiedByAgentId ? { verifiedByAgentId } : {}),
    });

    // Track referral link usage
    if (matchedReferralLink) {
      await ReferralLink.findByIdAndUpdate(matchedReferralLink._id, {
        $inc: { usedCount: 1 },
        $push: {
          registrations: {
            employerId: employer._id,
            userId: user._id,
            companyName,
            email: contactEmail,
            country: country || undefined,
            city: city || undefined,
            registeredAt: new Date(),
          },
        },
      });
    }

    // Link employer to referring agent
    if (referrerAgentId) {
      await Agent.findByIdAndUpdate(referrerAgentId, {
        $addToSet: { assignedEmployerIds: employer._id },
        $inc: { "performance.employersCreated": 1 },
      });

      // Notify super agent about new employer in their network
      const { getSuperAgentUserId, notifySuperAgentEmployerRegistered } = await import("@/lib/notifications/trigger");
      const saUserId = await getSuperAgentUserId(referrerAgentId);
      if (saUserId) {
        const agentDoc = await Agent.findById(referrerAgentId).select("userId").lean();
        const agentUser = agentDoc?.userId
          ? await User.findById(agentDoc.userId).select("name").lean()
          : null;
        const agentName = (agentUser as { name?: string })?.name ?? "An agent";
        notifySuperAgentEmployerRegistered(
          saUserId, companyName || "A company", agentName, String(employer._id),
        ).catch(() => {});
      }
    }

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

    // Auto-assign default subscription plan (fire-and-forget — don't block registration)
    autoAssignDefaultPlan(user._id.toString(), "employer").catch((err) =>
      console.error("[Registration] Failed to auto-assign subscription:", err),
    );

    await logActivity({
      actorId: user._id.toString(),
      actorRole: "employer",
      action: "register.employer",
      resource: "auth",
      resourceId: user._id.toString(),
      meta: { companyName, email: contactEmail },
      req,
    });

    // Send emails — await to prevent Next.js from terminating before delivery
    const baseUrl = process.env.NEXTAUTH_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
    const verifyUrl = `${baseUrl}/en/verify-email?token=${rawToken}`;
    const dashboardUrl = `${baseUrl}/en/employer/dashboard`;

    const [verifyResult, welcomeResult] = await Promise.allSettled([
      sendEmail({ to: contactEmail, ...EmailTemplates.verifyEmail(contactName, verifyUrl), source: "registration", category: "system" }),
      sendEmail({ to: contactEmail, ...EmailTemplates.employerSelfWelcome(contactName, companyName, dashboardUrl), source: "registration", category: "system" }),
    ]);

    if (verifyResult.status === "rejected") {
      console.error("[Registration] Failed to send verification email:", verifyResult.reason);
    }
    if (welcomeResult.status === "rejected") {
      console.error("[Registration] Failed to send welcome email:", welcomeResult.reason);
    }

    return NextResponse.json(
      {
        success: true,
        message: "Registration successful. Please check your email to verify your account.",
        ...(allowE2eVerificationToken ? { verificationToken: rawToken } : {}),
      },
      { status: 201 }
    );
  } catch (err) {
    console.error("employer-register error:", err);
    return NextResponse.json({ message: "Server error." }, { status: 500 });
  }
}
