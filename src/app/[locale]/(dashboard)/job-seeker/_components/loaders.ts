import { Types } from "mongoose";
import Interview from "@/models/Interview";
import SavedSearch from "@/models/SavedSearch";
import type { UpcomingInterview } from "@/components/features/job-seeker/home/types";

/** The next three interviews that are still on, soonest first. */
export async function loadUpcomingInterviews(seekerId: Types.ObjectId, now: Date): Promise<UpcomingInterview[]> {
  const rows = (await Interview.find({ jobSeekerId: seekerId, scheduledAt: { $gte: now }, status: { $nin: ["cancelled"] } })
    .sort({ scheduledAt: 1 })
    .limit(3)
    .select("jobId employerId scheduledAt type status location meetLink")
    .populate("jobId", "title")
    .populate("employerId", "companyName")
    .lean()) as Array<Record<string, unknown>>;
  return rows.map((row) => {
    const job = row.jobId as { title?: string } | null;
    const employer = row.employerId as { companyName?: string } | null;
    const at = row.scheduledAt instanceof Date ? row.scheduledAt : new Date(String(row.scheduledAt));
    return {
      _id: String(row._id),
      jobTitle: String(job?.title ?? ""),
      companyName: employer?.companyName ?? undefined,
      scheduledAt: at.toISOString(),
      type: String(row.type ?? "video"),
      status: String(row.status ?? "scheduled"),
      location: row.location ? String(row.location) : undefined,
      meetLink: row.meetLink ? String(row.meetLink) : undefined,
    };
  });
}

/** Saved searches that still email the seeker — the "job alerts" counter. */
export function loadJobAlertCount(userId: Types.ObjectId | string): Promise<number> {
  return SavedSearch.countDocuments({ userId, emailAlert: true, frequency: { $ne: "never" } });
}

/**
 * This user's unread messages across every non-support conversation.
 * `unreadCounts` is a Map keyed by user id; only this seeker's own entry counts.
 */
export async function loadUnreadMessageCount(userId: Types.ObjectId | string): Promise<number> {
  try {
    const Conversation = await import("@/models/Conversation").then((m) => m.default);
    const convs = (await Conversation.find({ participants: new Types.ObjectId(String(userId)), type: { $ne: "customer_care" } })
      .select("unreadCounts")
      .lean()) as Array<{ unreadCounts?: Record<string, number> | Map<string, number> }>;
    const key = String(userId);
    return convs.reduce((sum, conv) => {
      const counts = conv.unreadCounts instanceof Map ? Object.fromEntries(conv.unreadCounts) : conv.unreadCounts ?? {};
      return sum + (Number(counts[key]) || 0);
    }, 0);
  } catch {
    return 0;
  }
}
