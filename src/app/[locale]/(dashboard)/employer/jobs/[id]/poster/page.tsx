"use client";

import { useParams } from "next/navigation";
import { CreatePosterPage } from "@/components/features/employer/poster/CreatePosterPage";

export default function PosterPage() {
  const params = useParams();
  const jobId = params.id as string;

  return <CreatePosterPage jobId={jobId} />;
}
