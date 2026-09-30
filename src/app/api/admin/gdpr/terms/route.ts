import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withAuth, type AuthContext } from "@/lib/auth/withAuth";
import { connectDB } from "@/lib/db/mongoose";
import { validateBody } from "@/lib/validators";
import User from "@/models/User";
import { logActivity, actorFromCtx } from "@/lib/audit/log";
import { TERMS_BASELINE_VERSION, bumpTermsVersion, getCurrentTermsVersion } from "@/lib/gdpr/termsVersion";

/**
 * The Terms of Service + Privacy Policy version in force, and how many users
 * have accepted it. Admins are left out of both counts: they are never asked.
 */
async function summary(version: string) {
  const people = { role: { $ne: "admin" }, isActive: true };
  const [totalUsers, acceptedUsers] = await Promise.all([
    User.countDocuments(people),
    User.countDocuments({ ...people, termsAcceptedVersion: version }),
  ]);
  return { version, isBaseline: version === TERMS_BASELINE_VERSION, acceptedUsers, totalUsers };
}

/* GET /api/admin/gdpr/terms — the current version and its acceptance count */
async function getHandler(_req: NextRequest, ctx: AuthContext) {
  if (ctx.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  await connectDB();
  const version = await getCurrentTermsVersion();
  if (!version) {
    return NextResponse.json({ error: "We couldn't read the current terms version. Please try again." }, { status: 503 });
  }
  return NextResponse.json(await summary(version));
}

/**
 * POST /api/admin/gdpr/terms — start a new version after the Terms or Privacy
 * Policy changed materially. Every non-admin user is asked to accept again on
 * their next page load. `confirm` guards against a stray request.
 */
const bumpSchema = z.object({ confirm: z.literal(true) });

async function postHandler(req: NextRequest, ctx: AuthContext) {
  if (ctx.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  await validateBody(req, bumpSchema);
  await connectDB();
  const previous = await getCurrentTermsVersion();
  const version = await bumpTermsVersion();
  await logActivity({
    ...actorFromCtx(ctx),
    action: "gdpr.terms.new_version",
    resource: "gdpr",
    changes: { before: { termsVersion: previous }, after: { termsVersion: version } },
    req,
  });
  return NextResponse.json(await summary(version));
}

export const GET = withAuth(getHandler, { resource: "audit_logs", action: "read" });
export const POST = withAuth(postHandler, { resource: "users", action: "update" });
