import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/withAuth";
import { connectDB } from "@/lib/db/mongoose";
import Interview from "@/models/Interview";
import { escapeRegex } from "@/lib/security/sanitize";

export const GET = withAuth(async (req: NextRequest) => {
  await connectDB();

  const url = new URL(req.url);
  const page = parseInt(url.searchParams.get("page") ?? "1");
  const limit = parseInt(url.searchParams.get("limit") ?? "20");
  const status = url.searchParams.get("status") ?? "";
  const search = url.searchParams.get("search") ?? "";

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const filter: Record<string, any> = {};
  if (status) filter.status = status;

  const [interviews, total] = await Promise.all([
    Interview.find(filter)
      .populate("jobSeekerId", "name email", "User")
      .populate("employerId", "companyName", "Employer")
      .populate("jobId", "title", "Job")
      .populate("agentId", "name", "User")
      .sort({ scheduledAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    Interview.countDocuments(filter),
  ]);

  // Remap populated fields to match frontend expectations
  const mapped = interviews.map((iv) => ({
    ...iv,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    jobSeeker: (iv as any).jobSeekerId ?? null,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    employer: (iv as any).employerId ?? null,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    job: (iv as any).jobId ?? null,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    agent: (iv as any).agentId ?? null,
  }));

  if (search) {
    const rx = new RegExp(escapeRegex(search), "i");
    const filtered = mapped.filter(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (iv) => rx.test((iv as any).jobSeeker?.name ?? "") || rx.test((iv as any).employer?.companyName ?? "")
    );
    return NextResponse.json({ interviews: filtered, total: filtered.length });
  }

  return NextResponse.json({ interviews: mapped, total });
}, { resource: "interviews", action: "read" });
