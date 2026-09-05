/**
 * The platform's operational alerts, in one place.
 *
 * Deliberately free of database imports: the reports page is a Client Component
 * and needs `PLATFORM_ALERT_ACTIONS`, so pulling a Mongoose model in here would
 * drag server code into the browser bundle. The queries live next door in
 * `platformAlerts.server.ts`.
 *
 * These thresholds already existed inside `/api/admin/analytics`, and the
 * reports page already mapped every id to the destination where an admin acts
 * on it. The dashboard consulted none of it: its "recommended next" card ran a
 * three-branch ternary that, on a healthy platform, always resolved to "go read
 * the audit logs" — which is not a task. Moving the engine here lets the server
 * -rendered dashboard and the client-side reports page raise the same alerts
 * from the same numbers, so the two can never disagree.
 *
 * An alert carries an id and the numbers behind it, never rendered copy: this
 * runs without a locale, so composing the sentence here would print English
 * into an Arabic admin's dashboard. Each surface maps the id to its own message
 * keys and interpolates `values`.
 */
export type PlatformAlertLevel = "critical" | "warning" | "positive";

export interface PlatformAlert {
  id: PlatformAlertId;
  level: PlatformAlertLevel;
  values: Record<string, number>;
}

export type PlatformAlertId =
  | "jobs-without-applications"
  | "stale-open-applications"
  | "zero-placement-momentum"
  | "demand-softening"
  | "platform-stable";

/** Applications older than this with no decision are considered stale. */
export const STALE_APPLICATION_MS = 48 * 60 * 60 * 1000;

/** Statuses that still need a human decision. */
export const OPEN_APPLICATION_STATUSES = [
  "applied",
  "shortlisted",
  "interview_scheduled",
  "selected",
  "offer",
];

export interface PlatformAlertInputs {
  jobsWithoutApplications: number;
  staleOpenApplications: number;
  currentApplications: number;
  previousApplications: number;
  currentPlacements: number;
  currentJobs: number;
  previousJobs: number;
  placementRatePercent: number;
}

/** Pure ranking — every caller passes the same shape and gets the same alerts. */
export function buildPlatformAlerts(input: PlatformAlertInputs): PlatformAlert[] {
  const alerts: PlatformAlert[] = [];

  if (input.jobsWithoutApplications > 0) {
    alerts.push({
      id: "jobs-without-applications",
      level: input.jobsWithoutApplications >= 5 ? "critical" : "warning",
      values: { count: input.jobsWithoutApplications },
    });
  }

  if (input.staleOpenApplications > 0) {
    alerts.push({
      id: "stale-open-applications",
      level: input.staleOpenApplications >= 3 ? "critical" : "warning",
      values: { count: input.staleOpenApplications },
    });
  }

  if (input.currentPlacements === 0 && input.currentApplications > 0) {
    alerts.push({
      id: "zero-placement-momentum",
      level: "critical",
      values: { count: input.currentApplications },
    });
  }

  if (input.currentApplications < input.previousApplications && input.currentJobs >= input.previousJobs) {
    alerts.push({
      id: "demand-softening",
      level: "warning",
      values: {
        // A percentage, matching the "Applications down {delta}%" copy the
        // reports page has always rendered for this alert.
        delta: Math.abs(
          Number(
            (((input.currentApplications - input.previousApplications) /
              input.previousApplications) *
              100).toFixed(1),
          ),
        ),
      },
    });
  }

  if (alerts.length === 0) {
    alerts.push({
      id: "platform-stable",
      level: "positive",
      values: { rate: input.placementRatePercent },
    });
  }

  // Critical first: the dashboard shows the top alert as the recommended next
  // action, so ordering here decides what an admin is pointed at.
  const rank: Record<PlatformAlertLevel, number> = { critical: 0, warning: 1, positive: 2 };
  return alerts.sort((left, right) => rank[left.level] - rank[right.level]);
}

/**
 * Where an admin goes to act on each alert, and which filters land them on the
 * rows the alert is about. The reports page used to link at bare list pages, so
 * the finding was lost the moment the admin arrived and had to rebuild the
 * filter by hand.
 */
export const PLATFORM_ALERT_ACTIONS: Record<
  PlatformAlertId,
  { path: string | null; titleKey: string; descriptionKey: string; icon: string }
> = {
  "jobs-without-applications": {
    path: "/admin/jobs?applications=none",
    titleKey: "alertJobsWithoutDemandTitle",
    descriptionKey: "alertJobsWithoutDemandDescription",
    icon: "Briefcase",
  },
  "stale-open-applications": {
    // No status here on purpose: the API applies OPEN_APPLICATION_STATUSES
    // for `stale=true`, so the rows on the page are exactly the rows counted.
    path: "/admin/applications?stale=true",
    titleKey: "alertStaleApplicationsTitle",
    descriptionKey: "alertStaleApplicationsDescription",
    icon: "Clock3",
  },
  "zero-placement-momentum": {
    path: "/admin/placements",
    titleKey: "alertNoPlacementMomentumTitle",
    descriptionKey: "alertNoPlacementMomentumDescription",
    icon: "Target",
  },
  "demand-softening": {
    path: "/admin/applications",
    titleKey: "alertDemandSofteningTitle",
    descriptionKey: "alertDemandSofteningDescription",
    icon: "TrendingDown",
  },
  "platform-stable": {
    path: null,
    titleKey: "alertPlatformStableTitle",
    descriptionKey: "alertPlatformStableDescription",
    icon: "CheckCircle2",
  },
};
