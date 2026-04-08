"use client";

import { useEffect } from "react";

export default function TrackJobView({ jobId }: { jobId: string }) {
  useEffect(() => {
    fetch(`/api/jobs/${jobId}/track-view`, { method: "POST" }).catch(() => {});
  }, [jobId]);

  return null;
}
