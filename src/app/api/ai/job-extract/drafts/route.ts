import { NextResponse } from "next/server";
import { auth } from "@/lib/auth/config";
import { connectDB } from "@/lib/db/mongoose";
import { Employer } from "@/models/Employer";
import { ExtractionDraft } from "@/models/ExtractionDraft";
import type { UserRole } from "@/models/User";

/**
 * GET /api/ai/job-extract/drafts
 *
 * Returns the employer's ACTIVE extraction drafts (newest first), shaped for
 * the dashboard "Resume pending extraction" card. Includes only the fields the
 * card needs (no full job payloads) to keep the payload small.
 *
 * Query: ?status=active|completed|expired  (default: active)
 */
export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const role = (session.user as unknown as { role: UserRole }).role;
  if (role !== "employer" && role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    await connectDB();
    const employer = await Employer.findOne({ userId: session.user.id }).select("_id").lean();
    if (!employer?._id) {
      return NextResponse.json({ drafts: [] });
    }

    const drafts = await ExtractionDraft.find({
      employerId: employer._id,
      status: "active",
      // Silently hide drafts already past their expiry window even if the cron
      // hasn't swept them yet; the cron's job is cleanup, not correctness.
      expiresAt: { $gt: new Date() },
    })
      .sort({ createdAt: -1 })
      .limit(10)
      .select("_id fileName companyName jobs.selectedIndices jobs.status createdAt updatedAt")
      .lean();

    // Project a compact summary per draft for the card UI.
    const summary = drafts.map((d) => {
      const total = (d.jobs ?? []).length;
      const posted = (d.jobs ?? []).filter((j: { status: string }) => j.status === "posted").length;
      const skipped = (d.jobs ?? []).filter((j: { status: string }) => j.status === "skipped").length;
      return {
        _id: String(d._id),
        fileName: d.fileName,
        companyName: d.companyName ?? "",
        totalJobs: total,
        postedCount: posted,
        skippedCount: skipped,
        remainingCount: Math.max(0, total - posted - skipped),
        selectedCount: (d.selectedIndices ?? (d.jobs ?? [])
          .map((j: { index: number; status: string }) => (j.status === "pending" ? j.index : -1))
          .filter((i: number) => i >= 0)).length,
        createdAt: d.createdAt,
        updatedAt: d.updatedAt,
      };
    });

    return NextResponse.json({ drafts: summary });
  } catch (err) {
    console.error("[ExtractionDrafts] list error:", err);
    return NextResponse.json(
      { error: "Failed to load extraction drafts" },
      { status: 500 }
    );
  }
}
