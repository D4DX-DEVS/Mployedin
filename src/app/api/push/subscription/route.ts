import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { connectDB } from "@/lib/db/mongoose";
import { withAuth } from "@/lib/auth/withAuth";
import PushSubscription from "@/models/PushSubscription";
import { validateBody } from "@/lib/validators";
import type { UserRole } from "@/models/User";

interface AuthCtx { userId: string; role: UserRole; locale: string; }

const subscriptionSchema = z.object({
  endpoint: z.string().url().max(2000),
  keys: z.object({
    p256dh: z.string().min(1).max(500),
    auth: z.string().min(1).max(500),
  }),
});

/** Register (or refresh) the caller's browser push subscription. */
async function postHandler(req: NextRequest, ctx: AuthCtx) {
  const body = await validateBody(req, subscriptionSchema);
  await connectDB();
  await PushSubscription.findOneAndUpdate(
    { endpoint: body.endpoint },
    {
      userId: ctx.userId,
      endpoint: body.endpoint,
      keys: body.keys,
      userAgent: req.headers.get("user-agent") ?? undefined,
    },
    { upsert: true, returnDocument: "after" }
  );
  return NextResponse.json({ ok: true });
}

/** Remove the caller's subscription for this browser. */
async function deleteHandler(req: NextRequest, ctx: AuthCtx) {
  const body = await validateBody(req, z.object({ endpoint: z.string().url().max(2000) }));
  await connectDB();
  await PushSubscription.deleteOne({ endpoint: body.endpoint, userId: ctx.userId });
  return NextResponse.json({ ok: true });
}

export const POST = withAuth(postHandler, { resource: "notifications", action: "read" });
export const DELETE = withAuth(deleteHandler, { resource: "notifications", action: "read" });
