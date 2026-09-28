import Employer from "@/models/Employer";
import Job from "@/models/Job";
import JobSeeker from "@/models/JobSeeker";
import User from "@/models/User";
import { jobsExpiringFilter } from "@/lib/admin/queueFilters";
import type { DashboardPeriod } from "./period";

export type InsightId =
  | "seekers-incomplete-profile"
  | "seekers-not-onboarded"
  | "seekers-no-skills"
  | "users-unverified-email"
  | "users-dormant-30d"
  | "employers-basic-verification"
  | "employers-no-logo"
  | "jobs-no-salary"
  | "jobs-expiring-7d"
  | "jobs-stale-drafts";

export type InsightSeverity = "info" | "warning";

export interface DataInsight {
  id: InsightId;
  count: number;
  severity: InsightSeverity;
  /** Locale-less path to the list that shows these records. */
  path: string;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Quick findings: records that exist but are missing something a user could
 * fix. Unlike the action queue these are not decisions waiting on an admin —
 * they are gaps worth nudging (profile completion campaigns, verification
 * drives, expiring jobs).
 */
export async function getDataInsights(period: DashboardPeriod): Promise<DataInsight[]> {
  const { now } = period;
  const monthAgo = new Date(now.getTime() - 30 * DAY_MS);
  const [
    seekersIncomplete,
    seekersNotOnboarded,
    seekersNoSkills,
    usersUnverified,
    usersDormant,
    employersBasic,
    employersNoLogo,
    jobsNoSalary,
    jobsExpiring,
    staleDrafts,
  ] = await Promise.all([
    JobSeeker.countDocuments({ isOnboarded: true, profileCompleteness: { $lt: 50 } }),
    JobSeeker.countDocuments({ isOnboarded: { $ne: true } }),
    JobSeeker.countDocuments({ isOnboarded: true, $or: [{ skills: { $exists: false } }, { skills: { $size: 0 } }] }),
    User.countDocuments({ isEmailVerified: { $ne: true }, isActive: { $ne: false } }),
    User.countDocuments({ isActive: { $ne: false }, role: { $in: ["employer", "job_seeker"] }, $or: [{ lastLogin: { $lt: monthAgo } }, { lastLogin: null }] }),
    Employer.countDocuments({ roleArchivedAt: null, verificationLevel: "basic" }),
    Employer.countDocuments({ roleArchivedAt: null, $or: [{ logo: { $exists: false } }, { logo: null }, { logo: "" }] }),
    Job.countDocuments({ status: "active", deletedAt: null, $or: [{ showSalary: false }, { "salary.min": { $in: [null, 0] } }] }),
    Job.countDocuments(jobsExpiringFilter(7, now)),
    Job.countDocuments({ status: "draft", deletedAt: null, updatedAt: { $lt: monthAgo } }),
  ]);

  const rows: DataInsight[] = [
    { id: "seekers-incomplete-profile", count: seekersIncomplete, severity: "warning", path: "/admin/job-seekers" },
    { id: "seekers-not-onboarded", count: seekersNotOnboarded, severity: "info", path: "/admin/job-seekers" },
    { id: "seekers-no-skills", count: seekersNoSkills, severity: "info", path: "/admin/job-seekers" },
    { id: "users-unverified-email", count: usersUnverified, severity: "warning", path: "/admin/users" },
    { id: "users-dormant-30d", count: usersDormant, severity: "info", path: "/admin/users" },
    { id: "employers-basic-verification", count: employersBasic, severity: "warning", path: "/admin/employers" },
    { id: "employers-no-logo", count: employersNoLogo, severity: "info", path: "/admin/employers" },
    { id: "jobs-no-salary", count: jobsNoSalary, severity: "info", path: "/admin/jobs?status=active" },
    { id: "jobs-expiring-7d", count: jobsExpiring, severity: "warning", path: "/admin/jobs?status=active" },
    { id: "jobs-stale-drafts", count: staleDrafts, severity: "info", path: "/admin/jobs?status=draft" },
  ];
  return rows.filter((row) => row.count > 0);
}
