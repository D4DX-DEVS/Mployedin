import "server-only";
import { nanoid } from "nanoid";
import { connectDB } from "@/lib/db/mongoose";
import Job from "@/models/Job";
import PosterGeneration, { type IBrandPosterSpec } from "@/models/PosterGeneration";
import { getEmployerBrandKit } from "@/lib/brand/brandKit.server";
import { resolveBrandKit, type BrandKit } from "@/lib/brand/brandKit";
import { buildBrandPosterData, defaultHeadline, type PosterJobInput } from "@/lib/poster/brandPosterContent";
import { BRAND_LAYOUTS, type BrandLayout, type PosterLook } from "@/components/features/poster/BrandPoster";

export type BrandSource = "company" | "mployedin";

export interface CreateBrandPosterInput {
  jobId: string;
  /** When set, the job must belong to this employer (employer callers). Admins pass null. */
  employerId: string | null;
  source: BrandSource;
  layout: BrandLayout;
  look: PosterLook;
  headline?: string;
  locale?: string;
  actorUserId?: string;
}

export class BrandPosterError extends Error {
  constructor(public status: 400 | 403 | 404, message: string) {
    super(message);
  }
}

/** The legacy poster fields still required by the schema, mapped from the new look. */
function legacyFields(look: PosterLook) {
  return {
    type: look === "urgent" ? ("urgent-hiring" as const) : ("single-job" as const),
    style: look === "clean" ? ("minimal" as const) : ("bold" as const),
  };
}

const JOB_FIELDS = "title employerId location employmentType workMode salary showSalary status";

/**
 * Save a code-drawn poster for one job. Free (no AI, no credits). The brand kit
 * is snapshotted, so a later kit change never repaints a poster already shared.
 */
export async function createBrandPoster(input: CreateBrandPosterInput) {
  await connectDB();
  const job = (await Job.findById(input.jobId).select(JOB_FIELDS).lean()) as
    | (PosterJobInput & { _id: unknown; employerId: unknown })
    | null;
  if (!job) throw new BrandPosterError(404, "Job not found");
  if (input.employerId && String(job.employerId) !== String(input.employerId)) {
    throw new BrandPosterError(403, "This job does not belong to your company");
  }

  const view = await getEmployerBrandKit(String(job.employerId));
  if (!view) throw new BrandPosterError(404, "The job's company was not found");
  const kit: BrandKit = input.source === "company" ? view.kit : view.platform;
  const locale = input.locale === "ar" ? "ar" : "en";
  const headline = (input.headline?.trim() || defaultHeadline(input.look, locale)).slice(0, 80);

  const spec: IBrandPosterSpec = {
    source: input.source,
    layout: input.layout,
    look: input.look,
    headline,
    locale,
    kit: { ...kit },
  };

  const poster = await PosterGeneration.create({
    kind: "brand",
    brand: spec,
    employerId: job.employerId,
    jobId: job._id,
    ...legacyFields(input.look),
    prompt: headline,
    formats: ["instagram-post", "instagram-story", "linkedin-post", "a4-print"],
    variations: [],
    selectedVariation: Math.max(0, BRAND_LAYOUTS.indexOf(input.layout)),
    shareSlug: nanoid(10),
    creditsUsed: 0,
    ...(input.actorUserId ? { createdByUserId: input.actorUserId } : {}),
  });

  return { id: String(poster._id), shareSlug: poster.shareSlug as string, jobTitle: job.title ?? "", companyName: view.companyName };
}

export interface LoadedBrandPoster {
  spec: IBrandPosterSpec;
  kit: BrandKit;
  job: PosterJobInput;
  companyName: string;
  /** The company logo; without one the company name alone names the employer (Mployedin has its corner badge). */
  logoUrl: string | null;
}

/** A saved brand poster by its public share slug, with what it needs to be drawn. */
export async function loadBrandPosterBySlug(slug: string): Promise<LoadedBrandPoster | null> {
  if (!/^[A-Za-z0-9_-]{6,32}$/.test(slug)) return null;
  await connectDB();
  const poster = (await PosterGeneration.findOne({ shareSlug: slug, kind: "brand" })
    .select("brand jobId employerId")
    .lean()) as { brand?: IBrandPosterSpec; jobId: unknown; employerId: unknown } | null;
  if (!poster?.brand) return null;

  const [job, view] = await Promise.all([
    Job.findById(poster.jobId).select(JOB_FIELDS).lean() as Promise<PosterJobInput | null>,
    getEmployerBrandKit(String(poster.employerId)),
  ]);
  if (!job) return null;

  const kit = resolveBrandKit(poster.brand.kit as Partial<BrandKit>);
  return {
    spec: poster.brand,
    kit,
    job,
    companyName: view?.companyName ?? "",
    logoUrl: view?.companyLogo || null,
  };
}

export { buildBrandPosterData };
