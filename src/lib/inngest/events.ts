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
      salary?: { min: number; max: number };
    }>;
    profileViews: {
      count: number;
      viewers: Array<{ name: string; role: string }>;
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

/**
 * Union of all notification events flowing through Inngest.
 */
export type NotificationEvent =
  | NotificationInstantEvent
  | NotificationDailyDigestEvent
  | NotificationReEngagementEvent
  | NotificationProfileCompletionEvent
  | NotificationWeeklyDigestEvent;
