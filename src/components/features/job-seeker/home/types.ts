import type { LimitingFactor } from "@/lib/matching/recommend";
import type { StatusBreakdown } from "@/lib/jobSeeker/dashboard/status";

export type { StatusBreakdown };

export type FeedJob = {
  _id: string;
  title: string;
  createdAt: string;
  matchScore: number;
  employmentType?: string;
  skills?: string[];
  matchedSkills?: string[];
  location?: { city?: string; country?: string; isRemote?: boolean };
  salary?: { min?: number; max?: number; currency?: string };
  employerId?: { _id?: string; companyName?: string; logo?: string } | null;
};

export type AppliedJobSnippet = {
  _id: string;
  title: string;
  companyName?: string;
  companyLogo?: string;
  status: string;
  appliedAt?: string;
};

export type UpcomingInterview = {
  _id: string;
  jobTitle: string;
  companyName?: string;
  scheduledAt: string;
  type: "video" | "offline" | "hybrid" | string;
  status: string;
  location?: string;
  meetLink?: string;
};

/** A headline counter; delta is this calendar week minus the previous one. */
export type Counter = { count: number; delta?: number; daily?: number[] };

export type DashboardStats = {
  applicationsSent?: Counter;
  upcomingInterviews?: Counter;
  /** `total` is the 30-day count — the field name predates this page. */
  recruiterViews?: { total: number; delta?: number; last7Days?: number[] };
  pendingOffers?: Counter;
  unreadMessages?: Counter;
  jobAlerts?: Counter;
  statusBreakdown?: StatusBreakdown;
};

export type ProfileData = {
  summary?: string;
  profileCompleteness?: number;
  preferredRoles?: string[];
  preferredCountries?: string[];
  preferredJobType?: string;
  preferredSalary?: { min?: number; max?: number; currency?: string };
  skills?: Array<string | { name?: string }>;
  experience?: Array<unknown>;
  education?: Array<unknown>;
  languages?: Array<unknown>;
  cvFileUrl?: string;
  cv?: { originalUrl?: string };
  userId?: string;
  nationality?: string;
  currentLocation?: string;
  linkedin?: string;
  socialLinks?: Array<{ label?: string; url?: string }>;
};

/** What the engine said about the seeker's pool, so an empty list can say why. */
export type RecommendationSummary = {
  threshold: number;
  bestScore: number;
  recommendedCount: number;
  limitingFactor: LimitingFactor | null;
};

/** Typed bundle the client fallback and the tests render from. */
export type InitialHomeData = {
  profile: ProfileData;
  stats: DashboardStats;
  /** Recommended jobs only: eligible and at or above the admin threshold. */
  jobs: FeedJob[];
  recommendation?: RecommendationSummary;
  appliedJobs?: AppliedJobSnippet[];
  interviews?: UpcomingInterview[];
};
