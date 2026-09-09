/**
 * @jest-environment jsdom
 */
import React from "react";
import { render, screen } from "@testing-library/react";
import { HiresList } from "@/components/features/employer/hires/HiresList";

const useJobHiresMock = jest.fn();
jest.mock("@/hooks/useJobHires", () => ({ useJobHires: (...a: unknown[]) => useJobHiresMock(...a) }));
jest.mock("next/link", () => ({ __esModule: true, default: ({ children, href, ...props }: any) => <a href={href} {...props}>{children}</a> }));
jest.mock("@/components/ui/avatar", () => ({
  Avatar: ({ children }: any) => <div>{children}</div>,
  AvatarImage: () => null,
  AvatarFallback: ({ children }: any) => <span>{children}</span>,
}));

const base = { isLoading: false, isError: false, refetch: jest.fn() };

describe("HiresList", () => {
  it("shows a skeleton while loading and the empty state when there are no hires", () => {
    useJobHiresMock.mockReturnValue({ ...base, rows: [], isLoading: true });
    const { unmount } = render(<HiresList jobId="job-1" locale="en" />);
    expect(document.querySelector("[aria-busy='true']")).toBeTruthy();
    unmount();
    useJobHiresMock.mockReturnValue({ ...base, rows: [] });
    render(<HiresList jobId="job-1" locale="en" />);
    expect(screen.getByText("No hires yet")).toBeInTheDocument();
  });

  it("renders one row per hire with placement, visa, check and onboarding link", () => {
    useJobHiresMock.mockReturnValue({
      ...base,
      rows: [
        {
          applicationId: "app-1", candidateName: "Amina Noor", hiredAt: "2026-09-01T00:00:00Z",
          placement: { _id: "pl-1", status: "active", visaStatus: "pending", startDate: "2026-10-01" },
          check: { _id: "chk-1", status: "in_progress", referencesTotal: 2, referencesReplied: 1 },
        },
        { applicationId: "app-2", candidateName: "Omar Said", hiredAt: "2026-09-05T00:00:00Z" },
      ],
    });
    render(<HiresList jobId="job-1" locale="en" />);
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
    expect(screen.getByText("Amina Noor")).toBeInTheDocument();
    expect(screen.getByText("Active")).toBeInTheDocument();
    expect(screen.getByText(/Starts Oct 1, 2026 · Visa pending/)).toBeInTheDocument();
    expect(screen.getByText("In progress")).toBeInTheDocument();
    expect(screen.getByText("1/2 references replied")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Onboarding" })).toHaveAttribute("href", "/en/employer/placements/pl-1/onboarding");
    // Second hire has neither placement nor check yet
    expect(screen.getByText("Placement pending — created by your agent or Mployedin")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Request check" })).toHaveAttribute("href", "/en/employer/background-checks?jobId=job-1");
    expect(screen.getByRole("link", { name: /All placements/ })).toHaveAttribute("href", "/en/employer/placements");
    expect(screen.getByRole("link", { name: /All background checks/ })).toHaveAttribute("href", "/en/employer/background-checks?jobId=job-1");
  });
});
