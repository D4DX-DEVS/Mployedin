"use client";

export interface SeekerReferralLink {
  code: string;
  usedCount?: number;
}

const ACTIVE_LINK_URL = "/api/referral-links?audience=job_seeker&status=active&limit=1&sortBy=createdAt&sortOrder=desc&mine=1";

/**
 * The caller's newest live job-seeker referral link, created on first use.
 * mine=1 ensures agents see only their own links, and SAs see only their own links (not their team's).
 * Shared by "Refer a job seeker" and "Share job": whoever signs up through it
 * joins as Premium and is credited to the caller.
 */
export async function getOrCreateSeekerReferralLink(label: string): Promise<SeekerReferralLink> {
  const res = await fetch(ACTIVE_LINK_URL);
  if (!res.ok) throw new Error(String(res.status));
  const found = ((await res.json()) as { links?: SeekerReferralLink[] }).links?.[0];
  if (found) return found;
  const created = await fetch("/api/referral-links", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ audience: "job_seeker", label }),
  });
  if (!created.ok) throw new Error(String(created.status));
  const link = ((await created.json()) as { link?: SeekerReferralLink }).link;
  if (!link) throw new Error("no link");
  return link;
}
