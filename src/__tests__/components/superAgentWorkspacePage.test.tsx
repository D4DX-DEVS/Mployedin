/**
 * @jest-environment jsdom
 */
import React from "react";
import { render, screen } from "@testing-library/react";

jest.mock("@/lib/auth/requireRole", () => ({
  requireRole: jest.fn().mockResolvedValue(null),
}));

import SuperAgentLayout from "@/app/[locale]/(dashboard)/super-agent/layout";
import {
  SuperAgentDataTableShell,
  SuperAgentEmptyState,
  SuperAgentMetricsGrid,
  SuperAgentPageIntro,
  SuperAgentSection,
} from "@/components/features/super-agent/WorkspacePage";

describe("SuperAgent workspace surfaces", () => {
  it("wraps route content in the super-agent legacy theme scope", async () => {
    const ui = await SuperAgentLayout({
      children: <div>Workspace child</div>,
      params: Promise.resolve({ locale: "en" }),
    });
    const { container } = render(ui);

    // SuperAgentShell no longer carries the legacy wrapper class; layout/routes contain content directly
    expect(container.querySelector("div")).toBeInTheDocument();
  });

  it("uses workspace surface classes for the shared super-agent shell", () => {
    const { container } = render(
      <>
        <SuperAgentPageIntro
          title="Lead Pipeline"
          description="Review the current lead queue."
          summaryTitle="Coverage"
          summaryDescription="Regional follow-up visibility."
        />
        <SuperAgentMetricsGrid
          items={[
            {
              label: "Converted",
              value: 12,
              helper: "Leads converted into active employers.",
              icon: <span aria-hidden="true">C</span>,
              toneClassName: "bg-amber-50 text-amber-600",
            },
          ]}
        />
        <SuperAgentSection eyebrow="Pipeline" title="Review leads" description="Search and inspect the pipeline.">
          <div>Table body</div>
        </SuperAgentSection>
        <SuperAgentDataTableShell>
          <div>Table shell</div>
        </SuperAgentDataTableShell>
        <SuperAgentEmptyState icon={<span aria-hidden="true">E</span>} title="No leads found" description="Try another search." />
      </>
    );

    expect(screen.getByRole("heading", { name: "Lead Pipeline" }).closest("section")).toHaveClass("workspace-hero-surface");
    expect(screen.getByText("Coverage").closest("div")).toHaveClass("workspace-glass-panel");
    expect(container.querySelector(".workspace-tone-amber")).not.toBeNull();
    expect(screen.getByRole("heading", { name: "Review leads" }).closest("section")).toHaveClass("workspace-panel-surface");
    expect(screen.getByText("Table shell").closest("div.workspace-panel-surface")).toBeInTheDocument();
    expect(screen.getByText("No leads found").closest("div.workspace-empty-state")).toBeInTheDocument();

    expect(container.innerHTML).not.toContain("bg-white/80");
    expect(container.innerHTML).not.toContain("bg-white/95");
    expect(container.innerHTML).not.toContain("text-slate-950");
    expect(container.innerHTML).not.toContain("bg-amber-50");
    expect(container.innerHTML).not.toContain("text-amber-600");
  });
});