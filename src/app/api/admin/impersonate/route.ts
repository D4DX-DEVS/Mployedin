import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/withAuth";
import { connectDB } from "@/lib/db/mongoose";
import User from "@/models/User";
import { Employer } from "@/models/Employer";
import TenantViewSession from "@/models/TenantViewSession";
import { validateBody } from "@/lib/validators";
import { impersonateSchema } from "@/lib/validators/admin";
import { logActivity, actorFromCtx } from "@/lib/audit/log";
import { isValidObjectId } from "@/lib/security/sanitize";
import { checkRateLimit } from "@/lib/security/rateLimit";
import { signTenantCookie, TENANT_COOKIE_NAME } from "@/lib/security/tenantCookie";

const SESSION_TTL_MS = 60 * 60 * 1000; // 1 hour
/** Matches tenant/switch — keeps the signed cookie well under the 4096-byte limit. */
const MAX_COOKIE_COMPANY_NAME = 100;

/**
 * POST /api/admin/impersonate
 * Body: { userId: string } — enter that user's context
 * Body: { exit: true }     — leave it and return to the admin's own context
 *
 * Implemented on top of tenant view rather than as a second identity mechanism.
 * This route previously wrote an `ImpersonationSession` that nothing ever read —
 * not withAuth, not the middleware, not the auth config — so the admin's requests
 * continued to run as the admin while the UI claimed otherwise.
 *
 * `withAuth:128-232` already consumes a signed tenant cookie and does the hard parts
 * properly: cookie as the only source of truth (middleware headers are never
 * trusted), a live DB session check, re-authorisation of the actor on every request
 * so revoked access takes effect immediately, DELETE restricted to admins, RBAC still
 * enforced, and ctx.userId/role swapped to the target so `Employer.findOne({userId})`
 * resolves transparently. It also carries the real actor in ctx.tenantView, which is
 * what lets the audit trail record "admin X acted on behalf of employer Y" instead of
 * crediting the employer (see actorFromCtx).
 *
 * Consequence: only employer accounts can be entered today, because tenant view is
 * employer-scoped. Entering a job-seeker or agent account would need a separate
 * design (what a support view may read, whether it may write at all), so those
 * targets are refused explicitly rather than pretended.
 */
export const POST = withAuth(async (req: NextRequest, ctx) => {
  // Rate limit: 10 impersonations per hour per admin
  const { allowed } = await checkRateLimit(`impersonate:${ctx.userId}`, { limit: 10, windowSec: 3600, prefix: "impersonate", failClosed: true });
  if (!allowed) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  await connectDB();
  const body = await validateBody(req, impersonateSchema);

  if (body.exit) {
    await TenantViewSession.deleteMany({ actorId: ctx.userId });

    // critical: leaving someone else's account must not happen untraceably.
    await logActivity({
      ...actorFromCtx(ctx),
      action: "impersonation.exit",
      resource: "users",
      resourceId: ctx.userId,
      req,
      critical: true,
    });

    const res = NextResponse.json({ success: true, message: "Impersonation ended" });
    res.cookies.set(TENANT_COOKIE_NAME, "", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      path: "/",
      maxAge: 0,
    });
    return res;
  }

  const { userId } = body as { userId: string };
  if (!isValidObjectId(userId)) {
    return NextResponse.json({ error: "Invalid userId" }, { status: 400 });
  }

  const target = await User.findById(userId).select("name email role isActive").lean();
  if (!target) return NextResponse.json({ error: "User not found" }, { status: 404 });
  if (!target.isActive) return NextResponse.json({ error: "Cannot impersonate inactive user" }, { status: 400 });

  // Never allow entering another admin's account: it would grant admin privileges
  // under a colleague's identity, and the target could then act with no way to tell
  // the two apart in their own audit view.
  if (target.role === "admin") {
    return NextResponse.json(
      { error: "Admin accounts cannot be impersonated" },
      { status: 400 }
    );
  }

  if (target.role !== "employer") {
    return NextResponse.json(
      {
        error:
          "Only employer accounts can be entered. Support view for job-seeker and agent accounts is not implemented.",
      },
      { status: 400 }
    );
  }

  const employer = await Employer.findOne({ userId })
    .select("_id companyName userId isActive")
    .lean();
  if (!employer) {
    return NextResponse.json({ error: "Employer profile not found for this user" }, { status: 404 });
  }
  if (employer.isActive === false) {
    return NextResponse.json({ error: "Unable to access this employer account" }, { status: 400 });
  }

  const employerId = employer._id.toString();
  const companyNameRaw = employer.companyName ?? "Company";
  const companyName =
    companyNameRaw.length > MAX_COOKIE_COMPANY_NAME
      ? companyNameRaw.slice(0, MAX_COOKIE_COMPANY_NAME) + "…"
      : companyNameRaw;
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  const ipAddress =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    "unknown";

  // One active session per actor — entering a second account replaces the first.
  await TenantViewSession.findOneAndUpdate(
    { actorId: ctx.userId },
    {
      actorId: ctx.userId,
      actorRole: ctx.role,
      employerId,
      employerUserId: userId,
      companyName,
      ipAddress,
      expiresAt,
    },
    { upsert: true, returnDocument: "after" }
  );

  // critical: entering someone else's account is exactly the action whose only
  // control is the audit entry, so refuse to proceed if it cannot be written.
  await logActivity({
    ...actorFromCtx(ctx),
    action: "impersonation.start",
    resource: "users",
    resourceId: userId,
    meta: { targetEmail: target.email, targetRole: target.role, employerId, companyName },
    req,
    critical: true,
  });

  const secret = process.env.NEXTAUTH_SECRET!;
  const cookieValue = await signTenantCookie(
    {
      actorId: ctx.userId,
      employerId,
      employerUserId: userId,
      companyName,
      exp: Math.floor(expiresAt.getTime() / 1000),
    },
    secret
  );

  const res = NextResponse.json({
    success: true,
    target: {
      id: target._id,
      name: target.name,
      email: target.email,
      role: target.role,
    },
    companyName,
    // Where the caller should go to actually work inside the account.
    redirectTo: `/${ctx.locale}/employer`,
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
}, { resource: "users", action: "impersonate" });

/**
 * GET /api/admin/impersonate
 * Returns the admin's active session, so the UI can restore its banner on refresh.
 * Reads the same TenantViewSession the POST writes and withAuth enforces — there is
 * no second store to drift out of sync.
 */
export const GET = withAuth(async (_req: NextRequest, ctx) => {
  await connectDB();

  const session = await TenantViewSession.findOne({
    actorId: ctx.userId,
    expiresAt: { $gt: new Date() },
  }).lean();

  if (!session) {
    return NextResponse.json({ active: false });
  }

  const target = await User.findById(session.employerUserId)
    .select("name email role isActive")
    .lean();

  // Session outlived the account — drop it rather than report a live session.
  if (!target || !target.isActive) {
    await TenantViewSession.deleteOne({ _id: session._id });
    return NextResponse.json({ active: false });
  }

  return NextResponse.json({
    active: true,
    target: {
      id: target._id,
      name: target.name,
      email: target.email,
      role: target.role,
    },
    companyName: session.companyName,
    expiresAt: session.expiresAt.toISOString(),
  });
}, { resource: "users", action: "impersonate" });
