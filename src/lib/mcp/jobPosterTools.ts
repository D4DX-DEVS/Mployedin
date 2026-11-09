import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Types } from "mongoose";
import { connectDB } from "@/lib/db/mongoose";
import logger from "@/lib/logger";
import { canAccess } from "@/lib/permissions/matrix";
import { getScopedEmployerIds } from "@/lib/auth/agentRestrictions";
import { getAppBaseUrl } from "@/lib/mcp/baseUrl";
import { errorResult, jsonResult, oauthMeta, requireScope, type TokenExtra } from "@/lib/mcp/toolHelpers";
import { POSTERS_ENABLED } from "@/lib/features/posterFeature";
import { BRAND_LAYOUTS, POSTER_LOOKS } from "@/components/features/poster/BrandPoster";
import { BrandPosterError, createBrandPoster } from "@/lib/poster/brandPosters.server";
import { renderBrandPosterBase64 } from "@/lib/poster/renderBrandPoster.server";
import Job from "@/models/Job";
import Employer from "@/models/Employer";

/** At most this many jobs per list; more would bloat the AI's context. */
const MAX_JOBS = 20;
/** At most this many posters per call; each is a saved record. */
const MAX_POSTERS = 5;
/** Posters returned as inline images; the rest come back as links only (message size). */
const INLINE_IMAGES = 3;

const WRITE_ANNOTATIONS = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: false,
  openWorldHint: false,
} as const;

const READ_ANNOTATIONS = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
} as const;

const RESULT_SCHEMA = { data: z.unknown() };

function permits(auth: TokenExtra, action: "read" | "update"): boolean {
  return canAccess(auth.role, "jobs", action, {
    permissionMode: auth.permissionMode,
    customPermissions: auth.customPermissions,
  });
}

interface JobRow {
  _id: Types.ObjectId;
  title: string;
  employerId: Types.ObjectId;
  location?: { city?: string; country?: string; isRemote?: boolean } | null;
  employmentType?: string;
  createdAt: Date;
}

/** Company names for a set of employer profiles. */
async function companyNames(ids: Types.ObjectId[]): Promise<Map<string, string>> {
  const rows = (await Employer.find({ _id: { $in: ids } }).select("companyName").lean()) as Array<{
    _id: Types.ObjectId;
    companyName?: string;
  }>;
  return new Map(rows.map((row) => [String(row._id), row.companyName ?? ""]));
}

/** The employer profile an employer token acts for (null when it has none). */
async function ownEmployerId(userId: string): Promise<string | null> {
  const employer = (await Employer.findOne({ userId }).select("_id").lean()) as { _id: Types.ObjectId } | null;
  return employer ? String(employer._id) : null;
}

export function registerJobPosterTools(server: McpServer) {
  server.registerTool(
    "list_latest_jobs",
    {
      title: "List latest jobs",
      description:
        "Use this to find recently posted, open jobs the signed-in user can see in Mployedin (admin: all jobs; " +
        "super agent and agent: their companies; employer: their own). Returns each job's id, title, company, " +
        "location, type, posting date and public apply link. Pass the ids to create_job_posters to make posters.",
      inputSchema: {
        sinceDays: z.number().int().min(1).max(90).optional().describe("Only jobs posted in the last N days. Defaults to 7."),
        limit: z.number().int().min(1).max(MAX_JOBS).optional().describe(`How many jobs, newest first. Defaults to 10, at most ${MAX_JOBS}.`),
      },
      outputSchema: RESULT_SCHEMA,
      annotations: READ_ANNOTATIONS,
      _meta: oauthMeta("read:jobs"),
    },
    async (args, extra) => {
      const check = requireScope(extra.authInfo, "read:jobs");
      if (!check.ok) return check.error;
      if (!permits(check, "read")) return errorResult("Forbidden — your current account permissions do not include jobs");

      const sinceDays = args.sinceDays ?? 7;
      const limit = args.limit ?? 10;
      try {
        await connectDB();
        // Default-deny: null means "every company" and only admin gets it.
        const scoped = await getScopedEmployerIds({ userId: check.userId, role: check.role });
        if (scoped === null && check.role !== "admin") return errorResult("No jobs are available for this account.");
        if (scoped && scoped.length === 0) return jsonResult({ sinceDays, jobs: [] });

        const since = new Date(Date.now() - sinceDays * 24 * 60 * 60 * 1000);
        const jobs = (await Job.find({
          status: "active",
          deletedAt: null,
          createdAt: { $gte: since },
          ...(scoped ? { employerId: { $in: scoped } } : {}),
        })
          .select("title employerId location employmentType createdAt")
          .sort({ createdAt: -1 })
          .limit(limit)
          .lean()) as unknown as JobRow[];

        const names = await companyNames(jobs.map((job) => job.employerId));
        const base = getAppBaseUrl();
        return jsonResult({
          sinceDays,
          jobs: jobs.map((job) => ({
            id: String(job._id),
            title: job.title,
            company: names.get(String(job.employerId)) ?? "",
            location: [job.location?.city, job.location?.country].filter(Boolean).join(", ") || (job.location?.isRemote ? "Remote" : ""),
            employmentType: job.employmentType ?? null,
            postedAt: job.createdAt,
            applyUrl: `${base}/jobs/${job._id}`,
          })),
        });
      } catch (err) {
        logger.error({ err, role: check.role }, "[mcp] list_latest_jobs failed");
        return errorResult("The jobs could not be loaded right now. Try again later.");
      }
    },
  );

  server.registerTool(
    "create_job_posters",
    {
      title: "Create job posters",
      description:
        "Use this when the user wants hiring posters for one or more jobs (get ids from list_latest_jobs). Saves a free, " +
        "ready-to-share poster per job in the company's brand or the Mployedin brand, with a QR code that opens the " +
        "job's apply page. Returns the poster images plus download and share links. Admins can make posters for any " +
        "job; employers only for their own. Nothing is posted to social media.",
      inputSchema: {
        jobIds: z.array(z.string().regex(/^[a-f0-9]{24}$/i, "A job id")).min(1).max(MAX_POSTERS)
          .describe(`Job ids, at most ${MAX_POSTERS}.`),
        brand: z.enum(["company", "mployedin"]).optional()
          .describe("company = the company's logo and brand kit colours; mployedin = Mployedin blue. Defaults to company."),
        style: z.enum(POSTER_LOOKS).optional().describe("bold, clean or urgent. Defaults to bold."),
        layout: z.enum(BRAND_LAYOUTS).optional().describe("One of the six layouts. Defaults to spotlight."),
        language: z.enum(["en", "ar"]).optional().describe("Poster language. Defaults to en."),
      },
      outputSchema: RESULT_SCHEMA,
      annotations: WRITE_ANNOTATIONS,
      _meta: oauthMeta("write:posters"),
    },
    async (args, extra) => {
      const check = requireScope(extra.authInfo, "write:posters");
      if (!check.ok) return check.error;
      if (check.role !== "admin" && check.role !== "employer") return errorResult("Only admins and employers can make posters.");
      if (!permits(check, "update")) return errorResult("Forbidden — your current account permissions do not include editing jobs");
      if (!POSTERS_ENABLED) return errorResult("Job posters are turned off on this Mployedin site.");

      try {
        await connectDB();
        const employerId = check.role === "employer" ? await ownEmployerId(check.userId) : null;
        if (check.role === "employer" && !employerId) return errorResult("This account has no company profile yet.");

        const base = getAppBaseUrl();
        const posters: Array<Record<string, unknown>> = [];
        const images: Array<{ type: "image"; data: string; mimeType: "image/png" }> = [];
        for (const jobId of [...new Set(args.jobIds)]) {
          try {
            const saved = await createBrandPoster({
              jobId,
              employerId,
              source: args.brand ?? "company",
              layout: args.layout ?? "spotlight",
              look: args.style ?? "bold",
              locale: args.language ?? "en",
              actorUserId: check.userId,
            });
            const image = (size: string) => `${base}/api/poster/${saved.shareSlug}/image?size=${size}`;
            posters.push({
              jobId,
              jobTitle: saved.jobTitle,
              company: saved.companyName,
              shareUrl: `${base}/poster/${saved.shareSlug}`,
              images: { square: image("square"), story: image("story"), linkedin: image("landscape"), a4: image("a4") },
              qrOpens: `${base}/jobs/${jobId}`,
            });
            if (images.length < INLINE_IMAGES) {
              const data = await renderBrandPosterBase64(saved.shareSlug, "square");
              if (data) images.push({ type: "image", data, mimeType: "image/png" });
            }
          } catch (err) {
            if (err instanceof BrandPosterError) {
              posters.push({ jobId, error: err.status === 403 ? "Not your company's job" : err.message });
            } else {
              logger.error({ err, jobId }, "[mcp] create_job_posters: one poster failed");
              posters.push({ jobId, error: "This poster could not be made right now" });
            }
          }
        }

        const body = { posters };
        return {
          structuredContent: { data: body },
          content: [{ type: "text" as const, text: JSON.stringify(body) }, ...images],
        };
      } catch (err) {
        logger.error({ err, role: check.role }, "[mcp] create_job_posters failed");
        return errorResult("The posters could not be made right now. Try again later.");
      }
    },
  );
}
