import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/withAuth";
import { connectDB } from "@/lib/db/mongoose";
import { listActiveJobCategories } from "@/lib/jobs/jobCategoryStore";

/**
 * GET /api/job-categories — the active job categories, in admin order.
 *
 * Read by every job form (employer, agent and admin create, and the edit page).
 * Any signed-in user may read it; editing happens through the admin
 * job-attributes routes. The first read on an empty database seeds the
 * starting set (see jobCategoryStore).
 */
export const GET = withAuth(async () => {
  await connectDB();
  const items = await listActiveJobCategories();
  return NextResponse.json(
    { items },
    { headers: { "Cache-Control": "private, max-age=60, stale-while-revalidate=300" } },
  );
});
