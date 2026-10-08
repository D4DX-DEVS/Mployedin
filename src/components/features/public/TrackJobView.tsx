"use client";

import { useEffect } from "react";
import { csrfFetch } from "@/lib/security/csrf-client";

export default function TrackJobView({ jobId }: { jobId: string }) {
  useEffect(() => {
    // csrfFetch: a bare POST was refused 403 "Missing CSRF token" on every view (JS-34).
    csrfFetch(`/api/jobs/${jobId}/track-view`, { method: "POST" }).catch(() => {});
  }, [jobId]);

  return null;
}
