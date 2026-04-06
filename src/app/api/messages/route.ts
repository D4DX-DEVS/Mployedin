import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/withAuth";
import connectDB from "@/lib/db/mongoose";
import Message from "@/models/Message";
import { validateBody } from "@/lib/validators";
import { messageCreateSchema } from "@/lib/validators/messages";

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

  const msg = await (Message as unknown as {
    create: (data: object) => Promise<{ _id: unknown; channel: string; content: string; senderId: string; senderRole: string; createdAt: Date }>
  }).create({
    channel,
    content: content.trim(),
    senderId: ctx.userId,
    senderRole: ctx.role,
    senderName: body.senderName || "Unknown",
    createdAt: new Date(),
  });

  return NextResponse.json({ message: msg }, { status: 201 });
}

export const GET_handler = withAuth(GET, { resource: "notifications", action: "read" });
export const POST_handler = withAuth(POST, { resource: "notifications", action: "create" });
export { GET_handler as GET, POST_handler as POST };
