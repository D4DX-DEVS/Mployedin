"use client";

import { useEffect } from "react";

export default function TrackCompanyProfileView({ employerId }: { employerId: string }) {
  useEffect(() => {
    fetch(`/api/employers/${employerId}/profile-view`, { method: "POST" }).catch((error: unknown) => {
      if (process.env.NODE_ENV === "development") {
        console.warn("[TrackCompanyProfileView] Failed to track view", error);
      }
    });
  }, [employerId]);

  return null;
}