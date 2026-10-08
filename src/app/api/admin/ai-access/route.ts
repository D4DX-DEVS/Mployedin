/**
 * GET  /api/admin/ai-access — list platform AI Data Access keys (never the key or its hash)
 * POST /api/admin/ai-access — issue a key; the plaintext is returned exactly once
 */
import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { connectDB } from "@/lib/db/mongoose";
import { withAuth } from "@/lib/auth/withAuth";
import { validateBody } from "@/lib/validators";
import { platformApiKeyCreateSchema } from "@/lib/validators/aiAccess";
import { logActivity, actorFromCtx } from "@/lib/audit/log";
import PlatformApiKey, { generatePlatformApiKey, type PlatformApiKeyScope } from "@/models/PlatformApiKey";
import User from "@/models/User";

interface AuthCtx { userId: string; role: string; locale: string }

/** Soft cap so a leaked admin session cannot mint keys without bound. */
const MAX_ACTIVE_KEYS = 25;

const PUBLIC_FIELDS = "name keyPrefix scopes isActive expiresAt rateLimitPerMin totalRequests lastUsedAt revokedAt createdBy createdAt";

async function getHandler(_req: NextRequest, ctx: AuthCtx) {
  if (ctx.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  await connectDB();

  const keys = await PlatformApiKey.find({})
    .select(PUBLIC_FIELDS)
    .sort({ isActive: -1, createdAt: -1 })
    .limit(200)
    .lean();

  const creatorIds = [...new Set(keys.map((k) => String(k.createdBy)))].map((id) => new mongoose.Types.ObjectId(id));
  const creators = await User.find({ _id: { $in: creatorIds } }).select("name").lean<{ _id: unknown; name?: string }[]>();
  const creatorName = new Map(creators.map((u) => [String(u._id), u.name ?? ""]));

  return NextResponse.json({
    keys: keys.map((k) => ({ ...k, createdByName: creatorName.get(String(k.createdBy)) ?? null })),
  });
}

async function postHandler(req: NextRequest, ctx: AuthCtx) {
  if (ctx.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  await connectDB();
  const body = await validateBody(req, platformApiKeyCreateSchema);

  const active = await PlatformApiKey.countDocuments({ isActive: true });
  if (active >= MAX_ACTIVE_KEYS) {
    return NextResponse.json(
      { error: `Maximum ${MAX_ACTIVE_KEYS} active keys — revoke one first`, code: "key_limit" },
      { status: 400 },
    );
  }

  const { key, keyPrefix, keyHash } = generatePlatformApiKey();
  const scopes: PlatformApiKeyScope[] = body.pii ? ["insights:read", "pii:read"] : ["insights:read"];
  const created = await PlatformApiKey.create({
    name: body.name,
    keyPrefix,
    keyHash,
    scopes,
    rateLimitPerMin: body.rateLimitPerMin ?? 120,
    expiresAt: body.expiresInDays ? new Date(Date.now() + body.expiresInDays * 24 * 60 * 60 * 1000) : undefined,
    createdBy: new mongoose.Types.ObjectId(ctx.userId),
  });

  await logActivity({
    ...actorFromCtx(ctx),
    action: "insights.key_create",
    resource: "insights",
    resourceId: String(created._id),
    meta: { name: body.name, keyPrefix, scopes, rateLimitPerMin: created.rateLimitPerMin, expiresAt: created.expiresAt },
    req,
  });

  const { keyHash: _omit, ...safe } = created.toObject();
  void _omit;
  return NextResponse.json(
    { key: { ...safe, key }, message: "Copy this key now — it will not be shown again." },
    { status: 201 },
  );
}

export const GET = withAuth(getHandler, { resource: "insights", action: "read" });
export const POST = withAuth(postHandler, { resource: "insights", action: "create" });
