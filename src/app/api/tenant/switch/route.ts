import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { withAuth } from "@/lib/auth/withAuth";
import { connectDB } from "@/lib/db/mongoose";
import Agent from "@/models/Agent";
import SuperAgent from "@/models/SuperAgent";
import { Employer } from "@/models/Employer";
import User from "@/models/User";
import TenantViewSession from "@/models/TenantViewSession";
import { isValidObjectId } from "@/lib/security/sanitize";
import { signTenantCookie, TENANT_COOKIE_NAME } from "@/lib/security/tenantCookie";
import { logActivity, actorFromCtx } from "@/lib/audit/log";
import { checkRateLimit } from "@/lib/security/rateLimit";

const SESSION_TTL_MS = 4 * 60 * 60 * 1000; // 4 hours
/** Max characters for companyName stored in the cookie to prevent size overflow */
const MAX_COOKIE_COMPANY_NAME = 100;

const ALLOWED_ROLES = ["admin", "super_agent", "agent"] as const;

function extractIp(req: NextRequest): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    "unknown"
  );
}

/**
 * POST /api/tenant/switch
 * Body: { employerId: string }   — Start tenant view as that employer
 * Body: { exit: true }           — Exit tenant view and return cookie
 *
 * GET /api/tenant/switch         — Return active tenant view session (if any)
 */
export const POST = withAuth(async (req: NextRequest, ctx) => {
  const { role, userId } = ctx;

  if (!(ALLOWED_ROLES as readonly string[]).includes(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Rate limit: 10 tenant switches per minute per user
  const rlResult = checkRateLimit(`tenant_switch:${userId}`, {
    limit: 10,
    windowSec: 60,
    prefix: "tenant",
  });
  if (!rlResult.allowed) {
    return NextResponse.json(
      { error: "Too many tenant switch requests. Please try again later." },
      { status: 429 }
    );
  }

  const body = await req.json().catch(() => ({})) as Record<string, unknown>;

  // ── Exit tenant view ────────────────────────────────────────────────────
  if (body.exit === true) {
    await connectDB();
    await TenantViewSession.deleteMany({ actorId: userId });

    await logActivity({
      ...actorFromCtx(ctx),
      action: "tenant_view.exit",
      resource: "employers",
      req,
    });

    const res = NextResponse.json({ success: true, message: "Tenant view ended" });
    res.cookies.set(TENANT_COOKIE_NAME, "", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      path: "/",
      maxAge: 0,
    });
    return res;
  }

  // ── Start tenant view ───────────────────────────────────────────────────
  const { employerId } = body as { employerId?: string };

  if (!employerId || !isValidObjectId(employerId)) {
    return NextResponse.json({ error: "Invalid employerId" }, { status: 400 });
  }

  await connectDB();

  // The admin employers page returns User._id (not Employer._id),
  // so try both: findById (Employer._id) then findOne by userId.
  let employer = await Employer.findById(employerId)
    .select("_id companyName agentId userId isActive")
    .lean();

  if (!employer) {
    employer = await Employer.findOne({ userId: employerId })
      .select("_id companyName agentId userId isActive")
      .lean();
  }

  if (!employer) {
    return NextResponse.json({ error: "Employer not found" }, { status: 404 });
  }
  if (employer.isActive === false) {
    return NextResponse.json({ error: "Unable to access this employer account" }, { status: 400 });
  }
  if (!employer.userId) {
    return NextResponse.json({ error: "Unable to access this employer account" }, { status: 400 });
  }

  // Verify the employer's user account actually has the employer role
  const employerUser = await User.findById(employer.userId).select("role isActive").lean();
  if (!employerUser || employerUser.role !== "employer") {
    return NextResponse.json({ error: "Unable to access this employer account" }, { status: 400 });
  }
  if (!employerUser.isActive) {
    return NextResponse.json({ error: "Unable to access this employer account" }, { status: 400 });
  }

  // ── Access control ──────────────────────────────────────────────────────
  // Use the canonical employer document _id for all comparisons
  const canonicalEmployerId = employer._id.toString();

  if (role === "agent") {
    const agent = await Agent.findOne({ userId }).select("assignedEmployerIds").lean();
    if (!agent) {
      return NextResponse.json({ error: "Agent profile not found" }, { status: 404 });
    }
    const hasAccess = agent.assignedEmployerIds.some(
      (id: mongoose.Types.ObjectId) => id.toString() === canonicalEmployerId
    );
    if (!hasAccess) {
      return NextResponse.json(
        { error: "Forbidden — employer is not in your assigned list" },
        { status: 403 }
      );
    }
  } else if (role === "super_agent") {
    const superAgent = await SuperAgent.findOne({ userId }).select("agentIds").lean();
    if (!superAgent) {
      return NextResponse.json({ error: "Super-agent profile not found" }, { status: 404 });
    }
    // Employer must belong to an agent under this super-agent
    const employerAgentId = employer.agentId?.toString();
    const underJurisdiction =
      employerAgentId &&
      superAgent.agentIds.some((id: mongoose.Types.ObjectId) => id.toString() === employerAgentId);
    if (!underJurisdiction) {
      return NextResponse.json(
        { error: "Forbidden — employer is not under your jurisdiction" },
        { status: 403 }
      );
    }
  }
  // admin: no restriction

  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  const companyNameRaw = employer.companyName ?? "Company";
  // Truncate to prevent cookie size overflow (4096 byte browser limit)
  const companyName = companyNameRaw.length > MAX_COOKIE_COMPANY_NAME
    ? companyNameRaw.slice(0, MAX_COOKIE_COMPANY_NAME) + "…"
    : companyNameRaw;
  const employerUserId = employer.userId.toString();
  const ipAddress = extractIp(req);

  // Upsert — one active session per actor
  await TenantViewSession.findOneAndUpdate(
    { actorId: userId },
    {
      actorId: userId,
      actorRole: role,
      employerId: canonicalEmployerId,
      employerUserId: employer.userId,
      companyName,
      ipAddress,
      expiresAt,
    },
    { upsert: true, new: true }
  );

  await logActivity({
    ...actorFromCtx(ctx),
    action: "tenant_view.start",
    resource: "employers",
    resourceId: canonicalEmployerId,
    meta: { companyName, ipAddress },
    req,
  });

  // Sign the edge-verifiable cookie
  const secret = process.env.NEXTAUTH_SECRET!;
  const cookieValue = await signTenantCookie(
    {
      actorId: userId,
      employerId: canonicalEmployerId,
      employerUserId,
      companyName,
      exp: Math.floor(expiresAt.getTime() / 1000),
    },
    secret
  );

  const res = NextResponse.json({
    success: true,
    employer: {
      id: canonicalEmployerId,
      companyName,
    },
    expiresAt: expiresAt.toISOString(),
  });

  res.cookies.set(TENANT_COOKIE_NAME, cookieValue, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: SESSION_TTL_MS / 1000,
  });

  return res;
}, { skipTenantView: true });

export const GET = withAuth(async (_req: NextRequest, ctx) => {
  if (!(ALLOWED_ROLES as readonly string[]).includes(ctx.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await connectDB();

  const session = await TenantViewSession.findOne({
    actorId: ctx.userId,
    expiresAt: { $gt: new Date() },
  }).lean();

  if (!session) return NextResponse.json({ active: false });

  const employer = await Employer.findById(session.employerId)
    .select("companyName isActive")
    .lean();

  if (!employer?.isActive) {
    await TenantViewSession.deleteOne({ actorId: ctx.userId });
    return NextResponse.json({ active: false });
  }

  return NextResponse.json({
    active: true,
    employerId: session.employerId.toString(),
    companyName: employer.companyName,
    actorRole: session.actorRole,
    expiresAt: session.expiresAt.toISOString(),
  });
}, { skipTenantView: true });
