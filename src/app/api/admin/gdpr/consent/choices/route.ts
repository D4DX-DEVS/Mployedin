import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import type { PipelineStage } from "mongoose";
import { withAuth, AuthContext } from "@/lib/auth/withAuth";
import { connectDB } from "@/lib/db/mongoose";
import ConsentLog from "@/models/ConsentLog";
import User from "@/models/User";
import { escapeRegex } from "@/lib/security/sanitize";
import { isReceiptId } from "@/lib/consent/receiptId";
import {
  COOKIE_CHOICE_OUTCOMES,
  COOKIE_CHOICE_SOURCES,
  DEFAULT_COOKIE_CHOICE_PERIOD,
  cookieChoiceOutcomeFilter,
  isCookieChoicePeriod,
  periodStart,
} from "@/lib/gdpr/cookieChoiceOutcome";
import {
  COOKIE_CHOICE_TYPES,
  consentAccountsById,
  groupCookieChoiceStages,
  toCookieChoiceRecord,
  type GroupedCookieChoice,
} from "@/lib/gdpr/cookieChoiceGroups";

/**
 * Rows per page. The repo's listing sizes are 10/20/50/100; 25 is what the
 * shared rows-per-page menu (PaginationControls) offers instead of 20, so both
 * are accepted and the menu never asks for a size this route refuses.
 */
const PAGE_SIZES = [10, 20, 25, 50, 100];

/** Enough to find a person by e-mail; a broader match should be narrowed, not paged through. */
const EMAIL_MATCH_LIMIT = 200;

const querySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().refine((n) => PAGE_SIZES.includes(n)).default(20),
    search: z.string().trim().max(200).optional(),
    outcome: z.enum(COOKIE_CHOICE_OUTCOMES).optional(),
    source: z.enum(COOKIE_CHOICE_SOURCES).optional(),
    days: z.coerce.number().int().refine(isCookieChoicePeriod).default(DEFAULT_COOKIE_CHOICE_PERIOD),
    order: z.enum(["asc", "desc"]).default("desc"),
  })
  .strict();

interface FacetResult {
  data?: GroupedCookieChoice[];
  total?: Array<{ count?: number }>;
}

/* ------------------------------------------------------------------ */
/*  GET /api/admin/gdpr/consent/choices — one row per saved choice     */
/* ------------------------------------------------------------------ */

/**
 * Signed-in users' cookie choices, one row per choice (the two category rows
 * folded together, see lib/gdpr/cookieChoiceGroups), newest first, within the
 * same period as the count cards. Choices made while signed out are anonymous
 * receipts: counted by /summary and found by /receipt, never listed here.
 *
 * Search: a full choice reference (any case) matches that choice exactly,
 * whatever the period, so a quoted reference from months ago is still found;
 * anything else matches the name on the log rows or the account's e-mail,
 * within the period.
 * Returns { data, page, pageSize, total, totalPages }; never an IP address.
 */
async function handler(req: NextRequest, ctx: AuthContext) {
  if (ctx.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const parsed = querySchema.safeParse(Object.fromEntries(new URL(req.url).searchParams));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid query" }, { status: 400 });
  }
  const { page, pageSize, search, outcome, source, days, order } = parsed.data;

  await connectDB();

  const match: Record<string, unknown> = { consentType: { $in: COOKIE_CHOICE_TYPES } };
  if (source) match.source = source;
  // The app writes lower-case ids (crypto.randomUUID), so a pasted upper-case reference is lower-cased.
  const reference = search ? search.toLowerCase() : "";
  if (isReceiptId(reference)) {
    // One exact choice: the period would only hide an older one.
    match.receiptId = reference;
  } else {
    match.createdAt = { $gte: periodStart(days) };
    if (search) {
      const safe = escapeRegex(search);
      // The rows keep the name the user had; the e-mail lives on the account.
      const emailMatches = await User.find({ email: { $regex: safe, $options: "i" } })
        .select("_id")
        .limit(EMAIL_MATCH_LIMIT)
        .lean<Array<{ _id: unknown }>>();
      match.$or = [
        { userName: { $regex: safe, $options: "i" } },
        ...(emailMatches.length ? [{ userId: { $in: emailMatches.map((u) => u._id) } }] : []),
      ];
    }
  }

  const dir = order === "asc" ? 1 : -1;
  const pipeline: PipelineStage[] = [
    { $match: match },
    ...groupCookieChoiceStages(),
    ...(outcome ? [{ $match: cookieChoiceOutcomeFilter(outcome) } as PipelineStage] : []),
    // _id breaks ties, so a page boundary never repeats or skips a choice.
    { $sort: { recordedAt: dir, _id: dir } },
    {
      $facet: {
        data: [{ $skip: (page - 1) * pageSize }, { $limit: pageSize }],
        total: [{ $count: "count" }],
      },
    },
  ];

  const [result] = (await ConsentLog.aggregate(pipeline)) as FacetResult[];
  const groups = result?.data ?? [];
  const total = Number(result?.total?.[0]?.count ?? 0);
  const accounts = await consentAccountsById(groups.map((g) => String(g.userId ?? "")));

  return NextResponse.json({
    data: groups.map((g) => toCookieChoiceRecord(g, accounts)),
    page,
    pageSize,
    total,
    totalPages: Math.ceil(total / pageSize),
  });
}

export const GET = withAuth(handler, { resource: "audit_logs", action: "read" });
