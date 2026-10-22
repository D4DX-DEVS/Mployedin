import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongoose";
import StaticPage from "@/models/StaticPage";
import { checkRateLimit } from "@/lib/security/rateLimit";
import { getClientIp } from "@/lib/security/clientIp";
import logger from "@/lib/logger";
import { isLegalPageSlug } from "@/lib/cms/legalPages";
import { COOKIE_POLICY_SLUG, withCurrentCookiePolicy, type PublicLegalPage } from "@/lib/cms/cookiePolicyFallback";

/**
 * Public legal page by slug — NO AUTH required. Only the slugs in
 * lib/cms/legalPages are served; nothing else has a public route.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const ip = getClientIp(req.headers);
  const { allowed } = await checkRateLimit(`pages:${ip}`, { limit: 30, windowSec: 60, prefix: "pages" });
  if (!allowed) return NextResponse.json({ error: "Too many requests" }, { status: 429 });

  try {
    const { slug } = await params;
    if (!isLegalPageSlug(slug)) {
      return NextResponse.json({ error: "Page not found" }, { status: 404 });
    }
    await connectDB();

    const page = await StaticPage.findOne({
      slug,
      isActive: true,
    })
      .select("slug title titleAr body bodyAr updatedAt")
      .lean();

    // The Cookie Policy never shows text that is not the generated one (the old CMS text described implied consent).
    if (slug === COOKIE_POLICY_SLUG) {
      return NextResponse.json({ page: withCurrentCookiePolicy(page as PublicLegalPage | null) });
    }

    if (!page) {
      return NextResponse.json({ error: "Page not found" }, { status: 404 });
    }

    return NextResponse.json({ page });
  } catch (error) {
    logger.error({ error }, "[Public] Static page error");
    return NextResponse.json({ error: "Failed to load page" }, { status: 500 });
  }
}
