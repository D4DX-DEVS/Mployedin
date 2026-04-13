import { NextRequest, NextResponse } from "next/server";
import { google } from "googleapis";
import { auth } from "@/lib/auth/config";
import connectDB from "@/lib/db/mongoose";
import JobSeeker from "@/models/JobSeeker";
import { encrypt } from "@/lib/security/encryption";

function buildOAuth2Client() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CALENDAR_CLIENT_ID ?? process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CALENDAR_CLIENT_SECRET ?? process.env.GOOGLE_CLIENT_SECRET,
    `${process.env.NEXTAUTH_URL}/api/integrations/google-calendar/callback`
  );
}

function settingsRedirect(req: NextRequest, locale: string, status: string) {
  const base = new URL(req.url).origin;
  const response = NextResponse.redirect(
    `${base}/${locale}/job-seeker/settings?calendar=${status}`
  );
  response.cookies.delete("gcal_oauth_state");
  return response;
}

export async function GET(req: NextRequest) {
  const session = await auth();
  const locale = ((session?.user as { locale?: string })?.locale) ?? "en";

  if (!session?.user) {
    return NextResponse.redirect(new URL(`/${locale}/login`, req.url));
  }

  const role = (session.user as { role?: string }).role;
  if (role !== "job_seeker") {
    return NextResponse.redirect(new URL("/", req.url));
  }

  const { searchParams } = new URL(req.url);
  const code = searchParams.get("code");
  const incomingState = searchParams.get("state");
  const error = searchParams.get("error");

  // User denied access
  if (error) {
    return settingsRedirect(req, locale, "denied");
  }

  // Validate state to prevent CSRF
  const storedState = req.cookies.get("gcal_oauth_state")?.value;
  if (!incomingState || !storedState || incomingState !== storedState) {
    return settingsRedirect(req, locale, "error");
  }

  if (!code) {
    return settingsRedirect(req, locale, "error");
  }

  try {
    const oauth2Client = buildOAuth2Client();
    const { tokens } = await oauth2Client.getToken(code);

    if (!tokens.refresh_token) {
      // Should not happen since we force prompt=consent, but handle defensively
      return settingsRedirect(req, locale, "error");
    }

    // Fetch the Google account email for display purposes
    oauth2Client.setCredentials(tokens);
    const oauth2 = google.oauth2({ version: "v2", auth: oauth2Client });
    const { data: userInfo } = await oauth2.userinfo.get();

    await connectDB();
    await JobSeeker.findOneAndUpdate(
      { userId: session.user.id },
      {
        $set: {
          "googleCalendar.connected": true,
          "googleCalendar.accessToken": encrypt(tokens.access_token!),
          "googleCalendar.refreshToken": encrypt(tokens.refresh_token),
          "googleCalendar.expiresAt": tokens.expiry_date
            ? new Date(tokens.expiry_date)
            : undefined,
          "googleCalendar.email": userInfo.email ?? undefined,
        },
      },
      { upsert: false }
    );
  } catch (err) {
    console.error("[google-calendar/callback] Token exchange failed:", err);
    return settingsRedirect(req, locale, "error");
  }

  return settingsRedirect(req, locale, "connected");
}
