import { NextRequest, NextResponse } from "next/server";
import { google } from "googleapis";
import { auth } from "@/lib/auth/config";
import crypto from "crypto";

// Required env vars:
//   GOOGLE_CALENDAR_CLIENT_ID     — OAuth 2.0 client ID (Google Cloud Console)
//   GOOGLE_CALENDAR_CLIENT_SECRET — OAuth 2.0 client secret
//   NEXTAUTH_URL                  — App base URL (e.g. https://app.mployedin.com)

function buildOAuth2Client() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CALENDAR_CLIENT_ID ?? process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CALENDAR_CLIENT_SECRET ?? process.env.GOOGLE_CLIENT_SECRET,
    `${process.env.NEXTAUTH_URL}/api/integrations/google-calendar/callback`
  );
}

export async function GET(_req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const role = (session.user as { role?: string }).role;
  if (role !== "job_seeker") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const clientId = process.env.GOOGLE_CALENDAR_CLIENT_ID ?? process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CALENDAR_CLIENT_SECRET ?? process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return NextResponse.json(
      { error: "Google Calendar integration is not configured." },
      { status: 503 }
    );
  }

  const oauth2Client = buildOAuth2Client();

  // Generate a cryptographically random state value to prevent CSRF
  const state = crypto.randomBytes(16).toString("hex");

  const authUrl = oauth2Client.generateAuthUrl({
    access_type: "offline",
    scope: [
      "https://www.googleapis.com/auth/calendar.events",
      "https://www.googleapis.com/auth/calendar.readonly",
    ],
    state,
    // Force consent screen to ensure a refresh_token is always returned
    prompt: "consent",
  });

  const response = NextResponse.redirect(authUrl);

  // Store the state in a short-lived, httpOnly cookie for CSRF validation
  response.cookies.set("gcal_oauth_state", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    maxAge: 600, // 10 minutes
    sameSite: "lax",
    path: "/",
  });

  return response;
}
