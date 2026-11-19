import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/security/rateLimit";
import { getClientIp } from "@/lib/security/clientIp";
import { getEmployerOnboardingFlags } from "@/lib/settings/employerOnboarding";
import { employerInviteStatus } from "@/lib/settings/employerSignupGate";

export const runtime = "nodejs";

/**
 * GET /api/public/employer-onboarding[?ref=CODE] — NO AUTH.
 *
 * The admin's employer onboarding switches, so public pages know whether to show
 * "Register as employer" links and agent screens know whether "Add employer" is on.
 * With `ref`, also says whether that employer invite is usable ("valid" | "invalid"
 * | "paused"); that part is rate limited because it answers "is this code real".
 */
export async function GET(req: NextRequest) {
  const flags = await getEmployerOnboardingFlags();
  const ref = req.nextUrl.searchParams.get("ref")?.trim() ?? "";

  let invite: Awaited<ReturnType<typeof employerInviteStatus>> | null = null;
  if (ref) {
    const ip = getClientIp(req.headers);
    const { allowed } = await checkRateLimit(`employer-invite-check:${ip}`, { limit: 10, windowSec: 60 });
    if (!allowed) return NextResponse.json({ error: "Too many requests. Please try again later." }, { status: 429 });
    invite = await employerInviteStatus(ref);
  }

  return NextResponse.json(
    { ...flags, invite },
    // The flags alone are the same for everyone; a code check is not.
    { headers: { "Cache-Control": ref ? "no-store" : "public, max-age=60" } },
  );
}
