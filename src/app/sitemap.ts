import type { MetadataRoute } from "next";
import { connectDB } from "@/lib/db/mongoose";
import Job from "@/models/Job";
import BlogPost from "@/models/BlogPost";

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://mployedin-8a4rc.ondigitalocean.app";
const LOCALES = ["en", "ar"] as const;

// Regenerate in the background every hour, so a sitemap that shipped without
// the database part (see the budget below) heals itself on the next request.
export const revalidate = 3600;

// How long to wait for MongoDB before shipping the static routes only.
// connectDB also sweeps indexes, which has taken minutes during a production
// build and made `next build` give up on this route after three 60s attempts.
const DB_BUDGET_MS = 20_000;

function withBudget<T>(work: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("sitemap: database budget exceeded")), ms);
    work.then(
      (value) => { clearTimeout(timer); resolve(value); },
      (error: unknown) => { clearTimeout(timer); reject(error); },
    );
  });
}

async function loadDynamicEntries(): Promise<MetadataRoute.Sitemap> {
  await connectDB();

  // Up to 1000 most recently updated active jobs
  const jobs = await Job.find({ status: "active" })
    .sort({ updatedAt: -1 })
    .limit(1000)
    .select("_id updatedAt")
    .lean();

  const jobEntries: MetadataRoute.Sitemap = jobs.flatMap((job) =>
    LOCALES.map((locale) => ({
      url: `${BASE_URL}/${locale}/jobs/${job._id}`,
      lastModified: job.updatedAt ?? new Date(),
      changeFrequency: "daily" as const,
      priority: 0.8,
    }))
  );

  const posts = await BlogPost.find({ status: "published", isActive: true })
    .sort({ publishedAt: -1 })
    .limit(500)
    .select("slug publishedAt updatedAt")
    .lean();

  const blogEntries: MetadataRoute.Sitemap = posts.flatMap((post) =>
    LOCALES.map((locale) => ({
      url: `${BASE_URL}/${locale}/blog/${post.slug}`,
      lastModified: post.updatedAt ?? post.publishedAt ?? new Date(),
      changeFrequency: "monthly" as const,
      priority: 0.6,
    }))
  );

  return [...jobEntries, ...blogEntries];
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // Static routes: [path, changeFrequency, priority]
  type SitemapEntry = [string, "always" | "hourly" | "daily" | "weekly" | "monthly" | "yearly" | "never", number];
  const staticPaths: SitemapEntry[] = [
    ["/", "weekly", 1.0],
    ["/jobs", "hourly", 0.9],
    ["/companies", "daily", 0.8],
    ["/blog", "daily", 0.7],
    ["/salary-explorer", "weekly", 0.7],
    ["/faq", "monthly", 0.6],
    ["/contact", "monthly", 0.5],
    ["/terms", "yearly", 0.3],
    ["/privacy", "yearly", 0.3],
    ["/gdpr", "yearly", 0.3],
    ["/cookies", "yearly", 0.3],
  ];
  const staticEntries: MetadataRoute.Sitemap = staticPaths.flatMap(([path, freq, priority]) =>
    LOCALES.map((locale) => ({
      url: `${BASE_URL}/${locale}${path === "/" ? "" : path}`,
      lastModified: new Date(),
      changeFrequency: freq,
      priority,
    }))
  );

  try {
    const dynamicEntries = await withBudget(loadDynamicEntries(), DB_BUDGET_MS);
    return [...staticEntries, ...dynamicEntries];
  } catch {
    // Database slow or unavailable: the static routes still ship, and the
    // hourly revalidation adds jobs and posts back once the database answers.
    return staticEntries;
  }
}
