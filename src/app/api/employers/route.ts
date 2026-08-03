import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongoose";
import { withAuth } from "@/lib/auth/withAuth";
import User from "@/models/User";
import Employer from "@/models/Employer";
import Agent from "@/models/Agent";
import SuperAgent from "@/models/SuperAgent";
import { CompanyUser, getDefaultPermissions } from "@/models/CompanyUser";
import { escapeRegex } from "@/lib/security/sanitize";
import { validateBody } from "@/lib/validators";
import { employerAdminCreateSchema } from "@/lib/validators/employers";
import { logActivity, actorFromCtx } from "@/lib/audit/log";
import { checkRateLimitDual, RATE_LIMIT_CONFIGS } from "@/lib/security/rateLimit";
import { sendEmail, EmailTemplates } from "@/lib/communications/email";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import logger from "@/lib/logger";
import { buildEmployerAdminCreatePayload } from "@/lib/employers/admin";

interface AuthCtx { userId: string; role: string; locale: string; }

async function handler(req: NextRequest, ctx: AuthCtx) {
  await connectDB();
  const { searchParams } = new URL(req.url);
  const search = searchParams.get("search") ?? "";
  const page = parseInt(searchParams.get("page") ?? "1");
  const limit = parseInt(searchParams.get("limit") ?? "10");
  const skip = (page - 1) * limit;

  // Agents can only see employers assigned to them — resolve via Agent doc
  if (ctx.role === "agent") {
    const agentDoc = await Agent.findOne({ userId: ctx.userId }).select("assignedEmployerIds").lean();
    if (!agentDoc) return NextResponse.json({ error: "Agent profile not found" }, { status: 404 });
    const empIds = agentDoc.assignedEmployerIds ?? [];
    if (empIds.length === 0) {
      return NextResponse.json({ employers: [], pagination: { page, limit, total: 0, pages: 0 } });
    }

    // Query Employer profiles for assigned employers
    const empQuery: Record<string, unknown> = { _id: { $in: empIds } };
    if (search) {
      const safe = escapeRegex(search);
      empQuery.$or = [
        { companyName: { $regex: safe, $options: "i" } },
        { companyEmail: { $regex: safe, $options: "i" } },
        { industry: { $regex: safe, $options: "i" } },
      ];
    }

    const [profiles, total] = await Promise.all([
      Employer.find(empQuery)
        .populate("userId", "name email isActive createdAt")
        .sort({ companyName: 1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Employer.countDocuments(empQuery),
    ]);

    const employers = profiles.map((p) => {
      const user = p.userId as { _id?: unknown; name?: string; email?: string; isActive?: boolean; createdAt?: Date } | null;
      return {
        _id: p._id,
        name: user?.name,
        email: user?.email,
        companyName: p.companyName,
        companyEmail: p.companyEmail,
        phone: p.phone,
        address: p.address,
        country: p.country,
        taxId: p.taxId,
        industry: p.industry,
        location: p.address ?? p.country ?? "",
        isActive: user?.isActive ?? true,
        createdAt: user?.createdAt,
        verificationDocs: p.verificationDocs ?? [],
        domainVerified: p.domainVerified ?? false,
        verificationLevel: p.verificationLevel,
        isAgentVerified: p.isAgentVerified ?? false,
      };
    });

    return NextResponse.json({ employers, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
  }

  // Super-agents can only see employers under their agents
  if (ctx.role === "super_agent") {
    const superAgent = await SuperAgent.findOne({ userId: ctx.userId }).select("agentIds").lean();
    if (!superAgent) return NextResponse.json({ error: "Super-agent profile not found" }, { status: 404 });
    const agentDocIds = superAgent.agentIds ?? [];
    if (agentDocIds.length === 0) {
      return NextResponse.json({ employers: [], pagination: { page, limit, total: 0, pages: 0 } });
    }

    // Optional agentId filter: narrow to a specific agent's employers
    const agentIdParam = searchParams.get("agentId") ?? "";
    const scopedAgentIds = agentIdParam && agentDocIds.map(String).includes(agentIdParam)
      ? [agentIdParam]
      : agentDocIds;

    const empQuery: Record<string, unknown> = { agentId: { $in: scopedAgentIds } };
    if (search) {
      const safe = escapeRegex(search);
      empQuery.$or = [
        { companyName: { $regex: safe, $options: "i" } },
        { companyEmail: { $regex: safe, $options: "i" } },
        { industry: { $regex: safe, $options: "i" } },
      ];
    }
    const industry = searchParams.get("industry") ?? "";
    const location = searchParams.get("location") ?? "";
    const status = searchParams.get("status") ?? "";
    const verified = searchParams.get("verified") ?? "";
    const sortBy = searchParams.get("sortBy") ?? "companyName";
    const sortOrder = searchParams.get("sortOrder") ?? "asc";
    const distinct = searchParams.get("distinct");

    if (industry) empQuery.industry = { $regex: escapeRegex(industry), $options: "i" };
    if (location) empQuery.address = { $regex: escapeRegex(location), $options: "i" };
    if (verified === "verified") empQuery.isAgentVerified = true;
    else if (verified === "unverified") empQuery.isAgentVerified = { $ne: true };

    const VALID_SORT = new Set(["companyName", "industry", "createdAt"]);
    const sortField = VALID_SORT.has(sortBy) ? sortBy : "companyName";
    const sortDir = sortOrder === "desc" ? -1 : 1;

    const [profiles, total] = await Promise.all([
      Employer.find(empQuery)
        .populate("userId", "name email isActive createdAt")
        .populate("agentId", "userId")
        .sort({ [sortField]: sortDir })
        .skip(skip)
        .limit(limit)
        .lean(),
      Employer.countDocuments(empQuery),
    ]);

    // Resolve agent names
    const agentUserIds = profiles
      .map((p) => (p.agentId as { userId?: unknown } | undefined)?.userId)
      .filter(Boolean) as string[];
    const agentUsers = agentUserIds.length > 0
      ? await User.find({ _id: { $in: agentUserIds } }).select("name").lean()
      : [];
    const agentNameMap = new Map(agentUsers.map((u) => [String(u._id), u.name]));

    // Filter by user status if provided
    const employers = profiles
      .map((p) => {
        const user = p.userId as { _id?: unknown; name?: string; email?: string; isActive?: boolean; createdAt?: Date } | null;
        const agentProfile = p.agentId as { userId?: unknown } | undefined;
        const agentUserId = agentProfile?.userId ? String(agentProfile.userId) : null;
        return {
          _id: p._id,
          name: user?.name,
          email: user?.email,
          companyName: p.companyName,
          companyEmail: p.companyEmail,
          phone: p.phone,
          address: p.address,
          country: p.country,
          taxId: p.taxId,
          industry: p.industry,
          location: p.address ?? "",
          isActive: user?.isActive ?? true,
          createdAt: user?.createdAt,
          verificationDocs: p.verificationDocs ?? [],
          domainVerified: p.domainVerified ?? false,
          verificationLevel: p.verificationLevel,
          isAgentVerified: p.isAgentVerified ?? false,
          assignedAgent: agentUserId ? { name: agentNameMap.get(agentUserId) ?? "Unknown" } : undefined,
          jobCount: 0,
          totalPaid: p.totalPaid ?? 0,
        };
      })
      .filter((e) => {
        if (status === "active") return e.isActive;
        if (status === "inactive") return !e.isActive;
        return true;
      });

    const facets = distinct === "true" ? await getEmployerFacets() : undefined;

    // Server-side KPI stats across the WHOLE scoped set (not just the current
    // page) so the dashboard cards don't report the page size as the total.
    const statsAgg = await Employer.aggregate([
      { $match: empQuery },
      { $lookup: { from: "users", localField: "userId", foreignField: "_id", as: "u" } },
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          active: { $sum: { $cond: [{ $eq: [{ $arrayElemAt: ["$u.isActive", 0] }, false] }, 0, 1] } },
          assigned: { $sum: { $cond: [{ $ifNull: ["$agentId", false] }, 1, 0] } },
        },
      },
    ]);
    const stats = statsAgg[0]
      ? { total: statsAgg[0].total, active: statsAgg[0].active, assigned: statsAgg[0].assigned }
      : { total: 0, active: 0, assigned: 0 };

    return NextResponse.json({
      employers,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
      totalCount: total,
      stats,
      ...(facets ? { facets } : {}),
    });
  }

  // Non-agent roles (admin): query User model directly
  const industry = searchParams.get("industry") ?? "";
  const status = searchParams.get("status") ?? ""; // active | inactive
  const verified = searchParams.get("verified") ?? ""; // verified | unverified
  const location = searchParams.get("location") ?? "";
  const sortBy = searchParams.get("sortBy") ?? "name";
  const sortOrder = searchParams.get("sortOrder") ?? "asc";
  const distinct = searchParams.get("distinct");

  const query: Record<string, unknown> = { role: "employer" };
  if (status === "active") query.isActive = true;
  else if (status === "inactive") query.isActive = false;
  else query.isActive = true; // default to active

  // Build employer profile filter for industry/location/verified/agentId
  const empFilter: Record<string, unknown> = {};
  if (industry) empFilter.industry = { $regex: escapeRegex(industry), $options: "i" };
  if (location) empFilter.address = { $regex: escapeRegex(location), $options: "i" };
  if (verified === "verified") empFilter.isAgentVerified = true;
  else if (verified === "unverified") empFilter.isAgentVerified = { $ne: true };
  const agentIdParam = searchParams.get("agentId") ?? "";
  if (agentIdParam) empFilter.agentId = agentIdParam;

  // Search spans both User (name, email) AND Employer (companyName, industry)
  // We need to find userIds from Employer matches and merge with User-level matches
  if (search) {
    const safe = escapeRegex(search);
    // Find employer profiles matching companyName or industry
    const empSearchFilter: Record<string, unknown> = {
      ...empFilter,
      $or: [
        { companyName: { $regex: safe, $options: "i" } },
        { companyEmail: { $regex: safe, $options: "i" } },
        { industry: { $regex: safe, $options: "i" } },
      ],
    };
    const matchingByCompany = await Employer.find(empSearchFilter).select("userId").lean();
    const companyUserIds = matchingByCompany.map((p) => p.userId);

    // User-level search (name, email) combined with employer-level companyName matches
    query.$or = [
      { name: { $regex: safe, $options: "i" } },
      { email: { $regex: safe, $options: "i" } },
      ...(companyUserIds.length > 0 ? [{ _id: { $in: companyUserIds } }] : []),
    ];
  }

  // If we have employer-level filters (without search), find matching userIds first
  let userIdConstraint: unknown[] | null = null;
  if (!search && (industry || location || verified)) {
    const matchingProfiles = await Employer.find(empFilter).select("userId").lean();
    userIdConstraint = matchingProfiles.map((p) => p.userId);
    if (userIdConstraint.length === 0) {
      const facets = distinct === "true" ? await getEmployerFacets() : undefined;
      return NextResponse.json({
        employers: [],
        pagination: { page, limit, total: 0, pages: 0 },
        ...(facets ? { facets } : {}),
      });
    }
    query._id = { $in: userIdConstraint };
  }

  // When search is active AND we also have employer-level filters, narrow by those too
  if (search && (industry || location || verified)) {
    const filteredProfiles = await Employer.find(empFilter).select("userId").lean();
    const filteredUserIds = filteredProfiles.map((p) => p.userId);
    if (filteredUserIds.length === 0) {
      const facets = distinct === "true" ? await getEmployerFacets() : undefined;
      return NextResponse.json({
        employers: [],
        pagination: { page, limit, total: 0, pages: 0 },
        ...(facets ? { facets } : {}),
      });
    }
    // Intersect: user must match search AND be in filtered employer set
    query._id = { ...(query._id as object ?? {}), $in: filteredUserIds };
  }

  // Sorting
  const VALID_SORT = new Set(["name", "email", "createdAt"]);
  const sortField = VALID_SORT.has(sortBy) ? sortBy : "name";
  const sortDir = sortOrder === "desc" ? -1 : 1;

  const [users, total] = await Promise.all([
    User.find(query)
      .select("name email isActive createdAt")
      .sort({ [sortField]: sortDir })
      .skip(skip)
      .limit(limit)
      .lean(),
    User.countDocuments(query),
  ]);

  // Attach verificationDocs and domainVerified from Employer model
  const userIds = users.map((u) => u._id);
  const employerProfiles = await Employer.find({ userId: { $in: userIds } })
    .select("userId companyName companyEmail phone address country taxId industry verificationDocs domainVerified verificationLevel isAgentVerified agentId")
    .populate("agentId", "userId")
    .lean();

  const profileMap = new Map(
    employerProfiles.map((e) => [String(e.userId), e])
  );

  // Look up agent user names for assignedAgent display
  const agentUserIdSet = new Set(
    employerProfiles.filter((e) => e.agentId).map((e) => {
      const agent = e.agentId as { userId?: unknown } | undefined;
      return agent?.userId ? String(agent.userId) : null;
    }).filter(Boolean) as string[]
  );
  const agentUsers = agentUserIdSet.size > 0
    ? await User.find({ _id: { $in: [...agentUserIdSet] } }).select("name").lean()
    : [];
  const agentNameMap = new Map(agentUsers.map((u) => [String(u._id), u.name]));

  const employers = users
    .filter((u) => profileMap.has(String(u._id))) // exclude orphaned employer Users without Employer profile
    .map((u) => {
    const profile = profileMap.get(String(u._id))!;
    const agentProfile = profile?.agentId as { userId?: unknown } | undefined;
    const agentUserId = agentProfile?.userId ? String(agentProfile.userId) : null;
    return {
      ...u,
      employerProfileId: String(profile._id), // canonical Employer._id for tenant switch
      companyName: profile?.companyName,
      companyEmail: profile?.companyEmail,
      phone: profile?.phone,
      address: profile?.address,
      country: profile?.country,
      taxId: profile?.taxId,
      industry: profile?.industry,
      location: profile?.address,
      verificationDocs: profile?.verificationDocs ?? [],
      domainVerified: profile?.domainVerified ?? false,
      verificationLevel: profile?.verificationLevel,
      isAgentVerified: profile?.isAgentVerified ?? false,
      assignedAgent: agentUserId ? { name: agentNameMap.get(agentUserId) ?? "Unknown" } : undefined,
    };
  });

  // Facets for filter dropdowns
  const facets = distinct === "true" ? await getEmployerFacets() : undefined;

  return NextResponse.json({
    employers,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    ...(facets ? { facets } : {}),
  });
}

// Helper: get distinct facet values for employer filters
async function getEmployerFacets() {
  const [industries, locations] = await Promise.all([
    Employer.distinct("industry").then((vals: (string | null | undefined)[]) => vals.filter(Boolean).sort()),
    Employer.distinct("address").then((vals: (string | null | undefined)[]) => vals.filter(Boolean).sort()),
  ]);
  return { industries, locations };
}

async function postHandler(req: NextRequest, ctx: AuthCtx) {
  const rl = await checkRateLimitDual(req, ctx.userId, RATE_LIMIT_CONFIGS.employers);
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

  const payload = buildEmployerAdminCreatePayload({ name, email, password, companyName, industry, location, phone });
  const passwordHash = await bcrypt.hash(payload.password, 12);
  const user = await User.create({
    ...payload.userUpdate,
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
    ...payload.employerUpdate,
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

    // Notify super agent about new employer created by their agent
    const { getSuperAgentUserId, notifySuperAgentEmployerRegistered } = await import("@/lib/notifications/trigger");
    const saUserId = await getSuperAgentUserId(agentId);
    if (saUserId) {
      const creatorUser = await User.findById(ctx.userId).select("name").lean();
      const agentName = (creatorUser as { name?: string })?.name ?? "An agent";
      notifySuperAgentEmployerRegistered(
        saUserId, companyName || name, agentName, String(employer._id), ctx.locale,
      ).catch((err) => logger.error({ err, employerId: String(employer._id) }, "Failed to notify super agent of new employer creation"));
    }
  }

  // Send welcome email with a password-setup link instead of the plaintext password
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? process.env.NEXTAUTH_URL ?? "https://mployedin.com";
  const loginUrl = `${baseUrl}/login`;
  const creatorName = ctx.role === "agent" || ctx.role === "super_agent" ? "Your MPLOYEDIN Agent" : "MPLOYEDIN Admin";
  const rawSetupToken = crypto.randomBytes(32).toString("hex");
  const hashedSetupToken = crypto.createHash("sha256").update(rawSetupToken).digest("hex");
  await User.findByIdAndUpdate(user._id, {
    passwordResetToken: hashedSetupToken,
    passwordResetExpiry: new Date(Date.now() + 24 * 60 * 60 * 1000),
  });
  const setupUrl = `${baseUrl}/en/reset-password?token=${rawSetupToken}`;
  await sendEmail({
    to: email,
    ...EmailTemplates.employerWelcome(name, email, setupUrl, creatorName, loginUrl),
    userId: user._id.toString(),
    source: "employer-onboard",
    category: "onboarding",
  }).catch((err) => logger.error({ err }, "[Employer Create] Failed to send welcome email"));

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
