import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/withAuth";
import connectDB from "@/lib/db/mongoose";
import Message from "@/models/Message";
import User from "@/models/User";
import { validateBody } from "@/lib/validators";
import { messageCreateSchema } from "@/lib/validators/messages";
import { logActivity, actorFromCtx } from "@/lib/audit/log";

async function GET(req: NextRequest, ctx: { userId: string; role: string }) {
  await connectDB();
  const { searchParams } = new URL(req.url);
  const channel = searchParams.get("channel") || "general";
  const limit = parseInt(searchParams.get("limit") || "10");

  const messages = await (Message as unknown as {
    find: (q: object) => { sort: (s: object) => { limit: (n: number) => { lean: () => Promise<unknown[]> } } }
  }).find({ channel })
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean();

  return NextResponse.json({ messages: (messages as unknown[]).reverse() });
}

async function POST(req: NextRequest, ctx: { userId: string; role: string; locale?: string }) {
  await connectDB();
  const body = await validateBody(req, messageCreateSchema);
  const { channel = "general", content } = body;

  // Resolve sender name from DB if not provided
  let senderName = body.senderName;
  if (!senderName) {
    const user = await User.findById(ctx.userId).select("name email").lean();
    senderName = (user as { name?: string; email?: string } | null)?.name || (user as { email?: string } | null)?.email || "Unknown";
  }

  const msg = await (Message as unknown as {
    create: (data: object) => Promise<{ _id: unknown; channel: string; content: string; senderId: string; senderRole: string; createdAt: Date }>
  }).create({
    channel,
    content: content.trim(),
    senderId: ctx.userId,
    senderRole: ctx.role,
    senderName,
    createdAt: new Date(),
  });

  await logActivity({
    ...actorFromCtx(ctx),
    action: "message.create",
    resource: "messages",
    resourceId: String(msg._id),
    meta: { channel },
    req,
  });

  return NextResponse.json({ message: msg }, { status: 201 });
}

const GET_handler = withAuth(GET);
const POST_handler = withAuth(POST);
export { GET_handler as GET, POST_handler as POST };
