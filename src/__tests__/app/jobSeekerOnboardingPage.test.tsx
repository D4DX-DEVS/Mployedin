/**
 * @jest-environment jsdom
 */
import React from "react";
import { renderWithProviders as render, screen, within } from "@/test-utils";

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

  // An uploaded document used to stay under "Action needed" with a Re-upload
  // button, as if the candidate still owed it, and nothing said what came next.
  it("sorts requested documents by whose turn it is", async () => {
    const doc = (index: number, name: string, extra: Record<string, unknown>) => ({
      index, name, url: null, requestedFromCandidate: true, requiresSignature: false,
      status: "requested", uploadedBy: null, dueDate: null, signature: null, reviewNote: null, ...extra,
    });
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        onboardings: [{
          _id: "ob1",
          status: "in_progress",
          startDate: null,
          probation: null,
          documents: [
            doc(0, "Passport copy", { reviewNote: "The scan is cut off" }),
            doc(1, "Old salary slip", { url: "https://files/slip.pdf", status: "submitted" }),
            doc(2, "Bank letter", { url: "https://files/bank.pdf", status: "approved" }),
          ],
          placement: { jobTitle: "QA Engineer", companyName: "d4dx", startDate: null },
        }],
      }),
    });
    render(<OnboardingPage />);

    const toUpload = (await screen.findByText("Passport copy")).closest("li") as HTMLElement;
    expect(within(toUpload).getByText("To upload")).toBeInTheDocument();
    expect(within(toUpload).getByText(/asked for a new copy/)).toBeInTheDocument();
    expect(within(toUpload).getByText("The scan is cut off")).toBeInTheDocument();
    expect(within(toUpload).getByRole("button", { name: "Upload" })).toBeInTheDocument();

    expect(screen.getByRole("heading", { name: "Sent to d4dx" })).toBeInTheDocument();
    const inReview = screen.getByText("Old salary slip").closest("li") as HTMLElement;
    expect(within(inReview).getByText("In review")).toBeInTheDocument();
    expect(within(inReview).getByRole("button", { name: "Replace file" })).toBeInTheDocument();
    expect(within(inReview).queryByRole("button", { name: "Upload" })).toBeNull();

    // Approved is closed: it can be opened, not replaced.
    const approved = screen.getByText("Bank letter").closest("li") as HTMLElement;
    expect(within(approved).queryByRole("button", { name: /Replace file|Upload/ })).toBeNull();

    expect(screen.getByText("2 of 3 sent")).toBeInTheDocument();
  });
});
