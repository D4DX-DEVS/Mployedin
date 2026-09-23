/**
 * Inngest event type definitions for the notification system.
 * All events flowing through the event bus are typed here.
 */

export interface NotificationInstantEvent {
  name: "notification/instant";
  data: {
    userId: string;
    type: string;
    title: string;
    message: string;
    link?: string;
    sendEmail?: boolean;
    sendWhatsApp?: boolean;
    metadata?: Record<string, unknown>;
  };
}

export interface NotificationDailyDigestEvent {
  name: "notification/daily-digest";
  data: {
    userId: string;
    userName: string;
    email: string;
    locale: string;
    jobs: Array<{
      jobId: string;
      title: string;
      company: string;
      location: string;
      matchScore: number;
      /**
       * The job's own pay figures. `currency` and `period` travel with them
       * because the email used to render every salary as AED — 46 of 62 live
       * jobs are priced in something else, so an INR figure was shown as a
       * dirham amount roughly 35x too large.
       */
      salary?: { min: number; max: number; currency?: string; period?: string };
      /** The job skills the seeker demonstrably has — the reasoning behind the %. */
      matchedSkills?: string[];
    }>;
    profileViews: {
      count: number;
      viewers: Array<{ name: string; role: string }>;
    };
    /**
     * What the seeker's profile actually states, so the digest can invite them
     * to improve their matches instead of implying the inputs were complete.
     */
    profile?: { completeness: number; signals: number };
    /**
     * Present only when jobs were scored and none cleared the threshold — the
     * "we checked 28 openings, your closest was 37%, here is why" section.
     *
     * Missing from this type until 2026-09-23, so the worker never forwarded
     * it: the producer computed it and claimed its 14-day cooldown, and every
     * one of the day's 187 "No strong job matches" emails went out without it.
     */
    nearMiss?: {
      bestScore: number;
      threshold: number;
      considered: number;
      topBlocker: string | null;
    };
  };
}

export interface NotificationReEngagementEvent {
  name: "notification/re-engagement";
  data: {
    userId: string;
    userName: string;
    email: string;
    locale: string;
    matchingJobCount: number;
    topJobs: Array<{
      title: string;
      company: string;
      matchScore: number;
    }>;
    daysSinceLastLogin: number;
  };
}

export interface NotificationProfileCompletionEvent {
  name: "notification/profile-completion";
  data: {
    userId: string;
    userName: string;
    email: string;
    locale: string;
    completeness: number;
    missingFields: string[];
  };
}

export interface NotificationWeeklyDigestEvent {
  name: "notification/weekly-digest";
  data: {
    userId: string;
    userName: string;
    email: string;
    locale: string;
    weekSummary: {
      applicationsSubmitted: number;
      interviewsScheduled: number;
      profileViews: number;
      newMatchingJobs: number;
    };
    topJobs: Array<{
      title: string;
      company: string;
      matchScore: number;
    }>;
  };
}

export interface AdminBroadcastEvent {
  name: "admin/broadcast";
  data: {
    title: string;
    message: string;
    targetRoles?: string[];
    targetAll?: boolean;
    channels: string[];
  };
}

/**
 * Union of all notification events flowing through Inngest.
 */
export type NotificationEvent =
  | NotificationInstantEvent
  | NotificationDailyDigestEvent
  | NotificationReEngagementEvent
  | NotificationProfileCompletionEvent
  | NotificationWeeklyDigestEvent
  | AdminBroadcastEvent;
