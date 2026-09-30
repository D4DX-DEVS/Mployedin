/**
 * The impersonation session outlives the page: the admin starts it, works in the
 * employer workspace, then comes back. The page used to keep the banner (and its
 * Exit button) in local state only, so on return it looked like nothing was
 * running. It now restores both from GET /api/admin/impersonate.
 */
import React from "react";
import { render, screen, waitFor } from "@testing-library/react";

jest.mock("sonner", () => ({ toast: { success: jest.fn(), error: jest.fn() } }));
jest.mock("@/components/shared/DashboardPageHeader", () => ({
  DashboardPageHeader: ({ title }: { title: string }) => <h1>{title}</h1>,
}));

import AdminUserImpersonatePage from "@/app/[locale]/(dashboard)/admin/impersonate/page";

const USERS = [
  { _id: "u1", name: "Charlie Test", email: "charlie@example.test", role: "employer", isActive: true, createdAt: "2026-04-28T00:00:00.000Z" },
];

function mockFetch(session: Record<string, unknown>) {
  global.fetch = jest.fn((url: string) => {
    if (url === "/api/admin/impersonate") return Promise.resolve({ ok: true, json: async () => session });
    return Promise.resolve({ ok: true, json: async () => ({ users: USERS }) });
  }) as unknown as typeof fetch;
}

describe("Admin impersonate page", () => {
  it("restores a running session's banner and exit button", async () => {
    mockFetch({
      active: true,
      target: { id: "u1", name: "Charlie Test", email: "charlie@example.test", role: "employer" },
      companyName: "Charlie Co",
      expiresAt: "2026-09-29T12:00:00.000Z",
    });

    render(<AdminUserImpersonatePage />);

    expect(await screen.findByText("Impersonation session active for Charlie Test")).toBeInTheDocument();
    expect(screen.getByText("Role: Employer · charlie@example.test")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Exit Impersonation" })).toBeInTheDocument();
  });

  it("shows no banner when nothing is running, and labels roles in the table", async () => {
    mockFetch({ active: false });

    render(<AdminUserImpersonatePage />);

    expect(await screen.findByText("Charlie Test", {}, { timeout: 2000 })).toBeInTheDocument();
    await waitFor(() => expect(global.fetch).toHaveBeenCalledWith("/api/admin/impersonate"));
    expect(screen.queryByText(/Impersonation session/)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Exit Impersonation" })).not.toBeInTheDocument();
    // The role column used to run the role through StatusBadge, which printed "Unknown status".
    expect(screen.getByText("Employer")).toBeInTheDocument();
    expect(screen.queryByText(/Unknown status/i)).not.toBeInTheDocument();
  });
});
