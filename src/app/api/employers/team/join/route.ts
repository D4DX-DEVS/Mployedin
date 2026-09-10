import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { connectDB } from "@/lib/db/mongoose";
import { User } from "@/models/User";
import { CompanyUser } from "@/models/CompanyUser";
import { Employer } from "@/models/Employer";
import { checkRateLimit, RATE_LIMIT_CONFIGS } from "@/lib/security/rateLimit";
import { strongPasswordSchema } from "@/lib/security/passwordPolicy";
import logger from "@/lib/logger";

/**
 * Joining an employer's workspace as an invited colleague.
 *
 * Deliberately NOT a branch inside /api/auth/employer-register. That route
 * parses a multipart company registration, creates an Employer document,
 * assigns an agent, notifies admins and sends a welcome mail. The Employer
 * document is the problem: it would make the invitee the owner of their own
 * empty company, which shadows the membership they were invited to and drops
 * them into company setup instead of their colleague's workspace.
 *
 * Both handlers are unauthenticated by design — the invite token is the
 * credential, and the person has no account yet.
 */

interface PendingInvite {
  email: string;
  companyId: unknown;
  inviteExpiresAt?: Date;
}

/** Returns the Mongoose query, not a promise, so callers can add `.lean()`. */
function findPendingInvite(token: string) {
  return CompanyUser.findOne({ inviteToken: token, status: "pending" }).select(
    "+inviteToken email companyId inviteExpiresAt"
  );
}

function isExpired(invite: Pick<PendingInvite, "inviteExpiresAt">): boolean {
  return Boolean(invite.inviteExpiresAt && invite.inviteExpiresAt.getTime() < Date.now());
}

/**
 * GET /api/employers/team/join?token=… — what the join page needs to show.
 *
 * Returns only what the invitation email already told them, plus whether an
 * account exists for that address so the page can send them to sign in rather
 * than ask for a password they already have.
 */
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token")?.trim();
  if (!token) {
    return NextResponse.json({ error: "We couldn't find that invitation." }, { status: 404 });
  }

  await connectDB();

  const invite = await findPendingInvite(token).lean();
  if (!invite || isExpired(invite as PendingInvite)) {
    return NextResponse.json(
      { error: "We couldn't find that invitation. It may have expired. Please ask for a new one." },
      { status: 404 }
    );
  }

  const [company, existingUser] = await Promise.all([
    Employer.findById((invite as PendingInvite).companyId).select("companyName").lean(),
    User.findOne({ email: (invite as PendingInvite).email }).select("_id").lean(),
  ]);

  return NextResponse.json({
    email: (invite as PendingInvite).email,
    companyName: (company as { companyName?: string } | null)?.companyName ?? "",
    hasAccount: Boolean(existingUser),
  });
}

/**
 * POST /api/employers/team/join — create the colleague's account and activate
 * their membership in one step, so they never meet a company setup wizard.
 */
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as
    | { token?: string; name?: string; password?: string }
    | null;

  const token = body?.token?.trim();
  const name = body?.name?.trim();
  const password = body?.password ?? "";

  if (!token || !name || !password) {
    return NextResponse.json(
      { error: "We couldn't complete your sign-up. Please check the form and try again." },
      { status: 400 }
    );
  }

  const { allowed } = await checkRateLimit(`team-join:${token}`, RATE_LIMIT_CONFIGS.auth);
  if (!allowed) {
    return NextResponse.json(
      { error: "Too many attempts. Please try again later." },
      { status: 429 }
    );
  }

  const policy = strongPasswordSchema.safeParse(password);
  if (!policy.success) {
    return NextResponse.json(
      { error: policy.error.issues[0]?.message ?? "Please choose a stronger password." },
      { status: 400 }
    );
  }

  await connectDB();

  const invite = await findPendingInvite(token);
  if (!invite) {
    return NextResponse.json(
      { error: "We couldn't find that invitation. Please ask for a new one." },
      { status: 404 }
    );
  }
  if (isExpired(invite)) {
    return NextResponse.json(
      { error: "That invitation has expired. Please ask for a new one." },
      { status: 410 }
    );
  }

  const existing = await User.findOne({ email: invite.email }).select("_id").lean();
  if (existing) {
    return NextResponse.json(
      {
        error:
          "An account already uses this email. Please sign in first, then open the invitation link again.",
      },
      { status: 409 }
    );
  }

  const user = await User.create({
    name,
    email: invite.email,
    passwordHash: await bcrypt.hash(password, 12),
    role: "employer",
    // The invitation email itself proves they control this address, so there is
    // no second verification step to sit through.
    isEmailVerified: true,
    isActive: true,
  });

  invite.userId = user._id;
  invite.status = "active";
  invite.acceptedAt = new Date();
  invite.inviteToken = undefined;
  invite.inviteExpiresAt = undefined;
  await invite.save();

  logger.info(
    { companyId: String(invite.companyId), userId: String(user._id) },
    "[team.join] colleague created an account and joined"
  );

  return NextResponse.json({ email: invite.email });
}
