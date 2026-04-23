import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/withAuth";
import { connectDB } from "@/lib/db/mongoose";
import { PosterTemplate } from "@/models/PosterTemplate";

/**
 * GET /api/poster-templates
 * Public endpoint for employers — returns only active templates.
 */
export const GET = withAuth(async (req: NextRequest) => {
  await connectDB();

  const url = new URL(req.url);
  const category = url.searchParams.get("category");

  const query: Record<string, unknown> = { isActive: true };
  if (category) query.category = category;

  const items = await PosterTemplate.find(query)
    .sort({ sortOrder: 1, createdAt: -1 })
    .select("name category backgroundImages textZones defaultAccentColor previewUrl")
    .lean();

  return NextResponse.json({ items });
});
