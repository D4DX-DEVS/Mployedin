/**
 * @jest-environment jsdom
 *
 * Premium job seekers' applications are priority (client decision 2026-10-12):
 * the reviewer sees a "Priority" pill beside "Partner referred".
 */
import React from "react";
import { render, screen } from "@testing-library/react";
import { PriorityBadge } from "@/components/shared/PriorityBadge";

it("reads Priority and says why to a screen reader and on hover", () => {
  render(<PriorityBadge />);
  const badge = screen.getByTestId("priority-badge");
  expect(badge).toHaveTextContent("Priority");
  expect(badge).toHaveAttribute("title", "Premium job seeker: review this application first");
  expect(badge).toHaveAccessibleName("Premium job seeker: review this application first");
});
