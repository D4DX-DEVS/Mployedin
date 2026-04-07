import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongoose";
import { withAuth } from "@/lib/auth/withAuth";
import Gender from "@/models/Gender";
import MaritalStatus from "@/models/MaritalStatus";
import Country from "@/models/Country";
import type { UserRole } from "@/models/User";

interface AuthCtx { userId: string; role: UserRole; locale: string; }

async function getHandler(_req: NextRequest, ctx: AuthCtx) {
  if (ctx.role !== "job_seeker") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await connectDB();

  const [genders, maritalStatuses, countries] = await Promise.all([
    Gender.find({ isActive: true }).sort({ sortOrder: 1 }).select("_id name nameAr slug").lean(),
    MaritalStatus.find({ isActive: true }).sort({ sortOrder: 1 }).select("_id name nameAr slug").lean(),
    Country.find({ isActive: true }).sort({ sortOrder: 1, name: 1 }).select("_id name nameAr code").lean(),
  ]);

  return NextResponse.json({ genders, maritalStatuses, countries });
}

export const GET = withAuth(getHandler);
