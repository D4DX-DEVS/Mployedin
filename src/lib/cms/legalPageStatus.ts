import { unstable_cache } from "next/cache";
import { connectDB } from "@/lib/db/mongoose";
import StaticPage from "@/models/StaticPage";
import logger from "@/lib/logger";
import type { LegalPageSlug } from "@/lib/cms/legalPages";

/** Tag on the cached published-state reads; the admin Static Pages save revalidates it. */
export const LEGAL_PAGES_CACHE_TAG = "legal-pages";

const readPublished = unstable_cache(
  async (slug: LegalPageSlug): Promise<boolean> => {
    await connectDB();
    return Boolean(await StaticPage.exists({ slug, isActive: true }));
  },
  ["legal-page-published"],
  { tags: [LEGAL_PAGES_CACHE_TAG], revalidate: 3600 },
);

// Public, sign-in and onboarding layouts wait on this, so a slow or cold
// database must not hold every page for the driver's 10s server-selection timeout.
const READ_BUDGET_MS = 1500;

/**
 * Whether an admin has set the page Active in CMS → Static Pages. Cached, so a
 * layout can ask on every request. A failed or slow read is not cached and
 * counts as unpublished: no link at all beats a link to a page that is not
 * there. A read that outruns the budget still finishes and fills the cache.
 *
 * ponytail: unstable_cache is per server instance; with several instances the
 * admin's revalidateTag clears only the one that took the PATCH, and the rest
 * catch up within the hour.
 */
export async function isLegalPagePublished(slug: LegalPageSlug): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const budget = new Promise<boolean>((resolve) => {
    timer = setTimeout(() => resolve(false), READ_BUDGET_MS);
  });
  try {
    return await Promise.race([readPublished(slug), budget]);
  } catch (error) {
    logger.warn({ error, slug }, "[CMS] Couldn't read legal page status");
    return false;
  } finally {
    clearTimeout(timer);
  }
}
