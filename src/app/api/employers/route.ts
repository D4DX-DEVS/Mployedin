import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongoose";
import { withAuth } from "@/lib/auth/withAuth";
import User from "@/models/User";
import Employer from "@/models/Employer";
import Agent from "@/models/Agent";
import { CompanyUser, getDefaultPermissions } from "@/models/CompanyUser";
import { escapeRegex } from "@/lib/security/sanitize";
import { validateBody } from "@/lib/validators";
import { employerAdminCreateSchema } from "@/lib/validators/employers";
import { logActivity, actorFromCtx } from "@/lib/audit/log";
import { checkRateLimitDual, RATE_LIMIT_CONFIGS } from "@/lib/security/rateLimit";
import { sendEmail, EmailTemplates } from "@/lib/communications/email";
import bcrypt from "bcryptjs";

interface AuthCtx { userId: string; role: string; locale: string; }

async function handler(req: NextRequest, ctx: AuthCtx) {
  await connectDB();
  const { searchParams } = new URL(req.url);
  const search = searchParams.get("search") ?? "";
  const page = parseInt(searchParams.get("page") ?? "1");
  const limit = parseInt(searchParams.get("limit") ?? "10");
  const skip = (page - 1) * limit;

  const query: Record<string, unknown> = { role: "employer", isActive: true };
  if (search) {
    const safe = escapeRegex(search);
    query.$or = [
      { name: { $regex: safe, $options: "i" } },
      { companyName: { $regex: safe, $options: "i" } },
      { email: { $regex: safe, $options: "i" } },
    ];
  }

  // Agents can only see employers assigned to them
  if (ctx.role === "agent") {
    query.assignedAgent = ctx.userId;
  }

  const [users, total] = await Promise.all([
    User.find(query)
      .select("name email companyName industry location isActive createdAt")
      .sort({ name: 1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    User.countDocuments(query),
  ]);

  // Attach verificationDocs and domainVerified from Employer model
  const userIds = users.map((u) => u._id);
  const employerProfiles = await Employer.find({ userId: { $in: userIds } })
    .select("userId verificationDocs domainVerified verificationLevel isAgentVerified")
    .lean();

  const profileMap = new Map(
    employerProfiles.map((e) => [String(e.userId), e])
  );

  const employers = users.map((u) => {
    const profile = profileMap.get(String(u._id));
    return {
      ...u,
      verificationDocs: profile?.verificationDocs ?? [],
      domainVerified: profile?.domainVerified ?? false,
      verificationLevel: profile?.verificationLevel,
      isAgentVerified: profile?.isAgentVerified ?? false,
    };
  });

  return NextResponse.json({
    employers,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
  });
}

async function postHandler(req: NextRequest, ctx: AuthCtx) {
  const rl = checkRateLimitDual(req, ctx.userId, RATE_LIMIT_CONFIGS.employers);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Too many requests. Please try again later." },
      { status: 429, headers: { "Retry-After": String(Math.ceil((rl.resetAt - Date.now()) / 1000)) } }
    );
  }

  await connectDB();
  const body = await validateBody(req, employerAdminCreateSchema);
  const { name, email, password, companyName, industry, location, phone } = body;

  const existing = await User.findOne({ email });
  if (existing) return NextResponse.json({ error: "Email already in use" }, { status: 409 });

  const passwordHash = await bcrypt.hash(password, 12);
  const user = await User.create({
    name,
    email,
    passwordHash,
    role: "employer",
    isActive: true,
    isEmailVerified: true,
  });

  // Resolve agentId — for agents, use their own Agent doc; for super_agents, leave null
  let agentId: string | undefined;
  if (ctx.role === "agent") {
    const agentDoc = await Agent.findOne({ userId: ctx.userId }).select("_id").lean();
    agentId = agentDoc?._id?.toString();
  }

  // Create Employer profile (matching employer-register flow)
  const employer = await Employer.create({
    userId: user._id,
    companyName: companyName || name,
    companyEmail: email,
    phone: phone || "",
    industry,
    ...(agentId ? { agentId } : {}),
    verificationLevel: "basic",
    isAgentVerified: !!(ctx.role === "agent" || ctx.role === "super_agent"),
    verifiedByAgentId: ctx.role === "agent" || ctx.role === "super_agent" ? ctx.userId : undefined,
  });

  // Create CompanyUser entry (owner)
  await CompanyUser.create({
    companyId: employer._id,
    userId: user._id,
    email,
    companyRole: "owner",
    permissions: getDefaultPermissions("owner"),
    invitedBy: user._id,
    invitedAt: new Date(),
    acceptedAt: new Date(),
    status: "active",
  });

  // Link employer to agent's assignedEmployerIds
  if (agentId) {
    await Agent.findByIdAndUpdate(agentId, {
      $addToSet: { assignedEmployerIds: employer._id },
      $inc: { "performance.employersCreated": 1 },
    });
  }

  // Send welcome email (fire-and-forget)
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? process.env.NEXTAUTH_URL ?? "https://mployedin.com";
  const loginUrl = `${baseUrl}/login`;
  const creatorName = ctx.role === "agent" || ctx.role === "super_agent" ? "Your MPLOYEDIN Agent" : "MPLOYEDIN Admin";
  sendEmail({
    to: email,
    ...EmailTemplates.employerWelcome(name, email, password, creatorName, loginUrl),
    userId: user._id.toString(),
    source: "employer-onboard",
    category: "onboarding",
  }).catch(() => {});

  await logActivity({
    ...actorFromCtx(ctx),
    action: "employer.create",
    resource: "employers",
    resourceId: String(user._id),
    meta: { companyName: companyName || name, email, createdBy: ctx.role },
    req,
  });

  return NextResponse.json({
    employer: {
      _id: user._id,
      name: user.name,
      email: user.email,
      companyName: employer.companyName,
      industry: employer.industry,
      isActive: true,
      isAgentVerified: employer.isAgentVerified ?? false,
    },
  }, { status: 201 });
}

export const GET = withAuth(handler, { resource: "employers", action: "read" });
export const POST = withAuth(postHandler, { resource: "employers", action: "create" });
