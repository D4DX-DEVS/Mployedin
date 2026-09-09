/**
 * @jest-environment jsdom
 */
import React from "react";
import { render, screen, within } from "@testing-library/react";

import OnboardingPage from "@/app/[locale]/(dashboard)/job-seeker/onboarding/page";

const fetchMock = jest.fn();

jest.mock("next/navigation", () => ({
  useParams: () => ({ locale: "en" }),
  usePathname: () => "/en/job-seeker/onboarding",
}));
jest.mock("next/link", () => ({
  __esModule: true,
  default: ({ children, href, prefetch: _prefetch, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string; prefetch?: boolean }) => (
    <a href={href} {...props}>{children}</a>
  ),
}));
jest.mock("@/hooks/useJobSeekerActionCounts", () => {
  const data = { pendingOffers: 0, interviewsAwaitingResponse: 0, upcomingInterviews: 0, totalApplications: 9, activeApplications: 3 };
  return { useJobSeekerActionCountsQuery: () => ({ data, isError: false }), useJobSeekerActionCounts: () => data };
});

describe("OnboardingPage", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ onboardings: [] }) });
    global.fetch = fetchMock as typeof fetch;
  });

  it("lives inside the shared shell with a truthful context and no back link", async () => {
    render(<OnboardingPage />);
    expect(screen.getByRole("heading", { level: 1, name: "My Applications" })).toBeInTheDocument();
    expect(await screen.findByText("Nothing in progress")).toBeInTheDocument();
    const journey = screen.getByRole("navigation", { name: "Application journey" });
    expect(within(journey).getByRole("link", { name: "Onboarding" })).toHaveAttribute("aria-current", "page");
    expect(screen.queryByText("Back to applications")).toBeNull();
    expect(screen.queryByText(/Welcome aboard/)).toBeNull();
    expect(screen.getByText(/don't have any onboarding yet/)).toBeInTheDocument();
  });
});
