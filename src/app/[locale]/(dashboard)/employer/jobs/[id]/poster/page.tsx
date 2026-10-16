"use client";

import { notFound, useParams } from "next/navigation";
import { CreatePosterPage } from "@/components/features/employer/poster/CreatePosterPage";
import { POSTERS_ENABLED } from "@/lib/features/posterFeature";

export default function PosterPage() {
  const params = useParams();
  if (!POSTERS_ENABLED) notFound();
  const jobId = params.id as string;

  return <CreatePosterPage jobId={jobId} />;
}
