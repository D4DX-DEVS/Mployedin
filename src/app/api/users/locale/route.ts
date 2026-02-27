import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongoose";
import { auth } from "@/lib/auth/config";
import User from "@/models/User";

/**
 * PATCH /api/users/locale
 * Updates the authenticated user's locale preference.
 */
export async function PATCH(req: NextRequest) {
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { locale } = body;

  if (!locale || !["en", "ar"].includes(locale)) {
    return NextResponse.json(
      { error: "Invalid locale. Must be 'en' or 'ar'." },
      { status: 400 }
    );
  }

  await connectDB();
  await User.findByIdAndUpdate(session.user.id, { locale });

  return NextResponse.json({ success: true, locale });
}
