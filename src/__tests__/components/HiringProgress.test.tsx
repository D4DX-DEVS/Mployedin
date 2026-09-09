/**
 * @jest-environment jsdom
 */
import React from "react";
import { render, screen } from "@testing-library/react";
import { HiringProgress } from "@/components/features/employer/jobs/HiringProgress";
import type { JobHiringSummary } from "@/hooks/useJobHiringSummary";

jest.mock("next/link", () => ({
  __esModule: true,
  default: ({ children, href, ...rest }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a href={href as string} {...rest}>{children}</a>
  ),
}));

const JOB_HREF = "/en/employer/jobs/job-1";

function summary(overrides: Partial<JobHiringSummary> = {}): JobHiringSummary {
  return {
    jobId: "job-1",
    status: "active",
    vacancies: 1,
    views: 29,
    total: 3,
    statusCounts: {
      applied: 0, shortlisted: 3, interview_scheduled: 0,
      selected: 0, offer: 0, hired: 0, rejected: 0, withdrawn: 0,
    },
    unreviewed: 0,
    interviews: { open: 1, interviewingCandidates: 1, upcoming: 1, awaitingOutcome: 0, rescheduleRequests: 0 },
    offers: { pending: 0, expiringSoon: 0, accepted: 0 },
    checks: { inProgress: 0, completed: 0 },
    placements: { active: 0, completed: 0 },
    posters: 0,
    ...overrides,
  };
}

/** The exact shape that made the card read as broken: three applicants, all
    shortlisted, one holding a scheduled interview. */
describe("HiringProgress", () => {
  it("reports every applicant under Applied, not just those still at that stage", () => {
    render(<HiringProgress summary={summary()} jobHref={JOB_HREF} />);
    const applied = screen.getByRole("link", { name: /applied/i });
    expect(applied).toHaveTextContent("3");
    // Applied is a total, so it opens the unfiltered list.
    expect(applied).toHaveAttribute("href", `${JOB_HREF}/applications`);
  });

  it("counts a candidate with a live interview so it cannot contradict the Interviews tab", () => {
    render(<HiringProgress summary={summary()} jobHref={JOB_HREF} />);
    const interviewing = screen.getByRole("link", { name: /interviewing/i });
    expect(interviewing).toHaveTextContent("1");
    expect(interviewing).toHaveAttribute("href", `${JOB_HREF}/interviews`);
  });

  it("still filters by stage for the remaining cells", () => {
    render(<HiringProgress summary={summary()} jobHref={JOB_HREF} />);
    const shortlisted = screen.getByRole("link", { name: /shortlisted/i });
    expect(shortlisted).toHaveTextContent("3");
    expect(shortlisted).toHaveAttribute("href", `${JOB_HREF}/applications?status=shortlisted`);
    expect(screen.getByRole("link", { name: /hired/i })).toHaveAttribute("href", `${JOB_HREF}/applications?status=hired`);
  });

  it("shows placeholders while the summary is still loading", () => {
    render(<HiringProgress jobHref={JOB_HREF} />);
    expect(screen.getAllByText("—").length).toBe(6);
  });
});
