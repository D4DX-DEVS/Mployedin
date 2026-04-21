import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongoose";
import { withAuth } from "@/lib/auth/withAuth";
import ReferralLink from "@/models/ReferralLink";

interface AuthCtx {
  userId: string;
  role: string;
  locale: string;
}

/**
 * GET /api/referral-links/[id]
 * Get a single referral link with full registration details
 */
async function handleGet(req: NextRequest, ctx: AuthCtx, params?: Record<string, string>) {
  await connectDB();
  const id = params?.id;
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const link = await ReferralLink.findById(id)
    .populate("createdBy", "name email")
    .lean();

  if (!link) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Agents can only see their own links
  if (ctx.role === "agent" && link.createdBy?._id?.toString() !== ctx.userId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  return NextResponse.json({ link });
}

/**
 * PATCH /api/referral-links/[id]
 * Update label, isActive, maxUses, expiresAt
 */
async function handlePatch(req: NextRequest, ctx: AuthCtx, params?: Record<string, string>) {
  await connectDB();
  const id = params?.id;
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const link = await ReferralLink.findById(id);
  if (!link) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Only creator or admin can update
  if (ctx.role !== "admin" && link.createdBy.toString() !== ctx.userId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();

  if (body.label !== undefined) link.label = body.label.trim().slice(0, 100);
  if (body.isActive !== undefined) link.isActive = Boolean(body.isActive);
  if (body.maxUses !== undefined) link.maxUses = Math.max(0, parseInt(body.maxUses) || 0);
  if (body.expiresAt !== undefined) {
    link.expiresAt = body.expiresAt ? new Date(body.expiresAt) : undefined;
  }

  await link.save();
  return NextResponse.json({ link });
}

/**
 * DELETE /api/referral-links/[id]
 * Soft-delete (deactivate) a referral link
 */
async function handleDelete(req: NextRequest, ctx: AuthCtx, params?: Record<string, string>) {
  await connectDB();
  const id = params?.id;
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const link = await ReferralLink.findById(id);
  if (!link) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Only creator or admin can delete
  if (ctx.role !== "admin" && link.createdBy.toString() !== ctx.userId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  link.isActive = false;
  await link.save();
  return NextResponse.json({ success: true });
}

export const GET = withAuth(handleGet);
export const PATCH = withAuth(handlePatch);
export const DELETE = withAuth(handleDelete);
