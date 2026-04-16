/**
 * @jest-environment jsdom
 */
import React from "react";
import { render, screen } from "@testing-library/react";
import SuperAgentDashboard from "@/app/[locale]/(dashboard)/super-agent/page";

const authMock = jest.fn();
const redirectMock = jest.fn();

jest.mock("@/lib/auth/config", () => ({
  auth: () => authMock(),
}));

jest.mock("next/navigation", () => ({
  redirect: (url: string) => redirectMock(url),
}));

describe("SuperAgentDashboard", () => {
  beforeEach(() => {
    authMock.mockReset();
    redirectMock.mockReset();
    authMock.mockResolvedValue({
      user: {
        id: "user-1",
      },
    });
  });

  it("renders workspace utility surfaces for the super-agent dashboard", async () => {
    render(await SuperAgentDashboard({ params: Promise.resolve({ locale: "en" }) }));

    const workspaceBadge = screen.getByText(/super agent workspace/i);
    const heroSection = workspaceBadge.closest("section");
    const quickActionsHeading = screen.getByRole("heading", {
      name: /jump into the work that moves your region forward/i,
    });

    expect(heroSection).toHaveClass("workspace-hero-surface");
    expect(workspaceBadge).toHaveClass("workspace-glass-panel");
    expect(screen.getByRole("heading", { name: /super agent dashboard/i })).toHaveClass("text-foreground");
    expect(quickActionsHeading.parentElement).toHaveClass("workspace-panel-surface");
  });
});