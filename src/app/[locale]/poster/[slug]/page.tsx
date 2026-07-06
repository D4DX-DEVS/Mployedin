import { Metadata } from "next";
import { connectDB } from "@/lib/db/mongoose";
import PosterGeneration from "@/models/PosterGeneration";
import { PosterShareView } from "@/components/features/employer/poster/PosterShareView";
import type { PosterStyleOverrides } from "@/lib/composer/types";

interface Props {
  params: Promise<{ slug: string; locale: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  await connectDB();
  const poster = await PosterGeneration.findOne({ shareSlug: slug })
    .populate("jobId", "title companyName")
    .lean();

  if (!poster) {
    return { title: "Poster Not Found" };
  }

  const job = poster.jobId as { title?: string; companyName?: string } | null;
  const thumb = poster.variations?.[poster.selectedVariation]?.backgroundUrl
    || poster.variations?.[0]?.backgroundUrl;

  return {
    title: `${job?.title || "Job Poster"} - ${job?.companyName || "Mployedin"}`,
    description: `Apply for ${job?.title || "this position"} via Mployedin`,
    openGraph: {
      title: `${job?.title || "Job Poster"}`,
      description: `Apply for ${job?.title || "this position"} via Mployedin`,
      images: thumb ? [{ url: thumb, width: 1080, height: 1080 }] : [],
    },
  };
}

export default async function PosterSharePage({ params }: Props) {
  const { slug } = await params;
  await connectDB();

  const poster = await PosterGeneration.findOneAndUpdate(
    { shareSlug: slug },
    { $inc: { "analytics.views": 1 } },
  )
    // Full job snapshot so the share view renders the composed poster, not just the AI background.
    .populate("jobId", "title companyName logo location salary skills description responsibilities qualifications requirements employmentType")
    .lean();

  if (!poster) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-lg text-muted-foreground">Poster not found</p>
      </div>
    );
  }

  const selected = poster.variations?.[poster.selectedVariation] ?? poster.variations?.[0];
  const job = poster.jobId as any;

  return (
    <PosterShareView
      backgroundUrl={selected?.backgroundUrl || ""}
      job={job ? JSON.parse(JSON.stringify(job)) : null}
      posterType={poster.type}
      showFields={poster.showFields ?? { salary: true, location: true, experience: true, skills: true }}
      layout={poster.layoutOverride ?? selected?.layout ?? "layout-a"}
      styleOverrides={poster.styleOverrides as PosterStyleOverrides | undefined}
      jobTitle={job?.title || ""}
      companyName={job?.companyName || ""}
      jobId={job?._id?.toString() || ""}
      slug={slug}
    />
  );
}
