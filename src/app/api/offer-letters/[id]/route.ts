import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongoose";
import { withAuth } from "@/lib/auth/withAuth";
import OfferLetter from "@/models/OfferLetter";
import { logActivity } from "@/lib/audit/log";
import mongoose from "mongoose";

async function getHandler(req: NextRequest, ctx: { userId: string; role: string }, params?: Record<string, string>) {
  await connectDB();
  const id = params?.id || "";
  if (!mongoose.isValidObjectId(id)) return NextResponse.json({ error: "Invalid ID" }, { status: 400 });

  const letter = await OfferLetter.findById(id).lean();
  if (!letter) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({ letter });
}

async function patchHandler(req: NextRequest, ctx: { userId: string; role: string }, params?: Record<string, string>) {
  await connectDB();
  const id = params?.id || "";
  if (!mongoose.isValidObjectId(id)) return NextResponse.json({ error: "Invalid ID" }, { status: 400 });

  const letter = await OfferLetter.findById(id);
  if (!letter) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json();

  // Send letter
  if (body.action === "send") {
    letter.status = "sent";
    letter.sentAt = new Date();
    await letter.save();
    await logActivity({ action: "offer_letter.sent", actorId: ctx.userId, resource: "OfferLetter", resourceId: id, meta: { candidateEmail: letter.candidateEmail } });
    return NextResponse.json({ letter, message: "Letter sent" });
  }

  // Candidate signs
  if (body.action === "sign") {
    letter.status = "signed";
    letter.signedAt = new Date();
    letter.signatureData = body.signatureData || "";
    letter.signatureIp = req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "";
    await letter.save();
    await logActivity({ action: "offer_letter.signed", actorId: ctx.userId, resource: "OfferLetter", resourceId: id, meta: {} });
    return NextResponse.json({ letter, message: "Letter signed" });
  }

  // Candidate declines
  if (body.action === "decline") {
    letter.status = "declined";
    letter.declinedAt = new Date();
    letter.declineReason = body.reason?.trim() || "";
    await letter.save();
    return NextResponse.json({ letter, message: "Letter declined" });
  }

  // Mark viewed
  if (body.action === "view" && letter.status === "sent") {
    letter.status = "viewed";
    letter.viewedAt = new Date();
    await letter.save();
  }

  // Update content
  if (body.content && letter.status === "draft") {
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
  if (letter.status !== "draft") return NextResponse.json({ error: "Can only delete draft letters" }, { status: 400 });

  await OfferLetter.findByIdAndDelete(id);
  await logActivity({ action: "offer_letter.deleted", actorId: ctx.userId, resource: "OfferLetter", resourceId: id, meta: {} });

  return NextResponse.json({ message: "Offer letter deleted" });
}

export const GET = withAuth(getHandler);
export const PATCH = withAuth(patchHandler);
export const DELETE = withAuth(deleteHandler);
