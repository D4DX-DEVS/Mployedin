"use client";

import { useCallback, useMemo } from "react";
import { useSession } from "next-auth/react";

interface LinkedInShareOptions {
  jobUrl: string;
  caption?: string;
}

/**
 * Hook for LinkedIn sharing functionality.
 * Currently uses client-side share-offsite redirect.
 * Can be upgraded to UGC API posting when w_member_social scope is available.
 */
export function useLinkedInShare() {
  const { data: session } = useSession();

  const isLinkedInConnected = useMemo(() => {
    // Check if user logged in via LinkedIn (has LinkedIn account linked)
    const provider = (session?.user as unknown as { provider?: string })?.provider;
    return provider === "linkedin";
  }, [session]);

  const shareToLinkedIn = useCallback(
    ({ jobUrl, caption }: LinkedInShareOptions) => {
      // Use share-offsite for now — works without w_member_social scope
      const url = caption
        ? `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(jobUrl)}`
        : `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(jobUrl)}`;

      window.open(url, "_blank", "noopener,noreferrer,width=600,height=500");
    },
    [],
  );

  return {
    shareToLinkedIn,
    isLinkedInConnected,
  };
}
