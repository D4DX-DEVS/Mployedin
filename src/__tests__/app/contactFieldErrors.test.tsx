/**
 * @jest-environment jsdom
 */
import React from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";

import ContactPage from "@/app/[locale]/(public)/contact/page";

jest.mock("next/navigation", () => ({ usePathname: () => "/en/contact" }));

/**
 * Like the login form, the contact form left empty or malformed input to the
 * browser's own bubble. It now explains each problem under the field.
 */
describe("contact form field errors", () => {
  const fetchMock = jest.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    // PhoneInput loads /api/countries on mount; an empty answer keeps its built-in list.
    fetchMock.mockResolvedValue({ ok: false, json: async () => null });
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  async function submit() {
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /send/i }));
    });
  }

  it("explains an empty submit under each required field and sends nothing", async () => {
    render(<ContactPage />);
    await submit();

    const name = screen.getByRole("textbox", { name: "Full Name" });
    expect(screen.getByText("Enter your full name.")).toBeInTheDocument();
    expect(screen.getByText("Enter your email address.")).toBeInTheDocument();
    expect(screen.getByText("Enter your message.")).toBeInTheDocument();
    expect(name).toHaveAttribute("aria-invalid", "true");
    expect(name).toHaveAccessibleDescription("Enter your full name.");
    expect(name).toHaveFocus();
    expect(fetchMock).not.toHaveBeenCalledWith("/api/contact", expect.anything());
  });

  it("flags a malformed email", async () => {
    render(<ContactPage />);
    fireEvent.change(screen.getByRole("textbox", { name: "Full Name" }), { target: { value: "Sara", name: "name" } });
    fireEvent.change(screen.getByRole("textbox", { name: /^Email/ }), { target: { value: "sara@", name: "email" } });
    fireEvent.change(screen.getByRole("textbox", { name: /^Message/ }), { target: { value: "Hello", name: "message" } });
    await submit();

    expect(screen.getByText("Enter a valid email address, like name@example.com.")).toBeInTheDocument();
    expect(screen.queryByText("Enter your full name.")).not.toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalledWith("/api/contact", expect.anything());
  });

  it("explains the asterisk and hides it from screen readers", () => {
    render(<ContactPage />);

    expect(screen.getByText("Fields marked * are required.")).toBeInTheDocument();
    expect(document.querySelector('label[for="contact-name"] [aria-hidden="true"]')).toHaveTextContent("*");
  });
});
