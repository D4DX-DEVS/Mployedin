/**
 * @jest-environment jsdom
 */
import React from "react";
import { render, screen, within } from "@testing-library/react";

import { JobSeekerSectionNav, APPLICATION_JOURNEY_PATHS } from "@/components/features/job-seeker/JobSeekerSectionNav";

let currentPath = "/en/job-seeker/applications";

jest.mock("next/link", () => ({
  __esModule: true,
  default: ({ children, href, prefetch: _prefetch, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string; prefetch?: boolean }) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

jest.mock("next/navigation", () => ({
  usePathname: () => currentPath,
}));

jest.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) =>
    values ? `${key}:${values.title}:${values.count}` : key,
}));

describe("JobSeekerSectionNav", () => {
  beforeEach(() => { currentPath = "/en/job-seeker/applications"; });

  it("marks the current stage and names the row", () => {
    render(<JobSeekerSectionNav locale="en" paths={APPLICATION_JOURNEY_PATHS} label="Application journey" />);
    const nav = screen.getByRole("navigation", { name: "Application journey" });
    const links = within(nav).getAllByRole("link");
    expect(links.map((l) => l.getAttribute("href"))).toEqual([
      "/en/job-seeker/applications",
      "/en/job-seeker/interviews",
      "/en/job-seeker/offers",
      "/en/job-seeker/onboarding",
    ]);
    expect(links[0]).toHaveAttribute("aria-current", "page");
    expect(links[1]).not.toHaveAttribute("aria-current");
  });

  it("badges only the stages that have something waiting", () => {
    render(
      <JobSeekerSectionNav
        locale="en"
        paths={APPLICATION_JOURNEY_PATHS}
        counts={{ interviewsAwaitingResponse: 2, pendingOffers: 0 }}
      />
    );
    // No `label` passed: falls back to the first entry's title.
    expect(screen.getByRole("navigation", { name: "Applications" })).toBeInTheDocument();
    const interviews = screen.getByRole("link", { name: "attention:Interviews:2" });
    expect(within(interviews).getByText("2")).toBeInTheDocument();
    const offers = screen.getByRole("link", { name: "Offers" });
    expect(within(offers).queryByText("0")).toBeNull();
    expect(screen.getByRole("link", { name: "Applications" })).not.toHaveAttribute("aria-label");
  });

  it("caps a runaway count at 99+", () => {
    render(<JobSeekerSectionNav locale="en" paths={APPLICATION_JOURNEY_PATHS} counts={{ pendingOffers: 250 }} />);
    expect(screen.getByText("99+")).toBeInTheDocument();
    // The accessible name must be built from the same capped number as the
    // visible badge, not the raw 250 — otherwise sighted and screen-reader
    // users are told two different counts by the same element.
    expect(screen.getByRole("link", { name: "attention:Offers:99" })).toBeInTheDocument();
  });
});
