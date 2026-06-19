import { NextRequest, NextResponse } from "next/server";
import jwt from "jsonwebtoken";
import { connectDB } from "@/lib/db/mongoose";
import NotificationPreference from "@/models/NotificationPreference";
import SavedSearch from "@/models/SavedSearch";

const JWT_SECRET = process.env.JWT_SECRET ?? process.env.NEXTAUTH_SECRET ?? "";

interface UnsubscribePayload {
  userId: string;
  category?: string;
  /** When present, disables email alerts for just this saved search. */
  savedSearchId?: string;
}

/**
 * GET /api/unsubscribe?token=...
 *
 * Token-based one-click unsubscribe. The token is a JWT containing
 * userId and optional category. If no category, unsubscribes from all.
 *
 * Also supports query param `ref` for tracking which email type triggered it.
 */
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");

  if (!token) {
    // If no token, show a generic unsubscribe page
    return new NextResponse(
      buildUnsubscribePage(false, "Missing unsubscribe token. Please use the link from your email."),
      { status: 400, headers: { "Content-Type": "text/html; charset=utf-8" } },
    );
  }

  if (!JWT_SECRET) {
    console.error("[unsubscribe] JWT_SECRET not configured");
    return new NextResponse(
      buildUnsubscribePage(false, "Server configuration error."),
      { status: 500, headers: { "Content-Type": "text/html; charset=utf-8" } },
    );
  }

  let payload: UnsubscribePayload;
  try {
    payload = jwt.verify(token, JWT_SECRET) as UnsubscribePayload;
  } catch {
    return new NextResponse(
      buildUnsubscribePage(false, "Invalid or expired unsubscribe link."),
      { status: 400, headers: { "Content-Type": "text/html; charset=utf-8" } },
    );
  }

  await connectDB();

  if (payload.savedSearchId) {
    // Granular: turn off alerts for a single saved search (scoped to the owner).
    const updated = await SavedSearch.findOneAndUpdate(
      { _id: payload.savedSearchId, userId: payload.userId },
      { $set: { emailAlert: false } },
      { new: true },
    ).lean();
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://mployedin.com";
    const name = (updated as { name?: string } | null)?.name;
    return new NextResponse(
      buildUnsubscribePage(
        true,
        name
          ? `Email alerts turned off for your saved search "${name}".`
          : "Email alerts turned off for this saved search.",
        `${baseUrl}/en/job-seeker/jobs`,
      ),
      { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } },
    );
  }

  if (payload.category) {
    // Unsubscribe from specific category
    await NotificationPreference.updateOne(
      { userId: payload.userId },
      { $set: { [`categories.${payload.category}.enabled`]: false } },
      { upsert: true },
    );
  } else {
    // Unsubscribe from all
    await NotificationPreference.updateOne(
      { userId: payload.userId },
      { $set: { unsubscribedAll: true } },
      { upsert: true },
    );
  }

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://mployedin.com";
  return new NextResponse(
    buildUnsubscribePage(
      true,
      payload.category
        ? `You've been unsubscribed from ${payload.category} emails.`
        : "You've been unsubscribed from all emails.",
      `${baseUrl}/en/job-seeker/settings/notifications`,
    ),
    { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } },
  );
}

/**
 * POST /api/unsubscribe
 *
 * RFC 8058 List-Unsubscribe-Post handler.
 * Gmail/Yahoo one-click unsubscribe sends POST with List-Unsubscribe=One-Click.
 */
export async function POST(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");

  if (!token || !JWT_SECRET) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  let payload: UnsubscribePayload;
  try {
    payload = jwt.verify(token, JWT_SECRET) as UnsubscribePayload;
  } catch {
    return NextResponse.json({ error: "Invalid token" }, { status: 400 });
  }

  await connectDB();

  if (payload.savedSearchId) {
    await SavedSearch.updateOne(
      { _id: payload.savedSearchId, userId: payload.userId },
      { $set: { emailAlert: false } },
    );
    return NextResponse.json({ success: true });
  }

  await NotificationPreference.updateOne(
    { userId: payload.userId },
    { $set: { unsubscribedAll: true } },
    { upsert: true },
  );

  return NextResponse.json({ success: true });
}

function buildUnsubscribePage(
  success: boolean,
  message: string,
  manageUrl?: string,
): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Unsubscribe – MPLOYEDIN</title>
  <style>
    body { font-family: Arial, sans-serif; display: flex; justify-content: center; align-items: center; min-height: 100vh; margin: 0; background: #f3f4f6; }
    .card { background: white; padding: 40px; border-radius: 12px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); text-align: center; max-width: 480px; }
    .icon { font-size: 48px; margin-bottom: 16px; }
    h1 { color: #111827; font-size: 24px; margin: 0 0 12px; }
    p { color: #6b7280; line-height: 1.6; }
    a.btn { display: inline-block; margin-top: 16px; background: #0D6FD8; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: bold; }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">${success ? "✅" : "⚠️"}</div>
    <h1>${success ? "Unsubscribed" : "Error"}</h1>
    <p>${message}</p>
    ${manageUrl ? `<a class="btn" href="${manageUrl}">Manage Preferences</a>` : ""}
  </div>
</body>
</html>`;
}
