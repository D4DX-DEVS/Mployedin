import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongoose";
import { auth } from "@/lib/auth/config";
import User from "@/models/User";
import { validateBody } from "@/lib/validators";
import { localeSchema } from "@/lib/validators/misc";

/**
 * PATCH /api/users/locale
 * Updates the authenticated user's locale preference.
 */
export async function PATCH(req: NextRequest) {
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { locale } = await validateBody(req, localeSchema);

  await connectDB();
  await User.findByIdAndUpdate(session.user.id, { locale });

  return NextResponse.json({ success: true, locale });
}
