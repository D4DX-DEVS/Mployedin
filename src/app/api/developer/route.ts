import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongoose";
import { withAuth } from "@/lib/auth/withAuth";
import ApiKey from "@/models/ApiKey";
import Webhook from "@/models/Webhook";
import Employer from "@/models/Employer";
import { logActivity } from "@/lib/audit/log";
import mongoose from "mongoose";
import crypto from "crypto";

async function getHandler(req: NextRequest, ctx: { userId: string; role: string }) {
  await connectDB();

  const employer = await Employer.findOne({ userId: ctx.userId }).lean();
  if (!employer) return NextResponse.json({ error: "Employer not found" }, { status: 404 });

  const url = new URL(req.url);
  const type = url.searchParams.get("type");

  if (type === "webhooks") {
    const webhooks = await Webhook.find({ createdBy: new mongoose.Types.ObjectId(ctx.userId) })
      .select("-secret")
      .sort({ createdAt: -1 })
      .lean();
    return NextResponse.json({ webhooks });
  }

  // API Keys (never return the actual key)
  const keys = await ApiKey.find({ employerId: employer._id })
    .select("-keyHash")
    .sort({ createdAt: -1 })
    .lean();

  return NextResponse.json({ keys });
}

async function postHandler(req: NextRequest, ctx: { userId: string; role: string }) {
  await connectDB();

  const employer = await Employer.findOne({ userId: ctx.userId }).lean();
  if (!employer) return NextResponse.json({ error: "Employer not found" }, { status: 404 });

  const body = await req.json();

  // Create API Key
  if (body.type === "api_key") {
    const name = body.name?.trim();
    if (!name) return NextResponse.json({ error: "Name required" }, { status: 400 });

    // Limit keys per employer
    const count = await ApiKey.countDocuments({ employerId: employer._id });
    if (count >= 10) return NextResponse.json({ error: "Maximum 10 API keys allowed" }, { status: 400 });

    const key = `mpd_${crypto.randomBytes(32).toString("hex")}`;
    const keyPrefix = key.substring(0, 12);
    const keyHash = crypto.createHash("sha256").update(key).digest("hex");

    const apiKey = await ApiKey.create({
      employerId: employer._id,
      name,
      keyPrefix,
      keyHash,
      scopes: body.scopes || ["read:jobs"],
      isActive: true,
      expiresAt: body.expiresAt ? new Date(body.expiresAt) : undefined,
      rateLimit: Math.min(Math.max(body.rateLimit || 60, 10), 1000),
      createdBy: new mongoose.Types.ObjectId(ctx.userId),
    });

    await logActivity({ action: "api_key.created", actorId: ctx.userId, resource: "ApiKey", resourceId: apiKey._id.toString(), meta: { name, scopes: body.scopes } });

    // Return the key only once (on creation)
    return NextResponse.json({ apiKey: { ...apiKey.toObject(), key, keyHash: undefined }, message: "Store this key securely - it won't be shown again" }, { status: 201 });
  }

  // Create Webhook
  if (body.type === "webhook") {
    const { name, url: webhookUrl, events } = body;
    if (!name || !webhookUrl || !events?.length) {
      return NextResponse.json({ error: "name, url, events required" }, { status: 400 });
    }

    const secret = crypto.randomBytes(32).toString("hex");

    const webhook = await Webhook.create({
      name: name.trim(),
      url: webhookUrl,
      secret,
      events,
      headers: body.headers || {},
      isActive: true,
      retryCount: body.retryCount || 3,
      createdBy: new mongoose.Types.ObjectId(ctx.userId),
    });

    await logActivity({ action: "webhook.created", actorId: ctx.userId, resource: "Webhook", resourceId: webhook._id.toString(), meta: { name, events } });

    return NextResponse.json({ webhook: { ...webhook.toObject(), secret }, message: "Store the webhook secret securely" }, { status: 201 });
  }

  return NextResponse.json({ error: "type must be 'api_key' or 'webhook'" }, { status: 400 });
}

async function deleteHandler(req: NextRequest, ctx: { userId: string; role: string }) {
  await connectDB();

  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  const type = url.searchParams.get("type");

  if (!id || !mongoose.isValidObjectId(id)) return NextResponse.json({ error: "Invalid ID" }, { status: 400 });

  if (type === "webhook") {
    await Webhook.findOneAndDelete({ _id: id, createdBy: new mongoose.Types.ObjectId(ctx.userId) });
  } else {
    const employer = await Employer.findOne({ userId: ctx.userId }).lean();
    if (!employer) return NextResponse.json({ error: "Employer not found" }, { status: 404 });
    await ApiKey.findOneAndDelete({ _id: id, employerId: employer._id });
  }

  return NextResponse.json({ message: "Deleted" });
}

export const GET = withAuth(getHandler);
export const POST = withAuth(postHandler);
export const DELETE = withAuth(deleteHandler);
