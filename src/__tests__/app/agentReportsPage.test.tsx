/**
 * @jest-environment jsdom
 */
import React from "react";
import { render, screen } from "@testing-library/react";

import AgentReportsPage from "@/app/[locale]/(dashboard)/agent/reports/page";

describe("AgentReportsPage", () => {
  it("uses workspace surface classes for theme-aware report shells", () => {
    const view = render(<AgentReportsPage />);

    expect(screen.getByRole("heading", { name: "AI Reports" }).closest("section")).toHaveClass("workspace-hero-surface");
    expect(screen.getByRole("heading", { name: /start from a prompt template that matches the workday/i }).closest("section")).toHaveClass("workspace-panel-surface");
    expect(screen.getByRole("textbox").closest("section")).toHaveClass("workspace-panel-surface");

    expect(view.container.innerHTML).not.toContain("bg-white/80");
    expect(view.container.innerHTML).not.toContain("bg-white/95");
    expect(view.container.innerHTML).not.toContain("text-slate-950");
    expect(view.container.innerHTML).not.toContain("text-slate-600");
  });
});