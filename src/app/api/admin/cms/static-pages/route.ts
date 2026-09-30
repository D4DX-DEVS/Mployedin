import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongoose";
import { withAuth } from "@/lib/auth/withAuth";
import { escapeRegex } from "@/lib/security/sanitize";
import StaticPage from "@/models/StaticPage";
import type { UserRole } from "@/models/User";
import { LEGAL_PAGES, LEGAL_PAGE_SLUGS } from "@/lib/cms/legalPages";
import { LEGAL_PAGE_DRAFTS } from "@/lib/cms/legalPageDrafts";
import { cmsListSort } from "@/lib/cms/listSort";

const SORT_FIELDS = ["createdAt", "slug", "title", "updatedAt"] as const;

interface AuthCtx { userId: string; role: UserRole; locale: string; }

/**
 * Static Pages is a fixed editor for the legal pages — there is no POST (a new
 * slug had no public route) and no DELETE. A legal page missing from the
 * database would otherwise be impossible to create, so the list upserts each
 * missing one as an inactive draft (empty, or the starting text in
 * legalPageDrafts); `$setOnInsert` never touches a page
 * that already exists. `timestamps: false` matters: Mongoose otherwise adds
 * `$set: { updatedAt: now }` to every matched page, and the public pages print
 * updatedAt as "Last updated" — each admin visit re-dated every page.
 */
// Two first-ever list loads can race to insert the same missing page; the
// loser's E11000 just means the page now exists.
function onlyDuplicateKeys(err: unknown): boolean {
  const e = err as { code?: number; writeErrors?: { code?: number }[] };
  if (e?.writeErrors?.length) return e.writeErrors.every((w) => w.code === 11000);
  return e?.code === 11000;
}

async function ensureLegalPages() {
  const now = new Date();
  await StaticPage.bulkWrite(
    LEGAL_PAGES.map((page) => ({
      updateOne: {
        filter: { slug: page.slug },
        update: {
          $setOnInsert: {
            slug: page.slug, title: page.title, titleAr: page.titleAr,
            body: LEGAL_PAGE_DRAFTS[page.slug]?.body ?? "", bodyAr: LEGAL_PAGE_DRAFTS[page.slug]?.bodyAr ?? "",
            isActive: false,
            createdAt: now, updatedAt: now,
          },
        },
        upsert: true,
        timestamps: false,
      },
    })),
    { ordered: false },
  ).catch((err: unknown) => {
    if (!onlyDuplicateKeys(err)) throw err;
  });
}

async function getHandler(req: NextRequest, _ctx: AuthCtx) {
  await connectDB();
  await ensureLegalPages();

  const { searchParams } = new URL(req.url);
  const search = searchParams.get("search") ?? "";
  const status = searchParams.get("status") ?? "";
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1"));
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") ?? "10")));
  const skip = (page - 1) * limit;

  const query: Record<string, unknown> = { slug: { $in: LEGAL_PAGE_SLUGS } };
  if (status === "active") query.isActive = true;
  else if (status === "inactive") query.isActive = false;

  if (search) {
    const safe = escapeRegex(search);
    query.$or = [
      { title: { $regex: safe, $options: "i" } },
      { titleAr: { $regex: safe, $options: "i" } },
      { slug: { $regex: safe, $options: "i" } },
    ];
  }

  const [items, total] = await Promise.all([
    StaticPage.find(query).sort(cmsListSort(searchParams, SORT_FIELDS, { createdAt: -1 })).skip(skip).limit(limit).lean(),
    StaticPage.countDocuments(query),
  ]);

  return NextResponse.json({
    items,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
  });
}

export const GET = withAuth(getHandler, { resource: "cms", action: "read" });
