/**
 * @jest-environment jsdom
 */
import React from "react";
import { render, screen } from "@testing-library/react";
import { PriorityActions } from "@/components/features/employer/dashboard/PriorityActions";
import { DashboardStatCards } from "@/components/features/employer/dashboard/DashboardStatCards";
import { InteractivePipeline } from "@/components/features/employer/dashboard/InteractivePipeline";
import { AIRecommendedCandidatesCard } from "@/components/features/employer/dashboard/AIRecommendedCandidatesCard";

const translations: Record<string, string> = {
  "employerDashboard.priorityActions.recommendedNext": "Recommended next",
  "employerDashboard.priorityActions.focusNextMove": "Focus your next move.",
  "employerDashboard.priorityActions.keepMomentum": "Keep momentum",
  "employerDashboard.priorityActions.urgent": "Urgent",
  "employerDashboard.priorityActions.medium": "Medium",
  "employerDashboard.priorityActions.suggestion": "Suggestion",
  "employerDashboard.priorityActions.reviewNewAppsPlural": "Review {count} new applications",
  "employerDashboard.priorityActions.reviewCandidates": "Review candidates",
  "employerDashboard.priorityActions.scheduleCountInterviews": "Schedule {count} interviews",
  "employerDashboard.priorityActions.scheduleInterviews": "Schedule interviews",
  "employerDashboard.priorityActions.messageCandidates": "Message candidates",
  "employerDashboard.priorityActions.messageNow": "Message now",
  "employerDashboard.priorityActions.moveTopMatched": "Review top matches",
  "employerDashboard.priorityActions.reviewTopMatches": "Review matches",
  "employerDashboard.priorityActions.interviewsComingPlural": "{count} interviews coming up",
  "employerDashboard.priorityActions.viewInterviews": "View interviews",
  "employerDashboard.smartHeader.overview": "At a glance",
  "employerDashboard.smartHeader.activeRoles": "Active jobs",
  "employerDashboard.smartHeader.activeRolesDesc": "Open roles",
  "employerDashboard.smartHeader.needsReview": "New applications",
  "employerDashboard.smartHeader.needsReviewDesc": "Waiting for review",
  "employerDashboard.smartHeader.aiMatches": "Profile matches",
  "employerDashboard.smartHeader.aiMatchesDesc": "Estimated matches",
  "employerDashboard.smartHeader.interviewsSet": "Today's interviews",
  "employerDashboard.smartHeader.interviewsSetDesc": "Booked today",
  "employerDashboard.jobQuickFilters.draftTab": "Draft",
  "employerDashboard.jobQuickFilters.pausedTab": "Paused",
  "employerDashboard.interactivePipeline.hiringPipeline": "Hiring pipeline",
  "employerDashboard.interactivePipeline.trackMovement": "Track candidate movement.",
  "employerDashboard.interactivePipeline.viewAllApplications": "View all applications",
  "employerDashboard.interactivePipeline.swipeMore": "Swipe to see every stage",
  "employerDashboard.interactivePipeline.stageAriaLabel": "{stage}: {value} candidates. {detail}",
  "employerDashboard.interactivePipeline.applied": "Applied",
  "employerDashboard.interactivePipeline.new": "New",
  "employerDashboard.interactivePipeline.screening": "Screening",
  "employerDashboard.interactivePipeline.inReview": "In review",
  "employerDashboard.interactivePipeline.interviews": "Interviews",
  "employerDashboard.interactivePipeline.scheduled": "Scheduled",
  "employerDashboard.interactivePipeline.offers": "Offers",
  "employerDashboard.interactivePipeline.sent": "Sent",
  "employerDashboard.interactivePipeline.hired": "Hired",
  "employerDashboard.interactivePipeline.placed": "Placed",
  "employerDashboard.interactivePipeline.candidates": "candidates",
  "employerDashboard.quickInsights.avgFitScore": "Average fit",
  "employerDashboard.aiRecommended.heading": "Profile match estimates",
  "employerDashboard.aiRecommended.subheading": "{count} matches across {jobs} jobs.",
  "employerDashboard.aiRecommended.reviewCandidates": "Review candidates",
  "employerDashboard.aiRecommended.band90Plus": "Above 90% match",
  "employerDashboard.aiRecommended.band90PlusDesc": "Review the full application.",
  "employerDashboard.aiRecommended.band80to89": "80–89% match",
  "employerDashboard.aiRecommended.band80to89Desc": "Verify experience.",
  "employerDashboard.aiRecommended.needsReview": "Needs review",
  "employerDashboard.aiRecommended.needsReviewDesc": "Human review required.",
  "employerDashboard.aiRecommended.assistiveNote": "Estimates do not replace human assessment.",
  "employerDashboard.aiRecommended.emptyTitle": "No match estimates yet",
  "employerDashboard.aiRecommended.emptyDescription": "Estimates appear after scoring.",
};

jest.mock("next-intl", () => ({
  useTranslations: (namespace: string) =>
    (key: string, values?: Record<string, string | number>) => {
      const template = translations[`${namespace}.${key}`] ?? key;
      return Object.entries(values ?? {}).reduce(
        (result, [name, value]) => result.replace(`{${name}}`, String(value)),
        template,
      );
    },
}));

beforeAll(() => {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: () => ({ matches: true, addEventListener: jest.fn(), removeEventListener: jest.fn() }),
  });
});

describe("Employer task-first dashboard", () => {
  it("promotes one next action and keeps lower-priority suggestions available", () => {
    const { rerender } = render(
      <PriorityActions
        activeJobs={2}
        newApplications={2}
        scheduledInterviews={0}
        totalApplications={4}
        placements={0}
        locale="en"
      />,
    );

    expect(screen.getByRole("heading", { name: "Recommended next" })).toBeInTheDocument();
    expect(screen.getByText("Review 2 new applications").closest("a")).toHaveAttribute(
      "href",
      "/en/employer/applications?status=applied",
    );

    rerender(
      <PriorityActions
        activeJobs={1}
        newApplications={0}
        scheduledInterviews={0}
        totalApplications={2}
        placements={0}
        locale="en"
      />,
    );
    expect(screen.getByText("Schedule 2 interviews")).toBeInTheDocument();
  });

  it("uses a four-column tablet signal strip instead of four separate cards", () => {
    const { container } = render(
      <DashboardStatCards
        activeJobCount={16}
        draftJobCount={4}
        pausedJobCount={3}
        newApplications={2}
        highMatchCount={3}
        interviewsToday={0}
        locale="en"
      />,
    );

    expect(screen.getByRole("heading", { name: "At a glance" })).toBeInTheDocument();
    expect(container.querySelector(".md\\:grid-cols-4")).toBeInTheDocument();
    expect(screen.getAllByRole("link")).toHaveLength(4);
  });

  it("shows every pipeline stage without a mobile horizontal-scroll trap", () => {
    const { container } = render(
      <InteractivePipeline
        totalApplications={26}
        newApplications={2}
        inReview={5}
        interviews={6}
        offers={1}
        offersSent={0}
        placements={0}
        avgMatchScore={44}
        locale="en"
      />,
    );

    expect(screen.getByRole("heading", { name: "Hiring pipeline" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "View all applications" })).toHaveAttribute(
      "href",
      "/en/employer/applications",
    );
    expect(container.querySelector(".md\\:grid-cols-5")).toBeInTheDocument();
    expect(container.querySelector(".grid-cols-6")).toBeInTheDocument();
    expect(screen.queryByText("Swipe to see every stage")).not.toBeInTheDocument();
    expect(screen.getAllByRole("link")).toHaveLength(6);
  });

  it("keeps match estimates review-only on the dashboard", () => {
    render(
      <AIRecommendedCandidatesCard
        highMatchCount={3}
        band90PlusCount={2}
        band80to89Count={1}
        needsReviewCount={22}
        activeJobCount={16}
        locale="en"
      />,
    );

    expect(screen.getByRole("heading", { name: "Profile match estimates" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /notify/i })).not.toBeInTheDocument();
    expect(screen.getByText("Estimates do not replace human assessment.")).toBeInTheDocument();
  });
});
