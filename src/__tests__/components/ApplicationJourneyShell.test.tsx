/**
 * @jest-environment jsdom
 */
import React from "react";
import { render, screen, within } from "@testing-library/react";

import { ApplicationJourneyShell } from "@/components/features/job-seeker/ApplicationJourneyShell";

let currentPath = "/en/job-seeker/offers";
let counts: Record<string, number> | undefined = {
  pendingOffers: 1,
  interviewsAwaitingResponse: 0,
  upcomingInterviews: 0,
  totalApplications: 27,
  activeApplications: 8,
};

jest.mock("next/link", () => ({
  __esModule: true,
  default: ({ children, href, prefetch: _prefetch, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string; prefetch?: boolean }) => (
    <a href={href} {...props}>{children}</a>
  ),
}));
jest.mock("next/navigation", () => ({ usePathname: () => currentPath }));
jest.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) =>
    values ? `${key}:${values.title}:${values.count}` : key,
}));
jest.mock("@/hooks/useJobSeekerActionCounts", () => ({
  useJobSeekerActionCountsQuery: () => ({ data: counts, isError: false }),
}));

function renderShell(context: string | null | undefined) {
  return render(
    <ApplicationJourneyShell
      locale="en"
      context={context}
      toolbar={<div data-testid="toolbar" />}
      filters={<div data-testid="filters" />}
      footer={<div data-testid="footer" />}
    >
      <p>body</p>
    </ApplicationJourneyShell>
  );
}

describe("ApplicationJourneyShell", () => {
  beforeEach(() => { currentPath = "/en/job-seeker/offers"; });

  it("renders the shared title, the journey row with badges, and the slots in order", () => {
    renderShell("27 applications · 8 active");
    expect(screen.getByRole("heading", { level: 1, name: "title" })).toBeInTheDocument();
    expect(screen.getByText("27 applications · 8 active")).toBeInTheDocument();
    const nav = screen.getByRole("navigation", { name: "navLabel" });
    expect(within(nav).getAllByRole("link")).toHaveLength(4);
    expect(within(nav).getByRole("link", { name: "attention:Offers:1" })).toHaveAttribute("aria-current", "page");
    expect(within(nav).getByRole("link", { name: "Interviews" })).toBeInTheDocument();

    const order = ["toolbar", "filters", "footer"].map((id) => screen.getByTestId(id));
    expect(order[0].compareDocumentPosition(order[1]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByText("body").compareDocumentPosition(order[2]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("shows a skeleton, never a number, while the context is unknown", () => {
    renderShell(undefined);
    expect(screen.getByTestId("journey-context-skeleton")).toBeInTheDocument();
    expect(screen.queryByText(/0/)).toBeNull();
  });

  it("shows nothing under the title when the context is null", () => {
    renderShell(null);
    expect(screen.queryByTestId("journey-context-skeleton")).toBeNull();
    expect(screen.getByRole("heading", { level: 1 }).parentElement?.querySelector("p")).toBeNull();
  });
});
