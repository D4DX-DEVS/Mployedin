import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongoose";
import { Employer } from "@/models/Employer";
import { logActivity } from "@/lib/audit/log";

/**
 * GET /api/employers/verify-domain/confirm?token=xxx
 * Public route — no auth required (clicked from email link)
 */
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  if (!token || token.length < 32) {
    return NextResponse.json({ error: "Invalid token" }, { status: 400 });
  }

  await connectDB();

  const employer = await Employer.findOne({ domainVerificationToken: token })
    .select("+domainVerificationToken");

  if (!employer) {
    return NextResponse.json({ error: "Invalid or expired verification token" }, { status: 404 });
  }

  // Check if verification was sent within 48 hours
  if (employer.domainVerificationSentAt) {
    const elapsed = Date.now() - new Date(employer.domainVerificationSentAt).getTime();
    if (elapsed > 48 * 60 * 60 * 1000) {
      return NextResponse.json({ error: "Verification link has expired" }, { status: 410 });
    }
  }

  // SECURITY (SEC-B2): a token issued before the requested domain was stored
  // proves nothing about which domain was checked — make them request again.
  const verifiedDomain = employer.domainVerificationDomain;
  if (!verifiedDomain) {
    return NextResponse.json({ error: "Verification link is no longer valid — please request a new one" }, { status: 400 });
  }

  employer.domainVerified = true;
  employer.domainVerifiedAt = new Date();
  employer.verifiedDomain = verifiedDomain;
  employer.domainVerificationToken = undefined;
  employer.domainVerificationDomain = undefined;
  await employer.save();

  await logActivity({
    action: "employer.domain_verified",
    resource: "employers",
    resourceId: String(employer._id),
    changes: { after: { domainVerified: true, verifiedDomain } },
  });

  // Redirect to a success page
  const baseUrl = process.env.NEXTAUTH_URL ?? "http://localhost:3000";
  return NextResponse.redirect(`${baseUrl}/en/employer/settings?verified=true`);
}
