import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongoose";
import { withAuth } from "@/lib/auth/withAuth";
import User from "@/models/User";
import Employer from "@/models/Employer";
import Agent from "@/models/Agent";
import { CompanyUser, getDefaultPermissions } from "@/models/CompanyUser";
import { escapeRegex, isValidObjectId } from "@/lib/security/sanitize";
import { validateBody } from "@/lib/validators";
import { employerAdminCreateSchema } from "@/lib/validators/employers";
import { logActivity, actorFromCtx } from "@/lib/audit/log";
import { checkRateLimitDual, RATE_LIMIT_CONFIGS } from "@/lib/security/rateLimit";
import { sendEmail, EmailTemplates } from "@/lib/communications/email";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import logger from "@/lib/logger";
import { buildEmployerAdminCreatePayload } from "@/lib/employers/admin";
import {
  getAgentEmployerIds,
  getSuperAgentBook,
  getSuperAgentOwnRegion,
  hasRegionAssigned,
} from "@/lib/auth/agentRestrictions";
import {
  employerCoverageFilter,
  resolveEmployerRegion,
  summariseEmployerRegions,
  territoryHoldsCity,
} from "@/lib/agents/territoryCoverage";
import { resolveEmployerAgents, unassignedEmployerFilter } from "@/lib/agents/employerAssignment";

interface AuthCtx { userId: string; role: string; locale: string; }

async function handler(req: NextRequest, ctx: AuthCtx) {
  await connectDB();
  const { searchParams } = new URL(req.url);
  const search = searchParams.get("search") ?? "";
  const page = parseInt(searchParams.get("page") ?? "1");
  const limit = parseInt(searchParams.get("limit") ?? "10");
  const skip = (page - 1) * limit;

  // Agents see employers assigned to them plus every employer registered in
  // their region (getAgentEmployerIds).
  if (ctx.role === "agent") {
    const agentDoc = await Agent.findOne({ userId: ctx.userId }).select("_id assignedEmployerIds").lean();
    if (!agentDoc) return NextResponse.json({ error: "Agent profile not found" }, { status: 404 });
    const empIds = await getAgentEmployerIds(ctx.userId);
    // Seeing is not owning: posting jobs and entering the account need the
    // explicit assignment (jobs POST, tenant switch), so the page offers those
    // actions only on these rows.
    const assignedToMe = new Set(((agentDoc.assignedEmployerIds as unknown[]) ?? []).map(String));
    if (empIds.length === 0) {
      return NextResponse.json({ employers: [], pagination: { page, limit, total: 0, pages: 0 } });
    }

    // Query Employer profiles for assigned employers
    // Archived by an admin role conversion — the company profile is kept so its
    // jobs keep an owner, but the account is no longer an employer. `null` also
    // matches documents predating the field.
    const empQuery: Record<string, unknown> = { _id: { $in: empIds }, roleArchivedAt: null };
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
        assignedToMe: assignedToMe.has(String(p._id)),
      };
    });

    return NextResponse.json({ employers, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
  }

  // Super-agents see their book (getSuperAgentBook): employers under their
  // agents, from either end of the agent link, plus every employer registered
  // in their territory — with or without an agent. It is the same set their
  // jobs, applications and territory pages scope to.
  if (ctx.role === "super_agent") {
    const book = await getSuperAgentBook(ctx.userId);
    if (!book) return NextResponse.json({ error: "Super-agent profile not found" }, { status: 404 });
    if (book.employerIds.length === 0) {
      return NextResponse.json({ employers: [], pagination: { page, limit, total: 0, pages: 0 } });
    }

    // See the note on the super-agent query above: archived conversions are
    // kept but must not appear in an employer list.
    const empQuery: Record<string, unknown> = { _id: { $in: book.employerIds }, roleArchivedAt: null };

    // Optional agentId filter: narrow to one of the SA's agents' employers.
    // An id outside the book narrows to nothing rather than widening.
    const agentIdParam = searchParams.get("agentId") ?? "";
    if (agentIdParam) {
      empQuery.agentId = book.agentIds.map(String).includes(agentIdParam)
        ? agentIdParam
        : { $in: [] };
    }
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
    // Entering the account (tenant switch) needs the employer's agent to be on
    // the SA's own team; region-only rows are visible but not enterable.
    const team = new Set(book.teamAgentIds.map(String));

    // Filter by user status if provided
    const employers = profiles
      .map((p) => {
        const user = p.userId as { _id?: unknown; name?: string; email?: string; isActive?: boolean; createdAt?: Date } | null;
        const agentProfile = p.agentId as { _id?: unknown; userId?: unknown } | undefined;
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
          canEnterAccount: Boolean(agentProfile?._id && team.has(String(agentProfile._id))),
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

  // Agent and super_agent are scoped above. Without this branch the employer role
  // falls through to the admin-shaped query and can enumerate every company on
  // the platform — the profile projection below includes companyEmail, phone,
  // address, taxId and verificationDocs.
  let ownEmployerUserId: unknown = null;
  if (ctx.role === "employer") {
    const ownProfile = await Employer.findOne({ userId: ctx.userId }).select("userId").lean();
    if (!ownProfile) {
      return NextResponse.json({ error: "Employer profile not found" }, { status: 404 });
    }
    ownEmployerUserId = ownProfile.userId;
    query._id = ownEmployerUserId;
  }
  // No status = active only (the pickers that list employers to post for).
  // "all" really means all, as it already does for agents and super agents:
  // the admin directory sent it and still lost every deactivated employer.
  if (status === "active") query.isActive = true;
  else if (status === "inactive") query.isActive = false;
  else if (status !== "all") query.isActive = true;

  // Build employer profile filter for industry/location/verified/agentId
  const empFilter: Record<string, unknown> = {};
  if (industry) empFilter.industry = { $regex: escapeRegex(industry), $options: "i" };
  if (location) empFilter.address = { $regex: escapeRegex(location), $options: "i" };
  if (verified === "verified") empFilter.isAgentVerified = true;
  else if (verified === "unverified") empFilter.isAgentVerified = { $ne: true };
  // agentId: "none" (no agent), "any" (has one), or an Agent doc id. Read from
  // BOTH ends of the employer↔agent link, the way the agent dashboard does.
  const agentIdParam = searchParams.get("agentId") ?? "";
  if (agentIdParam === "none") {
    empFilter.$and = [await unassignedEmployerFilter()];
  } else if (agentIdParam === "any") {
    const linked = await Agent.distinct("assignedEmployerIds", { roleArchivedAt: null });
    empFilter.$and = [{ $or: [{ agentId: { $ne: null } }, { _id: { $in: linked } }] }];
  } else if (agentIdParam) {
    const agentDoc = isValidObjectId(agentIdParam)
      ? await Agent.findById(agentIdParam).select("assignedEmployerIds").lean()
      : null;
    // An unknown agent id matches nothing rather than falling back to everyone.
    empFilter.$and = [agentDoc
      ? { $or: [{ agentId: agentDoc._id }, { _id: { $in: agentDoc.assignedEmployerIds ?? [] } }] }
      : { _id: null }];
  }
  // coverage: "none" = no super-agent's territory holds the employer's region
  // (or it has none), "covered" = at least one does.
  const coverageParam = searchParams.get("coverage") ?? "";
  if (coverageParam === "none" || coverageParam === "covered") {
    empFilter.$and = [
      ...((empFilter.$and as Record<string, unknown>[]) ?? []),
      await employerCoverageFilter(coverageParam === "covered"),
    ];
  }
  const hasEmployerFilter = Boolean(
    industry || location || verified || agentIdParam || coverageParam === "none" || coverageParam === "covered",
  );

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
  if (!search && hasEmployerFilter) {
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
  if (search && hasEmployerFilter) {
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

  // The filter blocks above assign query._id outright, which used to replace
  // the employer's own-account pin — `?industry=x` listed every matching
  // company to an employer. Re-pin last: an employer only ever sees itself.
  if (ownEmployerUserId) query._id = ownEmployerUserId;

  // Sorting. Company and industry live on Employer profiles rather than the
  // User document returned by this branch, so resolve those profile ids first
  // and preserve their order after fetching user records.
  const profileSort = sortBy === "companyName" || sortBy === "industry";
  let orderedProfileUserIds: string[] | null = null;
  const countQuery: Record<string, unknown> = { ...query };
  if (profileSort && !search) {
    const profileQuery: Record<string, unknown> = { ...empFilter };
    if (query._id) profileQuery.userId = query._id;
    const orderedProfiles = await Employer.find(profileQuery)
      .select("userId")
      .sort({ [sortBy]: sortOrder === "desc" ? -1 : 1, _id: 1 })
      .lean();
    orderedProfileUserIds = orderedProfiles.map((profile) => String(profile.userId));
    const pageUserIds = orderedProfileUserIds.slice(skip, skip + limit);
    query._id = { $in: pageUserIds };
  }
  const VALID_SORT = new Set(["name", "email", "createdAt"]);
  const sortField = VALID_SORT.has(sortBy) ? sortBy : "name";
  const sortDir = sortOrder === "desc" ? -1 : 1;

  const [users, total] = await Promise.all([
    User.find(query)
      .select("name email isActive createdAt")
      .sort(profileSort ? { _id: 1 } : { [sortField]: sortDir })
      .skip(skip)
      .limit(limit)
      .lean(),
    User.countDocuments(countQuery),
  ]);

  // Attach verificationDocs and domainVerified from Employer model
  const userIds = users.map((u) => u._id);
  const employerProfiles = await Employer.find({ userId: { $in: userIds } })
    .select("userId companyName companyEmail phone address country taxId industry verificationDocs domainVerified verificationLevel isAgentVerified agentId regionCityId regionStateId")
    .lean();

  const profileMap = new Map(
    employerProfiles.map((e) => [String(e.userId), e])
  );

  // The agent running each account (either end of the link) and their
  // super-agent; and the region with every super-agent covering it.
  const [agentByEmployer, regionByEmployer] = await Promise.all([
    resolveEmployerAgents(employerProfiles),
    ctx.role === "admin" ? summariseEmployerRegions(employerProfiles) : Promise.resolve(null),
  ]);

  const orderedUsers = orderedProfileUserIds
    ? [...users].sort((a, b) => orderedProfileUserIds!.indexOf(String(a._id)) - orderedProfileUserIds!.indexOf(String(b._id)))
    : users;
  const employers = orderedUsers
    .filter((u) => profileMap.has(String(u._id))) // exclude orphaned employer Users without Employer profile
    .map((u) => {
    const profile = profileMap.get(String(u._id))!;
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
      assignedAgent: agentByEmployer.get(String(profile._id)) ?? null,
      ...(regionByEmployer ? { region: regionByEmployer.get(String(profile._id)) ?? null } : {}),
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
  const { name, email, password, companyName, industry, location, phone, cityId } = body;

  // The employer's region (catalogue city) decides which super-agents and
  // agents see it. A super-agent places the company inside their own
  // territory — otherwise it would drop out of their list the moment it was
  // created, since they have no agent link to it.
  let region: Awaited<ReturnType<typeof resolveEmployerRegion>> = null;
  if (ctx.role === "super_agent") {
    const saRegion = await getSuperAgentOwnRegion(ctx.userId);
    if (saRegion && hasRegionAssigned(saRegion)) {
      if (!cityId || !(await territoryHoldsCity(saRegion, cityId))) {
        return NextResponse.json(
          {
            error: "Pick a city inside your territory.",
            details: [{ path: "cityId", message: "Pick a city inside your territory." }],
          },
          { status: 400 },
        );
      }
    }
  }
  if (cityId) {
    region = await resolveEmployerRegion({ cityId });
    if (!region) {
      return NextResponse.json(
        { error: "Pick a city from the list.", details: [{ path: "cityId", message: "Pick a city from the list." }] },
        { status: 400 },
      );
    }
  }

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
    ...(region
      ? { regionCityId: region.cityId, regionStateId: region.stateId, city: region.cityName, country: region.countryCode }
      : {}),
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
    // Here the agent chose the password on the form, so the employer is sent
    // the same one rather than a generated one.
    ...EmailTemplates.employerWelcome(name, email, payload.password, setupUrl, creatorName, loginUrl),
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
