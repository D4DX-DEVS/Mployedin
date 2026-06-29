import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/withAuth";
import { connectDB } from "@/lib/db/mongoose";
import Lead from "@/models/Lead";
import Agent from "@/models/Agent";
import User from "@/models/User";
import Employer from "@/models/Employer";
import { CompanyUser, getDefaultPermissions } from "@/models/CompanyUser";
import { isValidObjectId } from "@/lib/security/sanitize";
import { logActivity, actorFromCtx } from "@/lib/audit/log";
import { checkRateLimitDual, RATE_LIMIT_CONFIGS } from "@/lib/security/rateLimit";
import { sendEmail, EmailTemplates } from "@/lib/communications/email";
import { autoAssignDefaultPlan } from "@/lib/subscription/autoAssign";
import { notify, getSuperAgentUserId } from "@/lib/notifications/trigger";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import type { UserRole } from "@/models/User";

interface AuthCtx { userId: string; role: UserRole; locale: string }

/**
 * POST /api/leads/[id]/convert
 * Convert a lead into an employer account.
 * Creates User + Employer + CompanyUser, links to agent, updates lead status.
 */
async function handler(req: NextRequest, ctx: AuthCtx) {
  const rl = await checkRateLimitDual(req, ctx.userId, RATE_LIMIT_CONFIGS.employers);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Too many requests. Please try again later." },
      { status: 429, headers: { "Retry-After": String(Math.ceil((rl.resetAt - Date.now()) / 1000)) } },
    );
  }

  const id = req.nextUrl.pathname.split("/").at(-2); // /api/leads/[id]/convert
  if (!isValidObjectId(id)) {
    return NextResponse.json({ error: "Invalid lead ID" }, { status: 400 });
  }

  await connectDB();

  // Verify agent owns this lead
  const lead = await Lead.findById(id);
  if (!lead) return NextResponse.json({ error: "Lead not found" }, { status: 404 });

  if (lead.status === "converted") {
    return NextResponse.json({ error: "Lead is already converted" }, { status: 409 });
  }

  let agentDoc: { _id: unknown; userId?: unknown } | null = null;
  if (ctx.role === "agent") {
    agentDoc = await Agent.findOne({ userId: ctx.userId }).select("_id").lean();
    if (!agentDoc || String(lead.agentId) !== String(agentDoc._id)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  } else if (ctx.role === "super_agent" || ctx.role === "admin") {
    // Allowed — resolve agent from the lead
    agentDoc = await Agent.findById(lead.agentId).select("_id userId").lean();
  } else {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Parse optional overrides from request body
  let body: Record<string, string> = {};
  try {
    body = await req.json();
  } catch {
    // Body is optional — defaults from lead
  }

  const contactEmail = (body.contactEmail || lead.contactEmail || "").toLowerCase().trim();
  const contactPerson = body.contactPerson || lead.contactPerson || "";
  const companyName = body.companyName || lead.companyName || "";
  const phone = body.contactPhone || lead.contactPhone || "";
  const industry = body.industry || lead.industry || "";
  const country = body.country || lead.country || "";

  if (!contactEmail) {
    return NextResponse.json({ error: "Contact email is required to convert a lead" }, { status: 400 });
  }
  if (!companyName) {
    return NextResponse.json({ error: "Company name is required" }, { status: 400 });
  }

  // Check for duplicate email
  const existing = await User.findOne({ email: contactEmail });
  if (existing) {
    return NextResponse.json({ error: "An account with this email already exists" }, { status: 409 });
  }

  // Generate a temporary password (hashed only — never sent in plaintext)
  const tempPassword = crypto.randomBytes(6).toString("base64url");
  const passwordHash = await bcrypt.hash(tempPassword, 12);

  // Generate email verification token
  const rawToken = crypto.randomBytes(32).toString("hex");
  const hashedToken = crypto.createHash("sha256").update(rawToken).digest("hex");

  // Generate password-setup token (sent via email link instead of plaintext password)
  const rawSetupToken = crypto.randomBytes(32).toString("hex");
  const hashedSetupToken = crypto.createHash("sha256").update(rawSetupToken).digest("hex");

  // Create User
  const user = await User.create({
    name: contactPerson,
    email: contactEmail,
    passwordHash,
    role: "employer",
    isActive: true,
    isEmailVerified: false,
    emailVerificationToken: hashedToken,
    emailVerificationExpiry: new Date(Date.now() + 24 * 60 * 60 * 1000),
    passwordResetToken: hashedSetupToken,
    passwordResetExpiry: new Date(Date.now() + 24 * 60 * 60 * 1000),
  });

  // Create Employer profile
  const agentId = agentDoc?._id ? String(agentDoc._id) : undefined;
  const employer = await Employer.create({
    userId: user._id,
    companyName,
    companyEmail: contactEmail,
    phone: phone || "",
    industry: industry || undefined,
    country: country || undefined,
    ...(agentId ? { agentId } : {}),
    verificationLevel: "basic",
    isAgentVerified: true,
    verifiedByAgentId: ctx.userId,
  });

  // Create CompanyUser entry (owner)
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

  // Link employer to agent
  if (agentId) {
    await Agent.findByIdAndUpdate(agentId, {
      $addToSet: { assignedEmployerIds: employer._id },
      $inc: { "performance.employersCreated": 1 },
    });
  }

  // Update lead status to converted
  lead.status = "converted";
  lead.convertedAt = new Date();
  lead.convertedToEmployerId = employer._id;
  lead.activityLog.push({
    action: "converted_to_employer",
    note: `Converted to employer: ${companyName} (${contactEmail})`,
    timestamp: new Date(),
    by: ctx.userId as unknown as import("mongoose").Types.ObjectId,
  });
  await lead.save();

  // Auto-assign default subscription plan (fire-and-forget)
  autoAssignDefaultPlan(user._id.toString(), "employer").catch((err) =>
    console.error("[Lead Convert] Failed to auto-assign subscription:", err),
  );

  // Send welcome email with temporary credentials
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? process.env.NEXTAUTH_URL ?? "https://mployedin.com";
  const loginUrl = `${baseUrl}/login`;
  const verifyUrl = `${baseUrl}/en/verify-email?token=${rawToken}`;
  const setupUrl = `${baseUrl}/en/reset-password?token=${rawSetupToken}`;

  await Promise.allSettled([
    sendEmail({
      to: contactEmail,
      ...EmailTemplates.employerWelcome(contactPerson, contactEmail, setupUrl, "Your MPLOYEDIN Agent", loginUrl),
      userId: user._id.toString(),
      source: "lead-convert",
      category: "onboarding",
    }),
    sendEmail({
      to: contactEmail,
      ...EmailTemplates.verifyEmail(contactPerson, verifyUrl),
      source: "lead-convert",
      category: "system",
    }),
  ]);

  // Notify agent (if conversion done by super_agent/admin)
  if (ctx.role !== "agent" && agentDoc?.userId) {
    notify({
      userId: String(agentDoc.userId),
      type: "lead_converted",
      title: "Lead Converted to Employer",
      message: `Your lead "${companyName}" has been converted into an employer account.`,
      link: `/${ctx.locale}/agent/employers`,
      sendEmail: true,
      metadata: { leadId: id, employerId: String(employer._id), companyName },
    }).catch(() => {});
  }

  // Notify super-agent
  if (agentId) {
    const saUserId = await getSuperAgentUserId(agentId);
    if (saUserId) {
      const agentUser = await User.findById(ctx.userId).select("name").lean();
      const agentName = (agentUser as { name?: string })?.name ?? "An agent";
      notify({
        userId: saUserId,
        type: "lead_converted",
        title: "Lead Converted to Employer",
        message: `${agentName} converted lead "${companyName}" into an employer account.`,
        link: `/${ctx.locale}/super-agent/employers`,
        sendEmail: true,
        metadata: { leadId: id, employerId: String(employer._id), companyName },
      }).catch(() => {});
    }
  }

  // Audit log
  await logActivity({
    ...actorFromCtx(ctx),
    action: "lead.convert",
    resource: "leads",
    resourceId: id!,
    meta: { companyName, contactEmail, employerId: String(employer._id) },
    req,
  });

  return NextResponse.json({
    message: "Lead converted to employer successfully",
    employer: {
      _id: employer._id,
      companyName: employer.companyName,
      email: contactEmail,
    },
    lead: {
      _id: lead._id,
      status: lead.status,
      convertedAt: lead.convertedAt,
      convertedToEmployerId: lead.convertedToEmployerId,
    },
  }, { status: 201 });
}

export const POST = withAuth(handler, { resource: "leads", action: "update" });
