/**
 * @jest-environment jsdom
 *
 * The employer chip on an agent task opens a contact menu: the email and phone
 * from the employer's profile, ways to reach them, and their jobs.
 */
import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const t = (key: string) => key;
jest.mock("next-intl", () => ({ useTranslations: () => t, useLocale: () => "en" }));
jest.mock("next/link", () => ({
  __esModule: true,
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>{children}</a>
  ),
}));

import { TaskLinkChips } from "@/app/[locale]/(dashboard)/agent/tasks/_components/TaskLinkChips";

describe("TaskLinkChips employer contact menu", () => {
  it("shows the profile email and phone with message, email, call, WhatsApp and jobs actions", async () => {
    const user = userEvent.setup();
    render(
      <TaskLinkChips
        locale="en"
        links={{ employer: { id: "e1", name: "Fazil", email: "hr@fazil.test", phone: "+971 50 123 4567", userId: "u1" } }}
      />,
    );

    await user.click(screen.getByRole("button", { name: "employerMenuLabel" }));

    expect(await screen.findByText("hr@fazil.test")).toBeInTheDocument();
    expect(screen.getByText("+971 50 123 4567")).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "employerMessage" })).toHaveAttribute("href", "/en/agent/messages?newChat=u1");
    expect(screen.getByRole("menuitem", { name: "employerEmail" })).toHaveAttribute("href", "mailto:hr@fazil.test");
    expect(screen.getByRole("menuitem", { name: "employerCall" })).toHaveAttribute("href", "tel:+971 50 123 4567");
    expect(screen.getByRole("menuitem", { name: "employerWhatsapp" })).toHaveAttribute("href", "https://wa.me/971501234567");
    expect(screen.getByRole("menuitem", { name: "linkOpenEmployer" })).toHaveAttribute("href", "/en/agent/jobs?employerId=e1");
  });

  it("says when the profile has no email or phone and offers only message and jobs", async () => {
    const user = userEvent.setup();
    render(<TaskLinkChips locale="en" links={{ employer: { id: "e1", name: "Beta", userId: "u2" } }} />);

    await user.click(screen.getByRole("button", { name: "employerMenuLabel" }));

    expect(await screen.findByText("employerNoContact")).toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: "employerEmail" })).not.toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: "employerCall" })).not.toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: "employerWhatsapp" })).not.toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "employerMessage" })).toBeInTheDocument();
  });
});
