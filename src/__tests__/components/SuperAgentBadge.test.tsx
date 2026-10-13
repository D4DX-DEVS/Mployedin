/**
 * @jest-environment jsdom
 *
 * The agent dashboard names the agent's super agent beside their region, and
 * one click shows how to reach them (client feedback 2026-10-12).
 */
import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { SuperAgentBadge } from "@/components/features/agent/dashboard/SuperAgentBadge";

const contact = { userId: "u-sa", name: "Sara Khan", email: "sara@example.com", phone: "+971501234567" };

it("names the super agent and, opened, offers message, email and call", () => {
  render(<SuperAgentBadge contact={contact} locale="en" />);

  const pill = screen.getByRole("button", { name: /Super agent: Sara Khan/ });
  fireEvent.click(pill);

  expect(screen.getByRole("link", { name: /send a message/i })).toHaveAttribute("href", "/en/agent/messages?newChat=u-sa");
  expect(screen.getByRole("link", { name: /sara@example\.com/ })).toHaveAttribute("href", "mailto:sara@example.com");
  expect(screen.getByRole("link", { name: /\+971501234567/ })).toHaveAttribute("href", "tel:+971501234567");
});

it("leaves out the call row when no phone is on file", () => {
  render(<SuperAgentBadge contact={{ ...contact, phone: "" }} locale="en" />);
  fireEvent.click(screen.getByRole("button", { name: /Super agent: Sara Khan/ }));

  expect(screen.queryByRole("link", { name: /^tel:/ })).not.toBeInTheDocument();
  expect(screen.queryByText("+971501234567")).not.toBeInTheDocument();
});

it("renders nothing for an agent with no super agent", () => {
  const { container } = render(<SuperAgentBadge contact={null} locale="en" />);
  expect(container).toBeEmptyDOMElement();
});
