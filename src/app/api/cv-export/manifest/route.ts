import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withAuth } from "@/lib/auth/withAuth";
import type { AuthContext } from "@/lib/auth/withAuth";
import { connectDB } from "@/lib/db/mongoose";
import JobSeeker from "@/models/JobSeeker";
import User from "@/models/User";
import { validateBody, commonSchemas } from "@/lib/validators";
import { checkRateLimit } from "@/lib/security/rateLimit";
import { logActivity, actorFromCtx } from "@/lib/audit/log";
import logger from "@/lib/logger";
import { authorizeCvAccess, hasBuiltCvContent, resolveCvActor, type BuiltCvSource } from "@/lib/cv/cvAccess";
import { resolveOriginalCvSource } from "@/lib/cv/originalCvSource";
import {
  CV_EXPORT_MAX_ITEMS,
  type CvExportManifestItem,
  type CvExportManifestResponse,
} from "@/lib/cv/cvExportTypes";

/** Who may export CVs in bulk; each is limited to the candidates the CV gate lets them open. */
const EXPORT_ROLES = new Set(["admin", "employer", "agent", "super_agent"]);
/** Candidates checked at the same time: enough to be quick, few enough not to flood the database. */
const CHECK_CONCURRENCY = 5;

const bodySchema = z.object({
  items: z
    .array(
      z.object({
        seekerId: commonSchemas.objectId,
        applicationId: commonSchemas.objectId.nullish(),
      }),
    )
    .min(1)
    .max(CV_EXPORT_MAX_ITEMS),
});

/**
 * What a row needs from the profile, and no more. The arrays are only asked
 * "is there one?" (hasBuiltCvContent), so one entry each settles it.
 */
const PROFILE_PROJECTION = {
  fullName: 1,
  summary: 1,
  skills: { $slice: 1 },
  experience: { $slice: 1 },
  education: { $slice: 1 },
  // The sections the candidate hid on their CV: hasBuiltCvContent leaves them out, as the Standardised CV does.
  "cvDesign.hiddenSections": 1,
} as const;

interface ExportProfile extends BuiltCvSource {
  _id: unknown;
  fullName?: string;
}

/** Runs `fn` over `items`, at most `limit` at a time; results keep the input order. The first failure rejects. */
async function mapBounded<T, R>(items: readonly T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  let failed = false;
  const worker = async () => {
    while (!failed) {
      const index = next++;
      if (index >= items.length) return;
      try {
        results[index] = await fn(items[index]);
      } catch (err) {
        failed = true;
        throw err;
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

const trimmed = (value: unknown): string => (typeof value === "string" ? value.trim() : "");

/**
 * POST /api/cv-export/manifest   { items: [{ seekerId, applicationId? }] }
 *
 * The first step of a bulk CV export: which of the selected candidates the
 * person may export, and which CV versions exist for each. The browser then
 * fetches the files through /api/employers/candidates/[id]/cv, which applies
 * the same gate again.
 *
 * Every item goes through authorizeCvAccess — the one gate behind "may this
 * person open this seeker's CV" — so the export reaches no one the person could
 * not already open, and an agent's scope or an employer's applicants are never
 * widened here. A row they may not open is `{ seekerId, denied: true }` and
 * nothing more: no name, and nothing that tells "not yours" from "not there".
 *
 * Staff only (admin, employer, agent, super agent); at most 50 items. The rows
 * come back in the order they were sent. CSRF is enforced for every /api POST
 * by the proxy (src/proxy.ts).
 */
async function postHandler(req: NextRequest, ctx: AuthContext) {
  if (!EXPORT_ROLES.has(ctx.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const actorId = actorFromCtx(ctx).actorId;
  const limit = { limit: 20, windowSec: 60, prefix: "cv-export" };
  // The prefix names the bucket; the identifier is the person alone.
  const rate = await checkRateLimit(actorId, limit);
  if (!rate.allowed) {
    return NextResponse.json(
      { error: "Too many export requests. Please wait a moment and try again." },
      {
        status: 429,
        headers: { "Retry-After": String(Math.max(1, Math.ceil((rate.resetAt - Date.now()) / 1000))) },
      },
    );
  }

  const { items } = await validateBody(req, bodySchema);

  // A colleague who may review applicants but not manage talent pools (the
  // default hiring_manager role) exports applicants only: every item must name
  // an application, which the gate then requires to be their company's. withAuth
  // lets them reach this route on that promise.
  const applicationOnly = !!ctx.member && ctx.member.permissions.canManageTalentPools !== true;
  if (applicationOnly && !(ctx.member?.permissions.canReviewApplicants === true && items.every((item) => item.applicationId))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let rows: CvExportManifestItem[];
  let allowedIds: string[];
  try {
    await connectDB();
    // The per-person lookups run once for the whole request, not once per item;
    // if they fail there is one error, not fifty.
    const actor = await resolveCvActor(ctx);
    const results = await mapBounded(items, CHECK_CONCURRENCY, (item) =>
      authorizeCvAccess(ctx, item.seekerId, { applicationId: item.applicationId, actor }),
    );

    // Names and "is there anything to build a CV from" for everyone allowed, in one read.
    allowedIds = [
      ...new Set(results.flatMap((r) => (r.ok ? [String(r.seeker._id)] : []))),
    ];
    const profiles = new Map<string, ExportProfile>();
    if (allowedIds.length > 0) {
      const found = (await JobSeeker.find({ _id: { $in: allowedIds } })
        .select(PROFILE_PROJECTION)
        .lean()) as unknown as ExportProfile[];
      for (const profile of found) profiles.set(String(profile._id), profile);
    }

    // A profile with no name of its own is named by its account, read once for those only.
    const needAccountName = new Set<string>();
    for (const result of results) {
      if (!result.ok) continue;
      const profile = profiles.get(String(result.seeker._id));
      if (profile && !trimmed(profile.fullName) && result.seeker.userId) needAccountName.add(String(result.seeker.userId));
    }
    const accountNames = new Map<string, string>();
    if (needAccountName.size > 0) {
      const accounts = (await User.find({ _id: { $in: [...needAccountName] } })
        .select("name")
        .lean()) as unknown as Array<{ _id: unknown; name?: string }>;
      for (const account of accounts) accountNames.set(String(account._id), trimmed(account.name));
    }

    rows = results.map((result, index): CvExportManifestItem => {
      const asked = items[index];
      const echoedApplication = asked.applicationId ? { applicationId: asked.applicationId } : {};
      if (!result.ok) return { seekerId: asked.seekerId, ...echoedApplication, denied: true };

      // The candidate is whoever the gate opened, never the id that was typed.
      const seekerId = String(result.seeker._id ?? asked.seekerId);
      const profile = profiles.get(seekerId);
      const original = resolveOriginalCvSource(result.seeker, result.application);
      // The CV route only honours an application where the gate applied it
      // (not for an agent or super agent), so the URL names it only then.
      const applicationQuery = result.application && asked.applicationId ? `?applicationId=${asked.applicationId}` : "";
      const base = `/api/employers/candidates/${seekerId}/cv`;
      // An export fetch is a download: the Original carries `download=1` so it counts toward the
      // seeker's CV download statistic (a viewer's preview never does). The Standardised CV is
      // generated, not the uploaded file, so it is never counted.
      const originalQuery = applicationQuery ? `${applicationQuery}&download=1` : "?download=1";
      return {
        seekerId,
        ...echoedApplication,
        name: trimmed(profile?.fullName) || accountNames.get(String(result.seeker.userId)) || "",
        hasStandardised: hasBuiltCvContent(profile),
        hasOriginal: original.url !== null,
        originalIsBuilt: original.isBuilt,
        originalUrl: `${base}${originalQuery}`,
        // For an application-only colleague the standardised view needs the application too.
        builtUrl: applicationOnly && applicationQuery ? `${base}?kind=built&${applicationQuery.slice(1)}` : `${base}?kind=built`,
      };
    });
  } catch (err) {
    logger.error({ err }, "[cv-export] manifest failed");
    return NextResponse.json({ error: "Couldn't check these CVs right now. Please try again." }, { status: 500 });
  }

  // As sent, once each: an attempt on a candidate out of the person's scope is traceable too.
  const deniedIds = [...new Set(rows.flatMap((row) => (row.denied ? [row.seekerId] : [])))];
  const allowed = rows.filter((row) => !row.denied).length;
  await logActivity({
    ...actorFromCtx(ctx),
    action: "cv.export",
    resource: "job_seekers",
    meta: { count: rows.length, allowed, denied: rows.length - allowed, seekerIds: allowedIds, deniedIds },
    req,
  });

  const body: CvExportManifestResponse = { items: rows };
  return NextResponse.json(body, { headers: { "Cache-Control": "private, no-store" } });
}

export const POST = withAuth(postHandler);
