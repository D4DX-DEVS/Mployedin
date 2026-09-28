import { NextResponse } from "next/server";
import { auth } from "@/lib/auth/config";
import { connectDB } from "@/lib/db/mongoose";
import { Employer } from "@/models/Employer";
import logger from "@/lib/logger";
import { getEmployerSetupStatus } from "@/lib/employers/setupStatus";

/**
 * Labels are resolved client-side from `employerSetupGuide.steps.*`; this route
 * returns only ids, links and completion so an Arabic employer does not get an
 * English checklist. The checklist itself lives in `lib/employers/setupStatus`
 * so the dashboard's attention list counts the same steps.
 */
export async function GET() {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await connectDB();
    const userId = (session.user as unknown as { id: string }).id;
    const employer = await Employer.findOne({ userId }).select("_id").lean();

    if (!employer) {
      return NextResponse.json({ error: "Employer not found" }, { status: 404 });
    }

    const status = await getEmployerSetupStatus(employer._id);
    if (!status) {
      return NextResponse.json({ error: "Employer not found" }, { status: 404 });
    }

    return NextResponse.json(status);
  } catch (err) {
    logger.error({ err }, "[Setup Status Error]");
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
