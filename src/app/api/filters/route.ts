import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongoose";
import { getAllCategories } from "@/lib/job-attributes/categoryResolver";

/**
 * Public endpoint — returns all active job attribute values grouped by category.
 * Used by job posting forms, search filters, and profile editors.
 *
 * GET /api/filters
 * Response: { salaryPeriods: [...], ownershipTypes: [...], ... }
 */
export async function GET() {
  await connectDB();

  const categories = getAllCategories();
  const result: Record<string, unknown[]> = {};

  await Promise.all(
    Object.entries(categories).map(async ([slug, meta]) => {
      const Model = await meta.model();
      const items = await Model.find({ isActive: true })
        .sort({ sortOrder: 1, name: 1 })
        .select("name nameAr slug sortOrder")
        .lean();

      // Convert slug "salary-periods" → camelCase "salaryPeriods"
      const key = slug.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
      result[key] = items;
    })
  );

  return NextResponse.json(result, {
    headers: {
      "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
    },
  });
}
