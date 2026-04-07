import type { MetadataRoute } from "next";
import { connectDB } from "@/lib/db/mongoose";
import Job from "@/models/Job";

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://mployedin.com";
const LOCALES = ["en", "ar"] as const;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // Static routes for all locales
  const staticPaths = ["/", "/jobs", "/about", "/contact"];
  const staticEntries: MetadataRoute.Sitemap = staticPaths.flatMap((path) =>
    LOCALES.map((locale) => ({
      url: `${BASE_URL}/${locale}${path === "/" ? "" : path}`,
      lastModified: new Date(),
      changeFrequency: path === "/jobs" ? "hourly" : ("monthly" as const),
      priority: path === "/" ? 1.0 : path === "/jobs" ? 0.9 : 0.5,
    }))
  );

  try {
    await connectDB();

    // Fetch up to 1000 most recently updated active jobs
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

    return [...staticEntries, ...jobEntries];
  } catch {
    // Return static entries only if DB is unavailable
    return staticEntries;
  }
}
