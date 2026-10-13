/**
 * @jest-environment jsdom
 *
 * The dashboard's "Your accounts" card (client feedback 2026-10-12).
 */
import React from "react";
import { render, screen } from "@testing-library/react";
import { AgentAccounts } from "@/components/features/agent/dashboard/AgentAccounts";

it("says when nothing is assigned, and still offers the assigned list", () => {
  render(<AgentAccounts rows={[]} locale="ar" />);

  expect(screen.getByText("No accounts assigned to you yet")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: /view all/i })).toHaveAttribute("href", "/ar/agent/employers?view=assigned");
});

it("labels every number on a phone, where the column header is hidden", () => {
  render(
    <AgentAccounts
      rows={[{ employerId: "e1", companyName: "Gulf Metals", isActive: true, openJobs: 0, newApplicants: 2, upcomingInterviews: 0, hires: 0 }]}
      locale="en"
    />,
  );

  const row = screen.getByRole("link", { name: /Gulf Metals/ });
  for (const label of ["Open jobs", "New applicants", "Interviews ahead", "Hires"]) {
    expect(row).toHaveTextContent(label);
  }
});

it("flags an assigned account whose login is deactivated", () => {
  render(
    <AgentAccounts
      rows={[{ employerId: "e2", companyName: "Closed Co", isActive: false, openJobs: 1, newApplicants: 0, upcomingInterviews: 0, hires: 0 }]}
      locale="en"
    />,
  );

  expect(screen.getByRole("link", { name: /Closed Co/ })).toHaveTextContent("Inactive");
});
