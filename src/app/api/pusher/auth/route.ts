import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/config";
import { getPusher } from "@/lib/pusher";

/**
 * POST /api/pusher/auth
 * Authenticates Pusher private channels.
 * Only allows users to auth their own private-dm-{userId} channel.
 */
export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.text();
    const params = new URLSearchParams(body);
    const socketId = params.get("socket_id");
    const channelName = params.get("channel_name");

    if (!socketId || !channelName) {
      return NextResponse.json({ error: "Missing socket_id or channel_name" }, { status: 400 });
    }

    const userId = (session.user as { id?: string }).id;
    if (!userId) {
      return NextResponse.json({ error: "No user ID in session" }, { status: 401 });
    }

    // Only allow auth for the user's own private DM channel
    const expectedChannel = `private-dm-${userId}`;
    if (channelName !== expectedChannel) {
      return NextResponse.json({ error: "Forbidden — cannot auth this channel" }, { status: 403 });
    }

    const pusher = getPusher();
    const authResponse = pusher.authorizeChannel(socketId, channelName);

    return NextResponse.json(authResponse);
  } catch (err) {
    console.error("[Pusher Auth Error]", err);
    return NextResponse.json({ error: "Auth failed" }, { status: 500 });
  }
}
