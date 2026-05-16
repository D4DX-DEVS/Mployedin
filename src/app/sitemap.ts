import type { MetadataRoute } from "next";
import { connectDB } from "@/lib/db/mongoose";
import Job from "@/models/Job";
import BlogPost from "@/models/BlogPost";

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://mployedin-8a4rc.ondigitalocean.app";
const LOCALES = ["en", "ar"] as const;

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

    // Fetch published blog posts
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

    return [...staticEntries, ...jobEntries, ...blogEntries];
  } catch {
    // Return static entries only if DB is unavailable
    return staticEntries;
  }
}
