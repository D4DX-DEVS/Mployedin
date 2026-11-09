"use client";

import { Suspense } from "react";
import { notFound, useParams, useSearchParams } from "next/navigation";
import { CreatePosterPage } from "@/components/features/employer/poster/CreatePosterPage";
import { PosterStudio } from "@/components/features/poster/PosterStudio";
import { POSTERS_ENABLED } from "@/lib/features/posterFeature";

/**
 * The three-step brand poster maker by default. The original AI-background
 * maker stays reachable for the "Photo (AI)" style (?mode=ai) and for reopening
 * a saved AI poster (?generation=…).
 */
function PosterRoute() {
  const params = useParams();
  const searchParams = useSearchParams();
  const jobId = params.id as string;
  const useAiMaker = searchParams.get("mode") === "ai" || Boolean(searchParams.get("generation"));
  return useAiMaker ? <CreatePosterPage jobId={jobId} /> : <PosterStudio jobId={jobId} />;
}

export default function PosterPage() {
  if (!POSTERS_ENABLED) notFound();
  return (
    <Suspense>
      <PosterRoute />
    </Suspense>
  );
}
