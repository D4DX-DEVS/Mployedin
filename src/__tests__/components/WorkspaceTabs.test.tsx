/**
 * @jest-environment jsdom
 */
import React from "react";
import { render, screen } from "@testing-library/react";
import { WorkspaceTabs, type WorkspaceTab } from "@/components/shared/WorkspaceTabs";
import { Mail } from "lucide-react";

jest.mock("next/navigation", () => ({
  usePathname: () => "/employer/jobs/job-1/applications",
}));

describe("WorkspaceTabs", () => {
  const tabs: readonly WorkspaceTab[] = [
    {
      key: "overview",
      label: "Overview",
      href: "/employer/jobs/job-1",
      exact: true,
    },
    {
      key: "applications",
      label: "Applications",
      href: "/employer/jobs/job-1/applications",
      count: 5,
    },
    {
      key: "setup",
      label: "Setup",
      href: "/employer/jobs/job-1/setup",
      hideOnPhone: true,
    },
    {
      key: "posting",
      label: "Posting",
      href: "/employer/jobs/job-1/posting",
      icon: Mail,
    },
  ];

  it("renders links for all tabs", () => {
    render(
      <WorkspaceTabs tabs={tabs} ariaLabel="Job sections" />,
    );

    expect(screen.getByRole("link", { name: "Overview" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Applications/ })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Setup" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Posting/ })).toBeInTheDocument();
  });

  it("marks the matching tab as active with aria-current", () => {
    render(
      <WorkspaceTabs tabs={tabs} ariaLabel="Job sections" />,
    );

    const applicationsLink = screen.getByRole("link", { name: /Applications/ });
    expect(applicationsLink).toHaveAttribute("aria-current", "page");

    const overviewLink = screen.getByRole("link", { name: "Overview" });
    expect(overviewLink).not.toHaveAttribute("aria-current");
  });

  it("does not activate an exact tab on nested paths", () => {
    render(
      <WorkspaceTabs tabs={tabs} ariaLabel="Job sections" />,
    );

    const overviewLink = screen.getByRole("link", { name: "Overview" });
    expect(overviewLink).not.toHaveAttribute("aria-current", "page");
  });

  it("respects hideOnPhone class on tabs", () => {
    render(
      <WorkspaceTabs tabs={tabs} ariaLabel="Job sections" />,
    );

    const setupLink = screen.getByRole("link", { name: "Setup" });
    expect(setupLink.closest("li")).toHaveClass("hidden", "sm:inline-flex");
  });

  it("renders count pill when count is provided", () => {
    render(
      <WorkspaceTabs tabs={tabs} ariaLabel="Job sections" />,
    );

    const countPill = screen.getByText("5");
    expect(countPill).toHaveClass("workspace-tab-count");
  });

  it("uses activeKey prop when provided", () => {
    render(
      <WorkspaceTabs
        tabs={tabs}
        ariaLabel="Job sections"
        activeKey="setup"
      />,
    );

    const setupLink = screen.getByRole("link", { name: "Setup" });
    expect(setupLink).toHaveAttribute("aria-current", "page");
  });

  it("uses countLabel function for aria-label when provided", () => {
    const countLabel = (tab: string, count: number) => `${tab}, ${count} items`;
    render(
      <WorkspaceTabs
        tabs={tabs}
        ariaLabel="Job sections"
        countLabel={countLabel}
      />,
    );

    const applicationsLink = screen.getByRole("link", { name: "Applications, 5 items" });
    expect(applicationsLink).toBeInTheDocument();
  });

  it("renders icon when provided", () => {
    render(
      <WorkspaceTabs tabs={tabs} ariaLabel="Job sections" />,
    );

    const postingLink = screen.getByRole("link", { name: /Posting/ });
    const icon = postingLink.querySelector("svg");
    expect(icon).toBeInTheDocument();
  });

  it("wraps tabs in a nav with aria-label", () => {
    render(
      <WorkspaceTabs tabs={tabs} ariaLabel="Job sections" />,
    );

    const nav = screen.getByRole("navigation", { name: "Job sections" });
    expect(nav).toBeInTheDocument();
  });

  it("renders a ul with role list", () => {
    const { container } = render(
      <WorkspaceTabs tabs={tabs} ariaLabel="Job sections" />,
    );

    const ul = container.querySelector("ul[role='list']");
    expect(ul).toBeInTheDocument();
    expect(ul).toHaveClass("workspace-tabs");
  });
});
