import { Metadata } from "next";
import { connectDB } from "@/lib/db/mongoose";
import PosterGeneration from "@/models/PosterGeneration";
import { PosterShareView } from "@/components/features/employer/poster/PosterShareView";

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
    .populate("jobId", "title companyName location salary")
    .lean();

  if (!poster) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-lg text-muted-foreground">Poster not found</p>
      </div>
    );
  }

  const selectedBg = poster.variations?.[poster.selectedVariation]?.backgroundUrl
    || poster.variations?.[0]?.backgroundUrl;

  return (
    <PosterShareView
      backgroundUrl={selectedBg || ""}
      jobTitle={(poster.jobId as any)?.title || ""}
      companyName={(poster.jobId as any)?.companyName || ""}
      jobId={poster.jobId?.toString() || ""}
      slug={slug}
    />
  );
}
