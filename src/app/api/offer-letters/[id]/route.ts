import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongoose";
import { withAuth } from "@/lib/auth/withAuth";
import OfferLetter from "@/models/OfferLetter";
import Employer from "@/models/Employer";
import { User } from "@/models/User";
import { logActivity, actorFromCtx } from "@/lib/audit/log";
import mongoose from "mongoose";

type LetterAccess = { kind: "owner" } | { kind: "candidate" };

/**
 * Object-level authorization for a single offer letter (closes IDOR).
 * - admin: full access (treated as owner)
 * - employer who owns the letter (employerId === their Employer profile): owner
 * - the candidate whose account email matches the recipient: candidate
 * Anyone else gets 403. Without this, any authenticated user could read /
 * send / sign / decline / edit / delete any letter by guessing its id.
 */
async function resolveLetterAccess(
  letter: { employerId?: unknown; candidateEmail?: string },
  ctx: { userId: string; role: string }
): Promise<LetterAccess | NextResponse> {
  if (ctx.role === "admin") return { kind: "owner" };

  const employer = await Employer.findOne({ userId: ctx.userId }).select("_id").lean();
  if (employer && String(letter.employerId) === String(employer._id)) {
    return { kind: "owner" };
  }

  const user = await User.findById(ctx.userId).select("email").lean();
  const email = user?.email?.toLowerCase();
  if (email && letter.candidateEmail && email === letter.candidateEmail.toLowerCase()) {
    return { kind: "candidate" };
  }

  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}

const forbidden = () => NextResponse.json({ error: "Forbidden" }, { status: 403 });

async function getHandler(req: NextRequest, ctx: { userId: string; role: string }, params?: Record<string, string>) {
  await connectDB();
  const id = params?.id || "";
  if (!mongoose.isValidObjectId(id)) return NextResponse.json({ error: "Invalid ID" }, { status: 400 });

  const letter = await OfferLetter.findById(id).lean();
  if (!letter) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const access = await resolveLetterAccess(letter, ctx);
  if (access instanceof NextResponse) return access;

  return NextResponse.json({ letter });
}

async function patchHandler(req: NextRequest, ctx: { userId: string; role: string }, params?: Record<string, string>) {
  await connectDB();
  const id = params?.id || "";
  if (!mongoose.isValidObjectId(id)) return NextResponse.json({ error: "Invalid ID" }, { status: 400 });

  const letter = await OfferLetter.findById(id);
  if (!letter) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const access = await resolveLetterAccess(letter, ctx);
  if (access instanceof NextResponse) return access;
  const isOwner = access.kind === "owner";
  const isCandidate = access.kind === "candidate";

  const body = await req.json();

  // Send letter — owner (employer/admin) only
  if (body.action === "send") {
    if (!isOwner) return forbidden();
    letter.status = "sent";
    letter.sentAt = new Date();
    await letter.save();
    await logActivity({ action: "offer_letter.sent", ...actorFromCtx(ctx), resource: "OfferLetter", resourceId: id, meta: { candidateEmail: letter.candidateEmail } });
    return NextResponse.json({ letter, message: "Letter sent" });
  }

  // Candidate signs — recipient only
  if (body.action === "sign") {
    if (!isCandidate) return forbidden();
    letter.status = "signed";
    letter.signedAt = new Date();
    letter.signatureData = body.signatureData || "";
    letter.signatureIp = req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "";
    await letter.save();
    await logActivity({ action: "offer_letter.signed", ...actorFromCtx(ctx), resource: "OfferLetter", resourceId: id, meta: {} });
    return NextResponse.json({ letter, message: "Letter signed" });
  }

  // Candidate declines — recipient only
  if (body.action === "decline") {
    if (!isCandidate) return forbidden();
    letter.status = "declined";
    letter.declinedAt = new Date();
    letter.declineReason = body.reason?.trim() || "";
    await letter.save();
    return NextResponse.json({ letter, message: "Letter declined" });
  }

  // Mark viewed — recipient opening a sent letter
  if (body.action === "view" && isCandidate && letter.status === "sent") {
    letter.status = "viewed";
    letter.viewedAt = new Date();
    await letter.save();
  }

  // Update content — owner only, draft only
  if (body.content && letter.status === "draft") {
    if (!isOwner) return forbidden();
    letter.content = body.content;
    await letter.save();
  }

  return NextResponse.json({ letter });
}

async function deleteHandler(req: NextRequest, ctx: { userId: string; role: string }, params?: Record<string, string>) {
  await connectDB();
  const id = params?.id || "";
  if (!mongoose.isValidObjectId(id)) return NextResponse.json({ error: "Invalid ID" }, { status: 400 });

  const letter = await OfferLetter.findById(id);
  if (!letter) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const access = await resolveLetterAccess(letter, ctx);
  if (access instanceof NextResponse) return access;
  if (access.kind !== "owner") return forbidden();

  if (letter.status !== "draft") return NextResponse.json({ error: "Can only delete draft letters" }, { status: 400 });

  await OfferLetter.findByIdAndDelete(id);
  await logActivity({ action: "offer_letter.deleted", ...actorFromCtx(ctx), resource: "OfferLetter", resourceId: id, meta: {} });

  return NextResponse.json({ message: "Offer letter deleted" });
}

export const GET = withAuth(getHandler);
export const PATCH = withAuth(patchHandler);
export const DELETE = withAuth(deleteHandler);
