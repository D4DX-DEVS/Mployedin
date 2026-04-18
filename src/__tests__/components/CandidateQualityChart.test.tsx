/**
 * @jest-environment jsdom
 */
import React from "react";
import { render, screen } from "@testing-library/react";

import { CandidateQualityChart } from "@/components/features/employer/dashboard/CandidateQualityChart";

jest.mock("recharts", () => {
  const React = require("react") as typeof import("react");

  function DivWrapper({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
    return <div {...props}>{children}</div>;
  }

  return {
    ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div data-testid="responsive-container">{children}</div>,
    LineChart: DivWrapper,
    Line: () => null,
    XAxis: () => null,
    YAxis: () => null,
    CartesianGrid: () => null,
    Tooltip: () => null,
  };
});

describe("CandidateQualityChart", () => {
  it("keeps the high and low match summary cards visible in dark mode", () => {
    render(
      <CandidateQualityChart
        avgMatchScore={42}
        highMatchCount={0}
        lowMatchCount={2}
        totalApplications={2}
      />
    );

    const highMatchTile = screen.getByText("High match").closest("div");
    const applicationsTile = screen.getByText("Applications").closest("div");
    const lowMatchTile = screen.getByText("Low match").closest("div");

    expect(highMatchTile).toHaveClass("dark:border-emerald-800", "dark:bg-emerald-950/30");
    expect(applicationsTile).toHaveClass("dark:border-slate-700", "dark:bg-slate-800/70");
    expect(lowMatchTile).toHaveClass("dark:border-red-800", "dark:bg-red-950/30");
  });
});